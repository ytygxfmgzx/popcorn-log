/**
 * popcorn-log 服务层
 *
 * 职责：
 * 1. TMDB / 海报转发（无状态，API Key 存 secret，前端不可见）
 * 2. 云同步存储 API（/sync/*）：R2 对象存储（经内部绑定，零密钥零 CORS），
 *    访问凭据 = 用户自设的同步密码（secret SYNC_PASSWORD），两台手机填同一个。
 * 不存储任何数据、不写日志；换存储服务商只改部署侧，使用者无感。
 */

export interface Env {
  TMDB_API_KEY: string;
  /** 同步密码（wrangler secret put SYNC_PASSWORD），手机设置页填同一个值 */
  SYNC_PASSWORD?: string;
  /** R2 对象存储绑定（wrangler.toml r2_buckets） */
  BUCKET?: R2Bucket;
}

const TMDB_API_BASE = 'https://api.themoviedb.org/3/';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/';

/** 同步允许读写的对象 key（一事件一文件 + 共享配置），其余一律 403。
 *  结构校验而非字符集枚举：records/ 前缀 + .json 后缀 + 禁路径穿越，杜绝"漏字符"类边界 bug。 */
function isAllowedKey(key: string): boolean {
  if (key === 'config.json') return true;
  return key.startsWith('records/') && key.endsWith('.json') && !key.includes('..') && key.length > 'records/.json'.length;
}

/** 转发到上游时允许透传的请求头（最小集合） */
const FORWARD_REQUEST_HEADERS = ['accept'];

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  // 同步协议依赖浏览器 JS 读取 etag，必须显式暴露
  'Access-Control-Expose-Headers': 'ETag',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

async function proxy(request: Request, target: URL): Promise<Response> {
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  const upstream = new Request(target.toString(), { method: 'GET', headers });
  const response = await fetch(upstream);
  const respHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    respHeaders.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers: respHeaders });
}

/** 同步密码校验：Bearer <SYNC_PASSWORD>；未配置 secret 时明确报 503 */
function checkSyncAuth(request: Request, env: Env): Response | null {
  if (!env.SYNC_PASSWORD) {
    return errorResponse('服务端未设置 SYNC_PASSWORD，请先 wrangler secret put SYNC_PASSWORD', 503);
  }
  const auth = request.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${env.SYNC_PASSWORD}`) {
    return errorResponse('同步密码不对', 401);
  }
  return null;
}

/** /sync/* 云同步存储 API（R2 绑定） */
async function handleSync(request: Request, env: Env, url: URL): Promise<Response> {
  const authError = checkSyncAuth(request, env);
  if (authError) return authError;
  if (!env.BUCKET) {
    return errorResponse('服务端未绑定 R2 存储桶，请检查 wrangler.toml 并重新部署', 503);
  }

  const key = url.searchParams.get('key') ?? '';
  const action = url.pathname;

  // 清单：ListObjectsV2 语义，一页全量（家庭量级远小于 1000）
  if (request.method === 'GET' && action === '/sync/list') {
    const prefix = url.searchParams.get('prefix');
    if (prefix !== 'records/' && prefix !== 'config.json') {
      return errorResponse('不支持的 prefix', 400);
    }
    const listed = await env.BUCKET.list({ prefix, limit: 1000 });
    return jsonResponse({
      files: listed.objects.map((object) => ({ key: object.key, etag: object.etag })),
    });
  }

  // 下载
  if (request.method === 'GET' && action === '/sync/file') {
    if (!isAllowedKey(key)) return errorResponse('不支持的 key', 403);
    const object = await env.BUCKET.get(key);
    if (!object) return errorResponse('not found', 404);
    return jsonResponse({ etag: object.etag, content: await object.text() });
  }

  // 上传（可选乐观锁：ifMatch 与云端 etag 不符 → 412，对应前端冲突协议）
  if (request.method === 'PUT' && action === '/sync/file') {
    if (!isAllowedKey(key)) return errorResponse('不支持的 key', 403);    const body = await request.text();
    const ifMatch = url.searchParams.get('ifMatch') ?? undefined;
    const options: R2PutOptions = {};
    if (ifMatch) options.onlyIf = { etagMatches: ifMatch };
    const result = await env.BUCKET.put(key, body, options);
    if (!result) return errorResponse('云端已被对方先修改', 412);
    return jsonResponse({ etag: result.etag });
  }

  return errorResponse('not found', 404);
}

const handler: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
      if (url.pathname.startsWith('/tmdb/')) {
        const target = new URL(TMDB_API_BASE + url.pathname.slice('/tmdb/'.length));
        // 前端 query（language / query / page 等）原样保留，api_key 强制覆盖为 secret
        for (const [key, value] of url.searchParams) {
          target.searchParams.set(key, value);
        }
        target.searchParams.set('api_key', env.TMDB_API_KEY);
        return await proxy(request, target);
      }

      if (url.pathname.startsWith('/image/')) {
        const target = new URL(TMDB_IMAGE_BASE + url.pathname.slice('/image/'.length));
        return await proxy(request, target);
      }

      if (url.pathname.startsWith('/sync/')) {
        return await handleSync(request, env, url);
      }
    } catch {
      return errorResponse('upstream unavailable', 502);
    }

    return new Response('not found', { status: 404, headers: CORS_HEADERS });
  },
};

export default handler;

/**
 * popcorn-log 无状态转发层
 *
 * 职责：仅做"原样转交"——不存储任何数据、不写日志。
 * 目标域名白名单制（TMDB API / TMDB 图片 / WebDAV 网盘）：
 * WebDAV 目标由请求头 X-Dav-Url 提供，hostname 必须命中环境变量
 * DAV_ALLOWED_HOSTS（逗号分隔；"." 开头的条目按后缀匹配），防开放代理滥用。
 */

export interface Env {
  TMDB_API_KEY: string;
  /** 允许转发的 WebDAV 域名白名单（逗号分隔） */
  DAV_ALLOWED_HOSTS?: string;
}

const TMDB_API_BASE = 'https://api.themoviedb.org/3/';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/';
/**
 * 默认放行的 WebDAV 域名（"." 开头 = 后缀匹配，infiniCLOUD 每用户一个子域）：
 * - .infini-cloud.net / .teracloud.jp：infiniCLOUD（日本，免费 20GB，海外可达，推荐）
 * - dav.jianguoyun.com：坚果云（注意：实测 Cloudflare 海外出口访问坚果云国内节点稳定 520，
 *   Worker 转发架构下坚果云不可用，保留仅供参考）
 */
const DEFAULT_DAV_ALLOWED_HOSTS = '.infini-cloud.net,.teracloud.jp,dav.jianguoyun.com';

/** 转发到上游时允许透传的请求头（最小集合） */
const FORWARD_REQUEST_HEADERS = [
  'authorization',
  'content-type',
  'depth',
  'if-match',
  'if-none-match',
  'overwrite',
  'accept',
];

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, PROPFIND, MKCOL, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Depth, If-Match, If-None-Match, Content-Type, Overwrite, Accept, X-Dav-Url',
  // 同步协议依赖浏览器 JS 读取 etag / last-modified，必须显式暴露
  'Access-Control-Expose-Headers': 'ETag, Last-Modified',
  'Access-Control-Max-Age': '86400',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  // statusText 里的非 ISO-8859-1 字符会让 Response 构造器抛错（线上 530 的来源之一）
  const statusText = response.statusText.replace(/[^\x20-\x7E]/g, '');
  try {
    return new Response(response.body, {
      status: response.status,
      statusText,
      headers,
    });
  } catch {
    return new Response(response.body, { status: response.status, headers });
  }
}

async function proxy(request: Request, target: URL): Promise<Response> {
  // 继承方法与请求体，仅透传白名单请求头，Host 等由运行时自动处理
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  const upstream = new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });

  const response = await fetch(upstream);
  return withCors(response);
}

/** 解析 X-Dav-Url 并校验 hostname 白名单；非法返回 null（403）。条目 "." 开头 = 后缀匹配 */
function resolveDavTarget(request: Request, env: Env): URL | null {
  const raw = request.headers.get('x-dav-url');
  if (!raw) return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
  const hostname = target.hostname.toLowerCase();
  const allowed = (env.DAV_ALLOWED_HOSTS ?? DEFAULT_DAV_ALLOWED_HOSTS)
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const hit = allowed.some((entry) =>
    entry.startsWith('.') ? hostname.endsWith(entry) : hostname === entry,
  );
  return hit ? target : null;
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

      if (url.pathname.startsWith('/dav/')) {
        const target = resolveDavTarget(request, env);
        if (!target) {
          return new Response('dav host not allowed', { status: 403, headers: CORS_HEADERS });
        }
        return await proxy(request, target);
      }
    } catch {
      return new Response('upstream unavailable', { status: 502, headers: CORS_HEADERS });
    }

    return new Response('not found', { status: 404, headers: CORS_HEADERS });
  },
};

export default handler;

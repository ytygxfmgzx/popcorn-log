/**
 * popcorn-log 无状态转发层
 *
 * 职责：仅做"原样转交"——不存储任何数据、不写日志。
 * 目标白名单硬编码（TMDB API / TMDB 图片 / 坚果云 WebDAV），
 * 不接受任何用户可控的 host 参数，防止被当开放代理滥用。
 */

export interface Env {
  TMDB_API_KEY: string;
}

const TMDB_API_BASE = 'https://api.themoviedb.org/3/';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/';
const JIANGUAYUN_DAV_BASE = 'https://dav.jianguayun.com/dav/';

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
    'Authorization, Depth, If-Match, If-None-Match, Content-Type, Overwrite, Accept',
  // 同步协议依赖浏览器 JS 读取 etag / last-modified，必须显式暴露
  'Access-Control-Expose-Headers': 'ETag, Last-Modified',
  'Access-Control-Max-Age': '86400',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

const handler: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      return new Response('ok');
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
        const target = new URL(JIANGUAYUN_DAV_BASE + url.pathname.slice('/dav/'.length));
        return await proxy(request, target);
      }
    } catch {
      return new Response('upstream unavailable', { status: 502, headers: CORS_HEADERS });
    }

    return new Response('not found', { status: 404, headers: CORS_HEADERS });
  },
};

export default handler;

import { AwsClient } from 'aws4fetch';
import { CloudError, type CloudStore, type FetchedFile, type PutResult } from '@/services/cloud';
import { inferS3Region, parseListObjectsXml } from '@/services/s3-xml';
import type { Credentials } from '@/types';

/**
 * 模式 B（高级）：浏览器直连任意 S3 兼容存储（阿里 OSS / 腾讯 COS / R2 S3 API / B2…）。
 * aws4fetch 做 SigV4 签名；密钥只存本机 IndexedDB（务必最小权限子账号 + 桶开版本化）。
 * 统一 path-style 寻址：endpoint/bucket/key（R2 与 OSS 均兼容）。
 */

export function createS3Store(credentials: Credentials): CloudStore {
  const endpoint = (credentials.s3Endpoint as string).trim().replace(/\/+$/, '');
  const bucket = (credentials.s3Bucket as string).trim();
  const aws = new AwsClient({
    accessKeyId: credentials.s3AccessKeyId as string,
    secretAccessKey: credentials.s3SecretAccessKey as string,
    service: 's3',
    region: inferS3Region(endpoint),
  });

  function objectUrl(key: string): URL {
    return new URL(`${endpoint}/${bucket}/${key}`);
  }

  function listUrl(): URL {
    const url = new URL(`${endpoint}/${bucket}`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', 'records/');
    return url;
  }

  function stripQuotes(etag: string | null): string | undefined {
    return etag?.replace(/^"|"$/g, '') || undefined;
  }

  async function signedFetch(url: URL, init?: RequestInit): Promise<Response> {
    let resp: Response;
    try {
      resp = await aws.fetch(url, init);
    } catch (error) {
      // fetch 网络层失败（CORS 未放行 / 域名不通 / 断网）
      throw new CloudError(
        error instanceof Error ? `连接存储失败：${error.message}（检查地址与 CORS 配置）` : '连接存储失败',
        -1,
      );
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new CloudError('AccessKey 无权限（检查密钥正确性与存储桶授权）', resp.status);
    }
    return resp;
  }

  return {
    async listRecords(): Promise<{ file: string; etag?: string }[]> {
      const resp = await signedFetch(listUrl());
      if (!resp.ok) throw new CloudError(`拉取云端清单失败（${resp.status}）`, resp.status);
      return parseListObjectsXml(await resp.text());
    },

    async fetchFile(key: string): Promise<FetchedFile> {
      const resp = await signedFetch(objectUrl(key));
      if (resp.status === 404) return { text: null };
      if (!resp.ok) throw new CloudError(`下载 ${key} 失败（${resp.status}）`, resp.status);
      return { text: await resp.text(), etag: stripQuotes(resp.headers.get('ETag')) };
    },

    async putFileText(key: string, body: string, ifMatch?: string): Promise<PutResult> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ifMatch) headers['If-Match'] = ifMatch;
      const resp = await signedFetch(objectUrl(key), { method: 'PUT', headers, body });
      if (resp.status === 412) return { ok: false, conflict: true };
      if (!resp.ok) throw new CloudError(`上传 ${key} 失败（${resp.status}）`, resp.status);
      return { ok: true, etag: stripQuotes(resp.headers.get('ETag')), conflict: false };
    },

    async verify(): Promise<void> {
      await this.listRecords();
    },
  };
}

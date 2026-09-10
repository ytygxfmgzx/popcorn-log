import { getCredentials, isCredentialsComplete } from '@/db/credentials';
import type { CloudFileMeta } from '@/types';

/**
 * 云同步存储统一接口：同步引擎只依赖这里，不感知底层是 Worker+R2 还是 S3 直连。
 * 云端结构：records/<date>_<uuid>.json（一事件一文件）+ config.json（共享配置）。
 */

export interface FetchedFile {
  /** 404 时为 null（由调用方决定策略） */
  text: string | null;
  etag?: string;
}

export interface PutResult {
  ok: boolean;
  /** 上传成功后的云端新 etag（底账更新用） */
  etag?: string;
  /** true = If-Match 不匹配，云端已被对方先改（冲突，交人工处理） */
  conflict: boolean;
}

export class CloudError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface CloudStore {
  /** records/ 文件清单（file + etag，全量，含分页拉取） */
  listRecords(): Promise<CloudFileMeta[]>;
  fetchFile(key: string): Promise<FetchedFile>;
  putFileText(key: string, body: string, ifMatch?: string): Promise<PutResult>;
  /** 物理删除云端对象；对象本就不存在视为成功（删除幂等） */
  deleteFile(key: string): Promise<void>;
  /** 连通性/凭据校验（设置页「测试并保存」用），失败抛 CloudError */
  verify(): Promise<void>;
}

import { createS3Store } from '@/services/cloud-s3';
import { createWorkerStore } from '@/services/cloud-worker';

/** 按当前配置返回存储实现；未配置抛错（调用方静默跳过） */
export async function getCloudStore(): Promise<CloudStore> {
  const credentials = await getCredentials();
  if (!isCredentialsComplete(credentials)) {
    throw new CloudError('云同步未配置', 0);
  }
  return credentials.mode === 'direct'
    ? createS3Store(credentials)
    : createWorkerStore(credentials);
}

/** 退避重试：429/503 按 1s/2s/4s 指数退避，上限 3 次；其余异常直接抛出 */
export async function withBackoff<T>(op: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (error) {
      const status = error instanceof CloudError ? error.status : -1;
      const retriable = status === 429 || status === 503;
      if (!retriable || attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

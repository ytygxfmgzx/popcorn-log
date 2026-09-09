import type { CloudFileMeta, SyncState } from '@/types';

/** 云端清单 vs 本地底账的增量对账结果 */
export interface RemoteDiff {
  /** 需要下载：云端新增（本地底账没有）或 etag 不一致（对方改过） */
  toDownload: CloudFileMeta[];
  /** 云端清单里实际存在的记录文件（用于清理本地指向已消失文件的陈旧底账） */
  remoteFiles: Set<string>;
}

/**
 * 纯函数：逐行比指纹。
 * - 云端有、本地底账无 → 下载（对方新记的 / 新手机首次全量）
 * - etag 不一致 → 下载（对方改过 / 对方删除过=墓碑版本）
 * - etag 一致 → 跳过（零流量）
 * - 底账 etag 缺失 → 下载（宁可多拉一次，不做错决定）
 */
export function diffRemote(remote: CloudFileMeta[], localStates: SyncState[]): RemoteDiff {
  const byFile = new Map<string, SyncState>();
  for (const state of localStates) {
    if (state.cloudFile) byFile.set(state.cloudFile, state);
  }

  const toDownload: CloudFileMeta[] = [];
  const remoteFiles = new Set<string>();
  for (const meta of remote) {
    remoteFiles.add(meta.file);
    const state = byFile.get(meta.file);
    if (!state || state.cloudEtag !== meta.etag) {
      toDownload.push(meta);
    }
  }
  return { toDownload, remoteFiles };
}

/** 分批（首次全量 >50 条时 20 条/批，批间停顿，防一次打满 WebDAV 服务限额） */
export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

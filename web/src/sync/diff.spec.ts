import { describe, expect, it } from 'vitest';
import { chunk, diffRemote, planRemoteDeletions } from './diff';
import type { CloudFileMeta, SyncState } from '@/types';

function state(cloudFile: string, cloudEtag?: string, status: SyncState['status'] = 'synced'): SyncState {
  return { recordId: `id-${cloudFile}`, cloudFile, cloudEtag, status };
}

describe('diffRemote', () => {
  const remote: CloudFileMeta[] = [
    { file: 'records/a.json', etag: 'v1' },
    { file: 'records/b.json', etag: 'v2' },
    { file: 'records/c.json', etag: 'v3' },
  ];

  it('etag 一致跳过 / 不一致下载 / 本地无底账下载（新手机全量）', () => {
    const local: SyncState[] = [
      state('records/a.json', 'v1'), // 没变
      state('records/b.json', 'v1'), // 对方改过
    ];
    const { toDownload } = diffRemote(remote, local);
    expect(toDownload.map((m) => m.file)).toEqual(['records/b.json', 'records/c.json']);
  });

  it('底账缺 etag 视为需要下载（宁多拉不拉错）', () => {
    const local: SyncState[] = [state('records/a.json', undefined)];
    const { toDownload } = diffRemote(remote, local);
    expect(toDownload.map((m) => m.file)).toContain('records/a.json');
  });

  it('云端清单含 config.json 等非记录文件时一并进入清单（由引擎分流）', () => {
    const { remoteFiles } = diffRemote([{ file: 'config.json', etag: 'x' }], []);
    expect(remoteFiles.has('config.json')).toBe(true);
  });

  it('本地全部同步过且无变化 → 零下载', () => {
    const local: SyncState[] = remote.map((m) => state(m.file, m.etag));
    expect(diffRemote(remote, local).toDownload).toEqual([]);
  });
});

describe('planRemoteDeletions', () => {
  const remote: CloudFileMeta[] = [
    { file: 'records/a.json', etag: 'v1' },
    { file: 'records/b.json', etag: 'v2' },
  ];

  it('synced 且云端清单已消失 → 跟随删除本地', () => {
    const local: SyncState[] = [
      state('records/a.json', 'v1'),
      state('records/gone.json', 'v0'), // 云端已被直接删除
    ];
    expect(planRemoteDeletions(remote, local)).toEqual(['id-records/gone.json']);
  });

  it('pending 不跟随（create 云端本就没有；update/delete 是本地明确意图）', () => {
    const local: SyncState[] = [
      state('records/gone.json', undefined, 'pending'), // create：从未上云
      { recordId: 'r2', cloudFile: 'records/gone.json', cloudEtag: 'v1', status: 'pending', pendingOp: 'update' },
    ];
    expect(planRemoteDeletions(remote, local)).toEqual([]);
  });

  it('conflict 不跟随（保留人工裁决现场）', () => {
    const local: SyncState[] = [state('records/gone.json', 'v1', 'conflict')];
    expect(planRemoteDeletions(remote, local)).toEqual([]);
  });

  it('安全阀：云端清单为空 → 全部跳过（防误配桶/清空桶全量误删）', () => {
    const local: SyncState[] = [state('records/a.json', 'v1'), state('records/b.json', 'v2')];
    expect(planRemoteDeletions([], local)).toEqual([]);
  });

  it('无 cloudFile 的底账不参与对账', () => {
    const local: SyncState[] = [{ recordId: 'r0', status: 'synced' }];
    expect(planRemoteDeletions(remote, local)).toEqual([]);
  });
});

describe('chunk', () => {
  it('按批切分（整除与余数）', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 2)).toEqual([[1, 2]]);
  });

  it('空数组返回空批列表', () => {
    expect(chunk([], 20)).toEqual([]);
  });
});

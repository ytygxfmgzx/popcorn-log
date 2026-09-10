import { describe, expect, it } from 'vitest';
import { mapWorkerListResponse } from './cloud-worker';

/** 回归防线：Worker 响应字段是 key，前端 CloudFileMeta 字段是 file，映射不能丢 */
describe('mapWorkerListResponse', () => {
  it('key → file 字段映射（含 etag）', () => {
    const files = mapWorkerListResponse({
      files: [
        { key: 'records/2026-09-09_f0dfbbd4-aaaa.json', etag: 'e1' },
        { key: 'records/2026-05-01_xxx.json', etag: 'e2' },
      ],
    });
    expect(files).toEqual([
      { file: 'records/2026-09-09_f0dfbbd4-aaaa.json', etag: 'e1' },
      { file: 'records/2026-05-01_xxx.json', etag: 'e2' },
    ]);
  });

  it('空清单与缺 files 字段容错', () => {
    expect(mapWorkerListResponse({ files: [] })).toEqual([]);
    expect(mapWorkerListResponse({})).toEqual([]);
  });

  it('非字符串 key 映射为空串（由 assertKey 在请求前拦截，绝不流向网络层）', () => {
    const files = mapWorkerListResponse({ files: [{ key: undefined, etag: 'x' }] });
    expect(files[0].file).toBe('');
  });
});

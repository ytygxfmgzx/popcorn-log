import { describe, expect, it } from 'vitest';
import { recordCloudFile } from '@/utils/filename';

describe('recordCloudFile', () => {
  it('一事件一文件：records/<观影日期>_<uuid>.json', () => {
    const file = recordCloudFile({ watchedDate: '2026-09-08', id: 'e5f6a7b8-c1d2-3e4f-9a8b-7c6d5e4f3a2b' });
    expect(file).toBe('records/2026-09-08_e5f6a7b8-c1d2-3e4f-9a8b-7c6d5e4f3a2b.json');
  });

  it('文件名前缀是观影日期（非创建日，支持补记）', () => {
    const today = new Date().toISOString();
    expect(today.slice(0, 10)).not.toBe('2001-02-03');
    expect(recordCloudFile({ watchedDate: '2001-02-03', id: 'x' })).toBe(
      'records/2001-02-03_x.json',
    );
  });
});

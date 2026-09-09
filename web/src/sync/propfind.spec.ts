// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parsePropfind } from './propfind';

/** 坚果云风格：d: 前缀 + 引号 etag，首条为目录本身（应跳过） */
const D_PREFIXED = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/popcorn-log/records/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/popcorn-log/records/2026-09-09_e92b.json</d:href>
    <d:propstat><d:prop><d:getetag>&quot;aaa111&quot;</d:getetag></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/popcorn-log/records/2026-05-01_a3f8.json</d:href>
    <d:propstat><d:prop><d:getetag>bbb222</d:getetag></d:prop></d:propstat>
  </d:response>
</d:multistatus>`;

/** 其他服务端风格：大写 D: 前缀、URL 编码中文文件名 */
const UPPER_PREFIXED = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/popcorn-log/config.json</D:href>
    <D:propstat><D:prop><D:getetag>"cfg9"</D:getetag></D:prop></D:propstat>
  </D:response>
</D:multistatus>`;

describe('parsePropfind', () => {
  it('解析 d: 前缀清单：剥根前缀、剥 etag 引号、跳过目录', () => {
    const files = parsePropfind(D_PREFIXED);
    expect(files).toEqual([
      { file: 'records/2026-09-09_e92b.json', etag: 'aaa111' },
      { file: 'records/2026-05-01_a3f8.json', etag: 'bbb222' },
    ]);
  });

  it('解析 D: 前缀与无前缀标签等价处理', () => {
    const files = parsePropfind(UPPER_PREFIXED);
    expect(files).toEqual([{ file: 'config.json', etag: 'cfg9' }]);
  });

  it('无 getetag 的条目 etag 为 undefined（视为需要下载）', () => {
    const xml = `<d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/dav/popcorn-log/records/x.json</d:href></d:response>
    </d:multistatus>`;
    expect(parsePropfind(xml)).toEqual([{ file: 'records/x.json', etag: undefined }]);
  });

  it('空 multistatus 返回空数组', () => {
    expect(parsePropfind('<d:multistatus xmlns:d="DAV:"></d:multistatus>')).toEqual([]);
  });

  it('坏 XML 抛可读错误', () => {
    expect(() => parsePropfind('not xml <<<')).toThrow('XML 解析失败');
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { inferS3Region, parseListObjectsPage, parseListObjectsXml } from './s3-xml';

const LIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>popcorn-log</Name>
  <Prefix>records/</Prefix>
  <KeyCount>2</KeyCount>
  <Contents>
    <Key>records/2026-09-09_e92b.json</Key>
    <LastModified>2026-09-09T12:00:00.000Z</LastModified>
    <ETag>&quot;aaa111&quot;</ETag>
    <Size>431</Size>
  </Contents>
  <Contents>
    <Key>records/2026-05-01_a3f8.json</Key>
    <ETag>bbb222</ETag>
    <Size>389</Size>
  </Contents>
</ListBucketResult>`;

describe('parseListObjectsXml', () => {
  it('提取 Key 与 ETag（剥引号），忽略其余字段', () => {
    const files = parseListObjectsXml(LIST_XML);
    expect(files).toEqual([
      { file: 'records/2026-09-09_e92b.json', etag: 'aaa111' },
      { file: 'records/2026-05-01_a3f8.json', etag: 'bbb222' },
    ]);
  });

  it('空桶返回空数组', () => {
    const xml = '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></ListBucketResult>';
    expect(parseListObjectsXml(xml)).toEqual([]);
  });

  it('坏 XML 抛可读错误', () => {
    expect(() => parseListObjectsXml('not xml <<<')).toThrow('XML 解析失败');
  });
});

describe('parseListObjectsPage', () => {
  it('截断页携带 NextContinuationToken（分页拉全量依赖）', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=</NextContinuationToken>
  <Contents>
    <Key>records/a.json</Key>
    <ETag>&quot;aaa&quot;</ETag>
  </Contents>
</ListBucketResult>`;
    const page = parseListObjectsPage(xml);
    expect(page.files).toEqual([{ file: 'records/a.json', etag: 'aaa' }]);
    expect(page.nextToken).toBe('1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=');
  });

  it('末页无 NextContinuationToken → nextToken 为空（循环终止）', () => {
    const page = parseListObjectsPage(LIST_XML);
    expect(page.files).toHaveLength(2);
    expect(page.nextToken).toBeUndefined();
  });
});

describe('inferS3Region', () => {
  it('R2 → auto', () => {
    expect(inferS3Region('https://abc123.r2.cloudflarestorage.com')).toBe('auto');
  });

  it('阿里云 OSS（path-style 与 virtual-host）→ cn-hangzhou', () => {
    expect(inferS3Region('https://oss-cn-hangzhou.aliyuncs.com')).toBe('cn-hangzhou');
    expect(inferS3Region('https://popcorn.oss-cn-shenzhen.aliyuncs.com')).toBe('cn-shenzhen');
  });

  it('腾讯云 COS → ap-guangzhou', () => {
    expect(inferS3Region('https://popcorn-125000.cos.ap-guangzhou.myqcloud.com')).toBe('ap-guangzhou');
  });

  it('AWS → us-east-1；未知 → 兜底 us-east-1', () => {
    expect(inferS3Region('https://s3.us-west-2.amazonaws.com')).toBe('us-west-2');
    expect(inferS3Region('https://s3.example.org')).toBe('us-east-1');
  });
});

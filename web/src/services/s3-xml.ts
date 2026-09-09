import type { CloudFileMeta } from '@/types';

/**
 * 解析 S3 ListObjectsV2 XML 响应 → [{ key, etag }]（DOMParser，按 localName 取节点，
 * 与具体实现无关；ETag 常带引号（"abc"），统一剥掉）。
 * 浏览器用全局 DOMParser；测试环境注入解析器。
 */

export type XmlParser = (xml: string) => Document;

const defaultParser: XmlParser | undefined =
  typeof DOMParser !== 'undefined'
    ? (xml) => new DOMParser().parseFromString(xml, 'text/xml')
    : undefined;

export function parseListObjectsXml(
  xml: string,
  parse: XmlParser = defaultParser ?? failNoParser,
): CloudFileMeta[] {
  const doc = parse(xml);
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('云端清单 XML 解析失败');
  }

  const result: CloudFileMeta[] = [];
  for (const node of doc.getElementsByTagName('*')) {
    if (node.localName !== 'Contents') continue;
    let key = '';
    let etag: string | undefined;
    for (const child of node.getElementsByTagName('*')) {
      if (child.localName === 'Key') key = child.textContent?.trim() ?? '';
      if (child.localName === 'ETag') {
        etag = child.textContent?.trim().replace(/^&quot;|&quot;$/g, '').replace(/^"|"$/g, '') || undefined;
      }
    }
    if (key) result.push({ file: key, etag });
  }
  return result;
}

/** 从 endpoint 主机名推断 SigV4 region（纯函数，spec 覆盖） */
export function inferS3Region(endpoint: string): string {
  const host = new URL(endpoint).hostname;
  if (host.endsWith('.r2.cloudflarestorage.com')) return 'auto';
  // 阿里云 OSS：oss-cn-hangzhou.aliyuncs.com 或 bucket.oss-cn-shenzhen.aliyuncs.com → cn-hangzhou
  const oss = host.match(/^(?:[\w-]+\.)?oss-([a-z0-9-]+)\.aliyuncs\.com(?:\.cn)?/);
  if (oss) return oss[1];
  // 腾讯云 COS：bucket.cos.ap-guangzhou.myqcloud.com → ap-guangzhou
  const cos = host.match(/\.cos\.([a-z]+-[a-z]+)\.myqcloud\.com/);
  if (cos) return cos[1];
  // AWS：s3.us-east-1.amazonaws.com → us-east-1
  const aws = host.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com/);
  if (aws) return aws[1];
  return 'us-east-1';
}

function failNoParser(): Document {
  throw new Error('当前环境无 DOMParser，需注入解析器');
}

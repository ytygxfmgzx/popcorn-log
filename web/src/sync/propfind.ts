import type { CloudFileMeta } from '@/types';

/**
 * 解析 WebDAV PROPFIND multistatus XML → 文件清单（file + etag）
 * 命名空间前缀不定（d: / D: / 无），按 localName 取节点，兼容坚果云各端返回。
 * 默认用浏览器全局 DOMParser；测试环境注入解析器（见 propfind.spec.ts）。
 */

export type XmlParser = (xml: string) => Document;

const defaultParser: XmlParser | undefined =
  typeof DOMParser !== 'undefined' ? (xml) => new DOMParser().parseFromString(xml, 'text/xml') : undefined;

export function parsePropfind(xml: string, parse: XmlParser = defaultParser ?? failNoParser): CloudFileMeta[] {
  const doc = parse(xml);
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error('云端清单 XML 解析失败');

  const result: CloudFileMeta[] = [];
  for (const response of doc.getElementsByTagName('*')) {
    if (response.localName !== 'response') continue;

    let file = '';
    let etag: string | undefined;
    for (const child of response.getElementsByTagName('*')) {
      if (child.localName === 'href' && !file) {
        file = decodeURIComponent(child.textContent?.trim() ?? '');
        // /dav/popcorn-log/records/xxx.json → records/xxx.json（去掉根前缀，统一相对路径）
        const marker = '/popcorn-log/';
        const idx = file.indexOf(marker);
        if (idx !== -1) file = file.slice(idx + marker.length);
      }
      if (child.localName === 'getetag') {
        // 坚果云的 etag 常带引号（"abc123"），统一剥掉
        etag = child.textContent?.trim().replace(/^"|"$/g, '') || undefined;
      }
    }
    // 目录本身的 response（href 以 / 结尾）跳过，只要文件
    if (!file || file.endsWith('/')) continue;
    result.push({ file, etag });
  }
  return result;
}

function failNoParser(): Document {
  throw new Error('当前环境无 DOMParser，需注入解析器');
}

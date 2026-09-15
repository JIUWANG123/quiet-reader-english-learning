export type TextPage = { text: string; heading: string | null };
export const MAX_IMPORT_BYTES = 128 * 1024 * 1024;

export function fileFormat(name: string): 'txt' | 'epub' {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension !== 'txt' && extension !== 'epub') throw new Error('请选择 .txt 或 .epub 文件。');
  return extension;
}

export function normalizeText(raw: string) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new Error('这个 TXT 文件没有正文。');
  if (text.includes('\0') || text.includes('\uFFFD')) {
    throw new Error('暂不支持此文本编码，请将文件另存为 UTF-8 后导入。');
  }
  return text;
}

// Stable text chunks, independent of font size. Original whitespace is retained.
export function paginateText(text: string, limit = 3500): TextPage[] {
  if (limit < 100) throw new Error('分段长度过小');
  const pages: TextPage[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const minimum = start + Math.floor(limit / 2);
      const paragraph = text.lastIndexOf('\n\n', end);
      const space = text.lastIndexOf(' ', end);
      if (paragraph > minimum) end = paragraph + 2;
      else if (space > minimum) end = space + 1;
      else if (/[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
    }
    const body = text.slice(start, end);
    const firstLine = body.trimStart().split('\n')[0].trim();
    const heading = /^(chapter\b|part\b|book\s+[ivx\d]+\b|第.+章)/i.test(firstLine) && firstLine.length < 100
      ? firstLine : null;
    pages.push({ text: body, heading });
    start = end;
  }
  return pages;
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export function readingProgress(page: number, fraction: number, count: number) {
  return count > 0 ? clamp((page + clamp(fraction, 0, 1)) / count, 0, 1) : 0;
}

export function splitSearchText(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = [];
  let start = 0;
  for (const match of text.matchAll(new RegExp(escaped, 'gi'))) {
    if (match.index > start) parts.push({ text: text.slice(start, match.index), match: false });
    parts.push({ text: match[0], match: true });
    start = match.index + match[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start), match: false });
  return parts;
}

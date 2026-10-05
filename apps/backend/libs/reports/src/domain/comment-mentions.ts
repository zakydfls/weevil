export function extractMentionEmails(body: string): string[] {
  return [...new Set(Array.from(
    body.matchAll(/(?<![\w@])@([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi),
    (match) => match[1].toLowerCase(),
  ))];
}

export function extractMentionUserIds(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(/@\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g), (match) => match[2]))];
}

export function renderMentionNames(body: string): string {
  return body.replace(/@\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g, (token: string, name: string) => {
    try { return `@${decodeURIComponent(name)}`; } catch { return token; }
  });
}

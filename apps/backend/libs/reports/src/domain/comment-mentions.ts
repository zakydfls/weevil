export function extractMentionEmails(body: string): string[] {
  return [...new Set(Array.from(
    body.matchAll(/(?<![\w@])@([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi),
    (match) => match[1].toLowerCase(),
  ))];
}

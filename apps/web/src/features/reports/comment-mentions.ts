interface MentionRange {
  start: number;
  end: number;
  token: string;
}

export function readCommentMentions(body: string) {
  const mentions: MentionRange[] = [];
  let text = '';
  let offset = 0;
  for (const match of body.matchAll(/@\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g)) {
    let name: string;
    try { name = decodeURIComponent(match[1]); } catch { continue; }
    text += body.slice(offset, match.index);
    const start = text.length;
    text += `@${name}`;
    mentions.push({ start, end: text.length, token: match[0] });
    offset = match.index + match[0].length;
  }
  text += body.slice(offset);
  return { text, mentions };
}

export function updateCommentMentionText(body: string, nextText: string) {
  const previous = readCommentMentions(body);
  let start = 0;
  while (start < previous.text.length && start < nextText.length && previous.text[start] === nextText[start]) start++;
  let oldEnd = previous.text.length;
  let newEnd = nextText.length;
  while (oldEnd > start && newEnd > start && previous.text[oldEnd - 1] === nextText[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = newEnd - oldEnd;
  const kept = previous.mentions.flatMap((mention) => {
    if (mention.end <= start) return [mention];
    if (mention.start >= oldEnd) return [{ ...mention, start: mention.start + delta, end: mention.end + delta }];
    return [];
  });
  return writeCommentMentions(nextText, kept);
}

export function writeCommentMentions(text: string, mentions: MentionRange[]) {
  let body = text;
  for (const mention of [...mentions].sort((left, right) => right.start - left.start)) {
    body = body.slice(0, mention.start) + mention.token + body.slice(mention.end);
  }
  return body;
}

export function memberMentionToken(userId: string, name: string) {
  return `@[${encodeURIComponent(name)}](${userId})`;
}

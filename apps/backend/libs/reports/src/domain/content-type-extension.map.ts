export const ContentTypeExtensions = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'application/json': 'json',
  'application/har+json': 'har',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
} as const;

export function extensionFromContentType(contentType: string): string {
  const normalizedContentType = contentType.toLowerCase().split(';')[0]?.trim();

  if (!normalizedContentType) {
    return 'bin';
  }

  return ContentTypeExtensions[normalizedContentType as keyof typeof ContentTypeExtensions] ?? 'bin';
}

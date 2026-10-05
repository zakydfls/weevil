import type { NetworkRequestEntry } from '../../lib/api/types';

export function findNetworkMatch(request: NetworkRequestEntry, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;

  const fields = [
    ['Headers', 'URL', request.url],
    ['Request', 'Method', request.method],
    ['Response', 'Status', request.statusCode],
    ['Request', 'Request headers', request.requestHeaders],
    ['Request', 'Request body', request.requestBody],
    ['Response', 'Response headers', request.responseHeaders],
    ['Response', 'Response body', request.responseBody],
    ['Response', 'Error', request.error],
    ['Response', 'Duration', request.durationMs],
    ['Headers', 'Type', request.resourceType],
    ['Headers', 'Offset', request.offsetMs],
    ['Headers', 'Started at', request.startedAt],
    ['Headers', 'Ended at', request.endedAt],
    ['Headers', 'Request ID', request.requestId],
    ['Headers', 'Session ID', request.sessionId],
  ] as const;

  for (const [tab, label, value] of fields) {
    const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
    const index = text.toLowerCase().indexOf(normalizedQuery);
    if (index !== -1) {
      const start = Math.max(0, index - 40);
      const end = Math.min(text.length, index + normalizedQuery.length + 80);
      return {
        tab,
        label,
        before: `${start > 0 ? '…' : ''}${text.slice(start, index)}`,
        match: text.slice(index, index + normalizedQuery.length),
        after: `${text.slice(index + normalizedQuery.length, end)}${end < text.length ? '…' : ''}`,
      };
    }
  }
  return null;
}

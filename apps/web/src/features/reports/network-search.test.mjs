import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findNetworkMatch } from './network-search.ts';

const request = {
  id: 'request-1',
  method: 'POST',
  url: 'https://example.com/api/orders?customer=Zaky',
  statusCode: 422,
  requestHeaders: { 'X-Correlation-ID': 'trace-123' },
  responseHeaders: { 'Content-Type': 'application/json' },
  requestBody: '{"product":"Coffee"}',
  responseBody: '{"error":"Insufficient stock"}',
  error: 'Validation failed',
  startedAt: '2026-10-05T10:00:00Z',
};

test('searches network metadata, headers and both bodies without case sensitivity', () => {
  for (const [query, tab, label] of [
    ['zaky', 'Headers', 'URL'],
    ['post', 'Request', 'Method'],
    ['422', 'Response', 'Status'],
    ['TRACE-123', 'Request', 'Request headers'],
    [' coffee ', 'Request', 'Request body'],
    ['application/json', 'Response', 'Response headers'],
    ['insufficient stock', 'Response', 'Response body'],
    ['validation', 'Response', 'Error'],
  ]) {
    const match = findNetworkMatch(request, query);
    assert.equal(match?.tab, tab);
    assert.equal(match?.label, label);
    assert.equal(match?.match.toLowerCase(), query.trim().toLowerCase());
  }
  assert.equal(findNetworkMatch(request, 'missing text'), null);
  assert.equal(findNetworkMatch(request, '  '), null);
  assert.equal(findNetworkMatch({ ...request, responseBody: null }, 'stock'), null);
  assert.equal(findNetworkMatch(request, '.*'), null);
  const match = findNetworkMatch({ ...request, responseBody: `${'x'.repeat(100)}needle${'y'.repeat(100)}` }, 'needle');
  assert.equal(match?.before, `…${'x'.repeat(40)}`);
  assert.equal(match?.after, `${'y'.repeat(80)}…`);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitSearchText } from './network-search.ts';

test('highlights every literal match and preserves original text', () => {
  const text = '"project_name": "Kontrak test", "name": "TEST"';
  const parts = splitSearchText(text, ' test ');
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.deepEqual(parts.filter(part => part.match).map(part => part.text), ['test', 'TEST']);
  assert.deepEqual(splitSearchText('a.*b.*', '.*').filter(part => part.match).map(part => part.text), ['.*', '.*']);
  assert.deepEqual(splitSearchText('unchanged', ' '), [{ text: 'unchanged', match: false }]);
  assert.deepEqual(splitSearchText('unchanged', 'missing'), [{ text: 'unchanged', match: false }]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memberMentionToken, readCommentMentions, updateCommentMentionText } from './comment-mentions.ts';

test('shows names while preserving recipient IDs across edits', () => {
  const token = memberMentionToken('user-1', 'Alice QA');
  const body = `Hi ${token}, please check.`;
  assert.equal(readCommentMentions(body).text, 'Hi @Alice QA, please check.');
  assert.equal(updateCommentMentionText(body, 'Hello @Alice QA, please check.'), `Hello ${token}, please check.`);
  assert.equal(updateCommentMentionText(body, 'Hi @Alice QA, thanks.'), `Hi ${token}, thanks.`);
  assert.equal(updateCommentMentionText(body, 'Hi @Alice Q, please check.'), 'Hi @Alice Q, please check.');
  assert.equal(updateCommentMentionText(body, 'Hi , please check.'), 'Hi , please check.');
  const sameNames = `${memberMentionToken('user-1', 'Alice')} ${memberMentionToken('user-2', 'Alice')}`;
  assert.deepEqual(readCommentMentions(sameNames).mentions.map(mention => mention.token), ['@[Alice](user-1)', '@[Alice](user-2)']);
  const special = memberMentionToken('user-1', 'Alice [QA] (Team)');
  assert.equal(readCommentMentions(special).text, '@Alice [QA] (Team)');
});

import assert from 'node:assert/strict';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InAppNotificationEvents } from '@weevil/contracts';
import { ReportsService } from '../libs/reports/src/application/reports.service';
import { ReportNotificationService } from '../libs/reports/src/application/report-notification.service';
import { extractMentionEmails } from '../libs/reports/src/domain/comment-mentions';

async function check() {
  assert.deepEqual(extractMentionEmails('Email a@example.com; tag @A@example.com and @a@example.com.'), ['a@example.com']);
  assert.deepEqual(extractMentionEmails('Hi (@a+qa@example.com), @b@example.com!'), ['a+qa@example.com', 'b@example.com']);

  const eventEmitter = new EventEmitter2();
  let members = [{ user: { id: 'recipient', email: 'a@example.com' } }];
  let writes = 0;
  let commentEvent: { mentionedUserIds: string[]; commentId: string } | undefined;
  eventEmitter.on('report.comment.created', (event: typeof commentEvent) => { commentEvent = event; });
  const comments = Object.assign(Object.create(ReportsService.prototype) as object, {
    prisma: {
      bugReport: { findUnique: () => Promise.resolve({ id: 'report', workspaceId: 'workspace', metadata: {} }) },
      workspaceMember: { findMany: () => Promise.resolve(members) },
      reportComment: { create: ({ data }: { data: { authorId: string; body: string } }) => {
        writes++;
        assert.equal(data.authorId, 'actor');
        return Promise.resolve({ ...data, id: 'comment', authorName: 'Author', createdAt: new Date(), updatedAt: new Date() });
      } },
    },
    eventEmitter,
    redaction: { shouldRedact: () => false },
  }) as unknown as ReportsService;
  await comments.createComment('report', { body: 'Hi @a@example.com @a@example.com' }, { actorUserId: 'actor', workspaceId: 'workspace' });
  assert.deepEqual(commentEvent?.mentionedUserIds, ['recipient']);
  assert.equal(commentEvent?.commentId, 'comment');
  assert.equal(writes, 1);
  members = [{ user: { id: 'actor', email: 'a@example.com' } }];
  await assert.rejects(comments.createComment('report', { body: '@a@example.com' }, { actorUserId: 'actor', workspaceId: 'workspace' }), /cannot mention yourself/);
  members = [];
  await assert.rejects(comments.createComment('report', { body: '@outsider@example.com' }, { actorUserId: 'actor', workspaceId: 'workspace' }), /active members/);
  assert.equal(writes, 1);

  const recipient = { userId: 'recipient', email: 'a@example.com', displayName: 'Recipient' };
  const report = {
    id: 'report', workspaceId: 'workspace', title: '<Capture>', shareToken: 'share', createdAt: new Date(),
    workspace: { name: 'Workspace', slug: 'workspace' }, project: { name: 'Project' }, createdBy: null,
  };
  let emailEnabled = false;
  const sent: Array<{ html: string; subject: string }> = [];
  const inApp: Array<{ notifications: Array<{ userId: string; type: string; actionUrl: string }> }> = [];
  eventEmitter.on(InAppNotificationEvents.Requested, (event: typeof inApp[number]) => { inApp.push(event); });
  const notifications = Object.assign(Object.create(ReportNotificationService.prototype) as object, {
    config: { webAppUrl: 'http://localhost:3000' },
    prisma: {
      bugReport: { findFirst: () => Promise.resolve(report) },
      workspaceMember: { findMany: ({ where }: { where: { user: { id: { in: string[] } } } }) => {
        assert.deepEqual(where.user.id.in, ['recipient']);
        return Promise.resolve([{ user: { id: recipient.userId, email: recipient.email, displayName: recipient.displayName } }]);
      } },
      userNotificationPreference: { findMany: ({ where }: { where: Record<string, unknown> }) => Promise.resolve(
        where.emailOnMention && !emailEnabled ? [] : [{ user: { id: recipient.userId, email: recipient.email, displayName: recipient.displayName } }],
      ) },
    },
    mailer: { send: (message: typeof sent[number]) => { sent.push(message); return Promise.resolve({ sent: true }); } },
    eventEmitter,
  }) as unknown as ReportNotificationService;
  const event = { reportId: 'report', actorUserId: 'actor', authorName: 'Author', body: 'Hi @a@example.com', mentionedUserIds: ['recipient', 'recipient', 'actor'], commentId: 'comment' };
  await notifications.handleCommentCreated(event);
  assert.equal(sent.length, 0, 'email toggle off suppresses mention email, including generic comment duplicates');
  assert.equal(inApp.flatMap(item => item.notifications).length, 1);
  assert.equal(inApp[0].notifications[0].type, 'report_comment_mentioned');
  assert.equal(inApp[0].notifications[0].actionUrl, '/c/report#comment-comment');
  emailEnabled = true;
  await notifications.handleCommentCreated(event);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /You were mentioned/);
  assert.match(sent[0].html, /&lt;Capture&gt;/);
  console.log('Comment mention checks passed: self-tag, workspace validation, deduplication, email toggle and in-app delivery.');
}

void check().catch((error: unknown) => { console.error(error); process.exitCode = 1; });

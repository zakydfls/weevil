import { ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export interface ReportAccessOptions {
  workspaceId?: string | null;
  reportToken?: string | null;
}

export interface ReportAccessSubject {
  workspaceId: string;
  shareToken?: string | null;
  ingestToken?: string | null;
}

export function requireWorkspaceId(workspaceId: string | null | undefined): string {
  if (!workspaceId) {
    throw new ForbiddenException('No active workspace for this request.');
  }
  return workspaceId;
}

export function assertWorkspaceAccess(subject: ReportAccessSubject, workspaceId?: string | null) {
  if (subject.workspaceId !== requireWorkspaceId(workspaceId)) {
    throw new ForbiddenException('Report belongs to a different workspace.');
  }
}

export function assertReportAccess(subject: ReportAccessSubject, options: ReportAccessOptions) {
  if (options.workspaceId && subject.workspaceId === options.workspaceId) {
    return;
  }
  if (hasReportTokenAccess(subject, options.reportToken)) {
    return;
  }
  throw new ForbiddenException('You do not have access to this report.');
}

export function hasReportTokenAccess(
  subject: ReportAccessSubject,
  reportToken: string | null | undefined,
) {
  if (safeTokenEquals(subject.ingestToken, reportToken)) {
    return true;
  }
  // Backward compatibility for captures created before ingestToken existed.
  return !subject.ingestToken && safeTokenEquals(subject.shareToken, reportToken);
}

function safeTokenEquals(expected: string | null | undefined, received: string | null | undefined) {
  const cleanExpected = expected?.trim();
  const cleanReceived = received?.trim();
  if (!cleanExpected || !cleanReceived) return false;

  const expectedBuffer = Buffer.from(cleanExpected);
  const receivedBuffer = Buffer.from(cleanReceived);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

import type {
  AttachTelemetryInput,
  BackendTraceEntry,
  CaptureSession,
  CompleteCaptureSessionInput,
  ConsoleLogEntry,
  CreateCaptureSessionInput,
  CreateReportInput,
  CreateUploadInput,
  CreateUploadResponse,
  DomEventEntry,
  DownloadUrlResponse,
  ListReportsParams,
  NetworkRequestEntry,
  PageActionEntry,
  PaginatedReportsResponse,
  PerformanceEntry,
  ReportDetail,
  ReportSummary,
  RuntimeErrorEntry,
  TimelineEntry,
} from './types';
import { appEnv, readPublicEnv } from '@/lib/env';

const DEFAULT_API_BASE_URL = 'http://localhost:4000/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
  }
}

export function getApiBaseUrl() {
  const configured = readPublicEnv(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!configured) {
    if (appEnv.isProduction) {
      throw new Error('NEXT_PUBLIC_API_BASE_URL is required in production.');
    }
    return DEFAULT_API_BASE_URL;
  }

  const withProtocol = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  return withProtocol.replace(/\/+$/, '');
}

/**
 * Auth state holder. The AuthProvider wires this on mount; everything else just reads.
 * Kept outside React so non-component callers (queries.ts, extension-bridge) work too.
 */
interface AuthState {
  token: string | null;
  workspaceSlug: string | null;
}
const authState: AuthState = { token: null, workspaceSlug: null };
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authState.token = token;
}

export function setActiveWorkspaceSlug(slug: string | null) {
  authState.workspaceSlug = slug;
}

export function onAuthError(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function getAuthToken(): string | null {
  return authState.token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (authState.token) {
    headers.authorization = `Bearer ${authState.token}`;
  }
  if (authState.workspaceSlug) {
    headers['x-weevil-workspace'] = authState.workspaceSlug;
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok) {
    throw new ApiError(
      `API request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export const apiClient = {
  listReports: (params: ListReportsParams = {}) =>
    request<PaginatedReportsResponse>(`/reports${toQueryString(params)}`),

  getReportDetail: (reportId: string) => request<ReportDetail>(`/reports/${reportId}/detail`),

  getReportTimeline: (reportId: string) =>
    request<TimelineEntry[]>(`/reports/${reportId}/timeline`),

  createReport: (input: CreateReportInput) =>
    request<ReportSummary>('/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createUpload: (reportId: string, input: CreateUploadInput) =>
    request<CreateUploadResponse>(`/reports/${reportId}/uploads`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  completeUpload: (reportId: string, uploadId: string, byteSize: number) =>
    request<string>(`/reports/${reportId}/uploads/${uploadId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ byteSize }),
    }),

  getDownloadUrl: (reportId: string, uploadId: string) =>
    request<DownloadUrlResponse>(`/reports/${reportId}/uploads/${uploadId}/download-url`),

  createCaptureSession: (reportId: string, input: CreateCaptureSessionInput) =>
    request<CaptureSession>(`/reports/${reportId}/capture-sessions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  completeCaptureSession: (
    reportId: string,
    sessionId: string,
    input: CompleteCaptureSessionInput,
  ) =>
    request<CaptureSession>(`/reports/${reportId}/capture-sessions/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  attachConsoleLogs: (reportId: string, input: AttachTelemetryInput<Partial<ConsoleLogEntry>>) =>
    request<number>(`/reports/${reportId}/telemetry/console`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  attachNetworkRequests: (
    reportId: string,
    input: AttachTelemetryInput<Partial<NetworkRequestEntry>>,
  ) =>
    request<number>(`/reports/${reportId}/telemetry/network`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  attachPageActions: (reportId: string, input: AttachTelemetryInput<Partial<PageActionEntry>>) =>
    request<number>(`/reports/${reportId}/telemetry/actions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  attachRuntimeErrors: (
    reportId: string,
    input: AttachTelemetryInput<Partial<RuntimeErrorEntry>>,
  ) =>
    request<number>(`/reports/${reportId}/telemetry/errors`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  attachPerformanceEntries: (
    reportId: string,
    input: AttachTelemetryInput<Partial<PerformanceEntry>>,
  ) =>
    request<number>(`/reports/${reportId}/telemetry/performance`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  attachDomEvents: (reportId: string, input: AttachTelemetryInput<Partial<DomEventEntry>>) =>
    request<number>(`/reports/${reportId}/telemetry/dom-events`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  attachBackendTraces: (
    reportId: string,
    input: AttachTelemetryInput<Partial<BackendTraceEntry>>,
  ) =>
    request<number>(`/reports/${reportId}/telemetry/backend-traces`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createComment: (reportId: string, body: string) =>
    request(`/reports/${reportId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        authorName: 'Weevil User',
        body,
      }),
    }),

  // ── Auth ───────────────────────────────────────────────────────────────────
  signup: (body: {
    email: string;
    password: string;
    displayName?: string;
    workspaceName?: string;
    workspaceSlug?: string;
    inviteToken?: string;
  }) =>
    request<{
      token: string;
      sessionId: string;
      userId: string;
      workspaceId: string | null;
      expiresAt: string;
    }>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<{
      token: string;
      sessionId: string;
      userId: string;
      defaultWorkspaceId: string | null;
      expiresAt: string;
    }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  getInvitePreview: (inviteToken: string) =>
    request<{
      email: string;
      role: string;
      expiresAt: string;
      workspace: { slug: string; name: string };
      invitedBy: { email: string; displayName: string | null } | null;
    }>(`/auth/invites/${encodeURIComponent(inviteToken)}`),

  acceptInvite: (body: { inviteToken: string }) =>
    request<{
      workspace: { id: string; slug: string; name: string };
      role: string;
    }>('/auth/invites/accept', { method: 'POST', body: JSON.stringify(body) }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{
      user: {
        id: string;
        email: string;
        displayName: string | null;
        platformRole: string;
      };
      workspace: {
        id: string;
        slug: string;
        role: string;
        permissions: string[];
      } | null;
    }>('/auth/me', { method: 'POST' }),

  // ── Workspaces ─────────────────────────────────────────────────────────────
  listMyWorkspaces: () =>
    request<
      Array<{
        id: string;
        slug: string;
        name: string;
        role: string;
        status: string;
        joinedAt: string | null;
      }>
    >('/workspaces/mine'),

  createWorkspace: (body: { name: string; slug: string }) =>
    request<{ id: string; slug: string; name: string }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listMembers: () =>
    request<
      Array<{
        id: string;
        userId: string;
        email: string;
        displayName: string | null;
        avatarUrl: string | null;
        role: string;
        status: string;
        extraPermissions: string[];
        deniedPermissions: string[];
        effectivePermissions: string[];
        joinedAt: string | null;
        lastActiveAt: string | null;
      }>
    >('/workspaces/current/members'),

  inviteMember: (body: { email: string; role: string }) =>
    request<{
      id: string;
      email: string;
      role: string;
      token: string;
      expiresAt: string;
      inviteUrl: string;
      emailSent: boolean;
      notificationId: string | null;
    }>('/workspaces/current/members/invite', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  changeMemberRole: (memberId: string, role: string) =>
    request<unknown>(`/workspaces/current/members/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeMember: (memberId: string) =>
    request<void>(`/workspaces/current/members/${memberId}`, {
      method: 'DELETE',
    }),

  // ── Platform admin (PLATFORM_ADMIN role only) ──────────────────────────────
  platformOverview: () =>
    request<{
      generatedAt: string;
      counts: {
        workspaces: { total: number; active: number };
        users: { total: number; active: number };
        reports: { total: number; last30Days: number; prev30Days: number };
        activeSessionsLast30Days: number;
      };
      growth: {
        newWorkspaces30: number;
        newUsers30: number;
        reportGrowthPct: number | null;
      };
      timeline: { capturesByDay: Array<{ day: string; count: number }> };
    }>('/platform/overview'),

  platformRecentActivity: () =>
    request<
      Array<{
        type: 'capture';
        id: string;
        title: string;
        status: string;
        createdAt: string;
        workspace: { id: string; slug: string; name: string };
        createdBy: { email: string; displayName: string | null } | null;
      }>
    >('/platform/recent-activity'),

  platformWorkspaces: () =>
    request<
      Array<{
        id: string;
        slug: string;
        name: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        memberCount: number;
        reportCount: number;
        projectCount: number;
      }>
    >('/platform/workspaces'),

  platformSetWorkspaceStatus: (id: string, status: string) =>
    request<unknown>(`/platform/workspaces/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  platformUsers: (search?: string) =>
    request<
      Array<{
        id: string;
        email: string;
        displayName: string | null;
        status: string;
        platformRole: string;
        createdAt: string;
        sessionCount: number;
        workspaces: Array<{
          id: string;
          slug: string;
          name: string;
          role: string;
        }>;
      }>
    >(`/platform/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  platformSetUserStatus: (id: string, status: string) =>
    request<unknown>(`/platform/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  platformSetUserRole: (id: string, platformRole: string) =>
    request<unknown>(`/platform/users/${id}/platform-role`, {
      method: 'PATCH',
      body: JSON.stringify({ platformRole }),
    }),
};

export async function uploadBlobToPresignedUrl(putUrl: string, blob: Blob) {
  const response = await fetch(putUrl, {
    method: 'PUT',
    body: blob,
  });

  if (!response.ok) {
    throw new ApiError(
      'Failed to upload artifact to object storage',
      response.status,
      await response.text(),
    );
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function toQueryString(params: ListReportsParams) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

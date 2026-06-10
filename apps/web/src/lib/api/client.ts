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
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new ApiError(`API request failed with status ${response.status}`, response.status, payload);
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

  attachConsoleLogs: (
    reportId: string,
    input: AttachTelemetryInput<Partial<ConsoleLogEntry>>,
  ) =>
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
};

export async function uploadBlobToPresignedUrl(putUrl: string, blob: Blob) {
  const response = await fetch(putUrl, {
    method: 'PUT',
    body: blob,
  });

  if (!response.ok) {
    throw new ApiError('Failed to upload artifact to object storage', response.status, await response.text());
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

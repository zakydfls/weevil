import type {
  BackendTraceTelemetryEntry,
  CaptureSessionResponse,
  CompleteCaptureSessionInput,
  CompleteUploadInput,
  ConsoleTelemetryEntry,
  CreateCaptureSessionInput,
  CreateReportInput,
  CreateReportResponse,
  CreateUploadInput,
  CreateUploadResponse,
  DomEventTelemetryEntry,
  NetworkTelemetryEntry,
  PageActionTelemetryEntry,
  PerformanceTelemetryEntry,
  RuntimeErrorTelemetryEntry,
  UpdateReportInput,
} from './types';

const MAX_ATTACH_BODY_BYTES = 80_000;
const MAX_ATTACH_STRING_CHARS = 8_000;
const MAX_ATTACH_OBJECT_DEPTH = 5;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
  }
}

export class WeevilApiClient {
  constructor(private readonly apiBaseUrl: string) {}

  createReport(input: CreateReportInput) {
    return this.request<CreateReportResponse>('/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateReport(reportId: string, input: UpdateReportInput, reportToken?: string | null) {
    return this.request<CreateReportResponse>(`/reports/${reportId}`, {
      method: 'PATCH',
      headers: reportTokenHeaders(reportToken),
      body: JSON.stringify(input),
    });
  }

  createCaptureSession(
    reportId: string,
    input: CreateCaptureSessionInput,
    reportToken?: string | null,
  ) {
    return this.request<CaptureSessionResponse>(`/reports/${reportId}/capture-sessions`, {
      method: 'POST',
      headers: reportTokenHeaders(reportToken),
      body: JSON.stringify(input),
    });
  }

  completeCaptureSession(
    reportId: string,
    sessionId: string,
    input: CompleteCaptureSessionInput,
    reportToken?: string | null,
  ) {
    return this.request<CaptureSessionResponse>(
      `/reports/${reportId}/capture-sessions/${sessionId}/complete`,
      {
        method: 'POST',
        headers: reportTokenHeaders(reportToken),
        body: JSON.stringify(input),
      },
    );
  }

  createUpload(reportId: string, input: CreateUploadInput, reportToken?: string | null) {
    return this.request<CreateUploadResponse>(`/reports/${reportId}/uploads`, {
      method: 'POST',
      headers: reportTokenHeaders(reportToken),
      body: JSON.stringify(input),
    });
  }

  completeUpload(
    reportId: string,
    uploadId: string,
    input: CompleteUploadInput,
    reportToken?: string | null,
  ) {
    return this.request<string>(`/reports/${reportId}/uploads/${uploadId}/complete`, {
      method: 'POST',
      headers: reportTokenHeaders(reportToken),
      body: JSON.stringify(input),
    });
  }

  attachConsoleLogs(reportId: string, entries: ConsoleTelemetryEntry[], reportToken?: string | null) {
    return this.attach(reportId, 'console', entries, reportToken);
  }

  attachNetworkRequests(
    reportId: string,
    entries: NetworkTelemetryEntry[],
    reportToken?: string | null,
  ) {
    return this.attach(reportId, 'network', entries, reportToken);
  }

  attachPageActions(reportId: string, entries: PageActionTelemetryEntry[], reportToken?: string | null) {
    return this.attach(reportId, 'actions', entries, reportToken);
  }

  attachRuntimeErrors(
    reportId: string,
    entries: RuntimeErrorTelemetryEntry[],
    reportToken?: string | null,
  ) {
    return this.attach(reportId, 'errors', entries, reportToken);
  }

  attachPerformanceEntries(
    reportId: string,
    entries: PerformanceTelemetryEntry[],
    reportToken?: string | null,
  ) {
    return this.attach(reportId, 'performance', entries, reportToken);
  }

  attachDomEvents(reportId: string, entries: DomEventTelemetryEntry[], reportToken?: string | null) {
    return this.attach(reportId, 'dom-events', entries, reportToken);
  }

  attachBackendTraces(
    reportId: string,
    entries: BackendTraceTelemetryEntry[],
    reportToken?: string | null,
  ) {
    return this.attach(reportId, 'backend-traces', entries, reportToken);
  }

  async uploadBlob(putUrl: string, bytes: Blob | ArrayBuffer, contentType: string) {
    let response: Response;
    try {
      response = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'content-type': contentType,
        },
        body: bytes,
      });
    } catch (error) {
      throw new ApiError(networkErrorMessage('object storage upload URL', error), 0, null);
    }

    if (!response.ok) {
      throw new ApiError('Failed to upload recording artifact', response.status, await response.text());
    }
  }

  private async attach<TEntry>(
    reportId: string,
    kind: string,
    entries: TEntry[],
    reportToken?: string | null,
  ) {
    if (entries.length === 0) {
      return 0;
    }

    const chunks = chunkAttachEntries(entries);
    const counts = await Promise.all(
      chunks.map((items) =>
        this.request<number>(`/reports/${reportId}/telemetry/${kind}`, {
          method: 'POST',
          headers: reportTokenHeaders(reportToken),
          body: JSON.stringify({ entries: items }),
        }),
      ),
    );

    return counts.reduce((total, count) => total + count, 0);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };

    // Send the dashboard's session cookie to the API. Combined with the
    // backend's `credentials: true` CORS + the extension's host_permission
    // for the API origin, the session is recognized by the AuthGuard and
    // captures land in the user's workspace (instead of the dev tenant).
    const url = `${this.apiBaseUrl.replace(/\/+$/, '')}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        credentials: 'include',
        headers,
      });
    } catch (error) {
      throw new ApiError(networkErrorMessage(url, error), 0, null);
    }
    const text = await response.text();
    const payload = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new ApiError(apiErrorMessage(payload, response.status), response.status, payload);
    }

    return payload as T;
  }
}

function apiErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message = Array.isArray(record.message) ? record.message.join(', ') : record.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error;
    }
  }
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }
  return `API request failed with status ${status}`;
}

function networkErrorMessage(url: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return `Cannot reach Weevil API at ${url}. Make sure the backend is running and the extension API URL is correct. ${detail}`;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function reportTokenHeaders(reportToken: string | null | undefined): Record<string, string> {
  return reportToken ? { 'x-weevil-report-token': reportToken } : {};
}

function chunkAttachEntries<TEntry>(entries: TEntry[]) {
  const chunks: TEntry[][] = [];
  let current: TEntry[] = [];

  entries.forEach((entry) => {
    const compactEntry = ensureEntryFits(entry);
    const next = [...current, compactEntry];
    if (current.length > 0 && byteSize(JSON.stringify({ entries: next })) > MAX_ATTACH_BODY_BYTES) {
      chunks.push(current);
      current = [compactEntry];
      return;
    }

    current = next;
  });

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function ensureEntryFits<TEntry>(entry: TEntry): TEntry {
  if (byteSize(JSON.stringify({ entries: [entry] })) <= MAX_ATTACH_BODY_BYTES) {
    return entry;
  }

  const compactEntry = compactValue(entry, 0) as TEntry;
  if (byteSize(JSON.stringify({ entries: [compactEntry] })) <= MAX_ATTACH_BODY_BYTES) {
    return compactEntry;
  }

  return compactValue(entry, 0, 2_000) as TEntry;
}

function compactValue(value: unknown, depth: number, maxStringLength = MAX_ATTACH_STRING_CHARS): unknown {
  if (typeof value === 'string') {
    return truncate(value, maxStringLength);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (depth >= MAX_ATTACH_OBJECT_DEPTH) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => compactValue(item, depth + 1, maxStringLength));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      compactValue(entryValue, depth + 1, maxStringLength),
    ]),
  );
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function byteSize(value: string) {
  return new Blob([value]).size;
}

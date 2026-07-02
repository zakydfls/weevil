import {
  BackendTraceStatus,
  PageMessageTypes,
  PerformanceEntryKind,
  RuntimeErrorKind,
} from '../shared/constants';
import { nowIso, safeStringify, truncateBody, truncateText } from '../shared/telemetry-utils';

const installedFlag = '__WEevil_PAGE_BRIDGE_INSTALLED_20260604_CONSOLE_RECAPTURE__';
const consoleControlMessageType = 'WEevil_PAGE_CONSOLE_CONTROL';
const telemetryControlMessageType = 'WEevil_PAGE_TELEMETRY_CONTROL';
const responseBodyReadTimeoutMs = 1_500;
const originalConsoleMethods = new Map<string, (...args: unknown[]) => void>();
let originalConsoleAssert: ((condition?: boolean, ...args: unknown[]) => void) | undefined;
let isConsolePatched = false;
let originalFetch: typeof window.fetch | undefined;
let originalXhrOpen: typeof XMLHttpRequest.prototype.open | undefined;
let originalXhrSend: typeof XMLHttpRequest.prototype.send | undefined;
let originalXhrSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader | undefined;
let xhrMetadata = new WeakMap<XMLHttpRequest, XhrMetadata>();
let isNetworkPatched = false;
let isTelemetryEnabled = false;

declare global {
  interface Window {
    [installedFlag]?: boolean;
  }
}

if (!window[installedFlag]) {
  window[installedFlag] = true;
  attachConsoleControlListener();
  attachTelemetryControlListener();
  attachErrorListeners();
  schedulePerformanceCollection();
}

function post(type: string, payload: unknown) {
  window.postMessage({ type, payload }, '*');
}

function patchConsole() {
  if (isConsolePatched) {
    return;
  }

  isConsolePatched = true;
  const methods = [
    ['log', 'INFO'],
    ['debug', 'DEBUG'],
    ['info', 'INFO'],
    ['warn', 'WARN'],
    ['error', 'ERROR'],
    ['trace', 'DEBUG'],
    ['table', 'INFO'],
    ['dir', 'INFO'],
    ['group', 'INFO'],
    ['groupCollapsed', 'INFO'],
    ['groupEnd', 'INFO'],
    ['clear', 'INFO'],
    ['count', 'INFO'],
    ['countReset', 'INFO'],
    ['time', 'DEBUG'],
    ['timeLog', 'DEBUG'],
    ['timeEnd', 'DEBUG'],
  ] as const;

  methods.forEach(([method, level]) => {
    const original = console[method] as ((...args: unknown[]) => void) | undefined;
    if (typeof original !== 'function') {
      return;
    }

    originalConsoleMethods.set(method, original);
    console[method] = (...args: unknown[]) => {
      postConsole(level, method, args, method === 'error' || method === 'trace');
      original.apply(console, args);
    };
  });

  const originalAssert = console.assert as ((condition?: boolean, ...args: unknown[]) => void) | undefined;
  if (typeof originalAssert === 'function') {
    originalConsoleAssert = originalAssert;
    console.assert = (condition?: boolean, ...args: unknown[]) => {
      if (!condition) {
        postConsole('ERROR', 'assert', args.length > 0 ? args : ['Assertion failed'], true);
      }
      originalAssert.call(console, condition, ...args);
    };
  }
}

function unpatchConsole() {
  if (!isConsolePatched) {
    return;
  }

  originalConsoleMethods.forEach((original, method) => {
    (console as unknown as Record<string, (...args: unknown[]) => void>)[method] = original;
  });
  originalConsoleMethods.clear();

  if (originalConsoleAssert) {
    console.assert = originalConsoleAssert;
    originalConsoleAssert = undefined;
  }

  isConsolePatched = false;
}

function attachConsoleControlListener() {
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return;
    }

    const data = event.data as { type?: string; enabled?: unknown };
    if (data.type !== consoleControlMessageType) {
      return;
    }

    if (data.enabled === true) {
      patchConsole();
      return;
    }

    unpatchConsole();
  });
}

function attachTelemetryControlListener() {
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return;
    }

    const data = event.data as { type?: string; enabled?: unknown };
    if (data.type !== telemetryControlMessageType) {
      return;
    }

    setTelemetryEnabled(data.enabled === true);
  });
}

function setTelemetryEnabled(enabled: boolean) {
  isTelemetryEnabled = enabled;
  if (enabled) {
    patchNetwork();
    collectNavigationTiming();
    collectPaintEntries();
    collectResourceEntries();
    return;
  }

  unpatchNetwork();
}

function postConsole(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', method: string, args: unknown[], withStack = false) {
  post(PageMessageTypes.Console, {
    level,
    message: formatConsoleMessage(method, args),
    args: normalizeArgs(args),
    stack: withStack ? new Error().stack : undefined,
    pageUrl: location.href,
    timestamp: nowIso(),
  });
}

function formatConsoleMessage(method: string, args: unknown[]) {
  if (method === 'clear') {
    return 'Console was cleared';
  }

  if (method === 'groupEnd') {
    return 'Console group ended';
  }

  if (args.length === 0) {
    return method;
  }

  return args.map((item) => safeStringify(item, 2_000)).join(' ');
}

function patchNetwork() {
  if (isNetworkPatched) {
    return;
  }

  patchFetch();
  patchXhr();
  isNetworkPatched = true;
}

function unpatchNetwork() {
  if (!isNetworkPatched) {
    return;
  }

  if (originalFetch) {
    window.fetch = originalFetch;
    originalFetch = undefined;
  }

  if (originalXhrOpen) {
    XMLHttpRequest.prototype.open = originalXhrOpen;
    originalXhrOpen = undefined;
  }

  if (originalXhrSend) {
    XMLHttpRequest.prototype.send = originalXhrSend;
    originalXhrSend = undefined;
  }

  if (originalXhrSetRequestHeader) {
    XMLHttpRequest.prototype.setRequestHeader = originalXhrSetRequestHeader;
    originalXhrSetRequestHeader = undefined;
  }

  xhrMetadata = new WeakMap<XMLHttpRequest, XhrMetadata>();
  isNetworkPatched = false;
}

function patchFetch() {
  originalFetch = window.fetch;
  const fetchImpl = originalFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = performance.now();
    const startedAtIso = nowIso();
    let request: ReturnType<typeof normalizeFetchRequest>;

    try {
      request = normalizeFetchRequest(input, init);
    } catch {
      return fetchImpl.call(window, input, init);
    }

    try {
      const response = await fetchImpl.call(window, input, init);
      const endedAtIso = nowIso();
      const durationMs = Math.round(performance.now() - startedAt);
      let clonedResponse: Response | undefined;

      try {
        clonedResponse = response.clone();
      } catch {
        clonedResponse = undefined;
      }

      void postFetchSuccessTelemetry({
        request,
        response,
        clonedResponse,
        durationMs,
        startedAtIso,
        endedAtIso,
      });

      return response;
    } catch (error) {
      const endedAtIso = nowIso();
      const durationMs = Math.round(performance.now() - startedAt);
      post(PageMessageTypes.Network, {
        requestId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        method: request.method,
        url: request.url,
        durationMs,
        requestHeaders: request.headers,
        requestBody: request.body,
        error: error instanceof Error ? error.message : String(error),
        startedAt: startedAtIso,
        endedAt: endedAtIso,
      });
      postBackendTrace(request.method, request.url, undefined, durationMs, startedAtIso, endedAtIso, true);
      throw error;
    }
  };
}

async function postFetchSuccessTelemetry(input: {
  request: ReturnType<typeof normalizeFetchRequest>;
  response: Response;
  clonedResponse: Response | undefined;
  durationMs: number;
  startedAtIso: string;
  endedAtIso: string;
}) {
  const responseText = input.clonedResponse
    ? await readResponseBody(input.clonedResponse)
    : undefined;

  if (!isTelemetryEnabled) {
    return;
  }

  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  post(PageMessageTypes.Network, {
    requestId,
    method: input.request.method,
    url: input.request.url,
    statusCode: input.response.status,
    durationMs: input.durationMs,
    requestHeaders: input.request.headers,
    requestBody: input.request.body,
    responseHeaders: headersToRecord(input.response.headers),
    responseBody: responseText,
    startedAt: input.startedAtIso,
    endedAt: input.endedAtIso,
  });
  post(PageMessageTypes.Performance, {
    kind: PerformanceEntryKind.Resource,
    name: input.request.url,
    durationMs: input.durationMs,
    initiatorType: 'fetch',
    pageUrl: location.href,
    occurredAt: input.endedAtIso,
  });
  post(PageMessageTypes.Performance, {
    kind: PerformanceEntryKind.Custom,
    name: input.request.url,
    value: input.durationMs,
    durationMs: input.durationMs,
    rating: input.durationMs > 1_000 ? 'poor' : input.durationMs > 400 ? 'needs-improvement' : 'good',
    initiatorType: 'fetch',
    pageUrl: location.href,
    occurredAt: input.endedAtIso,
  });
  post(PageMessageTypes.Performance, {
    kind: PerformanceEntryKind.Custom,
    name: `Backend ${input.request.method} ${new URL(input.request.url, location.href).pathname}`,
    value: input.durationMs,
    durationMs: input.durationMs,
    rating: input.response.status >= 500 ? 'poor' : input.response.status >= 400 ? 'needs-improvement' : 'good',
    initiatorType: 'backend',
    pageUrl: location.href,
    occurredAt: input.endedAtIso,
  });
  post(PageMessageTypes.Performance, {
    kind: PerformanceEntryKind.Custom,
    name: `HTTP ${input.response.status}`,
    value: input.response.status,
    initiatorType: 'backend-status',
    pageUrl: location.href,
    occurredAt: input.endedAtIso,
  });
  post(PageMessageTypes.Performance, {
    kind: PerformanceEntryKind.Custom,
    name: `Backend trace ${input.request.method}`,
    value: input.durationMs,
    durationMs: input.durationMs,
    initiatorType: 'backend-trace',
    pageUrl: location.href,
    occurredAt: input.endedAtIso,
    metadata: {
      url: input.request.url,
      method: input.request.method,
      statusCode: input.response.status,
    },
  });
  postBackendTrace(
    input.request.method,
    input.request.url,
    input.response.status,
    input.durationMs,
    input.startedAtIso,
    input.endedAtIso,
  );
}

function patchXhr() {
  originalXhrOpen = XMLHttpRequest.prototype.open;
  originalXhrSend = XMLHttpRequest.prototype.send;
  originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  xhrMetadata = new WeakMap<XMLHttpRequest, XhrMetadata>();

  XMLHttpRequest.prototype.open = function open(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    xhrMetadata.set(this, {
      method,
      url: String(url),
      requestHeaders: {},
      startedAt: '',
      startedAtMs: 0,
    });
    return originalXhrOpen!.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(name: string, value: string) {
    const item = xhrMetadata.get(this);
    if (item) {
      item.requestHeaders[name] = value;
    }
    return originalXhrSetRequestHeader!.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
    const item = xhrMetadata.get(this);
    if (item) {
      item.startedAt = nowIso();
      item.startedAtMs = performance.now();
      item.requestBody = typeof body === 'string' ? truncateBody(body) : undefined;
      this.addEventListener('loadend', () => {
        if (!isTelemetryEnabled) {
          return;
        }

        const endedAt = nowIso();
        const durationMs = Math.round(performance.now() - item.startedAtMs);
        post(PageMessageTypes.Network, {
          requestId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
          method: item.method,
          url: new URL(item.url, location.href).toString(),
          statusCode: this.status || undefined,
          durationMs,
          requestHeaders: item.requestHeaders,
          requestBody: item.requestBody,
          responseHeaders: parseResponseHeaders(this.getAllResponseHeaders()),
          responseBody: readXhrTextResponse(this),
          error: this.status >= 400 ? this.statusText : undefined,
          startedAt: item.startedAt,
          endedAt,
        });
        postBackendTrace(
          item.method,
          new URL(item.url, location.href).toString(),
          this.status || undefined,
          durationMs,
          item.startedAt,
          endedAt,
          this.status >= 400,
        );
      });
    }

    return originalXhrSend!.call(this, body ?? null);
  };
}

function readXhrTextResponse(xhr: XMLHttpRequest) {
  if (xhr.responseType && xhr.responseType !== 'text') {
    return undefined;
  }

  try {
    return typeof xhr.responseText === 'string' ? truncateBody(xhr.responseText) : undefined;
  } catch {
    return undefined;
  }
}

function attachErrorListeners() {
  window.addEventListener(
    'error',
    (event) => {
      if (!isTelemetryEnabled) {
        return;
      }

      post(PageMessageTypes.RuntimeError, {
        kind: RuntimeErrorKind.JsError,
        message: event.message || 'Runtime error',
        sourceUrl: event.filename || location.href,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        pageUrl: location.href,
        occurredAt: nowIso(),
      });
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    if (!isTelemetryEnabled) {
      return;
    }

    const reason = event.reason;
    post(PageMessageTypes.RuntimeError, {
      kind: RuntimeErrorKind.UnhandledRejection,
      message: reason instanceof Error ? reason.message : safeStringify(reason, 2_000),
      stack: reason instanceof Error ? reason.stack : undefined,
      pageUrl: location.href,
      occurredAt: nowIso(),
    });
  });
}

function schedulePerformanceCollection() {
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      collectNavigationTiming();
      collectPaintEntries();
      collectResourceEntries();
    }, 1_000);
  });
}

function collectNavigationTiming() {
  if (!isTelemetryEnabled) {
    return;
  }

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!navigation) {
    return;
  }

  post(PageMessageTypes.Performance, {
    kind: PerformanceEntryKind.Navigation,
    name: navigation.name,
    value: Math.round(navigation.duration),
    startTimeMs: Math.round(navigation.startTime),
    durationMs: Math.round(navigation.duration),
    pageUrl: location.href,
    occurredAt: nowIso(),
  });
}

function collectPaintEntries() {
  if (!isTelemetryEnabled) {
    return;
  }

  performance.getEntriesByType('paint').forEach((entry) => {
    post(PageMessageTypes.Performance, {
      kind: PerformanceEntryKind.Paint,
      name: entry.name,
      startTimeMs: Math.round(entry.startTime),
      durationMs: Math.round(entry.duration),
      pageUrl: location.href,
      occurredAt: nowIso(),
    });
  });
}

function collectResourceEntries() {
  if (!isTelemetryEnabled) {
    return;
  }

  performance.getEntriesByType('resource').slice(-50).forEach((entry) => {
    const resource = entry as PerformanceResourceTiming;
    post(PageMessageTypes.Performance, {
      kind: PerformanceEntryKind.Resource,
      name: resource.name,
      startTimeMs: Math.round(resource.startTime),
      durationMs: Math.round(resource.duration),
      initiatorType: resource.initiatorType,
      pageUrl: location.href,
      occurredAt: nowIso(),
    });
  });
}

function postBackendTrace(
  method: string,
  url: string,
  statusCode: number | undefined,
  durationMs: number,
  startedAt: string,
  endedAt: string,
  failed = false,
) {
  const parsed = new URL(url, location.href);
  post(PageMessageTypes.Performance, {
    kind: PerformanceEntryKind.Custom,
    name: `Trace ${method} ${parsed.pathname}`,
    value: durationMs,
    durationMs,
    initiatorType: 'backend-trace',
    pageUrl: location.href,
    occurredAt: endedAt,
    metadata: {
      backendTrace: {
        operationName: `${method} ${parsed.pathname}`,
        serviceName: parsed.hostname,
        status: failed || (statusCode ?? 0) >= 400 ? BackendTraceStatus.Error : BackendTraceStatus.Ok,
        method,
        url: parsed.toString(),
        statusCode,
        durationMs,
        startedAt,
        endedAt,
      },
    },
  });
}

function normalizeFetchRequest(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const url = request?.url ?? new URL(String(input), location.href).toString();
  const method = init?.method ?? request?.method ?? 'GET';
  const headers = {
    ...headersToRecord(request?.headers),
    ...headersToRecord(init?.headers),
  };
  const body = typeof init?.body === 'string' ? truncateBody(init.body) : undefined;

  return { url, method, headers, body };
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json') && !contentType.includes('text')) {
    return undefined;
  }

  try {
    const body = await Promise.race([
      response.text(),
      new Promise<undefined>((resolve) => {
        window.setTimeout(() => resolve(undefined), responseBodyReadTimeoutMs);
      }),
    ]);
    return typeof body === 'string' ? truncateBody(body) : undefined;
  } catch {
    return undefined;
  }
}

function headersToRecord(headers: HeadersInit | null | undefined) {
  const record: Record<string, string> = {};
  if (!headers) {
    return record;
  }

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      record[key] = value;
    });
    return record;
  }

  return { ...headers };
}

function parseResponseHeaders(value: string) {
  const headers: Record<string, string> = {};
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex > 0) {
        headers[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1).trim();
      }
    });
  return headers;
}

function normalizeArgs(args: unknown[]) {
  return args.reduce<Record<string, unknown>>((record, item, index) => {
    record[String(index)] = truncateText(safeStringify(item, 2_000), 2_000);
    return record;
  }, {});
}

interface XhrMetadata {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string | undefined;
  startedAt: string;
  startedAtMs: number;
}

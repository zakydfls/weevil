import {
  PerformanceEntryKind,
  PageMessageTypes,
  RuntimeErrorKind,
} from '../shared/constants';
import { nowIso, safeStringify, truncateText } from '../shared/telemetry-utils';

const installedFlag = '__WEevil_PAGE_BRIDGE_INSTALLED_20260604_CONSOLE_RECAPTURE__';
const consoleControlMessageType = 'WEevil_PAGE_CONSOLE_CONTROL';
const telemetryControlMessageType = 'WEevil_PAGE_TELEMETRY_CONTROL';
const maxCapturedBodyChars = 20_000;
const unavailableHeaderValue = '[unavailable]';
const emptyHeaderValue = '[empty]';
const originalConsoleMethods = new Map<string, (...args: unknown[]) => void>();
let originalConsoleAssert: ((condition?: boolean, ...args: unknown[]) => void) | undefined;
let originalFetch: typeof window.fetch | undefined;
let originalXhrOpen: typeof XMLHttpRequest.prototype.open | undefined;
let originalXhrSend: typeof XMLHttpRequest.prototype.send | undefined;
let originalXhrSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader | undefined;
let isConsolePatched = false;
let isTelemetryEnabled = false;
let isNetworkPatched = false;

interface XhrCaptureState {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string | undefined;
  startedAt?: string | undefined;
  startedAtMs?: number | undefined;
}

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
      postConsole(level, method, args);
      original.apply(console, args);
    };
  });

  const originalAssert = console.assert as ((condition?: boolean, ...args: unknown[]) => void) | undefined;
  if (typeof originalAssert === 'function') {
    originalConsoleAssert = originalAssert;
    console.assert = (condition?: boolean, ...args: unknown[]) => {
      if (!condition) {
        postConsole('ERROR', 'assert', args.length > 0 ? args : ['Assertion failed']);
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

function patchNetwork() {
  if (isNetworkPatched) {
    return;
  }

  isNetworkPatched = true;
  patchFetch();
  patchXhr();
}

function patchFetch() {
  if (typeof window.fetch !== 'function') {
    return;
  }

  originalFetch = window.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!isTelemetryEnabled || !originalFetch) {
      return originalFetch ? originalFetch.call(window, input, init) : fetch(input, init);
    }

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const info = describeFetchRequest(input, init);
    const requestBodyPromise = captureFetchRequestBody(input, init);

    return originalFetch.call(window, input, init).then(
      (response) => {
        const endedAtMs = Date.now();
        const responseClone = response.clone();
        void Promise.all([
          requestBodyPromise,
          captureResponseBody(responseClone, info.url),
        ]).then(([requestBody, responseBody]) => {
          postNetworkTelemetry({
            method: info.method,
            url: info.url,
            statusCode: response.status || undefined,
            durationMs: Math.max(0, Math.round(endedAtMs - startedAtMs)),
            requestHeaders: info.requestHeaders,
            responseHeaders: headersToRecord(response.headers),
            requestBody,
            responseBody,
            resourceType: 'fetch',
            startedAt,
            endedAt: new Date(endedAtMs).toISOString(),
          });
        }).catch(() => undefined);

        return response;
      },
      (error: unknown) => {
        const endedAtMs = Date.now();
        void requestBodyPromise.then((requestBody) => {
          postNetworkTelemetry({
            method: info.method,
            url: info.url,
            durationMs: Math.max(0, Math.round(endedAtMs - startedAtMs)),
            requestHeaders: info.requestHeaders,
            requestBody,
            error: error instanceof Error ? error.message : String(error),
            resourceType: 'fetch',
            startedAt,
            endedAt: new Date(endedAtMs).toISOString(),
          });
        }).catch(() => undefined);

        throw error;
      },
    );
  }) as typeof window.fetch;
}

function patchXhr() {
  if (!originalXhrOpen) {
    originalXhrOpen = XMLHttpRequest.prototype.open;
  }
  if (!originalXhrSend) {
    originalXhrSend = XMLHttpRequest.prototype.send;
  }
  if (!originalXhrSetRequestHeader) {
    originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  }
  XMLHttpRequest.prototype.open = function patchedOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    xhrState.set(this, {
      method: method || 'GET',
      url: normalizeUrl(url),
      requestHeaders: {},
    });
    if (!originalXhrOpen) {
      return undefined;
    }
    const open = originalXhrOpen as unknown as (this: XMLHttpRequest, ...args: unknown[]) => void;
    if (username !== undefined || password !== undefined) {
      return open.call(this, method, url, async ?? true, username ?? null, password ?? null);
    }
    if (async !== undefined) {
      return open.call(this, method, url, async);
    }
    return open.call(this, method, url);
  };

  XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(name: string, value: string) {
    const state = xhrState.get(this);
    if (state) {
      state.requestHeaders[name] = normalizeCapturedHeaderValue(value);
    }
    return originalXhrSetRequestHeader?.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null) {
    const state = xhrState.get(this);
    if (state && isTelemetryEnabled) {
      state.startedAtMs = Date.now();
      state.startedAt = new Date(state.startedAtMs).toISOString();
      void serializeRequestBody(body).then((serialized) => {
        state.requestBody = serialized;
      }).catch(() => undefined);

      const finalize = () => {
        const endedAtMs = Date.now();
        const responseHeaders = parseRawHeaders(safeGetAllResponseHeaders(this));
        const responseBody = readXhrResponseBody(this);
        postNetworkTelemetry({
          method: state.method,
          url: this.responseURL || state.url,
          statusCode: this.status || undefined,
          durationMs: state.startedAtMs ? Math.max(0, Math.round(endedAtMs - state.startedAtMs)) : undefined,
          requestHeaders: state.requestHeaders,
          responseHeaders,
          requestBody: state.requestBody,
          responseBody,
          error: this.status === 0 ? 'Request failed or was blocked.' : undefined,
          resourceType: 'xhr',
          startedAt: state.startedAt ?? new Date(endedAtMs).toISOString(),
          endedAt: new Date(endedAtMs).toISOString(),
        });
        xhrState.delete(this);
      };

      this.addEventListener('loadend', finalize, { once: true });
    }

    return originalXhrSend?.call(this, body ?? null);
  };
}

const xhrState = new WeakMap<XMLHttpRequest, XhrCaptureState>();

function unpatchNetwork() {
  if (!isNetworkPatched) {
    return;
  }

  if (originalFetch) {
    window.fetch = originalFetch;
  }
  if (originalXhrOpen) {
    XMLHttpRequest.prototype.open = originalXhrOpen;
  }
  if (originalXhrSend) {
    XMLHttpRequest.prototype.send = originalXhrSend;
  }
  if (originalXhrSetRequestHeader) {
    XMLHttpRequest.prototype.setRequestHeader = originalXhrSetRequestHeader;
  }

  originalFetch = undefined;
  originalXhrOpen = undefined;
  originalXhrSend = undefined;
  originalXhrSetRequestHeader = undefined;
  isNetworkPatched = false;
}

function postNetworkTelemetry(payload: {
  method: string;
  url: string;
  statusCode?: number | undefined;
  durationMs?: number | undefined;
  requestHeaders?: Record<string, string> | undefined;
  responseHeaders?: Record<string, string> | undefined;
  requestBody?: string | undefined;
  responseBody?: string | undefined;
  error?: string | undefined;
  resourceType?: string | undefined;
  startedAt: string;
  endedAt?: string | undefined;
}) {
  if (!isTelemetryEnabled) {
    return;
  }

  post(PageMessageTypes.Network, payload);
}

function describeFetchRequest(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
  const url = request ? request.url : normalizeUrl(input);
  const requestHeaders = {
    ...(request ? headersToRecord(request.headers) : {}),
    ...headersToRecord(init?.headers),
  };

  return { method, url, requestHeaders };
}

async function captureFetchRequestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.body !== undefined && init.body !== null) {
    return serializeRequestBody(init.body);
  }

  if (input instanceof Request && input.method.toUpperCase() !== 'GET' && input.method.toUpperCase() !== 'HEAD') {
    try {
      return truncateBodyText(await input.clone().text());
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function captureResponseBody(response: Response, url: string) {
  if (!shouldReadBody(response.headers.get('content-type'), url)) {
    return undefined;
  }

  try {
    return truncateBodyText(await response.text());
  } catch {
    return undefined;
  }
}

async function serializeRequestBody(body: BodyInit | Document | null | undefined) {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (typeof body === 'string') {
    return truncateBodyText(body);
  }

  if (body instanceof URLSearchParams) {
    return truncateBodyText(body.toString());
  }

  if (body instanceof FormData) {
    return truncateBodyText(serializeFormData(body));
  }

  if (body instanceof Blob) {
    if (!shouldReadBody(body.type, '')) {
      return `[${body.type || 'blob'} body, ${body.size} bytes]`;
    }
    return truncateBodyText(await body.text());
  }

  if (body instanceof ArrayBuffer) {
    return `[binary request body, ${body.byteLength} bytes]`;
  }

  if (ArrayBuffer.isView(body)) {
    return `[binary request body, ${body.byteLength} bytes]`;
  }

  if (body instanceof Document) {
    return truncateBodyText(new XMLSerializer().serializeToString(body));
  }

  return '[stream request body]';
}

function serializeFormData(formData: FormData) {
  const entries: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    entries[key] = value instanceof File ? `[file:${value.name}, ${value.size} bytes]` : value;
  });
  return safeStringify(entries, maxCapturedBodyChars);
}

function readXhrResponseBody(xhr: XMLHttpRequest) {
  if (!shouldReadBody(xhr.getResponseHeader('content-type'), xhr.responseURL)) {
    return undefined;
  }

  try {
    if (xhr.responseType === '' || xhr.responseType === 'text') {
      return truncateBodyText(xhr.responseText);
    }
    if (xhr.responseType === 'json') {
      return truncateBodyText(safeStringify(xhr.response, maxCapturedBodyChars));
    }
    if (typeof xhr.response === 'string') {
      return truncateBodyText(xhr.response);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function shouldReadBody(contentType: string | null | undefined, url: string) {
  const lowerType = (contentType ?? '').toLowerCase();
  if (
    lowerType.includes('json') ||
    lowerType.includes('text/') ||
    lowerType.includes('xml') ||
    lowerType.includes('graphql') ||
    lowerType.includes('x-www-form-urlencoded') ||
    lowerType.includes('javascript') ||
    lowerType.includes('html') ||
    lowerType.includes('rsc') ||
    lowerType.includes('vnd.turbo-stream')
  ) {
    return true;
  }

  return /\.(json|txt|html|htm|xml|js|css|svg)(?:[?#]|$)/i.test(url);
}

function truncateBodyText(value: string) {
  return value.length > maxCapturedBodyChars
    ? `${value.slice(0, maxCapturedBodyChars)}\n… truncated by Weevil (${value.length} chars total)`
    : value;
}

function headersToRecord(headers: HeadersInit | Headers | undefined) {
  const record: Record<string, string> = {};
  if (!headers) {
    return record;
  }

  try {
    new Headers(headers).forEach((value, key) => {
      record[key] = normalizeCapturedHeaderValue(value);
    });
  } catch {
    return record;
  }

  return record;
}

function parseRawHeaders(rawHeaders: string) {
  const record: Record<string, string> = {};
  rawHeaders.split(/\r?\n/).forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      return;
    }
    record[line.slice(0, separatorIndex).trim()] = normalizeCapturedHeaderValue(
      line.slice(separatorIndex + 1).trim(),
    );
  });
  return record;
}

function normalizeCapturedHeaderValue(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return unavailableHeaderValue;
  }
  if (value === '') {
    return emptyHeaderValue;
  }
  return value;
}

function safeGetAllResponseHeaders(xhr: XMLHttpRequest) {
  try {
    return xhr.getAllResponseHeaders();
  } catch {
    return '';
  }
}

function normalizeUrl(input: RequestInfo | URL) {
  try {
    return new URL(String(input), location.href).href;
  } catch {
    return String(input);
  }
}

function postConsole(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', method: string, args: unknown[]) {
  post(PageMessageTypes.Console, {
    level,
    message: formatConsoleMessage(method, args),
    args: normalizeArgs(args),
    stack: extractErrorStack(args),
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

function normalizeArgs(args: unknown[]) {
  return args.reduce<Record<string, unknown>>((record, item, index) => {
    record[String(index)] = truncateText(safeStringify(item, 2_000), 2_000);
    return record;
  }, {});
}

function extractErrorStack(args: unknown[]): string | undefined {
  for (const arg of args) {
    const stack = stackFromConsoleArg(arg);
    if (stack) {
      return stack;
    }
  }

  return undefined;
}

function stackFromConsoleArg(value: unknown): string | undefined {
  if (value instanceof Error && typeof value.stack === 'string' && value.stack.trim()) {
    return value.stack;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as { stack?: unknown; name?: unknown; message?: unknown };
  if (
    typeof record.stack === 'string' &&
    record.stack.trim() &&
    (typeof record.message === 'string' || typeof record.name === 'string')
  ) {
    return record.stack;
  }

  return undefined;
}

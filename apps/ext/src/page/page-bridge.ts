import {
  PerformanceEntryKind,
  PageMessageTypes,
  RuntimeErrorKind,
} from '../shared/constants';
import { nowIso, safeStringify, truncateText } from '../shared/telemetry-utils';

const installedFlag = '__WEevil_PAGE_BRIDGE_INSTALLED_20260604_CONSOLE_RECAPTURE__';
const consoleControlMessageType = 'WEevil_PAGE_CONSOLE_CONTROL';
const telemetryControlMessageType = 'WEevil_PAGE_TELEMETRY_CONTROL';
const originalConsoleMethods = new Map<string, (...args: unknown[]) => void>();
let originalConsoleAssert: ((condition?: boolean, ...args: unknown[]) => void) | undefined;
let isConsolePatched = false;
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
    collectNavigationTiming();
    collectPaintEntries();
    collectResourceEntries();
  }
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

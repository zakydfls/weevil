import { ApiError, WeevilApiClient } from '../shared/api-client';
import {
  BackendTraceStatus,
  DEFAULT_MAX_BATCH_SIZE,
  DEFAULT_WEB_BASE_URL,
  PerformanceEntryKind,
  ReportSource,
  RECORDING_UPLOAD_CONTENT_TYPE,
  RuntimeErrorKind,
  RuntimeMessageTypes,
  UploadKind,
} from '../shared/constants';
import {
  getRecorderState,
  getSettings,
  resetRecorderState,
  saveSettings,
  saveRecorderState,
} from '../shared/config';
import { chunk, offsetFrom, truncateText } from '../shared/telemetry-utils';
import type {
  BackendTraceTelemetryEntry,
  CaptureCompletedPayload,
  ConsoleTelemetryEntry,
  ExtensionSettings,
  NetworkTelemetryEntry,
  OffscreenRecordingResult,
  PerformanceTelemetryEntry,
  RecorderState,
  RuntimeErrorTelemetryEntry,
  RuntimeMessage,
  SubmitCaptureReviewInput,
  TelemetryBatch,
} from '../shared/types';

const buffers: TelemetryBatch = createEmptyBatch();
const flushAlarmName = 'weevil-flush';
const requestHeaderCaptures: RequestHeaderCapture[] = [];
const responseHeaderCaptures: ResponseHeaderCapture[] = [];
const requestHeaderCaptureTtlMs = 30_000;
const responseHeaderCaptureTtlMs = 30_000;
const preparingCountdownMs = 3_000;
const maxTelemetryTextChars = 8_000;
const maxTelemetryBodyChars = 20_000;
const maxTelemetryUrlChars = 2_048;
const maxTelemetryMethodChars = 16;
const maxTelemetryNameChars = 500;
const maxTelemetryOperationChars = 240;
const maxTelemetryShortTextChars = 160;
const maxTelemetryOffsetMs = 86_400_000;
const maxTelemetryDurationMs = 3_600_000;
const redactedHeaderValue = '[REDACTED]';
const unavailableHeaderValue = '[unavailable]';
const emptyHeaderValue = '[empty]';
const sensitiveHeaderPattern = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|api-key|x-auth-token|x-csrf-token|x-xsrf-token)$|token|secret|session/i;
const sensitiveBodyKeyPattern = /pass(word)?|pwd|secret|token|session|authorization|auth|api[-_]?key|csrf|xsrf|cookie|set-cookie|ssn|cvv|cvc|card.?number/i;
const webStartCaptureUnsupportedMessage =
  'Chrome only allows tab recording after you click the Weevil extension button on the page you want to capture. Open the target page, click the Weevil icon in the browser toolbar, then start capture there.';
let attachedConsoleDebuggee: chrome.debugger.Debuggee | null = null;
let pendingReview: PendingCaptureReview | null = null;
let activeRecorderSnapshot: ActiveRecorderSnapshot | null | undefined;
const debuggerApi = (chrome as typeof chrome & { debugger?: typeof chrome.debugger }).debugger;

interface ActiveRecorderSnapshot {
  tabId: number;
  sessionId: string;
  startedAt: string;
}

interface BrowserCaptureContext {
  userAgent?: string | undefined;
  browserName?: string | undefined;
  browserVersion?: string | undefined;
  osName?: string | undefined;
  viewportWidth?: number | undefined;
  viewportHeight?: number | undefined;
  screenWidth?: number | undefined;
  screenHeight?: number | undefined;
  devicePixelRatio?: number | undefined;
}

type ConsoleCaptureMode = 'debugger' | 'page' | 'off';

chrome.runtime.onInstalled.addListener(async () => {
  await resetRecorderState();
  activeRecorderSnapshot = null;
});

chrome.runtime.onStartup.addListener(async () => {
  await resetRecorderState();
  activeRecorderSnapshot = null;
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch(async (error) => {
      await markError(error);
      sendResponse({ ok: false, error: getErrorMessage(error) });
    });
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === flushAlarmName) {
    void flushTelemetry();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
    void refreshRecordingTab(tabId);
  }
});

debuggerApi?.onEvent.addListener((source, method, params) => {
  void handleDebuggerEvent(source, method, params);
});

debuggerApi?.onDetach.addListener((source) => {
  if (attachedConsoleDebuggee?.tabId === source.tabId) {
    attachedConsoleDebuggee = null;
    void notifyConsoleCaptureMode(source.tabId, 'off');
  }
});

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    void captureRequestHeaders(details);
    return undefined;
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders'],
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    void captureResponseHeaders(details);
    return undefined;
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders'],
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    void captureCompletedBrowserRequest(details);
  },
  { urls: ['<all_urls>'] },
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    void captureFailedBrowserRequest(details);
  },
  { urls: ['<all_urls>'] },
);

async function handleMessage(message: RuntimeMessage, sender: chrome.runtime.MessageSender) {
  if (message.type === RuntimeMessageTypes.GetStatus) {
    const state = await getRecorderState();
    return {
      ok: true,
      state,
      settings: await getSettings(),
      isSenderRecordingTab: Boolean(sender.tab?.id && state.tabId === sender.tab.id),
    };
  }

  if (message.type === RuntimeMessageTypes.StartCapture) {
    if (sender.tab?.id) {
      throw new Error(webStartCaptureUnsupportedMessage);
    }

    const settings = await saveIncomingSettings(message.payload);
    const tab = await getActiveTab();
    return { ok: true, state: await startCapture(tab, settings) };
  }

  if (message.type === RuntimeMessageTypes.CaptureScreenshot) {
    const tab = await getActiveTab();
    return { ok: true, capture: await captureScreenshot(tab) };
  }

  if (message.type === RuntimeMessageTypes.StopCapture) {
    return { ok: true, state: await stopCapture() };
  }

  if (message.type === RuntimeMessageTypes.SubmitCaptureReview) {
    return { ok: true, capture: await submitCaptureReview(message.payload as SubmitCaptureReviewInput | undefined) };
  }

  if (message.type === RuntimeMessageTypes.DiscardCaptureReview) {
    await discardCaptureReview();
    return { ok: true };
  }

  if (message.type === RuntimeMessageTypes.UpdateSettings) {
    return { ok: true, settings: await saveIncomingSettings(message.payload) };
  }

  if (message.type === RuntimeMessageTypes.TelemetryBatch) {
    await appendBatch(message.payload as Partial<TelemetryBatch>);
    return { ok: true };
  }

  if (message.type === RuntimeMessageTypes.PageTelemetry) {
    await appendPageTelemetry(message.payload as { type: string; payload: unknown }, sender.tab?.id);
    return { ok: true };
  }

  if (message.type === RuntimeMessageTypes.OpenOptions) {
    chrome.runtime.openOptionsPage();
    return { ok: true };
  }

  return { ok: false, error: 'Unknown message type' };
}

async function saveIncomingSettings(payload: unknown) {
  const settings = await getSettings();
  const nextSettings = {
    ...settings,
    ...normalizeSettingsPatch(payload),
  };
  await saveSettings(nextSettings);
  return nextSettings;
}

function normalizeSettingsPatch(payload: unknown): Partial<ExtensionSettings> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const patch: Partial<ExtensionSettings> = {};
  if (typeof record.flushIntervalMs === 'number' && Number.isFinite(record.flushIntervalMs)) {
    patch.flushIntervalMs = record.flushIntervalMs;
  }
  if (typeof record.maxBatchSize === 'number' && Number.isFinite(record.maxBatchSize)) {
    patch.maxBatchSize = record.maxBatchSize;
  }
  if (typeof record.captureDomMutations === 'boolean') {
    patch.captureDomMutations = record.captureDomMutations;
  }
  if (typeof record.capturePerformance === 'boolean') {
    patch.capturePerformance = record.capturePerformance;
  }
  if (typeof record.redactSensitiveData === 'boolean') {
    patch.redactSensitiveData = record.redactSensitiveData;
  }

  return patch;
}

async function startCapture(tab: chrome.tabs.Tab, captureSettings?: ExtensionSettings) {
  if (!tab.id || !tab.windowId) {
    throw new Error('Active tab is not captureable.');
  }
  await assertCaptureableTab(tab);

  const settings = captureSettings ?? await getSettings();
  const api = await createCaptureApi(settings.apiBaseUrl);
  const manifest = chrome.runtime.getManifest();
  const pageUrl = tab.url;
  const title = tab.title || pageUrl || 'Weevil capture';

  clearBuffers();
  await injectContentScript(tab.id);
  await injectPageBridge(tab.id);
  const captureContext = await getTabCaptureContext(tab.id);

  let preparingOverlayShown = false;
  let offscreenStarted = false;

  try {
    await notifyTab(tab.id, {
      type: RuntimeMessageTypes.CapturePreparing,
      payload: { countdownMs: preparingCountdownMs, title },
    });
    preparingOverlayShown = true;

    await delay(preparingCountdownMs);
    await startOffscreenRecording(tab.id);
    offscreenStarted = true;

    const report = await api.createReport({
      title,
      description: 'Captured from the Weevil browser extension.',
      source: ReportSource.Extension,
      pageUrl,
      userAgent: captureContext.userAgent,
      browserName: captureContext.browserName ?? 'Chrome',
      browserVersion: captureContext.browserVersion,
      osName: captureContext.osName,
      viewportWidth: captureContext.viewportWidth,
      viewportHeight: captureContext.viewportHeight,
      metadata: {
        tabId: tab.id,
        windowId: tab.windowId,
        extensionVersion: manifest.version,
        redactSensitiveData: settings.redactSensitiveData,
      },
    });
    const sessionStartedAt = new Date();
    const session = await api.createCaptureSession(
      report.id,
      {
        startedAt: sessionStartedAt.toISOString(),
        recordingStartedAt: sessionStartedAt.toISOString(),
        pageUrl,
        title,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
        userAgent: captureContext.userAgent,
        browserName: captureContext.browserName ?? 'Chrome',
        browserVersion: captureContext.browserVersion,
        osName: captureContext.osName,
        extensionVersion: manifest.version,
        manifestVersion: String(manifest.manifest_version),
        tabId: String(tab.id),
        windowId: String(tab.windowId),
        viewportWidth: captureContext.viewportWidth,
        viewportHeight: captureContext.viewportHeight,
        screenWidth: captureContext.screenWidth,
        screenHeight: captureContext.screenHeight,
        devicePixelRatio: captureContext.devicePixelRatio,
        metadata: {
          source: 'extension',
          redactSensitiveData: settings.redactSensitiveData,
        },
      },
      report.ingestToken ?? report.shareToken,
    );

    const startedAt = new Date();
    const state: RecorderState = {
      isRecording: true,
      tabId: tab.id,
      windowId: tab.windowId,
      reportId: report.id,
      shareToken: report.shareToken,
      ingestToken: report.ingestToken ?? report.shareToken,
      sessionId: session.id,
      startedAt: startedAt.toISOString(),
      pageUrl: pageUrl ?? null,
      title: title ?? null,
      lastError: null,
    };

    await saveRecorderState(state);
    rememberActiveRecorder(state);
    await notifyTab(tab.id, {
      type: RuntimeMessageTypes.CaptureStarted,
      payload: {
        sessionId: session.id,
        startedAt: startedAt.toISOString(),
        reportId: report.id,
        consoleCaptureMode: 'off' satisfies ConsoleCaptureMode,
      },
    });
    chrome.alarms.create(flushAlarmName, { periodInMinutes: Math.max(0.1, settings.flushIntervalMs / 60_000) });
    await chrome.action.setBadgeText({ tabId: tab.id, text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#0f766e' });

    return state;
  } catch (error) {
    if (offscreenStarted) {
      await stopOffscreenRecording();
    }
    await resetRecorderState();
    activeRecorderSnapshot = null;
    if (preparingOverlayShown) {
      await notifyTab(tab.id, {
        type: RuntimeMessageTypes.CaptureFailed,
        payload: { error: getErrorMessage(error) },
      }).catch(() => undefined);
    }
    throw error;
  }
}

async function stopCapture() {
  const state = await getRecorderState();
  if (!state.isRecording || !state.reportId || !state.sessionId) {
    return state;
  }

  await notifyTab(state.tabId, { type: RuntimeMessageTypes.CaptureStopped });
  await delay(250);
  await detachConsoleDebugger(state.tabId);
  await flushTelemetry();
  const recording = await stopOffscreenRecording();
  const endedAt = new Date();
  const durationMs = recording?.durationMs ?? (
    state.startedAt ? endedAt.getTime() - new Date(state.startedAt).getTime() : undefined
  );
  chrome.alarms.clear(flushAlarmName);
  const review: PendingCaptureReview = {
    artifactKind: 'recording',
    tabId: state.tabId,
    reportId: state.reportId,
    sessionId: state.sessionId,
    shareToken: state.shareToken ?? null,
    ingestToken: state.ingestToken ?? state.shareToken ?? null,
    title: state.title ?? 'Untitled capture',
    description: 'Recording captured from the Weevil browser extension.',
    pageUrl: state.pageUrl,
    dashboardUrl: buildDashboardUrl(state.reportId, state.shareToken),
    dataUrl: recording?.dataUrl,
    contentType: recording?.contentType ?? RECORDING_UPLOAD_CONTENT_TYPE,
    byteSize: recording?.byteSize,
    durationMs,
    completedAt: endedAt.toISOString(),
  };
  pendingReview = review;
  if (state.tabId) {
    await chrome.action.setBadgeText({ tabId: state.tabId, text: '' });
    await notifyTab(state.tabId, {
      type: RuntimeMessageTypes.CaptureCompleted,
      payload: pendingReviewToPayload(review, false),
    });
  }
  await saveRecorderState({
    ...state,
    isRecording: false,
  });
  activeRecorderSnapshot = null;

  return getRecorderState();
}

async function captureScreenshot(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.windowId) {
    throw new Error('Active tab is not captureable.');
  }
  await assertCaptureableTab(tab);

  const settings = await getSettings();
  const api = await createCaptureApi(settings.apiBaseUrl);
  const capturedAt = new Date();
  const manifest = chrome.runtime.getManifest();
  const pageUrl = tab.url;
  const title = tab.title || pageUrl || 'Weevil screenshot';
  await injectContentScript(tab.id);
  const captureContext = await getTabCaptureContext(tab.id);
  const dataUrl = await captureVisibleTab(tab.windowId);
  const screenshotBlob = await dataUrlToBlob(dataUrl);
  const report = await api.createReport({
    title,
    description: 'Captured screenshot from the Weevil browser extension.',
    source: ReportSource.Extension,
    pageUrl,
    userAgent: captureContext.userAgent,
    browserName: captureContext.browserName ?? 'Chrome',
    browserVersion: captureContext.browserVersion,
    osName: captureContext.osName,
    viewportWidth: captureContext.viewportWidth,
    viewportHeight: captureContext.viewportHeight,
    metadata: {
      tabId: tab.id,
      windowId: tab.windowId,
      extensionVersion: manifest.version,
      captureMode: 'screenshot',
      redactSensitiveData: settings.redactSensitiveData,
    },
  });
  const session = await api.createCaptureSession(
    report.id,
    {
      startedAt: capturedAt.toISOString(),
      pageUrl,
      title,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
      userAgent: captureContext.userAgent,
      browserName: captureContext.browserName ?? 'Chrome',
      browserVersion: captureContext.browserVersion,
      osName: captureContext.osName,
      extensionVersion: manifest.version,
      manifestVersion: String(manifest.manifest_version),
      tabId: String(tab.id),
      windowId: String(tab.windowId),
      viewportWidth: captureContext.viewportWidth,
      viewportHeight: captureContext.viewportHeight,
      screenWidth: captureContext.screenWidth,
      screenHeight: captureContext.screenHeight,
      devicePixelRatio: captureContext.devicePixelRatio,
      metadata: {
        source: 'extension',
        captureMode: 'screenshot',
        redactSensitiveData: settings.redactSensitiveData,
      },
    },
    report.ingestToken ?? report.shareToken,
  );
  const review: PendingCaptureReview = {
    artifactKind: 'screenshot',
    tabId: tab.id,
    reportId: report.id,
    sessionId: session.id,
    shareToken: report.shareToken ?? null,
    ingestToken: report.ingestToken ?? report.shareToken ?? null,
    title,
    description: 'Screenshot captured from the Weevil browser extension.',
    pageUrl,
    dashboardUrl: buildDashboardUrl(report.id, report.shareToken),
    dataUrl,
    contentType: screenshotBlob.type || 'image/png',
    durationMs: 0,
    byteSize: screenshotBlob.size,
    completedAt: capturedAt.toISOString(),
  };
  pendingReview = review;

  await notifyTab(tab.id, {
    type: RuntimeMessageTypes.CaptureCompleted,
    payload: pendingReviewToPayload(review, false),
  });

  return pendingReviewToPayload(review, false);
}

async function submitCaptureReview(input?: SubmitCaptureReviewInput) {
  if (!pendingReview) {
    throw new Error('No capture review is waiting to be saved.');
  }

  const review = pendingReview;
  const settings = await getSettings();
  const api = new WeevilApiClient(settings.apiBaseUrl);
  const title = input?.title?.trim() || review.title || 'Untitled capture';
  const description = typeof input?.description === 'string'
    ? input.description.trim()
    : review.description ?? undefined;

  await api.updateReport(review.reportId, { title, description }, review.ingestToken);

  if (review.dataUrl) {
    const upload = await api.createUpload(review.reportId, {
      kind: review.artifactKind === 'screenshot' ? UploadKind.Screenshot : UploadKind.ScreenRecording,
      contentType: review.contentType,
      byteSize: review.byteSize,
      metadata: {
        source: review.artifactKind === 'screenshot' ? 'extension-visible-tab-screenshot' : 'extension-tab-recording',
      },
    }, review.ingestToken);
    const blob = await dataUrlToBlob(review.dataUrl);
    await api.uploadBlob(upload.putUrl, blob, review.contentType);
    await api.completeUpload(review.reportId, upload.uploadId, {
      byteSize: review.byteSize ?? blob.size,
    }, review.ingestToken);
  }

  await api.completeCaptureSession(review.reportId, review.sessionId, {
    endedAt: review.completedAt,
    recordingEndedAt: review.artifactKind === 'recording' ? review.completedAt : undefined,
    durationMs: review.durationMs,
    status: 'COMPLETED',
    metadata: {
      captureMode: review.artifactKind,
    },
  }, review.ingestToken);

  pendingReview = {
    ...review,
    title,
    description,
  };
  const savedReview = pendingReview;
  const payload = pendingReviewToPayload(savedReview, true);
  await notifyTab(review.tabId ?? null, {
    type: RuntimeMessageTypes.CaptureCompleted,
    payload,
  });
  pendingReview = null;
  await resetRecorderState();
  activeRecorderSnapshot = null;
  return payload;
}

async function discardCaptureReview() {
  pendingReview = null;
  chrome.alarms.clear(flushAlarmName);
  await resetRecorderState();
  activeRecorderSnapshot = null;
}

async function appendBatch(batch: Partial<TelemetryBatch>) {
  const state = await getRecorderState();
  if (!state.isRecording || !state.sessionId) {
    return;
  }

  buffers.consoleLogs.push(...withSession(batch.consoleLogs, state.sessionId));
  buffers.networkRequests.push(...withSession(batch.networkRequests, state.sessionId));
  buffers.pageActions.push(...withSession(batch.pageActions, state.sessionId));
  buffers.runtimeErrors.push(...withSession(batch.runtimeErrors, state.sessionId));
  buffers.performanceEntries.push(...withSession(batch.performanceEntries, state.sessionId));
  buffers.domEvents.push(...withSession(batch.domEvents, state.sessionId));
  buffers.backendTraces.push(...withSession(batch.backendTraces, state.sessionId));

  if (bufferSize() >= DEFAULT_MAX_BATCH_SIZE) {
    await flushTelemetry();
  }
}

async function appendPageTelemetry(message: { type: string; payload: unknown }, tabId: number | undefined) {
  const state = await getRecorderState();
  if (!state.isRecording || !state.sessionId || (state.tabId && tabId && state.tabId !== tabId)) {
    return;
  }

  const base = {
    sessionId: state.sessionId,
    offsetMs: offsetFromClamped(state.startedAt),
  };
  const payload = message.payload as Record<string, unknown>;

  if (message.type.endsWith('CONSOLE')) {
    const timestamp = optionalString(payload.timestamp) ?? new Date().toISOString();
    const stack = sanitizeConsoleStack(optionalString(payload.stack, maxTelemetryTextChars));
    buffers.consoleLogs.push({
      ...base,
      offsetMs: offsetFromClamped(state.startedAt, timestamp),
      level: normalizeConsoleLevel(payload.level),
      message: limitText(String(payload.message ?? ''), maxTelemetryTextChars),
      args: normalizeRecord(payload.args),
      stack,
      pageUrl: optionalUrlString(payload.pageUrl),
      timestamp,
    });
  }

  if (message.type.endsWith('NETWORK')) {
    const settings = await getSettings();
    const shouldRedactSensitiveData = settings.redactSensitiveData;
    const networkStartedAt = optionalString(payload.startedAt) ?? new Date().toISOString();
    const url = optionalNetworkUrl(payload.url ?? state.pageUrl);
    if (!url) {
      return;
    }

    buffers.networkRequests.push(mergeCapturedNetworkHeaders({
      ...base,
      // Offset from the request's REAL start, overriding base's flush-time value,
      // so dots land at the right spot on the scrubber instead of all clustering.
      offsetMs: offsetFromClamped(state.startedAt, networkStartedAt),
      requestId: optionalString(payload.requestId, maxTelemetryShortTextChars),
      method: limitText(String(payload.method ?? 'GET'), maxTelemetryMethodChars),
      url,
      statusCode: optionalHttpStatus(payload.statusCode),
      durationMs: optionalBoundedInt(payload.durationMs, 0, maxTelemetryDurationMs),
      requestHeaders: redactHeaderRecord(normalizeRecord(payload.requestHeaders), shouldRedactSensitiveData),
      responseHeaders: redactHeaderRecord(normalizeRecord(payload.responseHeaders), shouldRedactSensitiveData),
      requestBody: redactBodyText(optionalString(payload.requestBody, maxTelemetryBodyChars), shouldRedactSensitiveData),
      responseBody: redactBodyText(optionalString(payload.responseBody, maxTelemetryBodyChars), shouldRedactSensitiveData),
      error: optionalString(payload.error, 4_000),
      resourceType: optionalString(payload.resourceType, 32),
      startedAt: networkStartedAt,
      endedAt: optionalString(payload.endedAt),
    }, tabId, shouldRedactSensitiveData));
  }

  if (message.type.endsWith('RUNTIME_ERROR')) {
    const occurredAt = optionalString(payload.occurredAt) ?? new Date().toISOString();
    buffers.runtimeErrors.push({
      ...base,
      offsetMs: offsetFromClamped(state.startedAt, occurredAt),
      kind: String(payload.kind ?? 'JS_ERROR') as RuntimeErrorTelemetryEntry['kind'],
      message: limitText(String(payload.message ?? 'Runtime error'), maxTelemetryTextChars),
      sourceUrl: optionalUrlString(payload.sourceUrl),
      lineNumber: optionalBoundedInt(payload.lineNumber, 0, 1_000_000),
      columnNumber: optionalBoundedInt(payload.columnNumber, 0, 1_000_000),
      stack: optionalString(payload.stack, 12_000),
      componentStack: optionalString(payload.componentStack, 12_000),
      pageUrl: optionalUrlString(payload.pageUrl),
      occurredAt,
      metadata: normalizeRecord(payload.metadata),
    });
  }

  if (message.type.endsWith('PERFORMANCE')) {
    const metadata = normalizeRecord(payload.metadata);
    const backendTrace = metadata?.backendTrace;
    buffers.performanceEntries.push({
      ...base,
      kind: String(payload.kind ?? PerformanceEntryKind.Custom) as PerformanceTelemetryEntry['kind'],
      name: limitText(String(payload.name ?? 'performance'), maxTelemetryNameChars),
      value: optionalFiniteNumber(payload.value),
      startTimeMs: optionalFiniteNumber(payload.startTimeMs),
      durationMs: optionalFiniteNumber(payload.durationMs),
      rating: optionalString(payload.rating, 40),
      initiatorType: optionalString(payload.initiatorType, 80),
      pageUrl: optionalUrlString(payload.pageUrl),
      occurredAt: optionalString(payload.occurredAt) ?? new Date().toISOString(),
      metadata,
    });

    if (backendTrace && typeof backendTrace === 'object') {
      const trace = backendTrace as Record<string, unknown>;
      buffers.backendTraces.push({
        ...base,
        operationName: limitText(String(trace.operationName ?? payload.name ?? 'Backend operation'), maxTelemetryOperationChars),
        serviceName: optionalString(trace.serviceName, maxTelemetryShortTextChars),
        status: normalizeBackendTraceStatus(trace.status),
        method: optionalString(trace.method, maxTelemetryMethodChars),
        url: optionalUrlString(trace.url),
        statusCode: optionalHttpStatus(trace.statusCode),
        durationMs: optionalBoundedNumber(trace.durationMs, 0, maxTelemetryDurationMs),
        startedAt: optionalString(trace.startedAt) ?? new Date().toISOString(),
        endedAt: optionalString(trace.endedAt),
        metadata: {
          source: 'page-bridge',
        },
      });
    }
  }

  if (bufferSize() >= DEFAULT_MAX_BATCH_SIZE) {
    await flushTelemetry();
  }
}

async function detachConsoleDebugger(tabId: number | null | undefined) {
  if (!tabId || attachedConsoleDebuggee?.tabId !== tabId) {
    return;
  }

  const debuggee = attachedConsoleDebuggee;
  attachedConsoleDebuggee = null;
  try {
    await debuggerApi?.detach(debuggee);
  } catch {
    // The debugger can already be detached by Chrome or another extension.
  }
}

async function handleDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params?: object,
) {
  const state = await getRecorderState();
  if (!state.isRecording || !state.sessionId || state.tabId !== source.tabId) {
    return;
  }

  const record = toRecord(params);
  if (!record) {
    return;
  }

  if (method === 'Runtime.consoleAPICalled') {
    appendDebuggerConsoleEvent(record, state);
  }

  if (method === 'Log.entryAdded') {
    appendDebuggerLogEntry(record, state);
  }

  if (method === 'Runtime.exceptionThrown') {
    appendDebuggerException(record, state);
  }

  if (bufferSize() >= DEFAULT_MAX_BATCH_SIZE) {
    await flushTelemetry();
  }
}

function appendDebuggerConsoleEvent(params: Record<string, unknown>, state: RecorderState) {
  const type = optionalString(params.type) ?? 'log';
  const args = Array.isArray(params.args) ? params.args : [];
  const timestamp = debuggerTimestampToIso(params.timestamp);
  const stackTrace = toRecord(params.stackTrace);

  buffers.consoleLogs.push({
    sessionId: state.sessionId ?? undefined,
    level: normalizeDebuggerConsoleLevel(type),
    message: limitText(args.map(remoteObjectToString).filter(Boolean).join(' ') || type, maxTelemetryTextChars),
    args: normalizeDebuggerArgs(args),
    stack: stackTraceToString(stackTrace),
    pageUrl: optionalUrlString(getStackTopUrl(stackTrace) ?? state.pageUrl),
    timestamp,
    offsetMs: offsetFromClamped(state.startedAt, timestamp),
  });
}

function appendDebuggerLogEntry(params: Record<string, unknown>, state: RecorderState) {
  const entry = toRecord(params.entry);
  if (!entry) {
    return;
  }

  const level = optionalString(entry.level) ?? 'info';
  const timestamp = debuggerTimestampToIso(entry.timestamp);
  const url = optionalUrlString(entry.url) ?? optionalUrlString(state.pageUrl);
  const text = optionalString(entry.text) ?? optionalString(entry.source) ?? 'Browser log';

  buffers.consoleLogs.push({
    sessionId: state.sessionId ?? undefined,
    level: normalizeDebuggerConsoleLevel(level),
    message: limitText(text, maxTelemetryTextChars),
    pageUrl: url,
    timestamp,
    offsetMs: offsetFromClamped(state.startedAt, timestamp),
  });
}

function appendDebuggerException(params: Record<string, unknown>, state: RecorderState) {
  const details = toRecord(params.exceptionDetails);
  if (!details) {
    return;
  }

  const exception = toRecord(details.exception);
  const timestamp = new Date().toISOString();
  const message =
    optionalString(details.text) ??
    (exception ? remoteObjectToString(exception) : undefined) ??
    'Runtime exception';
  const url = optionalString(details.url) ?? state.pageUrl ?? undefined;

  buffers.runtimeErrors.push({
    sessionId: state.sessionId ?? undefined,
    kind: RuntimeErrorKind.JsError,
    message,
    sourceUrl: optionalUrlString(url),
    lineNumber: optionalBoundedInt(details.lineNumber, 0, 1_000_000),
    columnNumber: optionalBoundedInt(details.columnNumber, 0, 1_000_000),
    stack: exception ? optionalString(exception.description, maxTelemetryTextChars) : undefined,
    pageUrl: optionalUrlString(url),
    occurredAt: timestamp,
    offsetMs: offsetFromClamped(state.startedAt, timestamp),
    metadata: {
      source: 'chrome-debugger',
    },
  });
}

async function flushTelemetry() {
  const state = await getRecorderState();
  if (!state.reportId || !state.isRecording) {
    clearBuffers();
    return;
  }

  const settings = await getSettings();
  const api = new WeevilApiClient(settings.apiBaseUrl);
  const batch = drainBuffers();
  const reportId = state.reportId;
  const reportToken = state.ingestToken ?? state.shareToken ?? null;
  const tasks = [
    ...chunk(batch.consoleLogs, settings.maxBatchSize).map((items) => ({
      kind: 'console',
      run: () => api.attachConsoleLogs(reportId, items, reportToken),
    })),
    ...chunk(batch.networkRequests, settings.maxBatchSize).map((items) => ({
      kind: 'network',
      run: () => api.attachNetworkRequests(reportId, items, reportToken),
    })),
    ...chunk(batch.pageActions, settings.maxBatchSize).map((items) => ({
      kind: 'actions',
      run: () => api.attachPageActions(reportId, items, reportToken),
    })),
    ...chunk(batch.runtimeErrors, settings.maxBatchSize).map((items) => ({
      kind: 'errors',
      run: () => api.attachRuntimeErrors(reportId, items, reportToken),
    })),
    ...chunk(batch.performanceEntries, settings.maxBatchSize).map((items) => ({
      kind: 'performance',
      run: () => api.attachPerformanceEntries(reportId, items, reportToken),
    })),
    ...chunk(batch.domEvents, settings.maxBatchSize).map((items) => ({
      kind: 'dom-events',
      run: () => api.attachDomEvents(reportId, items, reportToken),
    })),
    ...chunk(batch.backendTraces, settings.maxBatchSize).map((items) => ({
      kind: 'backend-traces',
      run: () => api.attachBackendTraces(reportId, items, reportToken),
    })),
  ];

  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  const failed = results
    .map((result, index) => ({ result, task: tasks[index] }))
    .filter((item): item is { result: PromiseRejectedResult; task: (typeof tasks)[number] } => (
      item.result.status === 'rejected'
    ));

  if (failed.length > 0) {
    const summary = failed
      .map(({ task, result }) => `${task.kind}: ${describeTelemetryUploadError(result.reason)}`)
      .join('; ');
    console.warn(`[Weevil] telemetry upload skipped: ${summary}`);
    await markError(`Telemetry upload skipped: ${summary}`);
  }
}

async function startOffscreenRecording(tabId: number) {
  await ensureOffscreenDocument();
  const streamId = await getMediaStreamId(tabId);
  const response = await sendRuntimeMessage<{ ok?: boolean; error?: string }>({
    type: RuntimeMessageTypes.OffscreenStartRecording,
    payload: { streamId },
  });

  if (response?.ok === false) {
    throw new Error(response.error ?? 'Failed to start offscreen recording.');
  }
}

async function stopOffscreenRecording() {
  try {
    const response = await sendRuntimeMessage<OffscreenRecordingResult | { ok: false; error?: string } | null>({
      type: RuntimeMessageTypes.OffscreenStopRecording,
    });

    if (!response) {
      return null;
    }

    if ('ok' in response && response.ok === false) {
      throw new Error(response.error ?? 'Failed to stop offscreen recording.');
    }

    if (!('dataUrl' in response)) {
      return null;
    }

    return response;
  } catch (error) {
    await markError(error);
    return null;
  }
}

async function getTabCaptureContext(tabId: number): Promise<BrowserCaptureContext> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectBrowserCaptureContext,
    });

    return sanitizeBrowserCaptureContext(result?.result);
  } catch {
    return {};
  }
}

function collectBrowserCaptureContext(): BrowserCaptureContext {
  const ua = navigator.userAgent;
  const uaData = (navigator as unknown as {
    userAgentData?: {
      platform?: string;
      brands?: Array<{ brand?: string; version?: string }>;
    };
  }).userAgentData;
  const browser = detectBrowser(ua, uaData?.brands);

  return {
    userAgent: ua,
    browserName: browser.name,
    browserVersion: browser.version,
    osName: detectOsName(ua, uaData?.platform ?? navigator.platform),
    viewportWidth: positiveInt(window.innerWidth),
    viewportHeight: positiveInt(window.innerHeight),
    screenWidth: positiveInt(window.screen?.width),
    screenHeight: positiveInt(window.screen?.height),
    devicePixelRatio: positiveNumber(window.devicePixelRatio),
  };

  function detectBrowser(userAgent: string, brands?: Array<{ brand?: string; version?: string }>) {
    const brand = brands?.find((item) => {
      const name = item.brand?.toLowerCase() ?? '';
      return name.includes('chrome') || name.includes('chromium') || name.includes('arc');
    });
    const chromeVersion = userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/)?.[1];
    const edgeVersion = userAgent.match(/Edg\/([\d.]+)/)?.[1];
    const firefoxVersion = userAgent.match(/Firefox\/([\d.]+)/)?.[1];
    const safariVersion = !chromeVersion && userAgent.includes('Safari/')
      ? userAgent.match(/Version\/([\d.]+)/)?.[1]
      : undefined;

    if (edgeVersion) return { name: 'Edge', version: edgeVersion };
    if (chromeVersion) return { name: 'Chrome', version: chromeVersion };
    if (firefoxVersion) return { name: 'Firefox', version: firefoxVersion };
    if (safariVersion) return { name: 'Safari', version: safariVersion };
    return { name: brand?.brand ?? 'Chrome', version: brand?.version };
  }

  function detectOsName(userAgent: string, platform?: string) {
    const source = `${platform ?? ''} ${userAgent}`;
    if (/Windows/i.test(source)) return 'Windows';
    if (/Mac OS X|Macintosh|MacIntel/i.test(source)) return 'macOS';
    if (/iPhone|iPad|iPod/i.test(source)) return 'iOS';
    if (/Android/i.test(source)) return 'Android';
    if (/Linux/i.test(source)) return 'Linux';
    if (/CrOS/i.test(source)) return 'ChromeOS';
    return platform || undefined;
  }

  function positiveInt(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.round(value)
      : undefined;
  }

  function positiveNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : undefined;
  }
}

function sanitizeBrowserCaptureContext(value: unknown): BrowserCaptureContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    userAgent: optionalString(record.userAgent, 2_000),
    browserName: optionalString(record.browserName, 120),
    browserVersion: optionalString(record.browserVersion, 120),
    osName: optionalString(record.osName, 120),
    viewportWidth: optionalBoundedInt(record.viewportWidth, 1, 100_000),
    viewportHeight: optionalBoundedInt(record.viewportHeight, 1, 100_000),
    screenWidth: optionalBoundedInt(record.screenWidth, 1, 100_000),
    screenHeight: optionalBoundedInt(record.screenHeight, 1, 100_000),
    devicePixelRatio: optionalPositiveNumber(record.devicePixelRatio, 100),
  };
}

function optionalPositiveNumber(value: unknown, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    return undefined;
  }

  return value;
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record the active tab while the service worker coordinates the capture.',
  });
}

async function getMediaStreamId(tabId: number) {
  try {
    return await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });
  } catch (error) {
    throw normalizeCaptureError(error);
  }
}

async function captureVisibleTab(windowId: number) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch (error) {
    throw normalizeCaptureError(error);
  }
}

async function assertCaptureableTab(tab: chrome.tabs.Tab) {
  const url = tab.url?.trim();
  if (!url) {
    throw new Error('This tab is not ready to capture. Open a website tab, then try again.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('This tab URL cannot be captured. Open a website tab, then try again.');
  }

  const protocol = parsed.protocol;
  if (protocol === 'file:') {
    if (!(await isFileSchemeAccessAllowed())) {
      throw new Error(
        'Local file pages cannot be captured until file access is enabled for Weevil in chrome://extensions.',
      );
    }
    return;
  }

  if (restrictedCaptureProtocols.has(protocol)) {
    throw new Error(
      'Chrome internal pages cannot be captured. Open a normal http or https website tab, then try again.',
    );
  }
}

const restrictedCaptureProtocols = new Set([
  'chrome:',
  'chrome-extension:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'about:',
]);

function normalizeCaptureError(error: unknown): Error {
  const message = getErrorMessage(error);
  if (
    message.includes('activeTab permission') ||
    message.includes('Chrome pages cannot be captured') ||
    message.includes('Cannot access contents of the page')
  ) {
    return new Error(
      'This page cannot be captured by Chrome. Open a normal http or https website tab, click the Weevil extension button in the browser toolbar, then start capture there.',
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function isFileSchemeAccessAllowed(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.extension.isAllowedFileSchemeAccess((isAllowed) => resolve(isAllowed));
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error('No active tab found.');
  }

  return tab;
}

async function notifyTab(tabId: number | null, message: RuntimeMessage) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content scripts are unavailable on Chrome internal pages. The capture can still record.
  }
}

async function notifyConsoleCaptureMode(
  tabId: number | null | undefined,
  consoleCaptureMode: ConsoleCaptureMode,
) {
  const state = await getRecorderState();
  if (!tabId || !state.isRecording || state.tabId !== tabId || !state.sessionId || !state.startedAt) {
    return;
  }

  await notifyTab(tabId, {
    type: RuntimeMessageTypes.CaptureStarted,
    payload: {
      sessionId: state.sessionId,
      startedAt: state.startedAt,
      reportId: state.reportId ?? undefined,
      consoleCaptureMode,
    },
  });
}

async function refreshRecordingTab(tabId: number) {
  const state = await getRecorderState();
  if (!state.isRecording || state.tabId !== tabId || !state.sessionId || !state.startedAt) {
    return;
  }

  await injectContentScript(tabId);
  await injectPageBridge(tabId);
  await notifyTab(tabId, {
    type: RuntimeMessageTypes.CaptureStarted,
    payload: {
      sessionId: state.sessionId,
      startedAt: state.startedAt,
      reportId: state.reportId ?? undefined,
      consoleCaptureMode: 'off' satisfies ConsoleCaptureMode,
    },
  });
}

async function isRecordingTabRequest(tabId: number | undefined) {
  return Boolean(await getRecordingSnapshotForTab(tabId));
}

async function getRecordingSnapshotForTab(
  tabId: number | undefined,
): Promise<ActiveRecorderSnapshot | null> {
  if (typeof tabId !== 'number' || tabId < 0) {
    return null;
  }

  if (activeRecorderSnapshot !== undefined) {
    return activeRecorderSnapshot?.tabId === tabId ? activeRecorderSnapshot : null;
  }

  const hydratedSnapshot = rememberActiveRecorder(await getRecorderState());
  return hydratedSnapshot && hydratedSnapshot.tabId === tabId ? hydratedSnapshot : null;
}

function rememberActiveRecorder(state: RecorderState): ActiveRecorderSnapshot | null {
  if (
    state.isRecording &&
    typeof state.tabId === 'number' &&
    state.sessionId &&
    state.startedAt
  ) {
    activeRecorderSnapshot = {
      tabId: state.tabId,
      sessionId: state.sessionId,
      startedAt: state.startedAt,
    };
    return activeRecorderSnapshot;
  }

  activeRecorderSnapshot = null;
  return activeRecorderSnapshot;
}

async function captureRequestHeaders(details: chrome.webRequest.OnBeforeSendHeadersDetails) {
  if (!(await isRecordingTabRequest(details.tabId))) {
    return;
  }
  if (!isHttpNetworkUrl(details.url)) {
    return;
  }

  purgeCapturedRequestHeaders();
  requestHeaderCaptures.push({
    requestId: details.requestId,
    tabId: details.tabId,
    method: details.method,
    url: details.url,
    capturedAtMs: details.timeStamp,
    headers: chromeHeadersToRecord(details.requestHeaders),
  });
}

async function captureResponseHeaders(details: chrome.webRequest.OnHeadersReceivedDetails) {
  if (!(await isRecordingTabRequest(details.tabId))) {
    return;
  }
  if (!isHttpNetworkUrl(details.url)) {
    return;
  }

  purgeCapturedResponseHeaders();
  responseHeaderCaptures.push({
    requestId: details.requestId,
    tabId: details.tabId,
    method: details.method,
    url: details.url,
    capturedAtMs: details.timeStamp,
    statusCode: details.statusCode,
    headers: chromeHeadersToRecord(details.responseHeaders),
  });
}

async function captureCompletedBrowserRequest(details: chrome.webRequest.OnCompletedDetails) {
  if (shouldSkipBrowserNetworkEntry(details.type)) {
    return;
  }

  await appendBrowserNetworkEntry(details);
}

async function captureFailedBrowserRequest(details: chrome.webRequest.OnErrorOccurredDetails) {
  if (shouldSkipBrowserNetworkEntry(details.type)) {
    return;
  }

  await appendBrowserNetworkEntry(details, details.error);
}

async function appendBrowserNetworkEntry(
  details: chrome.webRequest.OnCompletedDetails | chrome.webRequest.OnErrorOccurredDetails,
  error?: string,
) {
  const state = await getRecordingSnapshotForTab(details.tabId);
  if (!state) {
    return;
  }
  const settings = await getSettings();
  const shouldRedactHeaders = settings.redactSensitiveData;
  const url = optionalNetworkUrl(details.url);
  if (!url) {
    return;
  }

  purgeCapturedRequestHeaders();
  purgeCapturedResponseHeaders();
  const requestMatch = findMatchingRequestHeaderCaptureByRequestId(details.requestId);
  const responseMatch = findMatchingResponseHeaderCaptureByRequestId(details.requestId);
  if (requestMatch) {
    requestHeaderCaptures.splice(requestMatch.index, 1);
  }

  if (responseMatch) {
    responseHeaderCaptures.splice(responseMatch.index, 1);
  }

  const startedAtMs = requestMatch?.capture.capturedAtMs ?? details.timeStamp;
  const endedAtMs = details.timeStamp;
  buffers.networkRequests.push({
    sessionId: state.sessionId,
    requestId: limitText(details.requestId, maxTelemetryShortTextChars),
    method: limitText(details.method, maxTelemetryMethodChars),
    url,
    statusCode: 'statusCode' in details ? optionalHttpStatus(details.statusCode) : undefined,
    durationMs: optionalBoundedInt(Math.max(0, Math.round(endedAtMs - startedAtMs)), 0, maxTelemetryDurationMs),
    requestHeaders: redactHeaderRecord(requestMatch?.capture.headers, shouldRedactHeaders),
    responseHeaders: redactHeaderRecord(responseMatch?.capture.headers, shouldRedactHeaders),
    error: optionalString(error, 4_000),
    resourceType: details.type,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    // Offset from the request's REAL start, not flush time — otherwise every
    // network dot piles up at "now" on the scrubber (or goes null = no dot).
    offsetMs: offsetFromClamped(state.startedAt, new Date(startedAtMs).toISOString()),
  });

  if (bufferSize() >= DEFAULT_MAX_BATCH_SIZE) {
    await flushTelemetry();
  }
}

function shouldSkipBrowserNetworkEntry(type: string) {
  return type === 'xmlhttprequest' || type === 'websocket' || type === 'ping';
}

function mergeCapturedNetworkHeaders(
  entry: NetworkTelemetryEntry,
  tabId: number | undefined,
  shouldRedactHeaders: boolean,
): NetworkTelemetryEntry {
  if (!tabId) {
    return entry;
  }

  purgeCapturedRequestHeaders();
  purgeCapturedResponseHeaders();
  const requestMatch = findMatchingRequestHeaderCapture(entry, tabId);
  const responseMatch = findMatchingResponseHeaderCapture(entry, tabId);

  if (requestMatch) {
    requestHeaderCaptures.splice(requestMatch.index, 1);
  }

  if (responseMatch) {
    responseHeaderCaptures.splice(responseMatch.index, 1);
  }

  return {
    ...entry,
    statusCode: entry.statusCode ?? responseMatch?.capture.statusCode,
    requestHeaders: requestMatch
      ? mergeHeaderRecords(requestMatch.capture.headers, entry.requestHeaders, shouldRedactHeaders)
      : redactHeaderRecord(entry.requestHeaders, shouldRedactHeaders),
    responseHeaders: responseMatch
      ? mergeHeaderRecords(responseMatch.capture.headers, entry.responseHeaders, shouldRedactHeaders)
      : redactHeaderRecord(entry.responseHeaders, shouldRedactHeaders),
  };
}

function findMatchingRequestHeaderCapture(entry: NetworkTelemetryEntry, tabId: number) {
  const startedAtMs = Date.parse(entry.startedAt);
  return requestHeaderCaptures
    .map((capture, index) => ({ capture, index }))
    .filter(({ capture }) => (
      capture.tabId === tabId &&
      capture.method.toUpperCase() === entry.method.toUpperCase() &&
      normalizeUrlForMatch(capture.url) === normalizeUrlForMatch(entry.url) &&
      Math.abs(capture.capturedAtMs - startedAtMs) < requestHeaderCaptureTtlMs
    ))
    .sort((left, right) => (
      Math.abs(left.capture.capturedAtMs - startedAtMs) - Math.abs(right.capture.capturedAtMs - startedAtMs)
    ))[0];
}

function findMatchingRequestHeaderCaptureByRequestId(requestId: string) {
  return requestHeaderCaptures
    .map((capture, index) => ({ capture, index }))
    .find(({ capture }) => capture.requestId === requestId);
}

function findMatchingResponseHeaderCapture(entry: NetworkTelemetryEntry, tabId: number) {
  const endedAtMs = entry.endedAt ? Date.parse(entry.endedAt) : Date.parse(entry.startedAt);
  return responseHeaderCaptures
    .map((capture, index) => ({ capture, index }))
    .filter(({ capture }) => (
      capture.tabId === tabId &&
      capture.method.toUpperCase() === entry.method.toUpperCase() &&
      normalizeUrlForMatch(capture.url) === normalizeUrlForMatch(entry.url) &&
      Math.abs(capture.capturedAtMs - endedAtMs) < responseHeaderCaptureTtlMs
    ))
    .sort((left, right) => (
      Math.abs(left.capture.capturedAtMs - endedAtMs) - Math.abs(right.capture.capturedAtMs - endedAtMs)
    ))[0];
}

function findMatchingResponseHeaderCaptureByRequestId(requestId: string) {
  return responseHeaderCaptures
    .map((capture, index) => ({ capture, index }))
    .find(({ capture }) => capture.requestId === requestId);
}

function purgeCapturedRequestHeaders() {
  const cutoff = Date.now() - requestHeaderCaptureTtlMs;
  for (let index = requestHeaderCaptures.length - 1; index >= 0; index -= 1) {
    const capture = requestHeaderCaptures[index];
    if (capture && capture.capturedAtMs < cutoff) {
      requestHeaderCaptures.splice(index, 1);
    }
  }
}

function purgeCapturedResponseHeaders() {
  const cutoff = Date.now() - responseHeaderCaptureTtlMs;
  for (let index = responseHeaderCaptures.length - 1; index >= 0; index -= 1) {
    const capture = responseHeaderCaptures[index];
    if (capture && capture.capturedAtMs < cutoff) {
      responseHeaderCaptures.splice(index, 1);
    }
  }
}

function chromeHeadersToRecord(
  headers: chrome.webRequest.HttpHeader[] | undefined,
): Record<string, string> {
  const record: Record<string, string> = {};
  headers?.forEach((header) => {
    const name = header.name;
    if (!name) {
      return;
    }

    const value = normalizeCapturedHeaderValue(
      header.value ?? (header.binaryValue ? String(header.binaryValue) : undefined),
    );
    const existingKey = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase());
    if (existingKey) {
      record[existingKey] = `${record[existingKey]}, ${value}`;
      return;
    }

    record[name] = value;
  });

  return record;
}

function mergeHeaderRecords(
  browserHeaders: Record<string, string>,
  pageHeaders: Record<string, unknown> | undefined,
  shouldRedactHeaders: boolean,
) {
  const merged: Record<string, unknown> = redactHeaderRecord(pageHeaders, shouldRedactHeaders) ?? {};
  Object.entries(browserHeaders).forEach(([key, value]) => {
    const existingKey = Object.keys(merged).find((header) => header.toLowerCase() === key.toLowerCase());
    merged[existingKey ?? key] = redactHeaderValue(key, value, shouldRedactHeaders);
  });
  return merged;
}

function redactHeaderRecord(headers: Record<string, unknown> | undefined, shouldRedactHeaders: boolean) {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      typeof value === 'string' ? redactHeaderValue(key, value, shouldRedactHeaders) : value,
    ]),
  );
}

function redactHeaderValue(name: string, value: string, shouldRedactHeaders: boolean) {
  return shouldRedactHeaders && sensitiveHeaderPattern.test(name) ? redactedHeaderValue : value;
}

function redactBodyText(value: string | undefined, shouldRedactSensitiveData: boolean): string | undefined {
  if (!value || !shouldRedactSensitiveData) {
    return value;
  }

  const jsonRedacted = redactJsonBody(value);
  if (jsonRedacted !== null) {
    return limitText(jsonRedacted, maxTelemetryBodyChars);
  }

  const formRedacted = redactFormBody(value);
  if (formRedacted !== null) {
    return limitText(formRedacted, maxTelemetryBodyChars);
  }

  return value
    .replace(
      /(["']?)([A-Za-z0-9_.-]*(?:pass(?:word)?|pwd|secret|token|session|authorization|auth|api[-_]?key|csrf|xsrf|cookie|ssn|cvv|cvc|card.?number)[A-Za-z0-9_.-]*)(\1\s*[:=]\s*)(["']?)[^"',&\s}]+(\4)/gi,
      (_match, quote, key, separator, valueQuote, closingQuote) =>
        `${quote}${key}${separator}${valueQuote}${redactedHeaderValue}${closingQuote}`,
    );
}

function redactJsonBody(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(redactSensitiveObject(parsed));
  } catch {
    return null;
  }
}

function redactFormBody(value: string): string | null {
  if (!/[=&]/.test(value)) {
    return null;
  }

  try {
    const params = new URLSearchParams(value);
    if (Array.from(params.keys()).length === 0) {
      return null;
    }

    let changed = false;
    params.forEach((_entryValue, key) => {
      if (sensitiveBodyKeyPattern.test(key)) {
        params.set(key, redactedHeaderValue);
        changed = true;
      }
    });

    return changed ? params.toString() : null;
  } catch {
    return null;
  }
}

function redactSensitiveObject(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveObject(entry, depth + 1));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      sensitiveBodyKeyPattern.test(key)
        ? redactedHeaderValue
        : redactSensitiveObject(entryValue, depth + 1),
    ]),
  );
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

function normalizeUrlForMatch(value: string) {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

async function injectContentScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content-script.js'],
    });
  } catch {
    // Programmatic injection covers already-open tabs after extension reload.
    // Restricted pages may reject it and are still allowed to record video only.
  }
}

async function injectPageBridge(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['page/page-bridge.js'],
      world: 'MAIN',
    });
  } catch {
    // Programmatic injection can fail on restricted pages, but video capture can
    // still continue when Chrome allows tabCapture.
  }
}

function sendRuntimeMessage<TResponse>(message: RuntimeMessage) {
  return chrome.runtime.sendMessage(message) as Promise<TResponse>;
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function createCaptureApi(apiBaseUrl: string) {
  const sessionApi = new WeevilApiClient(apiBaseUrl);
  try {
    const auth = await sessionApi.getCurrentAuth();
    return sessionApi.withWorkspaceSlug(auth.workspace?.slug ?? null);
  } catch {
    return sessionApi;
  }
}

function buildDashboardUrl(reportId: string, shareToken?: string | null) {
  try {
    const url = new URL(DEFAULT_WEB_BASE_URL);
    if (shareToken) {
      url.pathname = `/c/share/${encodeURIComponent(shareToken)}`;
      url.search = '';
    } else {
      url.pathname = '/';
      url.search = `capture=${encodeURIComponent(reportId)}`;
    }
    url.hash = '';
    return url.toString();
  } catch {
    const base = DEFAULT_WEB_BASE_URL.replace(/\/+$/, '');
    if (shareToken) {
      return `${base}/c/share/${encodeURIComponent(shareToken)}`;
    }
    return `${base}/?capture=${encodeURIComponent(reportId)}`;
  }
}

function pendingReviewToPayload(review: PendingCaptureReview, isSaved: boolean): CaptureCompletedPayload {
  return {
    artifactKind: review.artifactKind,
    reportId: review.reportId,
    shareToken: review.shareToken,
    title: review.title,
    description: review.description,
    pageUrl: review.pageUrl,
    dashboardUrl: isSaved ? review.dashboardUrl : undefined,
    previewDataUrl: review.dataUrl,
    durationMs: review.durationMs,
    byteSize: review.byteSize,
    completedAt: review.completedAt,
    isSaved,
  };
}

function createEmptyBatch(): TelemetryBatch {
  return {
    consoleLogs: [],
    networkRequests: [],
    pageActions: [],
    runtimeErrors: [],
    performanceEntries: [],
    domEvents: [],
    backendTraces: [],
  };
}

function clearBuffers() {
  Object.assign(buffers, createEmptyBatch());
}

function drainBuffers() {
  const batch = {
    consoleLogs: buffers.consoleLogs.splice(0),
    networkRequests: buffers.networkRequests.splice(0),
    pageActions: buffers.pageActions.splice(0),
    runtimeErrors: buffers.runtimeErrors.splice(0),
    performanceEntries: buffers.performanceEntries.splice(0),
    domEvents: buffers.domEvents.splice(0),
    backendTraces: buffers.backendTraces.splice(0),
  };

  return batch;
}

function bufferSize() {
  return Object.values(buffers).reduce((total, items) => total + items.length, 0);
}

function withSession<T extends { sessionId?: string | undefined }>(
  items: T[] | undefined,
  fallbackSessionId: string,
) {
  return (items ?? []).map((item) => ({
    ...item,
    sessionId: item.sessionId ?? fallbackSessionId,
  }));
}

function normalizeConsoleLevel(value: unknown): ConsoleTelemetryEntry['level'] {
  const normalized = String(value ?? 'INFO').toUpperCase();
  if (normalized === 'DEBUG' || normalized === 'INFO' || normalized === 'WARN' || normalized === 'ERROR') {
    return normalized;
  }

  return 'INFO';
}

function normalizeRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function toRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function optionalString(value: unknown, maxLength = maxTelemetryTextChars) {
  return typeof value === 'string' && value.length > 0 ? limitText(value, maxLength) : undefined;
}

function sanitizeConsoleStack(stack: string | undefined) {
  if (!stack) {
    return undefined;
  }

  const normalizedStack = stack.toLowerCase();
  if (
    normalizedStack.includes('page/page-bridge') ||
    normalizedStack.includes('page-bridge.js') ||
    normalizedStack.includes('weevil_page_bridge')
  ) {
    return undefined;
  }

  return stack;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoundedInt(value: unknown, min: number, max: number) {
  const number = optionalNumber(value);
  if (number === undefined || number < min || number > max) {
    return undefined;
  }
  return number;
}

function optionalBoundedNumber(value: unknown, min: number, max: number) {
  const number = optionalFiniteNumber(value);
  if (number === undefined || number < min || number > max) {
    return undefined;
  }
  return number;
}

function optionalHttpStatus(value: unknown) {
  return optionalBoundedInt(value, 100, 599);
}

function optionalUrlString(value: unknown) {
  return optionalString(value, maxTelemetryUrlChars);
}

function optionalNetworkUrl(value: unknown) {
  const url = optionalUrlString(value);
  if (!url || !isHttpNetworkUrl(url)) {
    return undefined;
  }

  return url;
}

function isHttpNetworkUrl(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function offsetFromClamped(startedAt: string | null | undefined, occurredAt?: string | null | undefined) {
  const offsetMs = offsetFrom(startedAt, occurredAt);
  if (offsetMs === undefined) {
    return undefined;
  }
  return Math.min(offsetMs, maxTelemetryOffsetMs);
}

function limitText(value: string, maxLength: number) {
  return truncateText(value, maxLength) ?? '';
}

function normalizeDebuggerConsoleLevel(value: string): ConsoleTelemetryEntry['level'] {
  const normalized = value.toLowerCase();
  if (normalized === 'error' || normalized === 'assert') {
    return 'ERROR';
  }

  if (normalized === 'warning' || normalized === 'warn') {
    return 'WARN';
  }

  if (normalized === 'debug' || normalized === 'verbose') {
    return 'DEBUG';
  }

  return 'INFO';
}

function normalizeBackendTraceStatus(value: unknown): BackendTraceTelemetryEntry['status'] {
  const normalized = String(value ?? BackendTraceStatus.Unknown).toUpperCase();
  if (normalized === BackendTraceStatus.Ok || normalized === BackendTraceStatus.Error) {
    return normalized;
  }
  return BackendTraceStatus.Unknown;
}

function debuggerTimestampToIso(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return new Date().toISOString();
  }

  const milliseconds = value > 1_000_000_000_000 ? value : value * 1_000;
  return new Date(milliseconds).toISOString();
}

function remoteObjectToString(value: unknown) {
  const record = toRecord(value);
  if (!record) {
    return truncateText(String(value), 2_000) ?? '';
  }

  if ('value' in record && record.value !== undefined) {
    return truncateText(String(record.value), 2_000) ?? '';
  }

  return (
    optionalString(record.unserializableValue) ??
    optionalString(record.description) ??
    optionalString(record.type) ??
    ''
  );
}

function normalizeDebuggerArgs(args: unknown[]) {
  return args.reduce<Record<string, unknown>>((record, item, index) => {
    record[String(index)] = remoteObjectToString(item);
    return record;
  }, {});
}

function stackTraceToString(stackTrace: Record<string, unknown> | undefined) {
  const callFrames = Array.isArray(stackTrace?.callFrames) ? stackTrace.callFrames : [];
  const lines = callFrames
    .map((frame) => {
      const record = toRecord(frame);
      if (!record) {
        return null;
      }

      const functionName = optionalString(record.functionName) ?? '(anonymous)';
      const url = optionalString(record.url) ?? 'unknown';
      const lineNumber = optionalNumber(record.lineNumber) ?? 0;
      const columnNumber = optionalNumber(record.columnNumber) ?? 0;
      return `${functionName} (${url}:${lineNumber + 1}:${columnNumber + 1})`;
    })
    .filter((line): line is string => Boolean(line));

  return truncateText(lines.join('\n'), maxTelemetryTextChars);
}

function getStackTopUrl(stackTrace: Record<string, unknown> | undefined) {
  const callFrames = Array.isArray(stackTrace?.callFrames) ? stackTrace.callFrames : [];
  const first = toRecord(callFrames[0]);
  return optionalString(first?.url);
}

async function markError(error: unknown) {
  const state = await getRecorderState();
  await saveRecorderState({
    ...state,
    lastError: getErrorMessage(error),
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function describeTelemetryUploadError(error: unknown) {
  if (error instanceof ApiError) {
    const status = error.status > 0 ? `HTTP ${error.status}` : 'network';
    const payload = summarizePayload(error.payload);
    return payload ? `${status} ${error.message} (${payload})` : `${status} ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return summarizePayload(error) ?? String(error);
}

function summarizePayload(payload: unknown) {
  if (payload === null || payload === undefined) {
    return undefined;
  }

  if (typeof payload === 'string') {
    return limitText(payload, 1_000);
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message = Array.isArray(record.message) ? record.message.join(', ') : record.message;
    if (typeof message === 'string' && message.trim()) {
      return limitText(message, 1_000);
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return limitText(record.error, 1_000);
    }
  }

  try {
    return limitText(JSON.stringify(payload), 1_000);
  } catch {
    return String(payload);
  }
}

function delay(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

interface RequestHeaderCapture {
  requestId: string;
  tabId: number;
  method: string;
  url: string;
  capturedAtMs: number;
  headers: Record<string, string>;
}

interface ResponseHeaderCapture {
  requestId: string;
  tabId: number;
  method: string;
  url: string;
  capturedAtMs: number;
  statusCode?: number;
  headers: Record<string, string>;
}

interface PendingCaptureReview {
  artifactKind: 'recording' | 'screenshot';
  tabId?: number | null | undefined;
  reportId: string;
  sessionId: string;
  shareToken?: string | null | undefined;
  ingestToken?: string | null | undefined;
  title?: string | null | undefined;
  description?: string | null | undefined;
  pageUrl?: string | null | undefined;
  dashboardUrl: string;
  dataUrl?: string | undefined;
  contentType: string;
  byteSize?: number | undefined;
  durationMs?: number | undefined;
  completedAt: string;
}

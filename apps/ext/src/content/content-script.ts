import {
  DEFAULT_MAX_BATCH_SIZE,
  DomEventKind,
  PageActionKind,
  PageMessageTypes,
  RuntimeMessageTypes,
  WebBridgeCommands,
  WebBridgeMessageTypes,
} from '../shared/constants';
import {
  getCssSelector,
  getElementLabel,
  getElementValue,
  getNodePath,
  nowIso,
  offsetFrom,
  safeStringify,
  truncateText,
} from '../shared/telemetry-utils';
import type {
  CaptureCompletedPayload,
  DomEventTelemetryEntry,
  PageTelemetryMessage,
  PageActionTelemetryEntry,
  RecorderState,
  RuntimeMessage,
  TelemetryBatch,
} from '../shared/types';

const contentInstalledFlag = '__WEevil_CONTENT_SCRIPT_INSTALLED_20260604_CONSOLE_RECAPTURE__';
const pageConsoleControlMessageType = 'WEevil_PAGE_CONSOLE_CONTROL';
const pageTelemetryControlMessageType = 'WEevil_PAGE_TELEMETRY_CONTROL';

declare global {
  interface Window {
    [contentInstalledFlag]?: boolean;
  }
}

let isRecording = false;
let sessionId: string | undefined;
let reportId: string | undefined;
let recordingStartedAt: string | null = null;
let flushTimer: number | undefined;
let overlayRoot: ShadowRoot | null = null;
let overlayTimer: number | undefined;
let stateSyncTimer: number | undefined;
let stopRequested = false;
let stoppedSessionId: string | undefined;
let overlayMode: OverlayMode = 'idle';
let preparingEndsAt = 0;
let preparingTotalMs = 3_000;
let countdownRaf = 0;
let isAnnotating = false;
let annotationColor = '#e11d48';
let annotationCanvas: HTMLCanvasElement | null = null;
let isOverlayMinimized = false;
const liveCounts = {
  console: 0,
  network: 0,
  action: 0,
  error: 0,
  performance: 0,
  dom: 0,
};
let escKeyHandler: ((event: KeyboardEvent) => void) | null = null;
let annotationContext: CanvasRenderingContext2D | null = null;
let activePointerId: number | null = null;
let completedCapture: CaptureCompletedPayload | null = null;
let reviewTitleDraft = '';
let reviewDescriptionDraft = '';
let startFailureMessage = '';
let isSubmittingReview = false;
const actionBuffer: PageActionTelemetryEntry[] = [];
const domBuffer: DomEventTelemetryEntry[] = [];
const pendingPageTelemetry: PageTelemetryMessage[] = [];
const maxPendingPageTelemetry = 300;
const scrollActionThrottleMs = 350;
let lastScrollActionAt = 0;
let lastScrollActionKey = '';

type OverlayMode = 'idle' | 'preparing' | 'recording' | 'stopping' | 'done' | 'failed';

if (!window[contentInstalledFlag]) {
  window[contentInstalledFlag] = true;
  removeAllWeevilOverlays();
  connectRuntime();
  attachActionListeners();
  attachDomObservers();
  void syncRecorderState();
  window.addEventListener('beforeunload', () => {
    void flush();
  });
}

function connectRuntime() {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === RuntimeMessageTypes.CapturePreparing) {
      const payload = message.payload as { countdownMs?: number; title?: string } | undefined;
      startPreparingOverlay(payload?.countdownMs ?? 3_000, payload?.title);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === RuntimeMessageTypes.CaptureStarted) {
      const payload = message.payload as {
        sessionId: string;
        startedAt: string;
        reportId?: string;
        consoleCaptureMode?: 'debugger' | 'page';
      };
      startLocalRecording(payload.sessionId, payload.startedAt, payload.reportId, payload.consoleCaptureMode);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === RuntimeMessageTypes.CaptureFailed) {
      const payload = message.payload as { error?: string } | undefined;
      showFailedOverlay(payload?.error);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === RuntimeMessageTypes.CaptureStopped) {
      beginStoppingOverlay();
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === RuntimeMessageTypes.CaptureCompleted) {
      showCompletedOverlay(message.payload as CaptureCompletedPayload);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return;
    }

    const data = event.data as { type?: string; payload?: unknown };
    if (data.type === WebBridgeMessageTypes.Command) {
      void handleWebBridgeCommand(data.payload);
      return;
    }

    if (!data.type?.startsWith('WEevil_PAGE_')) {
      return;
    }

    const pageTelemetry = {
      type: data.type,
      payload: data.payload,
    };

    if (!isRecording || !sessionId) {
      bufferPendingPageTelemetry(pageTelemetry);
      return;
    }

    incrementLiveCount(data.type);
    void sendPageTelemetry(pageTelemetry);
  });
}

function incrementLiveCount(type: string) {
  if (type.endsWith('CONSOLE')) liveCounts.console += 1;
  else if (type.endsWith('NETWORK')) liveCounts.network += 1;
  else if (type.endsWith('ACTION')) liveCounts.action += 1;
  else if (type.endsWith('RUNTIME_ERROR') || type.endsWith('ERROR')) liveCounts.error += 1;
  else if (type.endsWith('PERFORMANCE')) liveCounts.performance += 1;
  else if (type.endsWith('DOM')) liveCounts.dom += 1;
}

function resetLiveCounts() {
  liveCounts.console = 0;
  liveCounts.network = 0;
  liveCounts.action = 0;
  liveCounts.error = 0;
  liveCounts.performance = 0;
  liveCounts.dom = 0;
}

async function handleWebBridgeCommand(payload: unknown) {
  const command = normalizeWebBridgeCommand(payload);
  if (!command) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: runtimeMessageTypeForWebCommand(command.command),
      payload: command.payload,
    } satisfies RuntimeMessage);
    window.postMessage({
      type: WebBridgeMessageTypes.Result,
      requestId: command.requestId,
      ok: response?.ok !== false,
      payload: response,
      error: response?.ok === false ? response.error : undefined,
    }, '*');
  } catch (error) {
    window.postMessage({
      type: WebBridgeMessageTypes.Result,
      requestId: command.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, '*');
  }
}

function normalizeWebBridgeCommand(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const requestId = typeof record.requestId === 'string' ? record.requestId : '';
  const command = typeof record.command === 'string' ? record.command : '';
  if (!requestId || !Object.values(WebBridgeCommands).includes(command as never)) {
    return null;
  }

  return {
    requestId,
    command: command as (typeof WebBridgeCommands)[keyof typeof WebBridgeCommands],
    payload: record.payload,
  };
}

function runtimeMessageTypeForWebCommand(command: (typeof WebBridgeCommands)[keyof typeof WebBridgeCommands]) {
  if (command === WebBridgeCommands.StartCapture) {
    return RuntimeMessageTypes.StartCapture;
  }

  if (command === WebBridgeCommands.CaptureScreenshot) {
    return RuntimeMessageTypes.CaptureScreenshot;
  }

  if (command === WebBridgeCommands.UpdateSettings) {
    return RuntimeMessageTypes.UpdateSettings;
  }

  return RuntimeMessageTypes.GetStatus;
}

async function syncRecorderState() {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: RuntimeMessageTypes.GetStatus,
    } satisfies RuntimeMessage)) as {
      ok?: boolean;
      state?: RecorderState;
      isSenderRecordingTab?: boolean;
    };

    if (
      !response.ok ||
      !response.isSenderRecordingTab ||
      !response.state?.isRecording ||
      !response.state.sessionId ||
      !response.state.startedAt
    ) {
      if (overlayMode === 'preparing') {
        return;
      }
      if (overlayMode === 'stopping' || overlayMode === 'done') {
        return;
      }
      if (isRecording || overlayMode !== 'idle') {
        void stopLocalRecording();
      }
      return;
    }

    startLocalRecording(response.state.sessionId, response.state.startedAt, response.state.reportId ?? undefined);
  } catch {
    if (overlayMode === 'preparing') {
      return;
    }
    if (overlayMode === 'stopping' || overlayMode === 'done') {
      return;
    }
    if (isRecording || overlayMode !== 'idle') {
      void stopLocalRecording();
    }
  }
}

function startPreparingOverlay(countdownMs: number, title: string | undefined) {
  stopRequested = false;
  stoppedSessionId = undefined;
  overlayMode = 'preparing';
  completedCapture = null;
  startFailureMessage = '';
  preparingTotalMs = Math.max(1, countdownMs);
  preparingEndsAt = Date.now() + countdownMs;
  mountRecorderOverlay();
  const page = overlayRoot?.getElementById('weevil-page');
  if (page) {
    page.textContent = title ?? document.title ?? 'Current tab';
  }
  updateOverlay();
  startCountdownRing();
}

/**
 * Smoothly fill the countdown ring with requestAnimationFrame. The 250ms
 * overlay interval is too coarse and made the ring step/jitter; rAF updates
 * stroke-dashoffset every frame so the sweep is continuous.
 */
function startCountdownRing() {
  if (countdownRaf) cancelAnimationFrame(countdownRaf);
  const circumference = 2 * Math.PI * 42;

  const tick = () => {
    if (overlayMode !== 'preparing') {
      countdownRaf = 0;
      return;
    }
    const ringFill = overlayRoot?.getElementById('weevil-ring-fill') as SVGCircleElement | null | undefined;
    if (ringFill) {
      const remaining = Math.max(0, preparingEndsAt - Date.now());
      const progress = Math.min(1, Math.max(0, 1 - remaining / preparingTotalMs));
      ringFill.style.strokeDashoffset = String(circumference * (1 - progress));
    }
    countdownRaf = requestAnimationFrame(tick);
  };

  countdownRaf = requestAnimationFrame(tick);
}

function startLocalRecording(
  nextSessionId: string,
  startedAt: string,
  nextReportId?: string,
  consoleCaptureMode: 'debugger' | 'page' = 'page',
) {
  if (stopRequested && stoppedSessionId === nextSessionId) {
    return;
  }

  const isFreshSession = sessionId !== nextSessionId;

  stopRequested = false;
  stoppedSessionId = undefined;
  overlayMode = 'recording';
  completedCapture = null;
  startFailureMessage = '';
  isRecording = true;
  sessionId = nextSessionId;
  reportId = nextReportId;
  recordingStartedAt = startedAt;

  // Only reset transient UI state on a genuinely new session — the service worker
  // re-broadcasts CaptureStarted on tab updates / debugger reattach, which would
  // otherwise clobber user-controlled state (minimize toggle, live counters).
  if (isFreshSession) {
    isOverlayMinimized = false;
    lastScrollActionAt = 0;
    lastScrollActionKey = '';
    resetLiveCounts();
  }

  startFlushTimer();
  startStateSyncTimer();
  mountRecorderOverlay();
  setPageTelemetryPatchEnabled(true);
  setPageConsolePatchEnabled(consoleCaptureMode === 'page');
  flushPendingPageTelemetry();
}

async function stopLocalRecording() {
  stopRequested = true;
  if (sessionId) {
    stoppedSessionId = sessionId;
  }
  const batch = takeBufferedBatch();
  isRecording = false;
  sessionId = undefined;
  recordingStartedAt = null;
  overlayMode = 'stopping';
  startFailureMessage = '';
  isAnnotating = false;
  updateOverlay();
  stopFlushTimer();
  stopStateSyncTimer();
  unmountRecorderOverlay();
  setPageTelemetryPatchEnabled(false);
  setPageConsolePatchEnabled(false);
  void sendTelemetryBatch(batch);
  reportId = undefined;
}

function beginStoppingOverlay() {
  stopRequested = true;
  if (sessionId) {
    stoppedSessionId = sessionId;
  }

  const batch = takeBufferedBatch();
  isRecording = false;
  sessionId = undefined;
  recordingStartedAt = null;
  overlayMode = 'stopping';
  startFailureMessage = '';
  isAnnotating = false;
  activePointerId = null;
  stopFlushTimer();
  stopStateSyncTimer();
  mountRecorderOverlay();
  setPageTelemetryPatchEnabled(false);
  setPageConsolePatchEnabled(false);
  updateOverlay();
  void sendTelemetryBatch(batch);
}

function showCompletedOverlay(payload: CaptureCompletedPayload) {
  stopRequested = false;
  stoppedSessionId = undefined;
  completedCapture = payload;
  startFailureMessage = '';
  reviewTitleDraft = payload.title ?? document.title ?? 'Untitled capture';
  reviewDescriptionDraft = payload.description ?? (
    payload.artifactKind === 'screenshot'
      ? 'Screenshot captured from the Weevil browser extension.'
      : 'Recording captured from the Weevil browser extension.'
  );
  isSubmittingReview = false;
  reportId = payload.reportId;
  isRecording = false;
  sessionId = undefined;
  recordingStartedAt = null;
  overlayMode = 'done';
  isAnnotating = false;
  activePointerId = null;
  stopFlushTimer();
  stopStateSyncTimer();
  mountRecorderOverlay();
  setPageTelemetryPatchEnabled(false);
  setPageConsolePatchEnabled(false);
  updateOverlay();
}

function showFailedOverlay(error: string | undefined) {
  stopRequested = false;
  stoppedSessionId = undefined;
  completedCapture = null;
  startFailureMessage = error?.trim() || 'Recorder could not start. Check your dashboard session and API connection, then try again.';
  isSubmittingReview = false;
  reportId = undefined;
  isRecording = false;
  sessionId = undefined;
  recordingStartedAt = null;
  overlayMode = 'failed';
  isAnnotating = false;
  activePointerId = null;
  stopFlushTimer();
  stopStateSyncTimer();
  mountRecorderOverlay();
  setPageTelemetryPatchEnabled(false);
  setPageConsolePatchEnabled(false);
  updateOverlay();
}

function attachActionListeners() {
  document.addEventListener('click', (event) => captureElementAction(PageActionKind.Click, event), {
    capture: true,
    passive: true,
  });
  document.addEventListener('input', (event) => captureElementAction(PageActionKind.Input, event), {
    capture: true,
    passive: true,
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isAnnotating) {
      isAnnotating = false;
      activePointerId = null;
      updateOverlay();
      return;
    }

    if (!isRecording || !sessionId) {
      return;
    }

    liveCounts.action += 1;
    const target = event.target instanceof Element ? event.target : null;
    actionBuffer.push({
      sessionId,
      kind: PageActionKind.KeyPress,
      selector: target ? getCssSelector(target) : undefined,
      nodePath: target ? getNodePath(target) : undefined,
      label: event.key,
      tagName: target?.tagName.toLowerCase(),
      pageUrl: location.href,
      offsetMs: offsetFrom(recordingStartedAt),
      occurredAt: nowIso(),
      metadata: {
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      },
    });
    flushIfNeeded();
  }, true);
  document.addEventListener('scroll', captureScrollAction, { capture: true, passive: true });
  window.addEventListener('hashchange', () => captureNavigation('hashchange'));
  window.addEventListener('popstate', () => captureNavigation('popstate'));
}

function captureElementAction(kind: PageActionTelemetryEntry['kind'], event: Event) {
  if (!isRecording || !sessionId || !(event.target instanceof Element) || isWeevilElement(event.target)) {
    return;
  }

  liveCounts.action += 1;
  const target = event.target;
  const pointer = event instanceof MouseEvent ? event : null;
  actionBuffer.push({
    sessionId,
    kind,
    selector: getCssSelector(target),
    nodePath: getNodePath(target),
    label: getElementLabel(target),
    tagName: target.tagName.toLowerCase(),
    textPreview: truncateText(target.textContent?.trim()),
    valuePreview: getElementValue(target),
    pageUrl: location.href,
    x: pointer ? Math.round(pointer.clientX) : undefined,
    y: pointer ? Math.round(pointer.clientY) : undefined,
    scrollX: Math.round(window.scrollX),
    scrollY: Math.round(window.scrollY),
    offsetMs: offsetFrom(recordingStartedAt),
    occurredAt: nowIso(),
  });
  flushIfNeeded();
}

function captureNavigation(trigger: string) {
  if (!isRecording || !sessionId) {
    return;
  }

  actionBuffer.push({
    sessionId,
    kind: PageActionKind.Navigation,
    label: trigger,
    pageUrl: location.href,
    offsetMs: offsetFrom(recordingStartedAt),
    occurredAt: nowIso(),
  });
  flushIfNeeded();
}

function captureScrollAction(event: Event) {
  if (!isRecording || !sessionId) {
    return;
  }

  const target = getScrollActionTarget(event);
  if (target.element && isWeevilElement(target.element)) {
    return;
  }

  const now = Date.now();
  const pageUrl = location.href;
  const scrollX = Math.round(target.scrollX);
  const scrollY = Math.round(target.scrollY);
  const dedupeKey = `${target.selector ?? 'window'}:${scrollX}:${scrollY}:${pageUrl}`;
  if (dedupeKey === lastScrollActionKey || now - lastScrollActionAt < scrollActionThrottleMs) {
    return;
  }

  lastScrollActionAt = now;
  lastScrollActionKey = dedupeKey;
  liveCounts.action += 1;
  actionBuffer.push({
    sessionId,
    kind: PageActionKind.Scroll,
    selector: target.selector,
    nodePath: target.nodePath,
    label: target.label,
    tagName: target.tagName,
    pageUrl,
    scrollX,
    scrollY,
    offsetMs: offsetFrom(recordingStartedAt),
    occurredAt: nowIso(),
  });
  flushIfNeeded();
}

function getScrollActionTarget(event: Event): {
  element: Element | null;
  selector?: string;
  nodePath?: string;
  label: string;
  tagName?: string;
  scrollX: number;
  scrollY: number;
} {
  const eventTarget = event.target;
  const element = eventTarget instanceof Element ? eventTarget : null;
  const isPageScroll =
    !element ||
    element === document.documentElement ||
    element === document.body ||
    eventTarget === document;

  if (isPageScroll) {
    return {
      element: null,
      label: 'Window scroll',
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  }

  return {
    element,
    selector: getCssSelector(element),
    nodePath: getNodePath(element),
    label: getElementLabel(element) || `${element.tagName.toLowerCase()} scroll`,
    tagName: element.tagName.toLowerCase(),
    scrollX: element.scrollLeft,
    scrollY: element.scrollTop,
  };
}

function attachDomObservers() {
  document.addEventListener('focusin', (event) => captureFocusEvent(DomEventKind.Focus, event), true);
  document.addEventListener('focusout', (event) => captureFocusEvent(DomEventKind.Blur, event), true);

  const observer = new MutationObserver((mutations) => {
    if (!isRecording || !sessionId) {
      return;
    }

    for (const mutation of mutations.slice(0, 20)) {
      if (!(mutation.target instanceof Element)) {
        continue;
      }
      if (isWeevilElement(mutation.target) || hasWeevilNode(mutation.addedNodes) || hasWeevilNode(mutation.removedNodes)) {
        continue;
      }

      domBuffer.push({
        sessionId,
        kind: DomEventKind.Mutation,
        selector: getCssSelector(mutation.target),
        nodePath: getNodePath(mutation.target),
        mutationType: mutation.type,
        previousValue: truncateText(mutation.oldValue ?? undefined),
        nextValue: truncateText(mutation.target.textContent?.trim()),
        pageUrl: location.href,
        offsetMs: offsetFrom(recordingStartedAt),
        occurredAt: nowIso(),
        attributes: mutation.attributeName
          ? {
              attributeName: mutation.attributeName,
              value: mutation.target.getAttribute(mutation.attributeName),
            }
          : undefined,
        metadata: {
          addedNodes: mutation.addedNodes.length,
          removedNodes: mutation.removedNodes.length,
        },
      });
    }

    flushIfNeeded();
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeOldValue: true,
    characterDataOldValue: true,
  });
}

function captureFocusEvent(kind: typeof DomEventKind.Focus | typeof DomEventKind.Blur, event: FocusEvent) {
  if (!isRecording || !sessionId || !(event.target instanceof Element) || isWeevilElement(event.target)) {
    return;
  }

  domBuffer.push({
    sessionId,
    kind,
    selector: getCssSelector(event.target),
    nodePath: getNodePath(event.target),
    pageUrl: location.href,
    offsetMs: offsetFrom(recordingStartedAt),
    occurredAt: nowIso(),
  });
  flushIfNeeded();
}

function startFlushTimer() {
  stopFlushTimer();
  flushTimer = window.setInterval(() => {
    void flush();
  }, 2_500);
}

function startStateSyncTimer() {
  stopStateSyncTimer();
  stateSyncTimer = window.setInterval(() => {
    void syncRecorderState();
  }, 1_000);
}

function stopFlushTimer() {
  if (flushTimer) {
    window.clearInterval(flushTimer);
    flushTimer = undefined;
  }
}

function stopStateSyncTimer() {
  if (stateSyncTimer) {
    window.clearInterval(stateSyncTimer);
    stateSyncTimer = undefined;
  }
}

function flushIfNeeded() {
  if (actionBuffer.length + domBuffer.length >= DEFAULT_MAX_BATCH_SIZE) {
    void flush();
  }
}

async function flush() {
  if (!isRecording || !sessionId) {
    return;
  }

  await sendTelemetryBatch(takeBufferedBatch());
}

function takeBufferedBatch() {
  if (!sessionId || (actionBuffer.length === 0 && domBuffer.length === 0)) {
    return null;
  }

  const batch: Partial<TelemetryBatch> = {
    pageActions: actionBuffer.splice(0, actionBuffer.length),
    domEvents: domBuffer.splice(0, domBuffer.length),
  };

  return batch;
}

async function sendTelemetryBatch(batch: Partial<TelemetryBatch> | null) {
  if (!batch) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: RuntimeMessageTypes.TelemetryBatch,
    payload: sanitizeBatch(batch),
  }).catch(() => undefined);
}

function bufferPendingPageTelemetry(message: PageTelemetryMessage) {
  if (message.type !== PageMessageTypes.Console && message.type !== PageMessageTypes.RuntimeError) {
    return;
  }

  pendingPageTelemetry.push(message);
  if (pendingPageTelemetry.length > maxPendingPageTelemetry) {
    pendingPageTelemetry.splice(0, pendingPageTelemetry.length - maxPendingPageTelemetry);
  }
}

function flushPendingPageTelemetry() {
  const pending = pendingPageTelemetry.splice(0);
  pending.forEach((message) => {
    void sendPageTelemetry(message);
  });
}

async function sendPageTelemetry(message: PageTelemetryMessage) {
  await chrome.runtime.sendMessage({
    type: RuntimeMessageTypes.PageTelemetry,
    payload: message,
  }).catch(() => undefined);
}

function setPageConsolePatchEnabled(enabled: boolean) {
  window.postMessage({
    type: pageConsoleControlMessageType,
    enabled,
  }, '*');
}

function setPageTelemetryPatchEnabled(enabled: boolean) {
  window.postMessage({
    type: pageTelemetryControlMessageType,
    enabled,
  }, '*');
}

function sanitizeBatch(batch: Partial<TelemetryBatch>) {
  return JSON.parse(safeStringify(batch, 500_000)) as Partial<TelemetryBatch>;
}

function isWeevilElement(element: Element) {
  return Boolean(element.closest('[data-weevil-overlay="true"]'));
}

function hasWeevilNode(nodes: NodeList) {
  return Array.from(nodes).some((node) => node instanceof Element && isWeevilElement(node));
}

function removeAllWeevilOverlays() {
  document.querySelectorAll('[data-weevil-overlay="true"]').forEach((node) => {
    node.remove();
  });
}

function mountRecorderOverlay() {
  if (overlayRoot || !document.documentElement) {
    updateOverlay();
    return;
  }

  removeAllWeevilOverlays();

  const host = document.createElement('div');
  host.dataset.weevilOverlay = 'true';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  overlayRoot = host.attachShadow({ mode: 'closed' });
  overlayRoot.innerHTML = createOverlayMarkup();
  document.documentElement.appendChild(host);
  annotationCanvas = overlayRoot.getElementById('weevil-annotation-canvas') as HTMLCanvasElement | null;
  annotationContext = annotationCanvas?.getContext('2d', { willReadFrequently: true }) ?? null;

  const requestStop = () => {
    setStopButtonDisabled(true);
    beginStoppingOverlay();
    void chrome.runtime
      .sendMessage({ type: RuntimeMessageTypes.StopCapture } satisfies RuntimeMessage)
      .catch(() => undefined);
  };

  overlayRoot.getElementById('weevil-stop')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestStop();
  });
  overlayRoot.getElementById('weevil-minimize')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    isOverlayMinimized = !isOverlayMinimized;
    updateOverlay();
  });
  overlayRoot.getElementById('weevil-annotate')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    activePointerId = null;
    isAnnotating = !isAnnotating;
    updateOverlay();
  });

  escKeyHandler = (event: KeyboardEvent) => {
	    if (event.key !== 'Escape') return;
	    if (overlayMode === 'recording' && !isAnnotating) {
	      event.preventDefault();
	      requestStop();
	    } else if (overlayMode === 'recording' && isAnnotating) {
	      event.preventDefault();
	      isAnnotating = false;
	      updateOverlay();
	    } else if (overlayMode === 'failed') {
	      event.preventDefault();
	      void stopLocalRecording();
	    }
	  };
  window.addEventListener('keydown', escKeyHandler, true);
  overlayRoot.querySelectorAll('[data-weevil-color]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      annotationColor = (button as HTMLElement).dataset.weevilColor ?? annotationColor;
      isAnnotating = true;
      updateOverlay();
    });
  });
  overlayRoot.getElementById('weevil-clear')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearAnnotationCanvas();
  });
  overlayRoot.getElementById('weevil-review-close')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (completedCapture && !completedCapture.isSaved) {
      void chrome.runtime
        .sendMessage({ type: RuntimeMessageTypes.DiscardCaptureReview } satisfies RuntimeMessage)
        .catch(() => undefined);
    }
    void stopLocalRecording();
  });
  overlayRoot.getElementById('weevil-review-copy')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (completedCapture?.isSaved) {
      void copyCompletedCaptureLink();
      return;
    }
    void submitCaptureReview();
  });
  overlayRoot.getElementById('weevil-review-title')?.addEventListener('input', (event) => {
    reviewTitleDraft = (event.target as HTMLInputElement).value;
  });
  overlayRoot.getElementById('weevil-review-description')?.addEventListener('input', (event) => {
    reviewDescriptionDraft = (event.target as HTMLTextAreaElement).value;
  });
  overlayRoot.getElementById('weevil-review-play')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleReviewVideoPlayback();
  });
  const reviewVideo = overlayRoot.getElementById('weevil-review-video') as HTMLVideoElement | null;
  reviewVideo?.addEventListener('loadedmetadata', syncReviewVideoProgress);
  reviewVideo?.addEventListener('timeupdate', syncReviewVideoProgress);
  reviewVideo?.addEventListener('play', syncReviewVideoProgress);
  reviewVideo?.addEventListener('pause', syncReviewVideoProgress);
  reviewVideo?.addEventListener('ended', syncReviewVideoProgress);
  overlayRoot.getElementById('weevil-review-open')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (completedCapture?.dashboardUrl) {
      window.open(completedCapture.dashboardUrl, '_blank', 'noopener,noreferrer');
    }
  });
  annotationCanvas?.addEventListener('pointerdown', startAnnotationStroke);
  annotationCanvas?.addEventListener('pointermove', continueAnnotationStroke);
  annotationCanvas?.addEventListener('pointerup', endAnnotationStroke);
  annotationCanvas?.addEventListener('pointercancel', endAnnotationStroke);
  window.addEventListener('resize', resizeAnnotationCanvas);
  resizeAnnotationCanvas();
  updateOverlay();
  overlayTimer = window.setInterval(updateOverlay, 250);
}

function unmountRecorderOverlay() {
  if (overlayTimer) {
    window.clearInterval(overlayTimer);
    overlayTimer = undefined;
  }

  if (escKeyHandler) {
    window.removeEventListener('keydown', escKeyHandler, true);
    escKeyHandler = null;
  }

  const host = overlayRoot?.host;
  overlayRoot = null;
  annotationCanvas = null;
  annotationContext = null;
  activePointerId = null;
  isAnnotating = false;
  isOverlayMinimized = false;
  overlayMode = 'idle';
  window.removeEventListener('resize', resizeAnnotationCanvas);
  host?.remove();
  removeAllWeevilOverlays();
}

function updateOverlay() {
  const elapsed = overlayRoot?.getElementById('weevil-elapsed');
  const page = overlayRoot?.getElementById('weevil-page');
  const root = overlayRoot?.getElementById('weevil-root');
  const countdown = overlayRoot?.getElementById('weevil-countdown');
  const status = overlayRoot?.getElementById('weevil-status');
  const modalTitle = overlayRoot?.getElementById('weevil-modal-title');
  const modalCopy = overlayRoot?.getElementById('weevil-modal-copy');
  const modalHint = overlayRoot?.getElementById('weevil-modal-hint');
  const annotate = overlayRoot?.getElementById('weevil-annotate');
  const canvas = overlayRoot?.getElementById('weevil-annotation-canvas') as HTMLCanvasElement | null | undefined;
  const reviewPreview = overlayRoot?.getElementById('weevil-review-preview') as HTMLImageElement | null | undefined;
  const reviewVideo = overlayRoot?.getElementById('weevil-review-video') as HTMLVideoElement | null | undefined;
  const reviewFallback = overlayRoot?.getElementById('weevil-review-fallback');
  const reviewTitle = overlayRoot?.getElementById('weevil-review-title') as HTMLInputElement | null | undefined;
  const reviewDescription = overlayRoot?.getElementById('weevil-review-description') as HTMLTextAreaElement | null | undefined;
  const reviewKind = overlayRoot?.getElementById('weevil-review-kind');
  const reviewUrl = overlayRoot?.getElementById('weevil-review-url');
  const reviewSize = overlayRoot?.getElementById('weevil-review-size');
  const reviewDuration = overlayRoot?.getElementById('weevil-review-duration');
  const reviewSaved = overlayRoot?.getElementById('weevil-review-saved');
  const reviewCopy = overlayRoot?.getElementById('weevil-review-copy') as HTMLButtonElement | null | undefined;
  const reviewOpen = overlayRoot?.getElementById('weevil-review-open') as HTMLButtonElement | null | undefined;

  root?.setAttribute('data-mode', overlayMode);
  root?.setAttribute('data-artifact', completedCapture?.artifactKind ?? 'none');
  root?.toggleAttribute('data-has-preview', Boolean(completedCapture?.previewDataUrl));
  root?.toggleAttribute('data-annotating', isAnnotating);
  root?.toggleAttribute('data-minimized', isOverlayMinimized);
  annotate?.toggleAttribute('data-active', isAnnotating);
  canvas?.toggleAttribute('data-active', isAnnotating);
  const preparingRemainingMs = preparingEndsAt - Date.now();
  const isPreparingOvertime = overlayMode === 'preparing' && preparingRemainingMs <= 0;

  // Update live counters
  const countConsole = overlayRoot?.getElementById('weevil-count-console');
  const countNetwork = overlayRoot?.getElementById('weevil-count-network');
  const countAction = overlayRoot?.getElementById('weevil-count-action');
  const countError = overlayRoot?.getElementById('weevil-count-error');
  if (countConsole) countConsole.textContent = String(liveCounts.console);
  if (countNetwork) countNetwork.textContent = String(liveCounts.network);
  if (countAction) countAction.textContent = String(liveCounts.action);
  if (countError) countError.textContent = String(liveCounts.error);

  // The preparing ring is animated by startCountdownRing() via rAF for a smooth
  // continuous sweep — intentionally not updated here on the 250ms interval.

  if (elapsed) {
    if (overlayMode === 'preparing') {
      const remainingSeconds = Math.max(1, Math.ceil(preparingRemainingMs / 1_000));
      elapsed.textContent = isPreparingOvertime ? 'starting' : `in ${remainingSeconds}`;
    } else {
      elapsed.textContent = formatElapsed(offsetFrom(recordingStartedAt) ?? 0);
    }
  }
  if (page) {
    page.textContent = document.title || location.hostname || 'Current tab';
  }
  if (countdown) {
    // CSS handles visibility per overlayMode; just update the number.
    countdown.textContent = isPreparingOvertime
      ? '…'
      : String(Math.max(1, Math.ceil(preparingRemainingMs / 1_000)));
  }
  if (modalTitle) {
    modalTitle.textContent =
      overlayMode === 'stopping'
        ? 'Finalizing capture'
        : overlayMode === 'failed'
          ? 'Recorder could not start'
          : overlayMode === 'done'
            ? 'Capture ready'
            : isPreparingOvertime
              ? 'Starting recorder'
              : 'Preparing to record';
  }
  if (modalCopy) {
    modalCopy.textContent =
      overlayMode === 'stopping'
        ? 'Preparing your preview and syncing the last telemetry.'
        : overlayMode === 'failed'
          ? startFailureMessage
          : overlayMode === 'done'
            ? completedCapture?.isSaved && reportId
              ? `Your report is ready in the dashboard: ${reportId}`
              : 'Review your capture, then save it to the dashboard.'
            : isPreparingOvertime
              ? 'Opening the capture session. Keep this tab visible.'
              : 'Your capture will start in a moment. Keep this tab visible.';
  }
  if (modalHint) {
    modalHint.classList.toggle('weevil-modal-hint-steps', overlayMode === 'stopping');
    if (overlayMode === 'stopping') {
      modalHint.innerHTML = [
        '<span data-active>video</span>',
        '<span data-active>telemetry</span>',
        '<span>review</span>',
      ].join('');
    } else {
      modalHint.innerHTML =
        overlayMode === 'failed'
          ? 'press <kbd>esc</kbd> to close'
          : 'keep this tab visible';
    }
  }
  if (status) {
    status.textContent =
      overlayMode === 'preparing'
        ? isPreparingOvertime
          ? 'Starting recorder...'
          : 'Preparing recorder...'
        : overlayMode === 'stopping'
          ? 'Preparing preview...'
          : overlayMode === 'failed'
            ? 'Start failed'
            : overlayMode === 'done'
            ? completedCapture?.isSaved
              ? 'Capture saved'
              : 'Review ready'
            : isAnnotating
              ? 'Annotating'
              : 'Console, network, actions, and video are live';
  }

  if (completedCapture) {
    if (reviewTitle) {
      if (document.activeElement !== reviewTitle && reviewTitle.value !== reviewTitleDraft) {
        reviewTitle.value = reviewTitleDraft;
      }
    }
    if (reviewDescription) {
      if (document.activeElement !== reviewDescription && reviewDescription.value !== reviewDescriptionDraft) {
        reviewDescription.value = reviewDescriptionDraft;
      }
    }
    const hasPreview = Boolean(completedCapture.previewDataUrl);
    if (reviewVideo) {
      if (completedCapture.artifactKind === 'recording' && completedCapture.previewDataUrl) {
        if (reviewVideo.src !== completedCapture.previewDataUrl) {
          reviewVideo.src = completedCapture.previewDataUrl;
        }
        reviewVideo.style.display = 'block';
      } else {
        reviewVideo.removeAttribute('src');
        reviewVideo.style.display = 'none';
      }
    }
    if (reviewPreview) {
      if (completedCapture.artifactKind === 'screenshot' && completedCapture.previewDataUrl) {
        reviewPreview.src = completedCapture.previewDataUrl;
        reviewPreview.style.display = 'block';
      } else {
        reviewPreview.removeAttribute('src');
        reviewPreview.style.display = 'none';
      }
    }
    if (reviewFallback) {
      reviewFallback.style.display = hasPreview ? 'none' : 'grid';
    }
    if (reviewKind) {
      reviewKind.textContent = completedCapture.artifactKind === 'screenshot' ? 'Screenshot' : 'Recording';
    }
    if (reviewUrl) {
      reviewUrl.textContent = completedCapture.pageUrl ?? location.href;
    }
    if (reviewSize) {
      reviewSize.textContent = formatBytes(completedCapture.byteSize);
    }
    if (reviewDuration) {
      reviewDuration.textContent = completedCapture.durationMs && completedCapture.durationMs > 0
        ? formatElapsed(completedCapture.durationMs)
        : 'Instant';
    }
    if (reviewSaved) {
      reviewSaved.textContent = completedCapture.isSaved ? 'Saved to dashboard' : 'Ready to review';
    }
    if (reviewCopy) {
      reviewCopy.textContent = isSubmittingReview
        ? 'Saving...'
        : completedCapture.isSaved
          ? reviewCopy.textContent
          : 'Save report';
      reviewCopy.disabled = isSubmittingReview;
    }
    if (reviewOpen) {
      reviewOpen.disabled = !completedCapture.isSaved;
      reviewOpen.style.opacity = completedCapture.isSaved ? '1' : '0.52';
    }
    syncReviewVideoProgress();
  }

  overlayRoot?.querySelectorAll('[data-weevil-color]').forEach((button) => {
    button.toggleAttribute('data-active', (button as HTMLElement).dataset.weevilColor === annotationColor);
  });
}

async function copyCompletedCaptureLink() {
  const link = completedCapture?.dashboardUrl;
  if (!link) {
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    setReviewActionText('Copied');
    window.setTimeout(() => setReviewActionText('Copy link'), 1_400);
  } catch {
    setReviewActionText('Copy failed');
    window.setTimeout(() => setReviewActionText('Copy link'), 1_400);
  }
}

async function submitCaptureReview() {
  if (!completedCapture || isSubmittingReview) {
    return;
  }

  isSubmittingReview = true;
  updateOverlay();
  try {
    const response = await chrome.runtime.sendMessage({
      type: RuntimeMessageTypes.SubmitCaptureReview,
      payload: {
        title: reviewTitleDraft,
        description: reviewDescriptionDraft,
      },
    } satisfies RuntimeMessage);
    const payload = response?.capture as CaptureCompletedPayload | undefined;
    if (payload) {
      showCompletedOverlay(payload);
      setReviewActionText('Copy link');
    }
  } catch {
    setReviewActionText('Retry save');
  } finally {
    isSubmittingReview = false;
    updateOverlay();
  }
}

function setReviewActionText(text: string) {
  const button = overlayRoot?.getElementById('weevil-review-copy');
  if (button) {
    button.textContent = text;
  }
}

async function toggleReviewVideoPlayback() {
  const video = overlayRoot?.getElementById('weevil-review-video') as HTMLVideoElement | null | undefined;
  if (!video?.src || video.style.display === 'none') {
    return;
  }

  if (video.paused) {
    await video.play().catch(() => undefined);
  } else {
    video.pause();
  }
  syncReviewVideoProgress();
}

function syncReviewVideoProgress() {
  const video = overlayRoot?.getElementById('weevil-review-video') as HTMLVideoElement | null | undefined;
  const progress = overlayRoot?.querySelector('.weevil-review-progress span') as HTMLElement | null | undefined;
  const play = overlayRoot?.getElementById('weevil-review-play');
  const duration = overlayRoot?.getElementById('weevil-review-duration');

  if (!video || !progress || !play || !duration || video.style.display === 'none') {
    return;
  }

  const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
  const currentMs = Math.max(0, video.currentTime * 1_000);
  const durationMs = hasDuration ? video.duration * 1_000 : completedCapture?.durationMs;
  const percent = hasDuration ? Math.min(100, Math.max(0, (video.currentTime / video.duration) * 100)) : 0;

  progress.style.width = `${percent}%`;
  play.toggleAttribute('data-playing', !video.paused && !video.ended);
  duration.textContent = durationMs && durationMs > 0
    ? `${formatElapsed(currentMs)} / ${formatElapsed(durationMs)}`
    : 'Ready';
}

function setStopButtonDisabled(isDisabled: boolean) {
  const button = overlayRoot?.getElementById('weevil-stop') as HTMLButtonElement | null | undefined;
  if (!button) {
    return;
  }

  button.disabled = isDisabled;
  button.textContent = isDisabled ? 'Stopping' : 'Stop';
}

function resizeAnnotationCanvas() {
  if (!annotationCanvas || !annotationContext) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const image = annotationCanvas.width > 0 && annotationCanvas.height > 0
    ? annotationContext.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height)
    : null;
  annotationCanvas.width = Math.round(window.innerWidth * ratio);
  annotationCanvas.height = Math.round(window.innerHeight * ratio);
  annotationCanvas.style.width = `${window.innerWidth}px`;
  annotationCanvas.style.height = `${window.innerHeight}px`;
  annotationContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  annotationContext.lineCap = 'round';
  annotationContext.lineJoin = 'round';
  annotationContext.lineWidth = 5;

  if (image) {
    annotationContext.putImageData(image, 0, 0);
  }
}

function startAnnotationStroke(event: PointerEvent) {
  if (!isAnnotating || !annotationContext || !annotationCanvas) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  activePointerId = event.pointerId;
  annotationCanvas.setPointerCapture(event.pointerId);
  annotationContext.beginPath();
  annotationContext.strokeStyle = annotationColor;
  annotationContext.moveTo(event.clientX, event.clientY);
}

function continueAnnotationStroke(event: PointerEvent) {
  if (!isAnnotating || activePointerId !== event.pointerId || !annotationContext) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  annotationContext.lineTo(event.clientX, event.clientY);
  annotationContext.stroke();
}

function endAnnotationStroke(event: PointerEvent) {
  if (activePointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (annotationCanvas?.hasPointerCapture(event.pointerId)) {
    annotationCanvas.releasePointerCapture(event.pointerId);
  }
  activePointerId = null;
}

function clearAnnotationCanvas() {
  if (!annotationCanvas || !annotationContext) {
    return;
  }

  annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function createOverlayMarkup() {
  return `
    <style>
      :host {
        all: initial;
      }

      .weevil-root,
      .weevil-root *,
      .weevil-root *::before,
      .weevil-root *::after {
        box-sizing: border-box;
      }

      .weevil-root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif;
        --w-bg: oklch(0.992 0.003 110);
        --w-surface: oklch(0.975 0.005 110);
        --w-border: oklch(0.88 0.010 110);
        --w-ink: oklch(0.18 0.016 110);
        --w-ink-muted: oklch(0.47 0.022 110);
        --w-ink-faint: oklch(0.60 0.018 110);
        --w-primary: oklch(0.55 0.17 42);
        --w-primary-soft: oklch(0.91 0.065 42);
        --w-accent: oklch(0.55 0.17 42);
        --w-danger: oklch(0.55 0.21 25);
        --w-success: oklch(0.55 0.14 140);
        --w-mono: "Geist Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
        inset: 0;
        pointer-events: none;
        position: fixed;
        font-feature-settings: "ss01", "cv11";
      }

      .weevil-backdrop {
        background: rgba(26, 29, 18, 0.50);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        inset: 0;
        opacity: 0;
        pointer-events: none;
        position: fixed;
        transition: opacity 220ms cubic-bezier(0.165, 0.84, 0.44, 1);
        z-index: 10;
      }

	      .weevil-root[data-mode="preparing"] .weevil-backdrop,
	      .weevil-root[data-mode="stopping"] .weevil-backdrop,
	      .weevil-root[data-mode="failed"] .weevil-backdrop,
	      .weevil-root[data-mode="done"] .weevil-backdrop {
	        opacity: 1;
	      }

      /* ── Preparing modal: circular ring countdown ─────────────────── */

      .weevil-modal {
        background: var(--w-bg);
        border-radius: 16px;
        box-shadow: 0 24px 70px rgba(26, 29, 18, 0.30);
        color: var(--w-ink);
        left: 50%;
        opacity: 0;
        padding: 28px 32px 24px;
        pointer-events: none;
        position: fixed;
        text-align: center;
        top: 50%;
        transform: translate(-50%, -50%) scale(0.96);
        transition: opacity 220ms cubic-bezier(0.165, 0.84, 0.44, 1),
          transform 220ms cubic-bezier(0.165, 0.84, 0.44, 1);
        z-index: 50;
        min-width: 320px;
        width: min(380px, calc(100vw - 32px));
      }

	      .weevil-root[data-mode="preparing"] .weevil-modal,
	      .weevil-root[data-mode="stopping"] .weevil-modal,
	      .weevil-root[data-mode="failed"] .weevil-modal {
	        opacity: 1;
	        transform: translate(-50%, -50%) scale(1);
	      }

      .weevil-ring {
        display: block;
        width: 96px;
        height: 96px;
        margin: 0 auto 18px;
      }

      .weevil-ring-track {
        fill: none;
        stroke: var(--w-surface);
        stroke-width: 4;
      }

      .weevil-ring-fill {
        fill: none;
        stroke: var(--w-primary);
        stroke-width: 4;
        stroke-linecap: round;
        stroke-dasharray: 263.89;
        stroke-dashoffset: 263.89;
        transform: rotate(-90deg);
        transform-origin: center;
        /* Driven smoothly by requestAnimationFrame — no CSS transition (it would
           fight the per-frame updates and reintroduce the stepped/choppy look). */
      }

      /* SVG <text> aligns by glyph geometry (dominant-baseline:central +
         text-anchor:middle), so the digit lands on the ring's exact center
         regardless of font line-box quirks. */
	      .weevil-countdown {
	        font-family: var(--w-mono);
	        font-size: 36px;
        font-weight: 600;
        fill: var(--w-ink);
	        font-variant-numeric: tabular-nums;
	      }

	      .weevil-modal-mark {
	        align-items: center;
	        background: var(--w-primary);
	        border-radius: 15px;
	        color: #ffffff;
	        display: none;
	        font-size: 18px;
	        font-weight: 700;
	        height: 54px;
	        justify-content: center;
	        letter-spacing: -0.03em;
	        margin: 0 auto 18px;
	        position: relative;
	        width: 54px;
	      }

	      .weevil-modal-mark::before {
	        content: "W";
	      }

	      .weevil-modal-mark::after {
	        animation: weevil-modal-spin 900ms linear infinite;
	        border: 1.5px solid var(--w-primary-soft);
	        border-top-color: var(--w-primary);
	        border-radius: 18px;
	        content: "";
	        inset: -6px;
	        position: absolute;
	      }

      .weevil-root[data-mode="stopping"] .weevil-modal-mark,
      .weevil-root[data-mode="failed"] .weevil-modal-mark {
        display: inline-flex;
      }

	      .weevil-root[data-mode="stopping"] .weevil-modal-mark::before {
	        content: "";
	        background: #ffffff;
	        border-radius: 999px;
	        box-shadow:
	          -9px 0 0 rgba(255, 255, 255, 0.55),
	          9px 0 0 rgba(255, 255, 255, 0.55);
	        height: 7px;
	        width: 7px;
	      }

	      .weevil-root[data-mode="failed"] .weevil-modal-mark {
	        background: var(--w-danger);
	      }

	      .weevil-root[data-mode="failed"] .weevil-modal-mark::before {
	        content: "!";
	      }

	      .weevil-root[data-mode="failed"] .weevil-modal-mark::after {
	        display: none;
	      }

	      @keyframes weevil-modal-spin {
	        to {
	          transform: rotate(360deg);
	        }
	      }

	      .weevil-root[data-mode="stopping"] .weevil-ring,
	      .weevil-root[data-mode="stopping"] .weevil-countdown,
	      .weevil-root[data-mode="stopping"] .weevil-ring-fill,
	      .weevil-root[data-mode="stopping"] .weevil-ring-track,
	      .weevil-root[data-mode="failed"] .weevil-ring,
	      .weevil-root[data-mode="failed"] .weevil-countdown,
	      .weevil-root[data-mode="failed"] .weevil-ring-fill,
	      .weevil-root[data-mode="failed"] .weevil-ring-track {
	        display: none;
	      }

      .weevil-modal-title {
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
        line-height: 1.2;
        color: var(--w-ink);
      }

      .weevil-modal-copy {
        font-family: var(--w-mono);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--w-ink-faint);
        line-height: 1.4;
        margin-top: 8px;
      }

      .weevil-modal-hint {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 0.5px solid var(--w-border);
        font-family: var(--w-mono);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--w-ink-faint);
      }

      .weevil-modal-hint kbd {
        display: inline-block;
        padding: 1px 5px;
        border: 0.5px solid var(--w-border);
        border-radius: 3px;
        background: var(--w-surface);
        font-family: var(--w-mono);
        font-size: 10px;
        color: var(--w-ink-muted);
        margin: 0 2px;
        text-transform: none;
        letter-spacing: 0;
      }

      .weevil-modal-hint-steps {
        align-items: center;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .weevil-modal-hint-steps span {
        align-items: center;
        background: var(--w-surface);
        border: 0.5px solid var(--w-border);
        border-radius: 6px;
        color: var(--w-ink-faint);
        display: inline-flex;
        justify-content: center;
        min-height: 26px;
      }

      .weevil-modal-hint-steps span[data-active] {
        background: var(--w-primary-soft);
        border-color: oklch(0.82 0.08 42);
        color: var(--w-primary);
      }

	      .weevil-root[data-mode="recording"] .weevil-modal,
	      .weevil-root[data-mode="recording"] .weevil-backdrop,
	      .weevil-root[data-mode="done"] .weevil-modal {
	        display: none;
	      }

      /* ── Recording shell — workshop bar bottom right ──────────────── */

      .weevil-shell {
        display: flex;
        align-items: center;
        gap: 0;
        background: var(--w-ink);
        border: 0.5px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
        color: #ffffff;
        font-family: inherit;
        right: 20px;
        bottom: 20px;
        max-width: calc(100vw - 40px);
        min-height: 48px;
        padding: 4px;
        pointer-events: auto;
        position: fixed;
        user-select: none;
        z-index: 40;
        transition: width 220ms cubic-bezier(0.165, 0.84, 0.44, 1),
          padding 220ms cubic-bezier(0.165, 0.84, 0.44, 1),
          transform 220ms cubic-bezier(0.165, 0.84, 0.44, 1);
        animation: weevil-shell-in 320ms cubic-bezier(0.19, 1, 0.22, 1);
      }

      @keyframes weevil-shell-in {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .weevil-shell-recording {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 10px 0 12px;
        height: 40px;
      }

      .weevil-dot {
        position: relative;
        width: 8px;
        height: 8px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--w-danger);
      }

      .weevil-dot::after {
        content: "";
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 1.5px solid var(--w-danger);
        opacity: 0;
        animation: weevil-ring-pulse 1.8s ease-out infinite;
      }

      @keyframes weevil-ring-pulse {
        0% {
          opacity: 0.55;
          transform: scale(0.7);
        }
        100% {
          opacity: 0;
          transform: scale(1.3);
        }
      }

      .weevil-time {
        font-family: var(--w-mono);
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #ffffff;
        line-height: 1;
      }

      .weevil-divider {
        width: 0.5px;
        height: 22px;
        background: rgba(255, 255, 255, 0.14);
        flex-shrink: 0;
        margin: 0 2px;
      }

      .weevil-stats {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--w-mono);
        font-size: 11px;
        color: rgba(255, 255, 255, 0.72);
        font-variant-numeric: tabular-nums;
      }

      .weevil-stats .stat {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .weevil-stats .stat strong {
        color: #ffffff;
        font-weight: 600;
        min-width: 1ch;
      }

      .weevil-stats .stat[data-tone="error"] strong {
        color: oklch(0.78 0.16 25);
      }

      .weevil-stats .stat[data-tone="error"]:has(strong:not(:empty)):not([data-zero]) strong {
        color: oklch(0.78 0.16 25);
      }

      .weevil-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        padding-left: 4px;
      }

      .weevil-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        appearance: none;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        font: inherit;
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        height: 32px;
        padding: 0 10px;
        transition: background-color 140ms cubic-bezier(0.165, 0.84, 0.44, 1),
          color 140ms cubic-bezier(0.165, 0.84, 0.44, 1),
          transform 100ms cubic-bezier(0.165, 0.84, 0.44, 1);
      }

      .weevil-button:active {
        transform: scale(0.96);
      }

      .weevil-button svg {
        height: 14px;
        width: 14px;
      }

      .weevil-icon {
        background: transparent;
        color: rgba(255, 255, 255, 0.72);
        min-width: 32px;
        padding: 0;
      }

      .weevil-icon:hover {
        background: rgba(255, 255, 255, 0.10);
        color: #ffffff;
      }

      .weevil-icon[data-active] {
        background: var(--w-accent);
        color: #ffffff;
      }

      .weevil-stop {
        background: var(--w-danger);
        color: #ffffff;
        font-weight: 600;
        padding: 0 12px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .weevil-stop:hover {
        background: oklch(0.50 0.22 25);
      }

      /* Minimized state — just the dot + timer */
      .weevil-root[data-minimized] .weevil-shell {
        padding: 0;
      }

      .weevil-root[data-minimized] .weevil-shell-recording {
        padding: 0 10px;
        gap: 8px;
        height: 36px;
      }

      .weevil-root[data-minimized] .weevil-divider,
      .weevil-root[data-minimized] .weevil-stats,
      .weevil-root[data-minimized] .weevil-actions .weevil-icon:not(#weevil-minimize),
      .weevil-root[data-minimized] .weevil-stop {
        display: none;
      }

      /* Annotation palette */
      .weevil-palette {
        position: absolute;
        right: 0;
        bottom: 48px;
        display: none;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        background: var(--w-ink);
        border: 0.5px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
        pointer-events: auto;
      }

      .weevil-root[data-annotating] .weevil-palette {
        display: flex;
      }

      .weevil-swatch {
        appearance: none;
        border: 1.5px solid transparent;
        border-radius: 999px;
        cursor: pointer;
        height: 18px;
        width: 18px;
        padding: 0;
        transition: transform 120ms cubic-bezier(0.165, 0.84, 0.44, 1);
      }

      .weevil-swatch:hover {
        transform: scale(1.12);
      }

      .weevil-swatch[data-active] {
        border-color: #ffffff;
      }

	      .weevil-root[data-mode="stopping"] .weevil-shell,
	      .weevil-root[data-mode="failed"] .weevil-shell,
	      .weevil-root[data-mode="done"] .weevil-shell {
	        display: none;
	      }

      /* Annotation overlays */
      .weevil-annotation-canvas {
        display: none;
        inset: 0;
        pointer-events: none;
        position: fixed;
        touch-action: none;
        z-index: 20;
      }

      .weevil-annotation-canvas[data-active] {
        cursor: crosshair;
        display: block;
        pointer-events: auto;
      }

      .weevil-annotation-frame {
        border: 0 solid transparent;
        inset: 0;
        pointer-events: none;
        position: fixed;
        transition: border-color 140ms ease, border-width 140ms ease;
        z-index: 21;
      }

      .weevil-root[data-annotating] .weevil-annotation-frame {
        border-color: var(--w-accent);
        border-width: 3px;
      }

      /* ── Review modal (post-capture) ──────────────────────────────── */

      .weevil-review {
        background: var(--w-bg);
        border-radius: 14px;
        box-shadow: 0 28px 90px rgba(26, 29, 18, 0.30);
        display: grid;
        grid-template-columns: minmax(560px, 1fr) minmax(320px, 380px);
        height: min(680px, calc(100vh - 48px));
        left: 50%;
        opacity: 0;
        overflow: hidden;
        pointer-events: none;
        position: fixed;
        top: 50%;
        transform: translate(-50%, -48%) scale(0.97);
        transition: opacity 220ms cubic-bezier(0.165, 0.84, 0.44, 1),
          transform 220ms cubic-bezier(0.165, 0.84, 0.44, 1);
        width: min(1120px, calc(100vw - 48px));
        z-index: 55;
      }

      .weevil-root[data-mode="done"] .weevil-review {
        opacity: 1;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
      }

      .weevil-review-stage {
        background: var(--w-surface);
        display: grid;
        grid-template-rows: 1fr auto;
        min-width: 0;
        padding: 20px;
        border-right: 0.5px solid var(--w-border);
      }

      .weevil-review-preview-wrap {
        align-items: center;
        background: var(--w-ink);
        border-radius: 10px;
        display: grid;
        min-height: 0;
        overflow: hidden;
        place-items: center;
        position: relative;
      }

      .weevil-review-preview,
      .weevil-review-video {
        display: none;
        height: 100%;
        object-fit: contain;
        width: 100%;
      }

      .weevil-review-video {
        background: #000000;
      }

      .weevil-review-fallback {
        color: #ffffff;
        display: grid;
        gap: 10px;
        justify-items: center;
        padding: 28px;
        text-align: center;
      }

      .weevil-review-fallback svg {
        color: var(--w-primary-soft);
        height: 44px;
        width: 44px;
      }

      .weevil-review-fallback strong {
        font-size: 15px;
        font-weight: 600;
        color: #ffffff;
      }

      .weevil-review-fallback span {
        font-family: var(--w-mono);
        font-size: 11px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.62);
        max-width: 320px;
      }

      .weevil-review-strip {
        align-items: center;
        display: grid;
        gap: 12px;
        grid-template-columns: auto 1fr auto;
        margin-top: 14px;
      }

      .weevil-review-play {
        align-items: center;
        appearance: none;
        background: var(--w-bg);
        border: 0.5px solid var(--w-border);
        border-radius: 8px;
        color: var(--w-ink);
        cursor: pointer;
        display: inline-grid;
        font: inherit;
        height: 34px;
        place-items: center;
        width: 38px;
        transition: border-color 140ms cubic-bezier(0.165, 0.84, 0.44, 1);
      }

      .weevil-review-play:hover {
        border-color: var(--w-primary);
      }

      .weevil-review-play::before {
        content: "▶";
        font-size: 12px;
        line-height: 1;
      }

      .weevil-review-play[data-playing]::before {
        content: "❚❚";
        font-size: 11px;
        letter-spacing: -2px;
      }

      .weevil-root:not([data-has-preview]) .weevil-review-play,
      .weevil-root[data-artifact="screenshot"] .weevil-review-play {
        cursor: default;
        opacity: 0.45;
      }

      .weevil-review-progress {
        background: var(--w-bg);
        border: 0.5px solid var(--w-border);
        border-radius: 999px;
        height: 8px;
        overflow: hidden;
      }

      .weevil-review-progress span {
        background: var(--w-primary);
        display: block;
        height: 100%;
        transition: width 120ms linear;
        width: 0%;
      }

      .weevil-review-meta {
        font-family: var(--w-mono);
        font-size: 11px;
        font-weight: 500;
        color: var(--w-ink-muted);
        font-variant-numeric: tabular-nums;
      }

      .weevil-review-panel {
        background: var(--w-bg);
        display: grid;
        grid-template-rows: auto 1fr auto;
        min-width: 0;
        overflow: hidden;
        padding: 20px;
      }

      .weevil-review-top {
        align-items: center;
        display: flex;
        gap: 8px;
        justify-content: space-between;
      }

      .weevil-review-eyebrow {
        font-family: var(--w-mono);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--w-ink-faint);
      }

      .weevil-review-close,
      .weevil-review-open {
        align-items: center;
        appearance: none;
        background: var(--w-bg);
        border: 0.5px solid var(--w-border);
        border-radius: 8px;
        color: var(--w-ink);
        cursor: pointer;
        display: inline-flex;
        font: inherit;
        font-size: 12px;
        font-weight: 500;
        height: 32px;
        justify-content: center;
        padding: 0 12px;
        transition: border-color 140ms cubic-bezier(0.165, 0.84, 0.44, 1),
          background-color 140ms cubic-bezier(0.165, 0.84, 0.44, 1);
      }

      .weevil-review-close:hover,
      .weevil-review-open:hover {
        border-color: var(--w-primary);
        background: var(--w-surface);
      }

      .weevil-review-close {
        font-size: 18px;
        padding: 0;
        width: 32px;
      }

      .weevil-review-form {
        display: grid;
        gap: 12px;
        align-content: start;
        padding-top: 18px;
        padding-right: 1px;
        min-height: 0;
        overflow-y: auto;
      }

      .weevil-review-title-text,
      .weevil-review-description-text {
        appearance: none;
        background: var(--w-bg);
        border: 0.5px solid var(--w-border);
        border-radius: 8px;
        color: var(--w-ink);
        font: inherit;
        max-width: 100%;
        min-width: 0;
        outline: none;
        padding: 10px 12px;
        width: 100%;
        transition: border-color 140ms cubic-bezier(0.165, 0.84, 0.44, 1),
          box-shadow 140ms cubic-bezier(0.165, 0.84, 0.44, 1);
      }

      .weevil-review-title-text:focus,
      .weevil-review-description-text:focus {
        border-color: var(--w-primary);
        box-shadow: 0 0 0 2px var(--w-primary-soft);
      }

      .weevil-review-title-text {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -0.01em;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .weevil-review-description-text {
        font-size: 13px;
        line-height: 1.55;
        min-height: 88px;
        resize: vertical;
        color: var(--w-ink-muted);
      }

      .weevil-review-detail-grid {
        display: grid;
        gap: 0;
        border: 0.5px solid var(--w-border);
        border-radius: 8px;
        overflow: hidden;
      }

      .weevil-review-detail {
        display: grid;
        grid-template-columns: 90px 1fr;
        gap: 12px;
        padding: 8px 12px;
        border-bottom: 0.5px solid var(--w-border);
        align-items: center;
      }

      .weevil-review-detail:last-child {
        border-bottom: 0;
      }

      .weevil-review-detail span {
        font-family: var(--w-mono);
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--w-ink-faint);
      }

      .weevil-review-detail strong {
        font-family: var(--w-mono);
        font-size: 11px;
        font-weight: 500;
        color: var(--w-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .weevil-review-footer {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding-top: 16px;
        border-top: 0.5px solid var(--w-border);
        margin-top: 16px;
      }

      .weevil-review-saved {
        align-items: center;
        color: var(--w-ink-muted);
        display: inline-flex;
        gap: 6px;
        font-family: var(--w-mono);
        font-size: 11px;
        font-weight: 500;
      }

      .weevil-review-saved::before {
        background: var(--w-success);
        border-radius: 999px;
        content: "";
        display: inline-block;
        height: 6px;
        width: 6px;
      }

      .weevil-review-copy {
        appearance: none;
        background: var(--w-primary);
        border: 0;
        border-radius: 8px;
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        min-height: 36px;
        padding: 0 18px;
        transition: background-color 140ms cubic-bezier(0.165, 0.84, 0.44, 1);
      }

      .weevil-review-copy:hover {
        background: oklch(0.49 0.18 42);
      }

      @media (max-width: 900px) {
        .weevil-review {
          grid-template-columns: 1fr;
          height: min(820px, calc(100vh - 32px));
          overflow: auto;
          width: min(560px, calc(100vw - 24px));
        }

        .weevil-review-panel {
          border-top: 0.5px solid var(--w-border);
        }

        .weevil-review-stage {
          border-right: 0;
          border-bottom: 0.5px solid var(--w-border);
        }
      }

      @media (max-width: 520px) {
        .weevil-shell {
          right: 12px;
          bottom: 12px;
        }
        .weevil-stats {
          gap: 6px;
          font-size: 10px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          transition-duration: 0.001ms !important;
          animation-duration: 0.001ms !important;
        }
      }
    </style>
    <div class="weevil-root" id="weevil-root" data-mode="preparing">
      <div class="weevil-backdrop"></div>
      <canvas class="weevil-annotation-canvas" id="weevil-annotation-canvas"></canvas>
      <div class="weevil-annotation-frame"></div>

      <div class="weevil-modal" role="status" aria-live="polite">
        <svg class="weevil-ring" viewBox="0 0 96 96" aria-hidden="true">
          <circle class="weevil-ring-track" cx="48" cy="48" r="42"></circle>
          <circle class="weevil-ring-fill" id="weevil-ring-fill" cx="48" cy="48" r="42"></circle>
          <text
            id="weevil-countdown"
            class="weevil-countdown"
            x="48"
            y="48"
            text-anchor="middle"
            dominant-baseline="central"
	          >3</text>
	        </svg>
	        <div class="weevil-modal-mark" aria-hidden="true"></div>
	        <div class="weevil-modal-title" id="weevil-modal-title">Recording starts in…</div>
	        <div class="weevil-modal-copy" id="weevil-modal-copy">keep this tab visible</div>
	        <div class="weevil-modal-hint" id="weevil-modal-hint">
	          keep this tab visible
	        </div>
	      </div>

      <div class="weevil-review" role="dialog" aria-modal="true" aria-label="Capture review">
        <div class="weevil-review-stage">
          <div class="weevil-review-preview-wrap">
            <video class="weevil-review-video" id="weevil-review-video" controls playsinline preload="metadata"></video>
            <img class="weevil-review-preview" id="weevil-review-preview" alt="Capture preview" />
            <div class="weevil-review-fallback" id="weevil-review-fallback">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="2"/>
                <path d="m10 9 5 3-5 3V9Z" fill="currentColor"/>
              </svg>
              <strong>Capture saved</strong>
              <span>Recording uploaded. Open the dashboard to replay video with all telemetry synced.</span>
            </div>
          </div>
          <div class="weevil-review-strip">
            <button class="weevil-review-play" id="weevil-review-play" type="button" aria-label="Play preview"></button>
            <div class="weevil-review-progress"><span></span></div>
            <div class="weevil-review-meta" id="weevil-review-duration">ready</div>
          </div>
        </div>
        <div class="weevil-review-panel">
          <div class="weevil-review-top">
            <span class="weevil-review-eyebrow">review</span>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="weevil-review-open" id="weevil-review-open" type="button">Open dashboard</button>
              <button class="weevil-review-close" id="weevil-review-close" type="button" aria-label="Close">×</button>
            </div>
          </div>
          <div class="weevil-review-form">
            <input class="weevil-review-title-text" id="weevil-review-title" type="text" maxlength="180" value="Untitled capture" placeholder="Title this capture" />
            <textarea class="weevil-review-description-text" id="weevil-review-description" maxlength="4000" placeholder="What broke? What did you expect?">Recording captured from the Weevil browser extension.</textarea>
            <div class="weevil-review-detail-grid">
              <div class="weevil-review-detail">
                <span>type</span>
                <strong id="weevil-review-kind">Capture</strong>
              </div>
              <div class="weevil-review-detail">
                <span>size</span>
                <strong id="weevil-review-size">0 B</strong>
              </div>
              <div class="weevil-review-detail">
                <span>source</span>
                <strong id="weevil-review-url">Current page</strong>
              </div>
            </div>
          </div>
          <div class="weevil-review-footer">
            <div class="weevil-review-saved" id="weevil-review-saved">Ready to review</div>
            <button class="weevil-review-copy" id="weevil-review-copy" type="button">Save report</button>
          </div>
        </div>
      </div>

      <div class="weevil-shell" role="status" aria-live="polite">
        <div class="weevil-shell-recording">
          <span class="weevil-dot" aria-hidden="true"></span>
          <span class="weevil-time" id="weevil-elapsed">0:00</span>
          <span class="weevil-divider" aria-hidden="true"></span>
          <span class="weevil-stats" aria-label="Live telemetry counts">
            <span class="stat"><strong id="weevil-count-console">0</strong>cn</span>
            <span class="stat"><strong id="weevil-count-network">0</strong>net</span>
            <span class="stat"><strong id="weevil-count-action">0</strong>act</span>
            <span class="stat" data-tone="error"><strong id="weevil-count-error">0</strong>err</span>
          </span>
          <span class="weevil-divider" aria-hidden="true"></span>
          <div class="weevil-actions">
            <button class="weevil-button weevil-icon" id="weevil-annotate" type="button" title="Annotate (Esc to exit)" aria-label="Annotate">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20h4.2L19 9.2a2.8 2.8 0 0 0-4-4L4.2 16 4 20Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                <path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="weevil-button weevil-icon" id="weevil-clear" type="button" title="Clear annotations" aria-label="Clear annotations">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="weevil-button weevil-icon" id="weevil-minimize" type="button" title="Toggle minimize" aria-label="Toggle minimize">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 14h7v7M20 10h-7V3M4 14l-1 1M20 10l1-1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="weevil-palette" aria-label="Annotation colors">
              ${['#e11d48', '#c64a1f', '#5d8a3b', '#2563eb', '#1a1d12', '#ffffff']
                .map((color) => `<button class="weevil-swatch" data-weevil-color="${color}" type="button" style="background:${color}" title="${color}"></button>`)
                .join('')}
            </div>
            <button class="weevil-button weevil-stop" id="weevil-stop" type="button" title="Stop (Esc)">Stop</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.postMessage({ type: PageMessageTypes.BridgeReady }, '*');

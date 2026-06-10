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
let isAnnotating = false;
let annotationColor = '#ff3b5f';
let annotationCanvas: HTMLCanvasElement | null = null;
let annotationContext: CanvasRenderingContext2D | null = null;
let activePointerId: number | null = null;
let completedCapture: CaptureCompletedPayload | null = null;
let reviewTitleDraft = '';
let reviewDescriptionDraft = '';
let isSubmittingReview = false;
const actionBuffer: PageActionTelemetryEntry[] = [];
const domBuffer: DomEventTelemetryEntry[] = [];
const pendingPageTelemetry: PageTelemetryMessage[] = [];
const maxPendingPageTelemetry = 300;

type OverlayMode = 'idle' | 'preparing' | 'recording' | 'stopping' | 'done';

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

    void sendPageTelemetry(pageTelemetry);
  });
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
  preparingEndsAt = Date.now() + countdownMs;
  mountRecorderOverlay();
  const page = overlayRoot?.getElementById('weevil-page');
  if (page) {
    page.textContent = title ?? document.title ?? 'Current tab';
  }
  updateOverlay();
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

  stopRequested = false;
  stoppedSessionId = undefined;
  overlayMode = 'recording';
  completedCapture = null;
  isRecording = true;
  sessionId = nextSessionId;
  reportId = nextReportId;
  recordingStartedAt = startedAt;
  startFlushTimer();
  startStateSyncTimer();
  mountRecorderOverlay();
  setPageConsolePatchEnabled(consoleCaptureMode === 'page' || consoleCaptureMode === 'debugger');
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
  isAnnotating = false;
  updateOverlay();
  stopFlushTimer();
  stopStateSyncTimer();
  unmountRecorderOverlay();
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
  isAnnotating = false;
  activePointerId = null;
  stopFlushTimer();
  stopStateSyncTimer();
  mountRecorderOverlay();
  setPageConsolePatchEnabled(false);
  updateOverlay();
  void sendTelemetryBatch(batch);
}

function showCompletedOverlay(payload: CaptureCompletedPayload) {
  stopRequested = false;
  stoppedSessionId = undefined;
  completedCapture = payload;
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
  document.addEventListener(
    'scroll',
    () => {
      if (!isRecording || !sessionId) {
        return;
      }

      actionBuffer.push({
        sessionId,
        kind: PageActionKind.Scroll,
        pageUrl: location.href,
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        offsetMs: offsetFrom(recordingStartedAt),
        occurredAt: nowIso(),
      });
      flushIfNeeded();
    },
    { capture: true, passive: true },
  );
  window.addEventListener('hashchange', () => captureNavigation('hashchange'));
  window.addEventListener('popstate', () => captureNavigation('popstate'));
}

function captureElementAction(kind: PageActionTelemetryEntry['kind'], event: Event) {
  if (!isRecording || !sessionId || !(event.target instanceof Element) || isWeevilElement(event.target)) {
    return;
  }

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

  overlayRoot.getElementById('weevil-stop')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setStopButtonDisabled(true);
    beginStoppingOverlay();
    void chrome.runtime
      .sendMessage({ type: RuntimeMessageTypes.StopCapture } satisfies RuntimeMessage)
      .catch(() => undefined);
  });
  overlayRoot.getElementById('weevil-annotate')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    activePointerId = null;
    isAnnotating = !isAnnotating;
    updateOverlay();
  });
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

  const host = overlayRoot?.host;
  overlayRoot = null;
  annotationCanvas = null;
  annotationContext = null;
  activePointerId = null;
  isAnnotating = false;
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
  annotate?.toggleAttribute('data-active', isAnnotating);
  canvas?.toggleAttribute('data-active', isAnnotating);

  if (elapsed) {
    if (overlayMode === 'preparing') {
      const remainingSeconds = Math.max(1, Math.ceil((preparingEndsAt - Date.now()) / 1_000));
      elapsed.textContent = `in ${remainingSeconds}`;
    } else {
      elapsed.textContent = formatElapsed(offsetFrom(recordingStartedAt) ?? 0);
    }
  }
  if (page) {
    page.textContent = document.title || location.hostname || 'Current tab';
  }
  if (countdown) {
    countdown.textContent = String(Math.max(1, Math.ceil((preparingEndsAt - Date.now()) / 1_000)));
    countdown.style.display = overlayMode === 'preparing' ? 'inline-flex' : 'none';
  }
  if (modalTitle) {
    modalTitle.textContent =
      overlayMode === 'stopping'
        ? 'Preparing preview'
        : overlayMode === 'done'
          ? 'Capture ready'
          : 'Preparing to record';
  }
  if (modalCopy) {
    modalCopy.textContent =
      overlayMode === 'stopping'
        ? 'Preparing your preview. Review it before saving to the dashboard.'
        : overlayMode === 'done'
          ? completedCapture?.isSaved && reportId
            ? `Your report is ready in the dashboard: ${reportId}`
            : 'Review your capture, then save it to the dashboard.'
          : 'Your capture will start in a moment. Keep this tab visible.';
  }
  if (status) {
    status.textContent =
      overlayMode === 'preparing'
        ? 'Preparing recorder...'
        : overlayMode === 'stopping'
          ? 'Preparing preview...'
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
  button.textContent = isDisabled ? 'Saving' : 'Stop';
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

      .weevil-root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        inset: 0;
        pointer-events: none;
        position: fixed;
      }

      .weevil-backdrop {
        background: rgba(10, 10, 10, 0.54);
        backdrop-filter: blur(6px);
        inset: 0;
        opacity: 0;
        pointer-events: none;
        position: fixed;
        transition: opacity 160ms ease;
        z-index: 10;
      }

      .weevil-root[data-mode="preparing"] .weevil-backdrop,
      .weevil-root[data-mode="stopping"] .weevil-backdrop,
      .weevil-root[data-mode="done"] .weevil-backdrop {
        opacity: 1;
      }

      .weevil-modal {
        background: rgba(25, 30, 29, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 18px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.30);
        color: #ffffff;
        left: 50%;
        min-width: min(360px, calc(100vw - 42px));
        opacity: 0;
        padding: 22px 26px;
        pointer-events: none;
        position: fixed;
        text-align: center;
        top: 50%;
        transform: translate(-50%, -50%) scale(0.98);
        transition: opacity 160ms ease, transform 160ms ease;
        z-index: 50;
      }

      .weevil-root[data-mode="preparing"] .weevil-modal,
      .weevil-root[data-mode="stopping"] .weevil-modal {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }

      .weevil-modal-title {
        font-size: 20px;
        font-weight: 780;
        letter-spacing: 0;
        line-height: 1.2;
      }

      .weevil-modal-copy {
        color: rgba(255, 255, 255, 0.74);
        font-size: 13px;
        line-height: 1.55;
        margin-top: 10px;
      }

      .weevil-countdown {
        align-items: center;
        background: #ffffff;
        border-radius: 999px;
        color: #101010;
        display: inline-flex;
        font-size: 15px;
        font-weight: 800;
        height: 36px;
        justify-content: center;
        margin-top: 14px;
        min-width: 36px;
        padding: 0 12px;
      }

      .weevil-root[data-mode="recording"] .weevil-modal,
      .weevil-root[data-mode="recording"] .weevil-backdrop,
      .weevil-root[data-mode="done"] .weevil-modal {
        display: none;
      }

      .weevil-review {
        background: #ffffff;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 18px;
        box-shadow: 0 28px 90px rgba(15, 23, 42, 0.24);
        display: grid;
        grid-template-columns: minmax(560px, 1fr) minmax(300px, 360px);
        height: min(680px, calc(100vh - 48px));
        left: 50%;
        opacity: 0;
        overflow: hidden;
        pointer-events: none;
        position: fixed;
        top: 50%;
        transform: translate(-50%, -48%) scale(0.98);
        transition: opacity 160ms ease, transform 160ms ease;
        width: min(1120px, calc(100vw - 48px));
        z-index: 55;
      }

      .weevil-root[data-mode="done"] .weevil-review {
        opacity: 1;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
      }

      .weevil-review-stage {
        background:
          radial-gradient(circle at 14% 8%, rgba(37, 99, 235, 0.08), transparent 32%),
          linear-gradient(180deg, #f8fbff 0%, #f3f6fb 100%);
        display: grid;
        grid-template-rows: 1fr auto;
        min-width: 0;
        padding: 22px;
      }

      .weevil-review-preview-wrap {
        align-items: center;
        background: #0f172a;
        border: 1px solid #e3e8f7;
        border-radius: 16px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.70);
        display: grid;
        min-height: 0;
        overflow: hidden;
        place-items: center;
      }

      .weevil-review-preview,
      .weevil-review-video {
        display: none;
        height: 100%;
        object-fit: contain;
        width: 100%;
      }

      .weevil-review-video {
        background: #050816;
      }

      .weevil-review-fallback {
        color: #ffffff;
        display: grid;
        gap: 12px;
        justify-items: center;
        padding: 28px;
        text-align: center;
      }

      .weevil-review-fallback svg {
        color: #2563eb;
        height: 52px;
        width: 52px;
      }

      .weevil-review-fallback strong {
        font-size: 18px;
      }

      .weevil-review-fallback span {
        color: rgba(255, 255, 255, 0.72);
        font-size: 13px;
        line-height: 1.5;
        max-width: 360px;
      }

      .weevil-review-strip {
        align-items: center;
        display: grid;
        gap: 14px;
        grid-template-columns: auto 1fr auto;
        margin-top: 18px;
      }

      .weevil-review-play {
        align-items: center;
        appearance: none;
        background: #ffffff;
        border: 1px solid #dbe3f5;
        border-radius: 12px;
        color: #172033;
        cursor: pointer;
        display: inline-grid;
        font: inherit;
        height: 38px;
        place-items: center;
        width: 42px;
      }

      .weevil-review-play::before {
        content: "▶";
        font-size: 14px;
        line-height: 1;
      }

      .weevil-review-play[data-playing]::before {
        content: "Ⅱ";
        font-size: 13px;
        font-weight: 800;
      }

      .weevil-root:not([data-has-preview]) .weevil-review-play,
      .weevil-root[data-artifact="screenshot"] .weevil-review-play {
        cursor: default;
        opacity: 0.45;
      }

      .weevil-review-progress {
        background: #ffffff;
        border: 1px solid #a7f3d0;
        border-radius: 999px;
        height: 12px;
        overflow: hidden;
      }

      .weevil-review-progress span {
        background: #70e2bd;
        display: block;
        height: 100%;
        transition: width 120ms linear;
        width: 0%;
      }

      .weevil-review-meta {
        color: #172033;
        font-size: 13px;
        font-weight: 760;
      }

      .weevil-review-panel {
        background: #ffffff;
        border-left: 1px solid #e6ecf8;
        display: grid;
        grid-template-rows: auto 1fr auto;
        min-width: 0;
        padding: 20px;
      }

      .weevil-review-top {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: space-between;
      }

      .weevil-review-select,
      .weevil-review-close,
      .weevil-review-open {
        align-items: center;
        appearance: none;
        background: #ffffff;
        border: 1px solid #dbe3f5;
        border-radius: 12px;
        color: #172033;
        cursor: pointer;
        display: inline-flex;
        font: inherit;
        font-size: 13px;
        font-weight: 720;
        height: 36px;
        justify-content: center;
        padding: 0 12px;
      }

      .weevil-review-close {
        font-size: 20px;
        padding: 0;
        width: 38px;
      }

      .weevil-review-form {
        display: grid;
        gap: 14px;
        align-content: center;
        padding-top: 18px;
      }

      .weevil-review-title-text,
      .weevil-review-description-text {
        appearance: none;
        background: #f8faff;
        border: 1px solid #e6ecf8;
        border-radius: 12px;
        color: #172033;
        font: inherit;
        outline: none;
        padding: 10px 12px;
        width: 100%;
      }

      .weevil-review-title-text {
        font-size: 22px;
        font-weight: 800;
        line-height: 1.18;
        overflow-wrap: anywhere;
      }

      .weevil-review-description-text {
        color: #66738d;
        font-size: 14px;
        line-height: 1.5;
        min-height: 84px;
        resize: vertical;
      }

      .weevil-review-detail-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr 1fr;
      }

      .weevil-review-detail {
        background: #f8faff;
        border: 1px solid #e6ecf8;
        border-radius: 12px;
        padding: 10px;
      }

      .weevil-review-detail span {
        color: #66738d;
        display: block;
        font-size: 11px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .weevil-review-detail strong {
        color: #172033;
        display: block;
        font-size: 13px;
        font-weight: 760;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .weevil-review-footer {
        align-items: end;
        display: flex;
        gap: 14px;
        justify-content: space-between;
      }

      .weevil-review-saved {
        align-items: center;
        color: #66738d;
        display: inline-flex;
        font-size: 12px;
        font-weight: 720;
      }

      .weevil-review-saved::before {
        background: #10b981;
        border-radius: 999px;
        content: "";
        display: inline-block;
        height: 8px;
        margin-right: 8px;
        width: 8px;
      }

      .weevil-review-copy {
        appearance: none;
        background: #2563eb;
        border: 0;
        border-radius: 13px;
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-size: 14px;
        font-weight: 780;
        min-height: 44px;
        padding: 0 18px;
      }

      .weevil-review-copy:hover {
        background: #1d4ed8;
      }

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
        border-color: #ffd400;
        border-width: 3px;
      }

      .weevil-shell {
        align-items: center;
        background: rgba(21, 21, 20, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
        color: #ffffff;
        display: flex;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        gap: 8px;
        left: 50%;
        max-width: min(410px, calc(100vw - 28px));
        min-width: 0;
        min-height: 42px;
        padding: 5px 6px;
        pointer-events: auto;
        position: fixed;
        bottom: 18px;
        transform: translateX(-50%);
        user-select: none;
        z-index: 40;
      }

      .weevil-dot {
        align-items: center;
        background: #ff4d4f;
        border-radius: 999px;
        box-shadow: 0 0 0 6px rgba(255, 77, 79, 0.16);
        display: flex;
        height: 10px;
        justify-content: center;
        margin-left: 5px;
        width: 10px;
      }

      .weevil-copy {
        display: grid;
        flex: 1 1 auto;
        min-width: 0;
      }

      .weevil-title {
        align-items: center;
        display: flex;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1.2;
      }

      .weevil-time {
        background: rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        color: #ffffff;
        font-variant-numeric: tabular-nums;
        padding: 2px 6px;
      }

      .weevil-page,
      .weevil-status {
        color: rgba(255, 255, 255, 0.68);
        font-size: 10px;
        line-height: 1.25;
        max-width: 142px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .weevil-status {
        display: none;
      }

      .weevil-actions {
        align-items: center;
        display: flex;
        gap: 5px;
        margin-left: auto;
      }

      .weevil-button {
        align-items: center;
        appearance: none;
        border: 1px solid transparent;
        border-radius: 999px;
        cursor: pointer;
        display: inline-flex;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        height: 30px;
        justify-content: center;
        padding: 0 11px;
        transition: transform 120ms ease, background 120ms ease, color 120ms ease;
      }

      .weevil-button svg {
        height: 14px;
        width: 14px;
      }

      .weevil-icon {
        background: rgba(255, 255, 255, 0.10);
        color: #ffffff;
        min-width: 30px;
        padding: 0;
      }

      .weevil-icon[data-active] {
        background: #ffffff;
        color: #111111;
      }

      .weevil-stop {
        background: #ffffff;
        color: #171717;
        min-width: 56px;
      }

      .weevil-palette {
        align-items: center;
        background: rgba(21, 21, 20, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        bottom: 68px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
        display: none;
        gap: 8px;
        left: 50%;
        padding: 8px 10px;
        pointer-events: auto;
        position: fixed;
        transform: translateX(-50%);
        z-index: 45;
      }

      .weevil-root[data-annotating] .weevil-palette {
        display: flex;
      }

      .weevil-swatch {
        appearance: none;
        border: 2px solid transparent;
        border-radius: 999px;
        cursor: pointer;
        height: 16px;
        padding: 0;
        width: 16px;
      }

      .weevil-swatch[data-active] {
        border-color: #ffffff;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.16);
      }

      .weevil-root[data-mode="stopping"] .weevil-shell,
      .weevil-root[data-mode="done"] .weevil-shell {
        display: none;
      }

      .weevil-root[data-mode="preparing"] #weevil-annotate,
      .weevil-root[data-mode="preparing"] #weevil-clear,
      .weevil-root[data-mode="preparing"] #weevil-stop {
        display: none;
      }

      @media (max-width: 520px) {
        .weevil-shell {
          min-width: 0;
          width: auto;
        }

        .weevil-page,
        .weevil-status {
          max-width: 104px;
        }
      }

      @media (max-width: 900px) {
        .weevil-review {
          grid-template-columns: 1fr;
          height: min(820px, calc(100vh - 32px));
          overflow: auto;
          width: min(560px, calc(100vw - 24px));
        }

        .weevil-review-panel {
          border-left: 0;
          border-top: 1px solid #e6ecf8;
        }
      }
    </style>
    <div class="weevil-root" id="weevil-root" data-mode="preparing">
      <div class="weevil-backdrop"></div>
      <canvas class="weevil-annotation-canvas" id="weevil-annotation-canvas"></canvas>
      <div class="weevil-annotation-frame"></div>
      <div class="weevil-modal" role="status" aria-live="polite">
        <div class="weevil-modal-title" id="weevil-modal-title">
          <span data-mode-label="preparing">Preparing to record</span>
        </div>
        <div class="weevil-modal-copy" id="weevil-modal-copy">
          Your capture will start in a moment. Keep this tab visible.
        </div>
        <div class="weevil-countdown" id="weevil-countdown">3</div>
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
              <span>Your recording is uploaded. Open the dashboard to replay video with console, network, actions, and backend traces.</span>
            </div>
          </div>
          <div class="weevil-review-strip">
            <button class="weevil-review-play" id="weevil-review-play" type="button" aria-label="Play preview"></button>
            <div class="weevil-review-progress"><span></span></div>
            <div class="weevil-review-meta" id="weevil-review-duration">Ready</div>
          </div>
        </div>
        <div class="weevil-review-panel">
          <div class="weevil-review-top">
            <button class="weevil-review-close" id="weevil-review-close" type="button" aria-label="Close">×</button>
            <div style="display:flex;gap:10px;align-items:center">
              <button class="weevil-review-open" id="weevil-review-open" type="button">Open dashboard</button>
            </div>
          </div>
          <div class="weevil-review-form">
            <input class="weevil-review-title-text" id="weevil-review-title" type="text" maxlength="180" value="Untitled capture" />
            <textarea class="weevil-review-description-text" id="weevil-review-description" maxlength="4000">Recording captured from the Weevil browser extension.</textarea>
            <div class="weevil-review-detail-grid">
              <div class="weevil-review-detail">
                <span>Type</span>
                <strong id="weevil-review-kind">Capture</strong>
              </div>
              <div class="weevil-review-detail">
                <span>Size</span>
                <strong id="weevil-review-size">0 B</strong>
              </div>
              <div class="weevil-review-detail" style="grid-column:1 / -1">
                <span>Source URL</span>
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
        <div class="weevil-dot" aria-hidden="true"></div>
        <div class="weevil-copy">
          <div class="weevil-title">
            <span>Recording</span>
            <span class="weevil-time" id="weevil-elapsed">0:00</span>
          </div>
          <div class="weevil-page" id="weevil-page">Current tab</div>
          <div class="weevil-status" id="weevil-status">Console, network, actions, and video are live</div>
        </div>
        <div class="weevil-actions">
          <button class="weevil-button weevil-icon" id="weevil-annotate" type="button" title="Annotate" aria-label="Annotate">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 20h4.2L19 9.2a2.8 2.8 0 0 0-4-4L4.2 16 4 20Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="weevil-button weevil-icon" id="weevil-clear" type="button" title="Clear annotations" aria-label="Clear annotations">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m4 15 8.8-8.8a2.6 2.6 0 0 1 3.7 0l1.3 1.3a2.6 2.6 0 0 1 0 3.7L10 19H5.6L4 17.4V15Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <path d="M9 10.5 13.5 15M14 19h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <div class="weevil-palette" aria-label="Annotation colors">
            ${['#111827', '#ffffff', '#c084fc', '#a855f7', '#2563eb', '#38bdf8', '#fdba74', '#f97316', '#10b981', '#22c55e', '#f87171', '#ef4444']
              .map((color) => `<button class="weevil-swatch" data-weevil-color="${color}" type="button" style="background:${color}" title="${color}"></button>`)
              .join('')}
          </div>
          <button class="weevil-button weevil-stop" id="weevil-stop" type="button">Stop</button>
        </div>
      </div>
    </div>
  `;
}

window.postMessage({ type: PageMessageTypes.BridgeReady }, '*');

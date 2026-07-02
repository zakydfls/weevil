import { DEFAULT_WEB_BASE_URL, RuntimeMessageTypes } from '../shared/constants';
import { getSettings, saveSettings } from '../shared/config';
import type { RecorderState, RuntimeMessage } from '../shared/types';

const statusElement = document.getElementById('status');
const startButton = document.getElementById('startButton') as HTMLButtonElement | null;
const stopButton = document.getElementById('stopButton') as HTMLButtonElement | null;
const optionsButton = document.getElementById('optionsButton') as HTMLButtonElement | null;
const recordButtonVisual = document.getElementById('recordButtonVisual') as HTMLButtonElement | null;
const recordTagLabel = document.getElementById('recordTagLabel');
const durationDisplay = document.getElementById('durationDisplay');
const redactSensitiveDataToggle = document.getElementById('redactSensitiveDataToggle') as HTMLInputElement | null;
const openDashboardLink = document.getElementById('openDashboardLink') as HTMLAnchorElement | null;

let durationInterval: number | undefined;
let recordingStartedAtMs: number | null = null;

void refresh();
void refreshSettings();

startButton?.addEventListener('click', () => {
  disableActions();
  void send(RuntimeMessageTypes.StartCapture).catch(reportError);
  window.close();
});

recordButtonVisual?.addEventListener('click', () => {
  if (recordButtonVisual.classList.contains('recording')) {
    void send(RuntimeMessageTypes.StopCapture).catch(reportError);
  } else {
    void send(RuntimeMessageTypes.StartCapture).catch(reportError);
  }
  window.close();
});

stopButton?.addEventListener('click', () => {
  stopButton.disabled = true;
  void send(RuntimeMessageTypes.StopCapture).catch(reportError);
  window.close();
});

optionsButton?.addEventListener('click', () => {
  void send(RuntimeMessageTypes.OpenOptions);
});

redactSensitiveDataToggle?.addEventListener('change', () => {
  void updateRedactionSetting(redactSensitiveDataToggle.checked);
});

window.addEventListener('beforeunload', () => {
  if (durationInterval !== undefined) {
    window.clearInterval(durationInterval);
  }
});

async function refresh() {
  try {
    const response = await send<{ state: RecorderState }>(RuntimeMessageTypes.GetStatus);
    render(response.state);
  } catch (error) {
    renderFatalError(getErrorMessage(error));
  }
}

function render(state: RecorderState) {
  if (!statusElement || !startButton || !stopButton || !recordButtonVisual) {
    return;
  }

  const isRecording = state.isRecording;
  document.body.classList.toggle('is-recording', isRecording);
  recordButtonVisual.classList.toggle('recording', isRecording);
  recordButtonVisual.setAttribute('aria-label', isRecording ? 'Stop recording' : 'Start recording');

  startButton.disabled = isRecording;
  stopButton.disabled = !isRecording;

  if (recordTagLabel) {
    recordTagLabel.textContent = isRecording ? 'recording' : 'armed';
  }

  const escapedTitle = state.title ? escapeHtml(state.title) : 'Current tab';
  const escapedUrl = state.pageUrl ? escapeHtml(state.pageUrl) : '';
  statusElement.innerHTML = isRecording
    ? `<strong>Recording this tab</strong><span>${escapedTitle}</span><em>${escapedUrl}</em>`
    : `<strong>Ready to capture</strong><span>Capture the active tab with recording and debugging context.</span>`;

  if (state.lastError) {
    const errorEl = document.createElement('div');
    errorEl.className = 'status-error';
    errorEl.textContent = state.lastError;
    statusElement.appendChild(errorEl);
  }

  if (isRecording && state.startedAt) {
    recordingStartedAtMs = new Date(state.startedAt).getTime();
    if (!Number.isFinite(recordingStartedAtMs)) {
      recordingStartedAtMs = Date.now();
    }
    startDurationTimer();
  } else {
    recordingStartedAtMs = null;
    stopDurationTimer();
    if (durationDisplay) durationDisplay.textContent = '0:00';
  }
}

function renderFatalError(message: string) {
  if (!statusElement) return;
  statusElement.innerHTML = `<strong>Extension unavailable</strong>`;
  const errorEl = document.createElement('div');
  errorEl.className = 'status-error';
  errorEl.textContent = message;
  statusElement.appendChild(errorEl);
  startButton?.setAttribute('disabled', 'true');
  stopButton?.setAttribute('disabled', 'true');
}

function startDurationTimer() {
  stopDurationTimer();
  if (!durationDisplay || recordingStartedAtMs === null) return;
  const update = () => {
    if (recordingStartedAtMs === null) return;
    const elapsed = Math.max(0, Date.now() - recordingStartedAtMs);
    durationDisplay.textContent = formatDuration(elapsed);
  };
  update();
  durationInterval = window.setInterval(update, 250);
}

function stopDurationTimer() {
  if (durationInterval !== undefined) {
    window.clearInterval(durationInterval);
    durationInterval = undefined;
  }
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function disableActions() {
  startButton?.setAttribute('disabled', 'true');
  stopButton?.setAttribute('disabled', 'true');
}

async function refreshSettings() {
  try {
    const settings = await getSettings();
    if (redactSensitiveDataToggle) {
      redactSensitiveDataToggle.checked = settings.redactSensitiveData;
    }
    if (openDashboardLink) {
      openDashboardLink.href = DEFAULT_WEB_BASE_URL;
    }
  } catch {
    // Settings load failure is non-fatal
  }
}

async function updateRedactionSetting(redactSensitiveData: boolean) {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    redactSensitiveData,
  });
}

async function send<TPayload = unknown>(type: string, payload?: unknown) {
  const response = await chrome.runtime.sendMessage({ type, payload } satisfies RuntimeMessage);
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Extension request failed');
  }

  return response as TPayload & { ok: true };
}

function reportError(error: unknown) {
  console.error('[Weevil popup]', error);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[character] ?? character;
  });
}

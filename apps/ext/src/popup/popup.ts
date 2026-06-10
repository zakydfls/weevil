import { RuntimeMessageTypes } from '../shared/constants';
import { getSettings, saveSettings } from '../shared/config';
import type { RecorderState, RuntimeMessage } from '../shared/types';

const statusElement = document.getElementById('status');
const startButton = document.getElementById('startButton') as HTMLButtonElement | null;
const screenshotButton = document.getElementById('screenshotButton') as HTMLButtonElement | null;
const stopButton = document.getElementById('stopButton') as HTMLButtonElement | null;
const optionsButton = document.getElementById('optionsButton') as HTMLButtonElement | null;
const videoStatusElement = document.getElementById('videoStatus');
const telemetryStatusElement = document.getElementById('telemetryStatus');
const recordButtonVisual = document.getElementById('recordButtonVisual');
const redactSensitiveDataToggle = document.getElementById('redactSensitiveDataToggle') as HTMLInputElement | null;

void refresh();
void refreshSettings();

startButton?.addEventListener('click', () => {
  startButton.disabled = true;
  if (screenshotButton) {
    screenshotButton.disabled = true;
  }
  stopButton?.setAttribute('disabled', 'true');
  void send(RuntimeMessageTypes.StartCapture).catch(reportTransientError);
  window.close();
});

screenshotButton?.addEventListener('click', () => {
  screenshotButton.disabled = true;
  if (startButton) {
    startButton.disabled = true;
  }
  void send(RuntimeMessageTypes.CaptureScreenshot).catch(reportTransientError);
  window.close();
});

stopButton?.addEventListener('click', () => {
  stopButton.disabled = true;
  void send(RuntimeMessageTypes.StopCapture).catch(reportTransientError);
  window.close();
});

optionsButton?.addEventListener('click', () => {
  void send(RuntimeMessageTypes.OpenOptions);
});

redactSensitiveDataToggle?.addEventListener('change', () => {
  void updateRedactionSetting(redactSensitiveDataToggle.checked);
});

async function refresh() {
  const response = await send<{ state: RecorderState }>(RuntimeMessageTypes.GetStatus);
  render(response.state);
}

function render(state: RecorderState) {
  if (!statusElement || !startButton || !stopButton || !screenshotButton) {
    return;
  }

  startButton.disabled = state.isRecording;
  screenshotButton.disabled = state.isRecording;
  stopButton.disabled = !state.isRecording;
  recordButtonVisual?.classList.toggle('recording', state.isRecording);
  if (videoStatusElement) {
    videoStatusElement.textContent = state.isRecording ? 'Recording' : 'Ready';
  }
  if (telemetryStatusElement) {
    telemetryStatusElement.textContent = state.isRecording ? 'Live' : 'Armed';
  }
  statusElement.innerHTML = state.isRecording
    ? `<strong>Recording this tab</strong><span>${escapeHtml(state.title ?? 'Current tab')}</span><em>${escapeHtml(state.pageUrl ?? '')}</em>`
    : `<strong>Ready to capture</strong><span>Recording, actions, console, network, errors, performance, and DOM context.</span>`;

  if (state.lastError) {
    statusElement.innerHTML += `<br /><span style="color: var(--danger)">${escapeHtml(state.lastError)}</span>`;
  }
}

async function refreshSettings() {
  const settings = await getSettings();
  if (redactSensitiveDataToggle) {
    redactSensitiveDataToggle.checked = settings.redactSensitiveData;
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

function reportTransientError(error: unknown) {
  console.error(error);
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

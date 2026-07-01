import { DEFAULT_API_BASE_URL } from '../shared/constants';
import { getSettings, normalizeApiBaseUrl, saveSettings } from '../shared/config';
import type { ExtensionSettings } from '../shared/types';

const apiBaseUrlInput = document.getElementById('apiBaseUrl') as HTMLInputElement | null;
const flushIntervalInput = document.getElementById('flushIntervalMs') as HTMLInputElement | null;
const maxBatchSizeInput = document.getElementById('maxBatchSize') as HTMLInputElement | null;
const captureNetworkBodiesInput = document.getElementById('captureNetworkBodies') as HTMLInputElement | null;
const captureDomMutationsInput = document.getElementById('captureDomMutations') as HTMLInputElement | null;
const capturePerformanceInput = document.getElementById('capturePerformance') as HTMLInputElement | null;
const redactSensitiveDataInput = document.getElementById('redactSensitiveData') as HTMLInputElement | null;
const statusElement = document.getElementById('status');

let saveTimer: number | undefined;
let lastSaveStatusTimer: number | undefined;

void load();

if (apiBaseUrlInput) {
  apiBaseUrlInput.placeholder = DEFAULT_API_BASE_URL;
}

// Auto-save on any change. Inputs debounce (300ms) so typing in a URL field doesn't thrash storage.
apiBaseUrlInput?.addEventListener('input', () => queueSave(300));
flushIntervalInput?.addEventListener('input', () => queueSave(300));
maxBatchSizeInput?.addEventListener('input', () => queueSave(300));
captureNetworkBodiesInput?.addEventListener('change', () => queueSave(0));
captureDomMutationsInput?.addEventListener('change', () => queueSave(0));
capturePerformanceInput?.addEventListener('change', () => queueSave(0));
redactSensitiveDataInput?.addEventListener('change', () => queueSave(0));

async function load() {
  try {
    render(await getSettings());
  } catch (error) {
    setStatus(getErrorMessage(error), 'error');
  }
}

function render(settings: ExtensionSettings) {
  if (
    !apiBaseUrlInput ||
    !flushIntervalInput ||
    !maxBatchSizeInput ||
    !captureNetworkBodiesInput ||
    !captureDomMutationsInput ||
    !capturePerformanceInput ||
    !redactSensitiveDataInput
  ) {
    return;
  }

  apiBaseUrlInput.value = settings.apiBaseUrl;
  flushIntervalInput.value = String(settings.flushIntervalMs);
  maxBatchSizeInput.value = String(settings.maxBatchSize);
  captureNetworkBodiesInput.checked = settings.captureNetworkBodies;
  captureDomMutationsInput.checked = settings.captureDomMutations;
  capturePerformanceInput.checked = settings.capturePerformance;
  redactSensitiveDataInput.checked = settings.redactSensitiveData;
}

function queueSave(delayMs: number) {
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    void save();
  }, delayMs);
}

async function save() {
  if (
    !apiBaseUrlInput ||
    !flushIntervalInput ||
    !maxBatchSizeInput ||
    !captureNetworkBodiesInput ||
    !captureDomMutationsInput ||
    !capturePerformanceInput ||
    !redactSensitiveDataInput
  ) {
    return;
  }

  const flushIntervalMs = Number(flushIntervalInput.value);
  const maxBatchSize = Number(maxBatchSizeInput.value);

  if (!Number.isFinite(flushIntervalMs) || flushIntervalMs < 1_000) {
    setStatus('Flush interval must be at least 1000 ms.', 'error');
    return;
  }

  if (!Number.isFinite(maxBatchSize) || maxBatchSize < 1) {
    setStatus('Max batch size must be at least 1.', 'error');
    return;
  }

  try {
    const apiBaseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL);
    await saveSettings({
      apiBaseUrl,
      flushIntervalMs,
      maxBatchSize,
      captureNetworkBodies: captureNetworkBodiesInput.checked,
      captureDomMutations: captureDomMutationsInput.checked,
      capturePerformance: capturePerformanceInput.checked,
      redactSensitiveData: redactSensitiveDataInput.checked,
    });
    apiBaseUrlInput.value = apiBaseUrl;
    setStatus('Saved.', 'ok');
  } catch (error) {
    setStatus(getErrorMessage(error), 'error');
  }
}

function setStatus(message: string, tone: 'ok' | 'error') {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle('error', tone === 'error');
  if (lastSaveStatusTimer !== undefined) {
    window.clearTimeout(lastSaveStatusTimer);
  }
  if (tone === 'ok') {
    lastSaveStatusTimer = window.setTimeout(() => {
      if (statusElement) statusElement.textContent = '';
    }, 1_400);
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

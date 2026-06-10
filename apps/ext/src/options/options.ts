import { getSettings, saveSettings } from '../shared/config';
import type { ExtensionSettings } from '../shared/types';

const apiBaseUrlInput = document.getElementById('apiBaseUrl') as HTMLInputElement | null;
const flushIntervalInput = document.getElementById('flushIntervalMs') as HTMLInputElement | null;
const maxBatchSizeInput = document.getElementById('maxBatchSize') as HTMLInputElement | null;
const captureNetworkBodiesInput = document.getElementById('captureNetworkBodies') as HTMLInputElement | null;
const captureDomMutationsInput = document.getElementById('captureDomMutations') as HTMLInputElement | null;
const capturePerformanceInput = document.getElementById('capturePerformance') as HTMLInputElement | null;
const redactSensitiveDataInput = document.getElementById('redactSensitiveData') as HTMLInputElement | null;
const saveButton = document.getElementById('saveButton') as HTMLButtonElement | null;
const statusElement = document.getElementById('status');

void load();

saveButton?.addEventListener('click', () => {
  void save();
});

async function load() {
  render(await getSettings());
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

  await saveSettings({
    apiBaseUrl: apiBaseUrlInput.value.trim().replace(/\/$/, ''),
    flushIntervalMs: Number(flushIntervalInput.value),
    maxBatchSize: Number(maxBatchSizeInput.value),
    captureNetworkBodies: captureNetworkBodiesInput.checked,
    captureDomMutations: captureDomMutationsInput.checked,
    capturePerformance: capturePerformanceInput.checked,
    redactSensitiveData: redactSensitiveDataInput.checked,
  });

  if (statusElement) {
    statusElement.textContent = 'Settings saved.';
    window.setTimeout(() => {
      statusElement.textContent = '';
    }, 1_400);
  }
}

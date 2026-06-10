import {
  DEFAULT_API_BASE_URL,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_BATCH_SIZE,
  StorageKeys,
} from './constants';
import type { ExtensionSettings, RecorderState } from './types';

export const defaultSettings: ExtensionSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
  maxBatchSize: DEFAULT_MAX_BATCH_SIZE,
  captureNetworkBodies: true,
  captureDomMutations: true,
  capturePerformance: true,
  redactSensitiveData: true,
};

export const defaultRecorderState: RecorderState = {
  isRecording: false,
  tabId: null,
  windowId: null,
  reportId: null,
  shareToken: null,
  sessionId: null,
  startedAt: null,
  pageUrl: null,
  title: null,
  lastError: null,
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(StorageKeys.Settings);
  return {
    ...defaultSettings,
    ...(stored[StorageKeys.Settings] as Partial<ExtensionSettings> | undefined),
  };
}

export async function saveSettings(settings: ExtensionSettings) {
  await chrome.storage.local.set({ [StorageKeys.Settings]: settings });
}

export async function getRecorderState() {
  const stored = await chrome.storage.local.get(StorageKeys.RecorderState);
  return {
    ...defaultRecorderState,
    ...(stored[StorageKeys.RecorderState] as Partial<RecorderState> | undefined),
  };
}

export async function saveRecorderState(state: RecorderState) {
  await chrome.storage.local.set({ [StorageKeys.RecorderState]: state });
}

export async function resetRecorderState() {
  await saveRecorderState(defaultRecorderState);
}

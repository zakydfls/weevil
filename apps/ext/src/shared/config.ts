import {
  DEFAULT_API_BASE_URL,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_BATCH_SIZE,
  EXTENSION_BUILD_MODE,
  StorageKeys,
} from './constants';
import type { ExtensionSettings, RecorderState } from './types';

type StoredExtensionSettings = Partial<ExtensionSettings> & {
  buildMode?: string;
  defaultApiBaseUrl?: string;
};

export const defaultSettings: ExtensionSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
  maxBatchSize: DEFAULT_MAX_BATCH_SIZE,
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
  ingestToken: null,
  sessionId: null,
  startedAt: null,
  pageUrl: null,
  title: null,
  lastError: null,
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(StorageKeys.Settings);
  const storedSettings = stored[StorageKeys.Settings] as StoredExtensionSettings | undefined;
  const { settings, shouldPersist } = resolveStoredSettings(storedSettings);

  if (shouldPersist) {
    await chrome.storage.local.set({ [StorageKeys.Settings]: withSettingsMetadata(settings) });
  }

  return settings;
}

export async function saveSettings(settings: ExtensionSettings) {
  await chrome.storage.local.set({
    [StorageKeys.Settings]: withSettingsMetadata({
      ...settings,
      apiBaseUrl: DEFAULT_API_BASE_URL,
    }),
  });
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

export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('API base URL cannot be empty.');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : isLocalApiHost(trimmed)
      ? `http://${trimmed}`
      : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, '');
}

function resolveStoredSettings(storedSettings?: StoredExtensionSettings) {
  if (!storedSettings) {
    return { settings: defaultSettings, shouldPersist: false };
  }

  const {
    buildMode: storedBuildMode,
    defaultApiBaseUrl: storedDefaultApiBaseUrl,
    ...storedValues
  } = storedSettings;
  const settings: ExtensionSettings = {
    ...defaultSettings,
    ...storedValues,
  };
  let shouldPersist = false;

  const storedApiBaseUrl = normalizeOptionalApiBaseUrl(storedSettings.apiBaseUrl);
  if (storedApiBaseUrl !== DEFAULT_API_BASE_URL) {
    shouldPersist = true;
  }
  settings.apiBaseUrl = DEFAULT_API_BASE_URL;

  if (
    storedBuildMode !== EXTENSION_BUILD_MODE ||
    normalizeOptionalApiBaseUrl(storedDefaultApiBaseUrl) !== DEFAULT_API_BASE_URL
  ) {
    shouldPersist = true;
  }

  return { settings, shouldPersist };
}

function withSettingsMetadata(settings: ExtensionSettings): StoredExtensionSettings {
  return {
    ...settings,
    apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
    buildMode: EXTENSION_BUILD_MODE,
    defaultApiBaseUrl: DEFAULT_API_BASE_URL,
  };
}

function normalizeOptionalApiBaseUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '';
  }

  try {
    return normalizeApiBaseUrl(value);
  } catch {
    return '';
  }
}

function isLocalApiHost(value: string) {
  const lowerValue = value.toLowerCase();
  return (
    lowerValue.startsWith('localhost') ||
    lowerValue.startsWith('127.0.0.1') ||
    lowerValue.startsWith('[::1]') ||
    lowerValue.startsWith('0.0.0.0')
  );
}

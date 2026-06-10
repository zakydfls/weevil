'use client';

const ExtensionBridgeMessageTypes = {
  Command: 'WEevil_WEB_COMMAND',
  Result: 'WEevil_WEB_COMMAND_RESULT',
} as const;

const ExtensionBridgeCommands = {
  StartCapture: 'START_CAPTURE',
  CaptureScreenshot: 'CAPTURE_SCREENSHOT',
  GetStatus: 'GET_STATUS',
  UpdateSettings: 'UPDATE_SETTINGS',
} as const;

const EXTENSION_BRIDGE_TIMEOUT_MS = 5_000;

type ExtensionBridgeCommand =
  (typeof ExtensionBridgeCommands)[keyof typeof ExtensionBridgeCommands];

interface ExtensionBridgeResult {
  type?: string;
  requestId?: string;
  ok?: boolean;
  error?: string;
  payload?: unknown;
}

export function startExtensionCapture(settings?: Record<string, unknown>) {
  return sendExtensionBridgeCommand(ExtensionBridgeCommands.StartCapture, settings);
}

export function captureExtensionScreenshot() {
  return sendExtensionBridgeCommand(ExtensionBridgeCommands.CaptureScreenshot);
}

export function getExtensionStatus() {
  return sendExtensionBridgeCommand(ExtensionBridgeCommands.GetStatus);
}

export function updateExtensionSettings(settings: Record<string, unknown>) {
  return sendExtensionBridgeCommand(ExtensionBridgeCommands.UpdateSettings, settings);
}

function sendExtensionBridgeCommand(command: ExtensionBridgeCommand, payload?: unknown) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser extension bridge is not available during server rendering.'));
  }

  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  return new Promise<unknown>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Weevil extension is not responding. Reload the extension, then refresh this page.'));
    }, EXTENSION_BRIDGE_TIMEOUT_MS);

    function handleMessage(event: MessageEvent<ExtensionBridgeResult>) {
      if (event.source !== window || event.data?.type !== ExtensionBridgeMessageTypes.Result) {
        return;
      }

      if (event.data.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
      if (event.data.ok === false) {
        reject(new Error(event.data.error ?? 'Extension capture failed.'));
        return;
      }

      resolve(event.data.payload);
    }

    window.addEventListener('message', handleMessage);
    window.postMessage({
      type: ExtensionBridgeMessageTypes.Command,
      payload: {
        requestId,
        command,
        payload,
      },
    }, '*');
  });
}

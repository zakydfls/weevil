export const EXTENSION_NAME = 'Weevil';

export const DEFAULT_API_BASE_URL = 'http://localhost:4000/v1';
export const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
export const DEFAULT_MAX_BATCH_SIZE = 50;
export const DEFAULT_MAX_BODY_CHARS = 100_000;
export const DEFAULT_MAX_TEXT_CHARS = 1_000;
export const RECORDING_MIME_TYPE = 'video/webm;codecs=vp8,opus';
export const RECORDING_UPLOAD_CONTENT_TYPE = 'video/webm';

export const StorageKeys = {
  Settings: 'weevil.settings',
  RecorderState: 'weevil.recorder-state',
} as const;

export const RuntimeMessageTypes = {
  GetStatus: 'WEevil_GET_STATUS',
  StartCapture: 'WEevil_START_CAPTURE',
  CaptureScreenshot: 'WEevil_CAPTURE_SCREENSHOT',
  StopCapture: 'WEevil_STOP_CAPTURE',
  SubmitCaptureReview: 'WEevil_SUBMIT_CAPTURE_REVIEW',
  DiscardCaptureReview: 'WEevil_DISCARD_CAPTURE_REVIEW',
  TelemetryBatch: 'WEevil_TELEMETRY_BATCH',
  PageTelemetry: 'WEevil_PAGE_TELEMETRY',
  CapturePreparing: 'WEevil_CAPTURE_PREPARING',
  CaptureStarted: 'WEevil_CAPTURE_STARTED',
  CaptureStopped: 'WEevil_CAPTURE_STOPPED',
  CaptureCompleted: 'WEevil_CAPTURE_COMPLETED',
  UpdateSettings: 'WEevil_UPDATE_SETTINGS',
  OpenOptions: 'WEevil_OPEN_OPTIONS',
  OffscreenStartRecording: 'WEevil_OFFSCREEN_START_RECORDING',
  OffscreenStopRecording: 'WEevil_OFFSCREEN_STOP_RECORDING',
  OffscreenRecordingStarted: 'WEevil_OFFSCREEN_RECORDING_STARTED',
  OffscreenRecordingStopped: 'WEevil_OFFSCREEN_RECORDING_STOPPED',
  OffscreenRecordingFailed: 'WEevil_OFFSCREEN_RECORDING_FAILED',
} as const;

export const PageMessageTypes = {
  BridgeReady: 'WEevil_PAGE_BRIDGE_READY',
  Console: 'WEevil_PAGE_CONSOLE',
  Network: 'WEevil_PAGE_NETWORK',
  RuntimeError: 'WEevil_PAGE_RUNTIME_ERROR',
  Performance: 'WEevil_PAGE_PERFORMANCE',
} as const;

export const WebBridgeMessageTypes = {
  Command: 'WEevil_WEB_COMMAND',
  Result: 'WEevil_WEB_COMMAND_RESULT',
} as const;

export const WebBridgeCommands = {
  StartCapture: 'START_CAPTURE',
  CaptureScreenshot: 'CAPTURE_SCREENSHOT',
  GetStatus: 'GET_STATUS',
  UpdateSettings: 'UPDATE_SETTINGS',
} as const;

export const ReportSource = {
  Extension: 'EXTENSION',
} as const;

export const UploadKind = {
  ScreenRecording: 'SCREEN_RECORDING',
  Screenshot: 'SCREENSHOT',
} as const;

export const PageActionKind = {
  Click: 'CLICK',
  Input: 'INPUT',
  KeyPress: 'KEY_PRESS',
  Navigation: 'NAVIGATION',
  Scroll: 'SCROLL',
} as const;

export const RuntimeErrorKind = {
  JsError: 'JS_ERROR',
  UnhandledRejection: 'UNHANDLED_REJECTION',
} as const;

export const PerformanceEntryKind = {
  Navigation: 'NAVIGATION',
  Resource: 'RESOURCE',
  Paint: 'PAINT',
  WebVital: 'WEB_VITAL',
  LongTask: 'LONG_TASK',
  Mark: 'MARK',
  Measure: 'MEASURE',
  Custom: 'CUSTOM',
} as const;

export const DomEventKind = {
  Mutation: 'MUTATION',
  Snapshot: 'SNAPSHOT',
  Selection: 'SELECTION',
  Focus: 'FOCUS',
  Blur: 'BLUR',
  Custom: 'CUSTOM',
} as const;

export const BackendTraceStatus = {
  Ok: 'OK',
  Error: 'ERROR',
  Unknown: 'UNKNOWN',
} as const;

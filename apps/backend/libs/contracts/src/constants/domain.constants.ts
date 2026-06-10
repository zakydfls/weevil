export const ReportDefaults = {
  UntitledReport: 'Untitled bug report',
  ShareTokenSize: 24,
} as const;

export const UploadDefaults = {
  PresignedPutExpirySeconds: 900,
  PresignedGetExpirySeconds: 900,
} as const;

export const RedactionDefaults = {
  RedactedValue: '[REDACTED]',
} as const;

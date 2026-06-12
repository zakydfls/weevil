export const appEnv = {
  nodeEnv: process.env.NODE_ENV,
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProduction: process.env.NODE_ENV === 'production',
  isNonProduction: process.env.NODE_ENV !== 'production',
  canShowDevOnlyUi: process.env.NODE_ENV !== 'production',
} as const;

export function readPublicEnv(value: string | undefined) {
  return value?.trim() ?? '';
}

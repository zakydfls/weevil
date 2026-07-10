import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  return value.toLowerCase() === 'true';
}, z.boolean());

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('weevil'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_USE_SSL: booleanFromString.default(false),
  MINIO_BUCKET_RECORDINGS: z.string().min(1).default('weevil-recordings'),
  PUBLIC_ASSET_URL: z.string().optional().default(''),

  // ── Web / CORS / cookie ──────────────────────────────────────────────────
  // ENABLE_CORS=false keeps CORS headers active but disables origin allowlist
  // enforcement by reflecting any browser origin. Use only for emergency/debug.
  ENABLE_CORS: booleanFromString.default(true),
  ENABLE_CSRF: booleanFromString.default(true),
  // Comma-separated list of allowed browser origins (the Vercel FE, etc).
  // Empty = reflect any origin (dev convenience only — set this in prod).
  WEB_ORIGIN: z.string().optional().default(''),
  // Comma-separated trusted browser-extension origins allowed to make
  // credentialed capture requests, e.g. chrome-extension://<extension-id>.
  // EXTENSION_ORIGIN is accepted as a backward-compatible singular alias.
  EXTENSION_ORIGIN: z.string().optional().default(''),
  EXTENSION_ORIGINS: z.string().optional().default(''),
  // Session-cookie attributes. Driven by env (NOT NODE_ENV) so a homeserver
  // running NODE_ENV=development behind HTTPS can still issue cross-site cookies.
  // Cross-site (FE on a different host than the API) REQUIRES SameSite=None+Secure.
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  COOKIE_SECURE: booleanFromString.default(false),
  // e.g. ".centurycode.id" to share the cookie across api.* and app.* subdomains.
  COOKIE_DOMAIN: z.string().optional().default(''),

  // ── Outbound links / notification gateway ────────────────────────────────
  // Absolute frontend URL used for links in emails, e.g. https://weevil.example.com.
  WEB_APP_URL: z.string().optional().default(''),
  // Century Notification Gateway REST base URL, e.g. http://localhost:9111.
  NOTIFICATION_GATEWAY_URL: z.string().optional().default(''),
  NOTIFICATION_GATEWAY_API_KEY: z.string().optional().default(''),
  NOTIFICATION_GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  // HMAC secret for signup OTP hashes. Required in production.
  AUTH_OTP_SECRET: z.string().optional().default(''),

  // ── Firebase Auth / Google OAuth ─────────────────────────────────────────
  AUTH_GOOGLE_ENABLED: booleanFromString.default(false),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  // Alternative to the three fields above. Store as raw JSON or base64 JSON.
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  // Preferred for VPS/Docker secrets: path to the service account JSON file.
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional().default(''),
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.AUTH_GOOGLE_ENABLED) {
    const hasServiceAccountJson = Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON.trim());
    const hasServiceAccountPath = Boolean(env.FIREBASE_SERVICE_ACCOUNT_PATH.trim());
    const hasSplitServiceAccount = Boolean(
      env.FIREBASE_PROJECT_ID.trim() &&
        env.FIREBASE_CLIENT_EMAIL.trim() &&
        env.FIREBASE_PRIVATE_KEY.trim(),
    );
    if (!hasServiceAccountJson && !hasServiceAccountPath && !hasSplitServiceAccount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_GOOGLE_ENABLED'],
        message:
          'Firebase service account config is required when AUTH_GOOGLE_ENABLED=true.',
      });
    }
  }

  if (env.NODE_ENV !== 'production') return;
  if (env.ENABLE_CORS && !env.WEB_ORIGIN.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WEB_ORIGIN'],
      message: 'WEB_ORIGIN must be set in production when ENABLE_CORS=true.',
    });
  }
  if (env.AUTH_OTP_SECRET.trim().length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_OTP_SECRET'],
      message: 'AUTH_OTP_SECRET must be set to at least 32 characters in production.',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}

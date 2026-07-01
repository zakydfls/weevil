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
  // Comma-separated list of allowed browser origins (the Vercel FE, etc).
  // Empty = reflect any origin (dev convenience only — set this in prod).
  WEB_ORIGIN: z.string().optional().default(''),
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
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (!env.WEB_ORIGIN.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WEB_ORIGIN'],
      message: 'WEB_ORIGIN must be set in production.',
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

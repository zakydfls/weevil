import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

export interface VerifiedFirebaseGoogleUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

@Injectable()
export class FirebaseAuthService {
  private readonly logger = new Logger(FirebaseAuthService.name);
  private app: App | null = null;

  constructor(private readonly config: AppConfigService) {}

  async verifyGoogleIdToken(idToken: string): Promise<VerifiedFirebaseGoogleUser> {
    if (!this.config.authGoogleEnabled) {
      throw new ServiceUnavailableException('Google sign-in is not enabled.');
    }
    if (!idToken.trim()) {
      throw new UnauthorizedException('Google sign-in token is invalid.');
    }

    let decoded: DecodedIdToken;
    try {
      decoded = await getAuth(this.getApp()).verifyIdToken(idToken, true);
    } catch (error) {
      this.logger.error(
        `Firebase ID token verification failed: ${firebaseErrorCode(error)} (${firebaseErrorMessage(error)}). ${safeTokenDiagnostics(idToken, this.readServiceAccount().projectId)}`,
      );
      throw new UnauthorizedException('Google sign-in token is invalid.');
    }

    const provider = decoded.firebase?.sign_in_provider;
    const email = decoded.email?.trim().toLowerCase();
    if (provider !== 'google.com' || !email || decoded.email_verified !== true) {
      this.logger.error(
        `Firebase ID token was verified but is not an acceptable Google login. provider=${provider ?? 'none'} emailPresent=${Boolean(email)} emailVerified=${decoded.email_verified === true}`,
      );
      throw new UnauthorizedException('Google account must have a verified email.');
    }

    return {
      uid: decoded.uid,
      email,
      emailVerified: decoded.email_verified === true,
      displayName: typeof decoded.name === 'string' ? decoded.name : null,
      avatarUrl: typeof decoded.picture === 'string' ? decoded.picture : null,
    };
  }

  private getApp(): App {
    if (this.app) return this.app;

    const existing = getApps()[0];
    if (existing) {
      this.app = existing;
      return existing;
    }

    const serviceAccount = this.readServiceAccount();
    this.app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
    return this.app;
  }

  private readServiceAccount(): {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  } {
    const fromJson =
      parseServiceAccountJson(this.config.firebaseServiceAccountJson) ??
      parseServiceAccountFile(this.config.firebaseServiceAccountPath);
    const projectId = fromJson?.projectId ?? this.config.firebaseProjectId;
    const clientEmail = fromJson?.clientEmail ?? this.config.firebaseClientEmail;
    const privateKey = fromJson?.privateKey ?? this.config.firebasePrivateKey;

    if (!projectId || !clientEmail || !privateKey) {
      throw new ServiceUnavailableException('Google sign-in is not configured.');
    }

    return { projectId, clientEmail, privateKey };
  }
}

function parseServiceAccountFile(path: string | undefined):
  | {
      projectId: string;
      clientEmail: string;
      privateKey: string;
    }
  | undefined {
  if (!path?.trim()) return undefined;
  try {
    return parseServiceAccountJson(readFileSync(path.trim(), 'utf8'));
  } catch {
    throw new ServiceUnavailableException('Google sign-in service account file is not readable.');
  }
}

function parseServiceAccountJson(value: string | undefined):
  | {
      projectId: string;
      clientEmail: string;
      privateKey: string;
    }
  | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  let parsed: Record<string, unknown>;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new ServiceUnavailableException('Google sign-in is not configured.');
  }
  const projectId = parsed.project_id ?? parsed.projectId;
  const clientEmail = parsed.client_email ?? parsed.clientEmail;
  const privateKey = parsed.private_key ?? parsed.privateKey;
  if (
    typeof projectId !== 'string' ||
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string'
  ) {
    throw new ServiceUnavailableException('Google sign-in is not configured.');
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

function firebaseErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'unknown';
}

function firebaseErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function safeTokenDiagnostics(idToken: string, expectedProjectId: string): string {
  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    return `Token diagnostics: malformed JWT, tokenLength=${idToken.length}, expectedProject=${expectedProjectId}`;
  }
  const firebase = payload.firebase;
  const provider =
    firebase && typeof firebase === 'object' && !Array.isArray(firebase)
      ? (firebase as Record<string, unknown>).sign_in_provider
      : undefined;
  return [
    'Token diagnostics:',
    `aud=${stringOrNone(payload.aud)}`,
    `iss=${stringOrNone(payload.iss)}`,
    `provider=${stringOrNone(provider)}`,
    `emailPresent=${typeof payload.email === 'string'}`,
    `emailVerified=${payload.email_verified === true}`,
    `tokenLength=${idToken.length}`,
    `expectedProject=${expectedProjectId}`,
  ].join(' ');
}

function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  const [, payload] = idToken.split('.');
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringOrNone(value: unknown): string {
  return typeof value === 'string' && value ? value : 'none';
}

import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '@weevil/config';
import { PrismaService } from '@weevil/database';
import { MailerService } from '@weevil/notifications';
import { OtpPurpose, type OtpChallenge, type Prisma } from '@weevil/prisma-client';

const OTP_TTL_MS = 10 * 60 * 1_000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1_000;
const OTP_MAX_RESENDS = 3;
const OTP_MAX_ATTEMPTS = 5;

export interface OtpChallengeState {
  recipient: string;
  purpose: OtpPurpose;
  expiresAt: string;
  resendAvailableAt: string;
  resendCount: number;
  maxResends: number;
  maxAttempts: number;
}

interface IssueOtpInput {
  purpose: OtpPurpose;
  recipient: string;
  payload?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
  buildEmail: (input: { code: string; expiresAt: Date }) => {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    metadata?: Record<string, unknown>;
  };
}

interface VerifyOtpInput {
  purpose: OtpPurpose;
  recipient: string;
  code: string;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly mailer: MailerService,
  ) {}

  async issue(input: IssueOtpInput): Promise<OtpChallengeState> {
    const recipient = normalizeRecipient(input.recipient);
    const now = new Date();
    const existing = await this.prisma.otpChallenge.findUnique({
      where: { purpose_recipient: { purpose: input.purpose, recipient } },
    });

    if (existing && !existing.consumedAt && existing.expiresAt > now) {
      if (existing.lockedAt) {
        throw tooManyRequests('Too many verification attempts. Request a new code later.');
      }
      if (existing.resendCount >= OTP_MAX_RESENDS) {
        throw tooManyRequests('Maximum resend limit reached. Try again later.');
      }
      if (existing.nextResendAt > now) {
        throw tooManyRequests(
          `Please wait ${secondsUntil(existing.nextResendAt)}s before requesting another code.`,
        );
      }
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const nextResendAt = new Date(Date.now() + OTP_RESEND_COOLDOWN_MS);
    const resendCount =
      existing && !existing.consumedAt && existing.expiresAt > now ? existing.resendCount + 1 : 0;
    const email = input.buildEmail({ code, expiresAt });

    const challenge = await this.prisma.otpChallenge.upsert({
      where: { purpose_recipient: { purpose: input.purpose, recipient } },
      create: {
        purpose: input.purpose,
        recipient,
        codeHash: this.hashCode(input.purpose, recipient, code),
        payload: input.payload,
        attemptCount: 0,
        resendCount,
        expiresAt,
        nextResendAt,
        lastSentAt: now,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      update: {
        codeHash: this.hashCode(input.purpose, recipient, code),
        payload: input.payload,
        attemptCount: 0,
        resendCount,
        expiresAt,
        nextResendAt,
        lastSentAt: now,
        consumedAt: null,
        lockedAt: null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    const delivery = await this.mailer.send({
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      metadata: {
        ...email.metadata,
        otp_purpose: input.purpose,
      },
    });

    if (!delivery.sent) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { nextResendAt: now, resendCount: Math.max(resendCount - 1, 0) },
      });
      throw new ServiceUnavailableException('Could not send verification code. Try again in a moment.');
    }

    return toState(challenge);
  }

  async verify(input: VerifyOtpInput): Promise<OtpChallenge> {
    const recipient = normalizeRecipient(input.recipient);
    const now = new Date();
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { purpose_recipient: { purpose: input.purpose, recipient } },
    });

    if (!challenge || challenge.consumedAt || challenge.expiresAt < now) {
      throw new UnauthorizedException('Verification code is invalid or expired.');
    }
    if (challenge.lockedAt) {
      throw tooManyRequests('Too many verification attempts. Request a new code later.');
    }

    if (!this.matches(input.purpose, recipient, input.code, challenge.codeHash)) {
      const nextAttempts = challenge.attemptCount + 1;
      const locked = nextAttempts >= OTP_MAX_ATTEMPTS;
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptCount: nextAttempts,
          lockedAt: locked ? now : null,
        },
      });
      const remaining = Math.max(OTP_MAX_ATTEMPTS - nextAttempts, 0);
      throw new UnauthorizedException(
        remaining > 0
          ? `Verification code is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
          : 'Verification code is locked. Request a new code later.',
      );
    }

    return challenge;
  }

  async consume(tx: Prisma.TransactionClient, challengeId: string): Promise<void> {
    await tx.otpChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    });
  }

  private matches(purpose: OtpPurpose, recipient: string, code: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashCode(purpose, recipient, normalizeCode(code)), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hashCode(purpose: OtpPurpose, recipient: string, code: string): string {
    return createHmac('sha256', this.otpSecret())
      .update(`${purpose}:${recipient}:${normalizeCode(code)}`)
      .digest('hex');
  }

  private otpSecret(): string {
    return this.config.authOtpSecret ?? 'weevil-dev-only-otp-secret';
  }
}

function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function secondsUntil(value: Date): number {
  return Math.max(1, Math.ceil((value.getTime() - Date.now()) / 1_000));
}

function toState(challenge: OtpChallenge): OtpChallengeState {
  return {
    recipient: challenge.recipient,
    purpose: challenge.purpose,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAvailableAt: challenge.nextResendAt.toISOString(),
    resendCount: challenge.resendCount,
    maxResends: OTP_MAX_RESENDS,
    maxAttempts: OTP_MAX_ATTEMPTS,
  };
}

function tooManyRequests(message: string): HttpException {
  return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

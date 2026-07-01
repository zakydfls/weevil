import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CacheService } from '@weevil/cache';
import { PrismaService } from '@weevil/database';
import {
  otpEmailSubject,
  renderOtpEmail,
} from '@weevil/notifications';
import {
  MembershipStatus,
  OtpPurpose,
  Prisma,
  UserStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '@weevil/prisma-client';
import { OtpService, type OtpChallengeState } from './otp.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

type TxClient = Prisma.TransactionClient;

/**
 * Default session lifetime: 30 days, sliding (refreshed on use up to a hard cap).
 * Override via env if needed.
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export interface SignupInput {
  email: string;
  password: string;
  displayName?: string;
  /** When provided, also create a default workspace with this name + slug. */
  workspaceName?: string;
  workspaceSlug?: string;
  /** When provided, accept a pending invite token instead of creating a workspace. */
  inviteToken?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface RequestSignupOtpInput {
  email: string;
  password: string;
  displayName?: string;
  workspaceName: string;
  workspaceSlug?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface VerifySignupOtpInput {
  email: string;
  code: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedSession {
  /** Raw token to give to the client. Show once, never store. */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
  ) {}

  async signup(
    input: SignupInput,
  ): Promise<{ session: IssuedSession; userId: string; workspaceId: string | null }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!input.inviteToken) {
      throw new BadRequestException('Self-service signup must be verified with OTP.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new ConflictException('An account with that email already exists.');
    }

    const passwordHash = await this.passwordService.hash(input.password);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          displayName: input.displayName ?? null,
          emailVerified: new Date(),
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });

      let workspaceId: string | null = null;

      if (input.inviteToken) {
        const invite = await this.findPendingInvite(tx, input.inviteToken);
        if (invite.email.toLowerCase() !== normalizedEmail) {
          throw new UnauthorizedException('Invite was issued to a different email.');
        }
        await tx.workspaceMember.create({
          data: {
            workspaceId: invite.workspaceId,
            userId: user.id,
            role: invite.role,
            status: MembershipStatus.ACTIVE,
            invitedById: invite.createdById,
            joinedAt: new Date(),
          },
        });
        await tx.workspaceInvite.update({
          where: { id: invite.id },
          data: { status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
        });
        workspaceId = invite.workspaceId;
      } else if (input.workspaceName) {
        const slug = (input.workspaceSlug ?? slugify(input.workspaceName)).trim();
        if (!slug) throw new ConflictException('Workspace slug cannot be empty.');
        const workspace = await tx.workspace.create({
          data: {
            slug,
            name: input.workspaceName,
            status: WorkspaceStatus.ACTIVE,
          },
        });
        await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: WorkspaceRole.OWNER,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });
        workspaceId = workspace.id;
      }

      if (workspaceId) {
        await tx.user.update({
          where: { id: user.id },
          data: { defaultWorkspaceId: workspaceId },
        });
      }

      const session = await this.issueSessionInTx(tx, user.id, workspaceId, undefined, undefined);
      return { session, userId: user.id, workspaceId };
    });
  }

  async requestSignupOtp(input: RequestSignupOtpInput): Promise<OtpChallengeState> {
    const normalizedEmail = input.email.trim().toLowerCase();
    await this.assertRateLimit('signup-otp', `${normalizedEmail}:${input.ipAddress ?? 'unknown'}`, 8, 60 * 60);

    const cleanWorkspaceName = input.workspaceName.trim();
    const cleanWorkspaceSlug = (input.workspaceSlug ?? slugify(cleanWorkspaceName)).trim().toLowerCase();

    if (cleanWorkspaceName.length < 2) {
      throw new BadRequestException('Workspace name must be at least 2 characters.');
    }
    if (!isValidWorkspaceSlug(cleanWorkspaceSlug)) {
      throw new BadRequestException('Slug must be 2-40 lowercase letters, numbers, or hyphens.');
    }

    const [existingUser, existingWorkspace] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
      this.prisma.workspace.findUnique({ where: { slug: cleanWorkspaceSlug } }),
    ]);
    if (existingUser) {
      throw new ConflictException('An account with that email already exists.');
    }
    if (existingWorkspace) {
      throw new ConflictException('That workspace slug is already taken.');
    }

    const passwordHash = await this.passwordService.hash(input.password);
    return this.otpService.issue({
      purpose: OtpPurpose.SIGNUP,
      recipient: normalizedEmail,
      payload: {
        passwordHash,
        displayName: input.displayName?.trim() || null,
        workspaceName: cleanWorkspaceName,
        workspaceSlug: cleanWorkspaceSlug,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      buildEmail: ({ code, expiresAt }) => ({
        to: normalizedEmail,
        subject: otpEmailSubject({ purposeLabel: 'signup' }),
        html: renderOtpEmail({
          code,
          title: 'Verify your email',
          purposeLabel: 'signup',
          description: 'Use this code to finish creating your Weevil workspace.',
          expiresAt,
        }),
        metadata: {
          purpose: 'signup',
          from_name: 'Weevil',
        },
      }),
    });
  }

  async verifySignupOtp(
    input: VerifySignupOtpInput,
  ): Promise<{ session: IssuedSession; userId: string; workspaceId: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const challenge = await this.otpService.verify({
      purpose: OtpPurpose.SIGNUP,
      recipient: normalizedEmail,
      code: input.code,
    });
    const payload = parseSignupOtpPayload(challenge.payload);

    const [existingUser, existingWorkspace] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
      this.prisma.workspace.findUnique({ where: { slug: payload.workspaceSlug } }),
    ]);
    if (existingUser) {
      throw new ConflictException('An account with that email already exists.');
    }
    if (existingWorkspace) {
      throw new ConflictException('That workspace slug is already taken.');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          displayName: payload.displayName,
          emailVerified: new Date(),
          passwordHash: payload.passwordHash,
          status: UserStatus.ACTIVE,
        },
      });
      const workspace = await tx.workspace.create({
        data: {
          slug: payload.workspaceSlug,
          name: payload.workspaceName,
          status: WorkspaceStatus.ACTIVE,
          projects: { create: { key: 'DEFAULT', name: `${payload.workspaceName} (default)` } },
        },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: WorkspaceRole.OWNER,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: workspace.id },
      });
      await this.otpService.consume(tx, challenge.id);
      const session = await this.issueSessionInTx(
        tx,
        user.id,
        workspace.id,
        input.userAgent,
        input.ipAddress,
      );
      return { session, userId: user.id, workspaceId: workspace.id };
    });
  }

  async getInvitePreview(inviteToken: string) {
    const invite = await this.findPendingInvite(this.prisma, inviteToken);
    return {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      workspace: {
        slug: invite.workspace.slug,
        name: invite.workspace.name,
      },
      invitedBy: invite.createdBy
        ? {
            email: invite.createdBy.email,
            displayName: invite.createdBy.displayName,
          }
        : null,
    };
  }

  async acceptInvite(input: {
    userId: string;
    email: string;
    sessionId: string;
    inviteToken: string;
  }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const invite = await this.findPendingInvite(tx, input.inviteToken);
      if (invite.email.toLowerCase() !== normalizedEmail) {
        throw new UnauthorizedException('Invite was issued to a different email.');
      }

      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId: input.userId,
          },
        },
        create: {
          workspaceId: invite.workspaceId,
          userId: input.userId,
          role: invite.role,
          status: MembershipStatus.ACTIVE,
          invitedById: invite.createdById,
          joinedAt: new Date(),
        },
        update: {
          role: invite.role,
          status: MembershipStatus.ACTIVE,
          invitedById: invite.createdById,
          joinedAt: new Date(),
        },
      });
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: { defaultWorkspaceId: invite.workspaceId },
      });
      await tx.authSession.update({
        where: { id: input.sessionId },
        data: { workspaceId: invite.workspaceId },
      });

      return {
        workspace: {
          id: invite.workspace.id,
          slug: invite.workspace.slug,
          name: invite.workspace.name,
        },
        role: invite.role,
      };
    });
  }

  async login(
    input: LoginInput,
  ): Promise<{ session: IssuedSession; userId: string; defaultWorkspaceId: string | null }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    await this.assertRateLimit('login', `${normalizedEmail}:${input.ipAddress ?? 'unknown'}`, 10, 10 * 60);

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.passwordHash || user.status !== UserStatus.ACTIVE) {
      // Generic error — don't leak existence.
      throw new UnauthorizedException('Invalid email or password.');
    }
    const ok = await this.passwordService.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const session = await this.issueSession(
      user.id,
      user.defaultWorkspaceId,
      input.userAgent,
      input.ipAddress,
    );
    return { session, userId: user.id, defaultWorkspaceId: user.defaultWorkspaceId };
  }

  /**
   * Verify a raw bearer token. Returns the resolved auth context or null if invalid/expired.
   * Cheap: single index lookup by tokenHash.
   */
  async verifyToken(rawToken: string) {
    if (!rawToken) return null;
    const tokenHash = this.tokenService.hash(rawToken);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      return null;
    }
    // Sliding refresh — extend if more than 1 day used.
    const usedMsAgo = Date.now() - session.lastUsedAt.getTime();
    if (usedMsAgo > 24 * 60 * 60 * 1_000) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
    }
    return session;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    userId: string,
    workspaceId: string | null,
    userAgent: string | undefined,
    ipAddress: string | undefined,
  ): Promise<IssuedSession> {
    return this.issueSessionInTx(this.prisma, userId, workspaceId, userAgent, ipAddress);
  }

  private async issueSessionInTx(
    tx: TxClient | PrismaService,
    userId: string,
    workspaceId: string | null,
    userAgent: string | undefined,
    ipAddress: string | undefined,
  ): Promise<IssuedSession> {
    const { raw, hash } = this.tokenService.generate('sess');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const created = await tx.authSession.create({
      data: {
        userId,
        tokenHash: hash,
        workspaceId,
        userAgent: userAgent ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt,
      },
    });
    return { token: raw, sessionId: created.id, expiresAt: created.expiresAt };
  }

  private async assertRateLimit(
    scope: string,
    rawKey: string,
    maxAttempts: number,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.tokenService.hash(`${scope}:${rawKey}`);
    const count = await this.cache.increment('auth-rate-limit', key, ttlSeconds);
    if (count > maxAttempts) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async findPendingInvite(tx: TxClient | PrismaService, inviteToken: string) {
    const trimmedToken = inviteToken.trim();
    if (!trimmedToken) {
      throw new UnauthorizedException('Invite is invalid or expired.');
    }
    const invite = await tx.workspaceInvite.findFirst({
      where: {
        OR: [
          // Current invite links use the durable stored token so admins can copy
          // links again from the pending invitation list.
          { token: trimmedToken },
          // Backward compatibility for earlier one-time raw-token links.
          { token: this.tokenService.hash(trimmedToken) },
        ],
      },
      include: {
        workspace: true,
        createdBy: { select: { email: true, displayName: true } },
      },
    });
    if (!invite || invite.status !== MembershipStatus.INVITED || invite.expiresAt < new Date()) {
      throw new UnauthorizedException('Invite is invalid or expired.');
    }
    return invite;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface SignupOtpPayload {
  passwordHash: string;
  displayName: string | null;
  workspaceName: string;
  workspaceSlug: string;
}

function parseSignupOtpPayload(payload: unknown): SignupOtpPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new UnauthorizedException('Verification code is invalid or expired.');
  }
  const record = payload as Record<string, unknown>;
  if (
    typeof record.passwordHash !== 'string' ||
    typeof record.workspaceName !== 'string' ||
    typeof record.workspaceSlug !== 'string'
  ) {
    throw new UnauthorizedException('Verification code is invalid or expired.');
  }
  const displayName = typeof record.displayName === 'string' ? record.displayName : null;
  if (!isValidWorkspaceSlug(record.workspaceSlug)) {
    throw new UnauthorizedException('Verification code is invalid or expired.');
  }
  return {
    passwordHash: record.passwordHash,
    displayName,
    workspaceName: record.workspaceName,
    workspaceSlug: record.workspaceSlug,
  };
}

function isValidWorkspaceSlug(value: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(value);
}

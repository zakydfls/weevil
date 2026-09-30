import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '@weevil/cache';
import { PrismaService } from '@weevil/database';
import { otpEmailSubject, renderOtpEmail } from '@weevil/notifications';
import {
  MembershipStatus,
  OtpPurpose,
  Prisma,
  UserIdentityProvider,
  UserStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '@weevil/prisma-client';
import { FirebaseAuthService, type VerifiedFirebaseGoogleUser } from './firebase-auth.service';
import { OtpService, type OtpChallengeState } from './otp.service';
import { PasswordService } from './password.service';
import { normalizeWorkspaceSlug } from './permission.service';
import { TokenService } from './token.service';
import { WorkspaceEvents, type WorkspaceJoinRequestedEvent } from '../domain/workspace-events';

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

export interface RequestLoginOtpInput extends LoginInput {
  channel: OtpChannel;
}

export interface VerifyLoginOtpInput {
  email: string;
  channel: OtpChannel;
  code: string;
  userAgent?: string;
  ipAddress?: string;
}

type OtpChannel = 'email' | 'whatsapp';

export interface FirebaseGoogleOAuthInput {
  idToken: string;
  intent?: 'LOGIN' | 'SIGNUP';
  displayName?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  joinWorkspaceSlug?: string;
  inviteToken?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface RequestSignupOtpInput {
  email: string;
  channel: OtpChannel;
  phoneNumber?: string;
  password: string;
  displayName?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  joinWorkspaceSlug?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface VerifySignupOtpInput {
  email: string;
  channel: OtpChannel;
  phoneNumber?: string;
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

export type VerifySignupOtpResult =
  | {
      status: 'ACTIVE';
      session: IssuedSession;
      userId: string;
      workspaceId: string;
    }
  | {
      status: 'PENDING_APPROVAL';
      userId: string;
      workspaceId: string;
      email: string;
      workspace: {
        slug: string;
        name: string;
      };
    };

export type FirebaseGoogleOAuthResult =
  | {
      status: 'ACTIVE';
      session: IssuedSession;
      userId: string;
      workspaceId: string | null;
      defaultWorkspaceId: string | null;
    }
  | {
      status: 'PENDING_APPROVAL';
      userId: string;
      workspaceId: string;
      email: string;
      workspace: {
        slug: string;
        name: string;
      };
    }
  | {
      status: 'REGISTRATION_REQUIRED';
      email: string;
      displayName: string | null;
      avatarUrl: string | null;
    };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly firebaseAuthService: FirebaseAuthService,
    private readonly eventEmitter: EventEmitter2,
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
        const slug = normalizeWorkspaceSlug(input.workspaceSlug ?? slugify(input.workspaceName));
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
    const phoneNumber = input.channel === 'whatsapp' ? normalizePhone(input.phoneNumber) : null;
    const recipient = input.channel === 'email' ? normalizedEmail : phoneNumber!;
    await this.assertRateLimit(
      'signup-otp',
      `${normalizedEmail}:${input.ipAddress ?? 'unknown'}`,
      8,
      60 * 60,
    );

    const existingUser = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      if (existingUser.status === UserStatus.INVITED) {
        throw new ConflictException(
          'Your workspace access request is already waiting for approval.',
        );
      }
      throw new ConflictException('An account with that email already exists.');
    }
    if (phoneNumber && (await this.prisma.user.findUnique({ where: { phoneNumber } }))) {
      throw new ConflictException('An account with that WhatsApp number already exists.');
    }

    const passwordHash = await this.passwordService.hash(input.password);
    if (input.joinWorkspaceSlug) {
      const cleanJoinSlug = normalizeWorkspaceSlug(input.joinWorkspaceSlug);
      if (!isValidWorkspaceSlug(cleanJoinSlug)) {
        throw new BadRequestException(
          'Workspace slug must be 2-40 lowercase letters, numbers, or hyphens.',
        );
      }
      const workspace = await this.findWorkspaceBySlug(cleanJoinSlug);
      if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
        throw new NotFoundException('No active workspace found with that slug.');
      }

      return this.otpService.issue({
        purpose: OtpPurpose.SIGNUP,
        recipient,
        channel: input.channel,
        payload: {
          kind: 'JOIN_WORKSPACE',
          passwordHash,
          displayName: input.displayName?.trim() || null,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug,
          channel: input.channel,
          phoneNumber,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        buildNotification: ({ code, expiresAt }) =>
          buildOtpNotification({
            channel: input.channel,
            recipient,
            code,
            expiresAt,
            title: `Verify your ${input.channel === 'email' ? 'email' : 'WhatsApp number'}`,
            purposeLabel: 'workspace access',
            description: `Use this code to request access to ${workspace.name}.`,
            metadata: {
              purpose: 'workspace_join_request',
              workspace_id: workspace.id,
              from_name: 'Weevil',
            },
          }),
      });
    }

    const cleanWorkspaceName = input.workspaceName?.trim() ?? '';
    const cleanWorkspaceSlug = normalizeWorkspaceSlug(
      input.workspaceSlug ?? slugify(cleanWorkspaceName),
    );

    if (cleanWorkspaceName.length < 2) {
      throw new BadRequestException('Workspace name must be at least 2 characters.');
    }
    if (!isValidWorkspaceSlug(cleanWorkspaceSlug)) {
      throw new BadRequestException('Slug must be 2-40 lowercase letters, numbers, or hyphens.');
    }

    const existingWorkspace = await this.findWorkspaceBySlug(cleanWorkspaceSlug);
    if (existingWorkspace) {
      throw new ConflictException('That workspace slug is already taken.');
    }

    return this.otpService.issue({
      purpose: OtpPurpose.SIGNUP,
      recipient,
      channel: input.channel,
      payload: {
        kind: 'CREATE_WORKSPACE',
        passwordHash,
        displayName: input.displayName?.trim() || null,
        workspaceName: cleanWorkspaceName,
        workspaceSlug: cleanWorkspaceSlug,
        channel: input.channel,
        phoneNumber,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      buildNotification: ({ code, expiresAt }) =>
        buildOtpNotification({
          channel: input.channel,
          recipient,
          code,
          expiresAt,
          title: `Verify your ${input.channel === 'email' ? 'email' : 'WhatsApp number'}`,
          purposeLabel: 'signup',
          description: 'Use this code to finish creating your Weevil workspace.',
          metadata: {
            purpose: 'signup',
            from_name: 'Weevil',
          },
        }),
    });
  }

  async verifySignupOtp(input: VerifySignupOtpInput): Promise<VerifySignupOtpResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const phoneNumber = input.channel === 'whatsapp' ? normalizePhone(input.phoneNumber) : null;
    const recipient = input.channel === 'email' ? normalizedEmail : phoneNumber!;
    const challenge = await this.otpService.verify({
      purpose: OtpPurpose.SIGNUP,
      recipient,
      code: input.code,
    });
    const payload = parseSignupOtpPayload(challenge.payload);
    if (payload.channel !== input.channel || payload.phoneNumber !== phoneNumber) {
      throw new UnauthorizedException('Verification code is invalid or expired.');
    }

    if (payload.kind === 'JOIN_WORKSPACE') {
      return this.verifyJoinWorkspaceOtp(normalizedEmail, challenge.id, payload);
    }

    const [existingUser, existingPhoneUser, existingWorkspace] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
      phoneNumber ? this.prisma.user.findUnique({ where: { phoneNumber } }) : null,
      this.findWorkspaceBySlug(payload.workspaceSlug),
    ]);
    if (existingUser) {
      throw new ConflictException('An account with that email already exists.');
    }
    if (existingPhoneUser) {
      throw new ConflictException('An account with that WhatsApp number already exists.');
    }
    if (existingWorkspace) {
      throw new ConflictException('That workspace slug is already taken.');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          displayName: payload.displayName,
          emailVerified: input.channel === 'email' ? new Date() : null,
          phoneNumber,
          phoneVerifiedAt: input.channel === 'whatsapp' ? new Date() : null,
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
      return { status: 'ACTIVE' as const, session, userId: user.id, workspaceId: workspace.id };
    });
  }

  private async verifyJoinWorkspaceOtp(
    normalizedEmail: string,
    challengeId: string,
    payload: JoinWorkspaceSignupOtpPayload,
  ): Promise<VerifySignupOtpResult> {
    const [existingUser, existingPhoneUser, workspace] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
      payload.phoneNumber
        ? this.prisma.user.findUnique({ where: { phoneNumber: payload.phoneNumber } })
        : null,
      this.prisma.workspace.findUnique({ where: { id: payload.workspaceId } }),
    ]);
    if (existingUser) {
      if (existingUser.status === UserStatus.INVITED) {
        throw new ConflictException(
          'Your workspace access request is already waiting for approval.',
        );
      }
      throw new ConflictException('An account with that email already exists.');
    }
    if (existingPhoneUser) {
      throw new ConflictException('An account with that WhatsApp number already exists.');
    }
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new NotFoundException('No active workspace found for this request.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          displayName: payload.displayName,
          emailVerified: payload.channel === 'email' ? new Date() : null,
          phoneNumber: payload.phoneNumber,
          phoneVerifiedAt: payload.channel === 'whatsapp' ? new Date() : null,
          passwordHash: payload.passwordHash,
          status: UserStatus.INVITED,
        },
      });
      const member = await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: WorkspaceRole.MEMBER,
          status: MembershipStatus.INVITED,
        },
      });
      await this.otpService.consume(tx, challengeId);

      return {
        user,
        member,
        response: {
          status: 'PENDING_APPROVAL' as const,
          userId: user.id,
          workspaceId: workspace.id,
          email: normalizedEmail,
          workspace: {
            slug: workspace.slug,
            name: workspace.name,
          },
        },
      };
    });

    this.eventEmitter.emit(WorkspaceEvents.JoinRequested, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      memberId: result.member.id,
      requesterEmail: result.user.email,
      requesterName: result.user.displayName,
    } satisfies WorkspaceJoinRequestedEvent);

    return result.response;
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

  async login(input: LoginInput) {
    const normalizedEmail = input.email.trim().toLowerCase();
    await this.assertRateLimit(
      'login-check',
      `${normalizedEmail}:${input.ipAddress ?? 'unknown'}`,
      10,
      10 * 60,
    );
    const user = await this.verifyLoginCredentials(input);
    return {
      channels: [
        ...(user.emailVerified
          ? [{ channel: 'email' as const, recipient: maskRecipient(user.email, 'email') }]
          : []),
        ...(user.phoneNumber && user.phoneVerifiedAt
          ? [
              {
                channel: 'whatsapp' as const,
                recipient: maskRecipient(user.phoneNumber, 'whatsapp'),
              },
            ]
          : []),
      ],
    };
  }

  async requestLoginOtp(input: RequestLoginOtpInput): Promise<OtpChallengeState> {
    const normalizedEmail = input.email.trim().toLowerCase();
    await this.assertRateLimit(
      'login',
      `${normalizedEmail}:${input.ipAddress ?? 'unknown'}`,
      10,
      10 * 60,
    );

    const user = await this.verifyLoginCredentials(input);
    const recipient = loginOtpRecipient(user, input.channel);

    return this.otpService.issue({
      purpose: OtpPurpose.LOGIN,
      recipient,
      channel: input.channel,
      payload: { userId: user.id },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      buildNotification: ({ code, expiresAt }) =>
        buildOtpNotification({
          channel: input.channel,
          recipient,
          code,
          expiresAt,
          title: 'Confirm your Weevil login',
          purposeLabel: 'login',
          description: 'Use this code to finish signing in to Weevil.',
          metadata: { purpose: 'login', from_name: 'Weevil' },
        }),
    });
  }

  async verifyLoginOtp(
    input: VerifyLoginOtpInput,
  ): Promise<{ session: IssuedSession; userId: string; defaultWorkspaceId: string | null }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Verification code is invalid or expired.');
    }
    const recipient = loginOtpRecipient(user, input.channel);
    const challenge = await this.otpService.verify({
      purpose: OtpPurpose.LOGIN,
      recipient,
      code: input.code,
    });
    const payload = challenge.payload as Record<string, unknown> | null;
    if (payload?.userId !== user.id) {
      throw new UnauthorizedException('Verification code is invalid or expired.');
    }

    const session = await this.prisma.$transaction(async (tx) => {
      await this.otpService.consume(tx, challenge.id);
      return this.issueSessionInTx(
        tx,
        user.id,
        user.defaultWorkspaceId,
        input.userAgent,
        input.ipAddress,
      );
    });
    return { session, userId: user.id, defaultWorkspaceId: user.defaultWorkspaceId };
  }

  private async verifyLoginCredentials(input: LoginInput) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.passwordHash || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!(await this.passwordService.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return user;
  }

  async authenticateWithFirebaseGoogle(
    input: FirebaseGoogleOAuthInput,
  ): Promise<FirebaseGoogleOAuthResult> {
    await this.assertRateLimit('oauth-google-ip', input.ipAddress ?? 'unknown', 30, 10 * 60);

    const profile = await this.firebaseAuthService.verifyGoogleIdToken(input.idToken);
    const normalizedEmail = profile.email.trim().toLowerCase();
    await this.assertRateLimit(
      'oauth-google-email',
      `${normalizedEmail}:${input.ipAddress ?? 'unknown'}`,
      20,
      10 * 60,
    );

    const txResult = await this.prisma.$transaction(async (tx) => {
      const identity = await tx.userIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: UserIdentityProvider.FIREBASE_GOOGLE,
            providerUserId: profile.uid,
          },
        },
        include: { user: true },
      });

      if (identity) {
        if (identity.user.status === UserStatus.INVITED) {
          return {
            result: await this.pendingApprovalForUserInTx(tx, identity.user.id, normalizedEmail),
          };
        }
        if (identity.user.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException('Google sign-in is not allowed for this account.');
        }
        const workspaceId = input.inviteToken
          ? await this.acceptInviteForUserInTx(tx, {
              userId: identity.user.id,
              email: identity.user.email,
              inviteToken: input.inviteToken,
            })
          : identity.user.defaultWorkspaceId;
        return {
          result: await this.issueOAuthSessionForUserInTx(tx, identity.user, workspaceId, input),
        };
      }

      const existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });
      if (existingUser) {
        if (
          existingUser.status !== UserStatus.ACTIVE &&
          existingUser.status !== UserStatus.INVITED
        ) {
          throw new UnauthorizedException('Google sign-in is not allowed for this account.');
        }
        await this.linkFirebaseGoogleIdentityInTx(
          tx,
          existingUser.id,
          profile.uid,
          normalizedEmail,
        );
        await this.updateOAuthProfileInTx(tx, existingUser.id, profile, input.displayName);
        if (existingUser.status === UserStatus.INVITED) {
          return {
            result: await this.pendingApprovalForUserInTx(tx, existingUser.id, normalizedEmail),
          };
        }

        const workspaceId = input.inviteToken
          ? await this.acceptInviteForUserInTx(tx, {
              userId: existingUser.id,
              email: existingUser.email,
              inviteToken: input.inviteToken,
            })
          : existingUser.defaultWorkspaceId;
        const freshUser = await tx.user.findUniqueOrThrow({ where: { id: existingUser.id } });
        return {
          result: await this.issueOAuthSessionForUserInTx(tx, freshUser, workspaceId, input),
        };
      }

      if (input.intent === 'LOGIN' && !input.inviteToken) {
        return {
          result: {
            status: 'REGISTRATION_REQUIRED' as const,
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        };
      }

      if (input.inviteToken) {
        return {
          result: await this.createOAuthInviteUserInTx(tx, profile, input),
        };
      }

      if (input.joinWorkspaceSlug) {
        const joinResult = await this.createOAuthJoinRequestInTx(tx, profile, input);
        return joinResult;
      }

      return {
        result: await this.createOAuthWorkspaceUserInTx(tx, profile, input),
      };
    });

    if ('joinRequestedEvent' in txResult) {
      this.eventEmitter.emit(WorkspaceEvents.JoinRequested, txResult.joinRequestedEvent);
    }

    return txResult.result;
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

  private async issueOAuthSessionForUserInTx(
    tx: TxClient,
    user: {
      id: string;
      email: string;
      status: UserStatus;
      defaultWorkspaceId: string | null;
    },
    workspaceId: string | null,
    input: { userAgent?: string; ipAddress?: string },
  ): Promise<FirebaseGoogleOAuthResult> {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Google sign-in is not allowed for this account.');
    }
    const activeWorkspaceId = workspaceId ?? user.defaultWorkspaceId;
    const session = await this.issueSessionInTx(
      tx,
      user.id,
      activeWorkspaceId,
      input.userAgent,
      input.ipAddress,
    );
    return {
      status: 'ACTIVE',
      session,
      userId: user.id,
      workspaceId: activeWorkspaceId,
      defaultWorkspaceId: activeWorkspaceId,
    };
  }

  private async createOAuthWorkspaceUserInTx(
    tx: TxClient,
    profile: VerifiedFirebaseGoogleUser,
    input: FirebaseGoogleOAuthInput,
  ): Promise<FirebaseGoogleOAuthResult> {
    const cleanWorkspaceName = input.workspaceName?.trim() ?? '';
    const cleanWorkspaceSlug = normalizeWorkspaceSlug(
      input.workspaceSlug ?? slugify(cleanWorkspaceName),
    );

    if (cleanWorkspaceName.length < 2) {
      throw new BadRequestException('Choose a workspace before continuing with Google.');
    }
    if (!isValidWorkspaceSlug(cleanWorkspaceSlug)) {
      throw new BadRequestException('Slug must be 2-40 lowercase letters, numbers, or hyphens.');
    }
    const existingWorkspace = await this.findWorkspaceBySlugInTx(tx, cleanWorkspaceSlug);
    if (existingWorkspace) {
      throw new ConflictException('That workspace slug is already taken.');
    }

    const user = await tx.user.create({
      data: {
        email: profile.email,
        displayName: input.displayName?.trim() || profile.displayName,
        avatarUrl: profile.avatarUrl,
        emailVerified: new Date(),
        passwordHash: null,
        status: UserStatus.ACTIVE,
      },
    });
    await this.linkFirebaseGoogleIdentityInTx(tx, user.id, profile.uid, profile.email);
    const workspace = await tx.workspace.create({
      data: {
        slug: cleanWorkspaceSlug,
        name: cleanWorkspaceName,
        status: WorkspaceStatus.ACTIVE,
        projects: { create: { key: 'DEFAULT', name: `${cleanWorkspaceName} (default)` } },
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
    return this.issueOAuthSessionForUserInTx(
      tx,
      { ...user, defaultWorkspaceId: workspace.id },
      workspace.id,
      input,
    );
  }

  private async createOAuthInviteUserInTx(
    tx: TxClient,
    profile: VerifiedFirebaseGoogleUser,
    input: FirebaseGoogleOAuthInput,
  ): Promise<FirebaseGoogleOAuthResult> {
    if (!input.inviteToken) {
      throw new BadRequestException('Invite token is required.');
    }
    const invite = await this.findPendingInvite(tx, input.inviteToken);
    if (invite.email.toLowerCase() !== profile.email) {
      throw new UnauthorizedException('Invite was issued to a different email.');
    }
    const user = await tx.user.create({
      data: {
        email: profile.email,
        displayName: input.displayName?.trim() || profile.displayName,
        avatarUrl: profile.avatarUrl,
        emailVerified: new Date(),
        passwordHash: null,
        status: UserStatus.ACTIVE,
        defaultWorkspaceId: invite.workspaceId,
      },
    });
    await this.linkFirebaseGoogleIdentityInTx(tx, user.id, profile.uid, profile.email);
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
    return this.issueOAuthSessionForUserInTx(tx, user, invite.workspaceId, input);
  }

  private async createOAuthJoinRequestInTx(
    tx: TxClient,
    profile: VerifiedFirebaseGoogleUser,
    input: FirebaseGoogleOAuthInput,
  ): Promise<{
    result: FirebaseGoogleOAuthResult;
    joinRequestedEvent: WorkspaceJoinRequestedEvent;
  }> {
    const cleanJoinSlug = normalizeWorkspaceSlug(input.joinWorkspaceSlug ?? '');
    if (!isValidWorkspaceSlug(cleanJoinSlug)) {
      throw new BadRequestException(
        'Workspace slug must be 2-40 lowercase letters, numbers, or hyphens.',
      );
    }
    const workspace = await this.findWorkspaceBySlugInTx(tx, cleanJoinSlug);
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new NotFoundException('No active workspace found with that slug.');
    }
    const user = await tx.user.create({
      data: {
        email: profile.email,
        displayName: input.displayName?.trim() || profile.displayName,
        avatarUrl: profile.avatarUrl,
        emailVerified: new Date(),
        passwordHash: null,
        status: UserStatus.INVITED,
      },
    });
    await this.linkFirebaseGoogleIdentityInTx(tx, user.id, profile.uid, profile.email);
    const member = await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: WorkspaceRole.MEMBER,
        status: MembershipStatus.INVITED,
      },
    });

    return {
      result: {
        status: 'PENDING_APPROVAL',
        userId: user.id,
        workspaceId: workspace.id,
        email: profile.email,
        workspace: {
          slug: workspace.slug,
          name: workspace.name,
        },
      },
      joinRequestedEvent: {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        memberId: member.id,
        requesterEmail: user.email,
        requesterName: user.displayName,
      },
    };
  }

  private async pendingApprovalForUserInTx(
    tx: TxClient,
    userId: string,
    email: string,
  ): Promise<FirebaseGoogleOAuthResult> {
    const member = await tx.workspaceMember.findFirst({
      where: { userId, status: MembershipStatus.INVITED },
      include: { workspace: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!member || member.workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new UnauthorizedException('Workspace access is still waiting for approval.');
    }
    return {
      status: 'PENDING_APPROVAL',
      userId,
      workspaceId: member.workspaceId,
      email,
      workspace: {
        slug: member.workspace.slug,
        name: member.workspace.name,
      },
    };
  }

  private async acceptInviteForUserInTx(
    tx: TxClient,
    input: { userId: string; email: string; inviteToken: string },
  ): Promise<string> {
    const invite = await this.findPendingInvite(tx, input.inviteToken);
    if (invite.email.toLowerCase() !== input.email.trim().toLowerCase()) {
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
    return invite.workspaceId;
  }

  private async linkFirebaseGoogleIdentityInTx(
    tx: TxClient,
    userId: string,
    providerUserId: string,
    emailAtLink: string,
  ): Promise<void> {
    await tx.userIdentity.create({
      data: {
        userId,
        provider: UserIdentityProvider.FIREBASE_GOOGLE,
        providerUserId,
        emailAtLink,
      },
    });
  }

  private async updateOAuthProfileInTx(
    tx: TxClient,
    userId: string,
    profile: VerifiedFirebaseGoogleUser,
    displayNameOverride: string | undefined,
  ): Promise<void> {
    const displayName = displayNameOverride?.trim() || profile.displayName;
    await tx.user.update({
      where: { id: userId },
      data: {
        emailVerified: new Date(),
        ...(displayName ? { displayName } : {}),
        ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      },
    });
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

  private async findWorkspaceBySlug(slug: string) {
    const cleanSlug = normalizeWorkspaceSlug(slug);
    return (
      (await this.prisma.workspace.findUnique({ where: { slug: cleanSlug } })) ??
      this.prisma.workspace.findFirst({
        where: {
          slug: { equals: cleanSlug, mode: 'insensitive' },
        },
      })
    );
  }

  private async findWorkspaceBySlugInTx(tx: TxClient, slug: string) {
    const cleanSlug = normalizeWorkspaceSlug(slug);
    return (
      (await tx.workspace.findUnique({ where: { slug: cleanSlug } })) ??
      tx.workspace.findFirst({
        where: {
          slug: { equals: cleanSlug, mode: 'insensitive' },
        },
      })
    );
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CreateWorkspaceSignupOtpPayload {
  kind: 'CREATE_WORKSPACE';
  passwordHash: string;
  displayName: string | null;
  workspaceName: string;
  workspaceSlug: string;
  channel: OtpChannel;
  phoneNumber: string | null;
}

interface JoinWorkspaceSignupOtpPayload {
  kind: 'JOIN_WORKSPACE';
  passwordHash: string;
  displayName: string | null;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  channel: OtpChannel;
  phoneNumber: string | null;
}

type SignupOtpPayload = CreateWorkspaceSignupOtpPayload | JoinWorkspaceSignupOtpPayload;

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
  const channel =
    record.channel === 'email' || record.channel === 'whatsapp' ? record.channel : null;
  const phoneNumber = typeof record.phoneNumber === 'string' ? record.phoneNumber : null;
  if (!channel || (channel === 'whatsapp' && !phoneNumber)) {
    throw new UnauthorizedException('Verification code is invalid or expired.');
  }
  if (!isValidWorkspaceSlug(record.workspaceSlug)) {
    throw new UnauthorizedException('Verification code is invalid or expired.');
  }
  if (record.kind === 'JOIN_WORKSPACE') {
    if (typeof record.workspaceId !== 'string') {
      throw new UnauthorizedException('Verification code is invalid or expired.');
    }
    return {
      kind: 'JOIN_WORKSPACE',
      passwordHash: record.passwordHash,
      displayName,
      workspaceId: record.workspaceId,
      workspaceName: record.workspaceName,
      workspaceSlug: record.workspaceSlug,
      channel,
      phoneNumber,
    };
  }
  return {
    kind: 'CREATE_WORKSPACE',
    passwordHash: record.passwordHash,
    displayName,
    workspaceName: record.workspaceName,
    workspaceSlug: record.workspaceSlug,
    channel,
    phoneNumber,
  };
}

function normalizePhone(value: string | undefined): string {
  const phone = value?.trim() ?? '';
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new BadRequestException('Use international phone format, for example +628123456789.');
  }
  return phone;
}

function loginOtpRecipient(
  user: {
    email: string;
    emailVerified: Date | null;
    phoneNumber: string | null;
    phoneVerifiedAt: Date | null;
  },
  channel: OtpChannel,
): string {
  if (channel === 'email' && user.emailVerified) return user.email;
  if (channel === 'whatsapp' && user.phoneNumber && user.phoneVerifiedAt) return user.phoneNumber;
  throw new BadRequestException('That OTP channel is not verified for this account.');
}

function maskRecipient(recipient: string, channel: OtpChannel): string {
  if (channel === 'whatsapp') return `${recipient.slice(0, 4)}••••${recipient.slice(-3)}`;
  const [name, domain] = recipient.split('@');
  return `${name.slice(0, 2)}•••@${domain}`;
}

function buildOtpNotification(input: {
  channel: OtpChannel;
  recipient: string;
  code: string;
  expiresAt: Date;
  title: string;
  purposeLabel: string;
  description: string;
  metadata: Record<string, unknown>;
}) {
  if (input.channel === 'whatsapp') {
    return {
      channel: 'whatsapp' as const,
      recipient: input.recipient,
      body: `Kode OTP Weevil Anda: ${input.code}. Berlaku 10 menit. Jangan bagikan kode ini.`,
      metadata: input.metadata,
    };
  }
  return {
    channel: 'email' as const,
    recipient: input.recipient,
    body: renderOtpEmail({
      code: input.code,
      title: input.title,
      purposeLabel: input.purposeLabel,
      description: input.description,
      expiresAt: input.expiresAt,
    }),
    metadata: {
      ...input.metadata,
      subject: otpEmailSubject({ purposeLabel: input.purposeLabel }),
      content_type: 'text/html',
    },
  };
}

function isValidWorkspaceSlug(value: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(value);
}

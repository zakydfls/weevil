import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfigService } from '@weevil/config';
import { AuthService } from '../application/auth.service';
import { CurrentAuth } from '../decorators/current-auth.decorator';
import { Public } from '../decorators/public.decorator';
import type { AuthContext } from '../domain/auth-context';
import {
  AcceptInviteDto,
  FirebaseGoogleOAuthDto,
  LoginDto,
  RequestPhoneOtpDto,
  RequestSignupOtpDto,
  SignupDto,
  VerifyEmailOtpDto,
  VerifyPhoneOtpDto,
  VerifySignupOtpDto,
} from './dto';

const SESSION_COOKIE = 'wv_session';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() body: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signup(body);
    this.setSessionCookie(res, result.session.token, result.session.expiresAt);
    return {
      token: result.session.token,
      sessionId: result.session.sessionId,
      userId: result.userId,
      workspaceId: result.workspaceId,
      expiresAt: result.session.expiresAt.toISOString(),
    };
  }

  @Public()
  @Post('signup/request-otp')
  @HttpCode(HttpStatus.OK)
  requestSignupOtp(@Body() body: RequestSignupOtpDto, @Req() req: Request) {
    return this.authService.requestSignupOtp({
      ...body,
      userAgent: req.headers['user-agent'],
      ipAddress: clientIp(req),
    });
  }

  @Public()
  @Post('signup/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifySignupOtp(
    @Body() body: VerifySignupOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifySignupOtp({
      ...body,
      userAgent: req.headers['user-agent'],
      ipAddress: clientIp(req),
    });
    if (result.status === 'PENDING_APPROVAL') {
      return result;
    }
    this.setSessionCookie(res, result.session.token, result.session.expiresAt);
    return {
      status: result.status,
      token: result.session.token,
      sessionId: result.session.sessionId,
      userId: result.userId,
      workspaceId: result.workspaceId,
      expiresAt: result.session.expiresAt.toISOString(),
    };
  }

  @Public()
  @Get('invites/:token')
  getInvitePreview(@Param('token') token: string) {
    return this.authService.getInvitePreview(token);
  }

  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(@CurrentAuth() auth: AuthContext, @Body() body: AcceptInviteDto) {
    return this.authService.acceptInvite({
      userId: auth.user.id,
      email: auth.user.email,
      sessionId: auth.session.id,
      inviteToken: body.inviteToken,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login({
      ...body,
      userAgent: req.headers['user-agent'],
      ipAddress: clientIp(req),
    });
    this.setSessionCookie(
      res,
      result.session.token,
      body.rememberMe ? result.session.expiresAt : undefined,
    );
    return {
      token: result.session.token,
      sessionId: result.session.sessionId,
      userId: result.userId,
      defaultWorkspaceId: result.defaultWorkspaceId,
      expiresAt: result.session.expiresAt.toISOString(),
    };
  }

  @Post('email/request-otp')
  @HttpCode(HttpStatus.OK)
  requestEmailOtp(@CurrentAuth() auth: AuthContext, @Req() req: Request) {
    return this.authService.requestEmailOtp({
      userId: auth.user.id,
      email: auth.user.email,
      userAgent: req.headers['user-agent'],
      ipAddress: clientIp(req),
    });
  }

  @Post('email/verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyEmailOtp(@CurrentAuth() auth: AuthContext, @Body() body: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(auth.user.id, auth.user.email, body.code);
  }

  @Post('phone/request-otp')
  @HttpCode(HttpStatus.OK)
  requestPhoneOtp(
    @CurrentAuth() auth: AuthContext,
    @Body() body: RequestPhoneOtpDto,
    @Req() req: Request,
  ) {
    return this.authService.requestPhoneOtp({
      userId: auth.user.id,
      phoneNumber: body.phoneNumber,
      userAgent: req.headers['user-agent'],
      ipAddress: clientIp(req),
    });
  }

  @Post('phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyPhoneOtp(@CurrentAuth() auth: AuthContext, @Body() body: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneOtp(auth.user.id, body.phoneNumber, body.code);
  }

  @Public()
  @Post('oauth/firebase-google')
  @HttpCode(HttpStatus.OK)
  async firebaseGoogleOAuth(
    @Body() body: FirebaseGoogleOAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.authenticateWithFirebaseGoogle({
      ...body,
      userAgent: req.headers['user-agent'],
      ipAddress: clientIp(req),
    });
    if (result.status !== 'ACTIVE') {
      return result;
    }
    this.setSessionCookie(res, result.session.token, result.session.expiresAt);
    return {
      status: result.status,
      token: result.session.token,
      sessionId: result.session.sessionId,
      userId: result.userId,
      workspaceId: result.workspaceId,
      defaultWorkspaceId: result.defaultWorkspaceId,
      expiresAt: result.session.expiresAt.toISOString(),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeSession(auth.session.id);
    // Clear with the SAME attributes the cookie was set with, or the browser
    // won't match and remove it (cross-site cookies especially).
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Post('me')
  @HttpCode(HttpStatus.OK)
  me(@CurrentAuth() auth: AuthContext) {
    return {
      user: auth.user,
      workspace: auth.workspace
        ? {
            id: auth.workspace.id,
            slug: auth.workspace.slug,
            role: auth.workspace.role,
            permissions: Array.from(auth.workspace.permissions),
          }
        : null,
    };
  }

  private setSessionCookie(res: Response, token: string, expiresAt?: Date) {
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      ...(expiresAt ? { expires: expiresAt } : {}),
    });
  }

  /**
   * Cookie attributes, driven by env so they work regardless of NODE_ENV:
   * - Cross-site (FE on app.* calling api.*) needs COOKIE_SAMESITE=none + COOKIE_SECURE=true.
   * - COOKIE_DOMAIN (e.g. ".centurycode.id") shares the cookie across subdomains.
   * SameSite=None is only valid with Secure, so we coerce that combination.
   */
  private cookieOptions(): CookieOptions {
    const sameSite = this.config.cookieSameSite;
    const secure = sameSite === 'none' ? true : this.config.cookieSecure;
    const domain = this.config.cookieDomain;
    return {
      httpOnly: true,
      sameSite,
      secure,
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }
}

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket.remoteAddress ?? undefined;
}

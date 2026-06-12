import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfigService } from '@weevil/config';
import { AuthService } from '../application/auth.service';
import { CurrentAuth } from '../decorators/current-auth.decorator';
import { Public } from '../decorators/public.decorator';
import type { AuthContext } from '../domain/auth-context';
import { LoginDto, SignupDto } from './dto';

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
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login({
      email: body.email,
      password: body.password,
      userAgent: req.headers['user-agent'],
      ipAddress: clientIp(req),
    });
    this.setSessionCookie(res, result.session.token, result.session.expiresAt);
    return {
      token: result.session.token,
      sessionId: result.session.sessionId,
      userId: result.userId,
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
    const { expires: _expires, ...clearOptions } = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, clearOptions);
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

  private setSessionCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), expires: expiresAt });
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

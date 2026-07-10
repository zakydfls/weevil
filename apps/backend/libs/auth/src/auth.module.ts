import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '@weevil/config';
import { DatabaseModule } from '@weevil/database';
import { NotificationsModule } from '@weevil/notifications';
import { AuthService } from './application/auth.service';
import { FirebaseAuthService } from './application/firebase-auth.service';
import { OtpService } from './application/otp.service';
import { PasswordService } from './application/password.service';
import { PermissionService } from './application/permission.service';
import { PlatformAdminService } from './application/platform-admin.service';
import { TokenService } from './application/token.service';
import { WorkspaceInviteNotificationService } from './application/workspace-invite-notification.service';
import { WorkspaceJoinRequestNotificationService } from './application/workspace-join-request-notification.service';
import { WorkspaceService } from './application/workspace.service';
import { AuthGuard } from './guards/auth.guard';
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
import { PermissionGuard } from './guards/permission.guard';
import { PlatformRoleGuard } from './guards/platform-role.guard';
import { AuthController } from './presentation/auth.controller';
import { PlatformAdminController } from './presentation/platform-admin.controller';
import { WorkspacesController } from './presentation/workspaces.controller';

@Module({
  imports: [AppConfigModule, DatabaseModule, NotificationsModule],
  controllers: [AuthController, WorkspacesController, PlatformAdminController],
  providers: [
    AuthService,
    FirebaseAuthService,
    OtpService,
    PasswordService,
    PermissionService,
    PlatformAdminService,
    TokenService,
    WorkspaceInviteNotificationService,
    WorkspaceJoinRequestNotificationService,
    WorkspaceService,
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: PlatformRoleGuard },
  ],
  exports: [
    AuthService,
    FirebaseAuthService,
    OtpService,
    PasswordService,
    PermissionService,
    PlatformAdminService,
    TokenService,
    WorkspaceInviteNotificationService,
    WorkspaceJoinRequestNotificationService,
    WorkspaceService,
  ],
})
export class AuthModule {}

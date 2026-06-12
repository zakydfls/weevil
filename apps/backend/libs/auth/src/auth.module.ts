import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '@weevil/config';
import { DatabaseModule } from '@weevil/database';
import { AuthService } from './application/auth.service';
import { PasswordService } from './application/password.service';
import { PermissionService } from './application/permission.service';
import { PlatformAdminService } from './application/platform-admin.service';
import { TokenService } from './application/token.service';
import { WorkspaceService } from './application/workspace.service';
import { AuthGuard } from './guards/auth.guard';
import { PermissionGuard } from './guards/permission.guard';
import { PlatformRoleGuard } from './guards/platform-role.guard';
import { AuthController } from './presentation/auth.controller';
import { PlatformAdminController } from './presentation/platform-admin.controller';
import { WorkspacesController } from './presentation/workspaces.controller';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [AuthController, WorkspacesController, PlatformAdminController],
  providers: [
    AuthService,
    PasswordService,
    PermissionService,
    PlatformAdminService,
    TokenService,
    WorkspaceService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: PlatformRoleGuard },
  ],
  exports: [
    AuthService,
    PasswordService,
    PermissionService,
    PlatformAdminService,
    TokenService,
    WorkspaceService,
  ],
})
export class AuthModule {}

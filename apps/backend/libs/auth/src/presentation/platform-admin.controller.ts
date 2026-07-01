import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PlatformRole, UserStatus, WorkspaceStatus } from '@weevil/prisma-client';
import { PlatformAdminService } from '../application/platform-admin.service';
import { CurrentAuth } from '../decorators/current-auth.decorator';
import { RequirePlatformRole } from '../decorators/platform-role.decorator';
import type { AuthContext } from '../domain/auth-context';
import { PlatformRoleGuard } from '../guards/platform-role.guard';

class SetWorkspaceStatusDto {
  @IsEnum(WorkspaceStatus)
  status: WorkspaceStatus;
}

class SetUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}

class SetPlatformRoleDto {
  @IsEnum(PlatformRole)
  platformRole: PlatformRole;
}

class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Platform-admin surface. Reserved for users with `platformRole = PLATFORM_ADMIN`.
 * These endpoints sit OUTSIDE workspace scope — they see across tenants.
 */
@RequirePlatformRole(PlatformRole.PLATFORM_ADMIN)
@UseGuards(PlatformRoleGuard)
@Controller('platform')
export class PlatformAdminController {
  constructor(private readonly platformService: PlatformAdminService) {}

  @Get('overview')
  overview() {
    return this.platformService.overview();
  }

  @Get('recent-activity')
  recentActivity() {
    return this.platformService.recentActivity(30);
  }

  @Get('workspaces')
  listWorkspaces() {
    return this.platformService.listWorkspaces();
  }

  @Patch('workspaces/:id/status')
  setWorkspaceStatus(@Param('id') workspaceId: string, @Body() body: SetWorkspaceStatusDto) {
    return this.platformService.setWorkspaceStatus(workspaceId, body.status);
  }

  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.platformService.listUsers({ search: query.search });
  }

  @Patch('users/:id/status')
  setUserStatus(@Param('id') userId: string, @Body() body: SetUserStatusDto) {
    return this.platformService.setUserStatus(userId, body.status);
  }

  @Patch('users/:id/platform-role')
  setPlatformRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id') userId: string,
    @Body() body: SetPlatformRoleDto,
  ) {
    return this.platformService.setPlatformRole(userId, body.platformRole, auth.user.id);
  }
}

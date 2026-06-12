import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Permission, WorkspaceRole } from '@weevil/prisma-client';
import { CurrentAuth } from '../decorators/current-auth.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import type { AuthContext } from '../domain/auth-context';
import { WorkspaceService } from '../application/workspace.service';

class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  slug: string;
}

class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;
}

class ChangeRoleDto {
  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;
}

class PermissionOverridesDto {
  @IsArray()
  @IsEnum(Permission, { each: true })
  @IsOptional()
  extraPermissions?: Permission[];

  @IsArray()
  @IsEnum(Permission, { each: true })
  @IsOptional()
  deniedPermissions?: Permission[];
}

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  /** All workspaces the current user is a member of. */
  @Get('mine')
  listMine(@CurrentAuth() auth: AuthContext) {
    return this.workspaceService.listMine(auth.user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentAuth() auth: AuthContext, @Body() body: CreateWorkspaceDto) {
    return this.workspaceService.create(auth.user.id, body.name, body.slug);
  }

  @Get('current/members')
  @RequirePermissions(Permission.WORKSPACE_VIEW)
  listMembers(@CurrentAuth() auth: AuthContext) {
    return this.workspaceService.listMembers(auth.workspace!.id);
  }

  @Post('current/members/invite')
  @RequirePermissions(Permission.MEMBER_INVITE)
  invite(@CurrentAuth() auth: AuthContext, @Body() body: InviteMemberDto) {
    return this.workspaceService.invite(auth.workspace!.id, auth.user.id, body.email, body.role);
  }

  @Patch('current/members/:memberId/role')
  @RequirePermissions(Permission.MEMBER_ROLE_UPDATE)
  changeRole(
    @CurrentAuth() auth: AuthContext,
    @Param('memberId') memberId: string,
    @Body() body: ChangeRoleDto,
  ) {
    return this.workspaceService.changeRole(auth.workspace!.id, memberId, body.role);
  }

  @Patch('current/members/:memberId/permissions')
  @RequirePermissions(Permission.MEMBER_ROLE_UPDATE)
  setOverrides(
    @CurrentAuth() auth: AuthContext,
    @Param('memberId') memberId: string,
    @Body() body: PermissionOverridesDto,
  ) {
    return this.workspaceService.setPermissionOverrides(
      auth.workspace!.id,
      memberId,
      body.extraPermissions ?? [],
      body.deniedPermissions ?? [],
    );
  }

  @Delete('current/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MEMBER_REMOVE)
  async removeMember(@CurrentAuth() auth: AuthContext, @Param('memberId') memberId: string) {
    await this.workspaceService.removeMember(auth.workspace!.id, memberId, auth.user.id);
  }
}

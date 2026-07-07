import { ForbiddenException, Injectable } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';
import { PrismaService } from '@weevil/database';
import { DevTenant } from '@weevil/contracts';

export interface TenantContext {
  workspaceId: string;
  projectId: string;
}

@Injectable()
export class TenantResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Resolve tenant for an authenticated workspace. Picks the project by projectId if given,
   * else the workspace's first project, else creates a default one.
   */
  async resolveForWorkspace(workspaceId: string, projectId?: string): Promise<TenantContext> {
    if (projectId) {
      const project = await this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { id: true, workspaceId: true },
      });
      if (project.workspaceId !== workspaceId) {
        throw new Error('Project does not belong to the requested workspace.');
      }
      return { workspaceId, projectId: project.id };
    }
    const project = await this.prisma.project.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    if (project) return { workspaceId, projectId: project.id };
    const created = await this.prisma.project.create({
      data: { workspaceId, key: 'DEFAULT', name: 'Default' },
    });
    return { workspaceId, projectId: created.id };
  }

  async resolve(projectId?: string): Promise<TenantContext> {
    if (this.config.nodeEnv === 'production') {
      throw new ForbiddenException('Authentication is required to create reports.');
    }
    if (projectId) {
      const project = await this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { id: true, workspaceId: true },
      });

      return {
        workspaceId: project.workspaceId,
        projectId: project.id,
      };
    }

    const workspace = await this.prisma.workspace.upsert({
      where: { slug: DevTenant.WorkspaceSlug },
      create: {
        slug: DevTenant.WorkspaceSlug,
        name: DevTenant.WorkspaceName,
        projects: {
          create: {
            key: DevTenant.ProjectKey,
            name: DevTenant.ProjectName,
          },
        },
      },
      update: {},
      include: {
        projects: {
          where: { key: DevTenant.ProjectKey },
          take: 1,
        },
      },
    });

    const project =
      workspace.projects[0] ??
      (await this.prisma.project.create({
        data: {
          workspaceId: workspace.id,
          key: DevTenant.ProjectKey,
          name: DevTenant.ProjectName,
        },
      }));

    return {
      workspaceId: workspace.id,
      projectId: project.id,
    };
  }
}

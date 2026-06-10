import { Injectable } from '@nestjs/common';
import { PrismaService } from '@weevil/database';
import { DevTenant } from '@weevil/contracts';

export interface TenantContext {
  workspaceId: string;
  projectId: string;
}

@Injectable()
export class TenantResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(projectId?: string): Promise<TenantContext> {
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

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@weevil/database';
import { Prisma, ReportEventKind, ReportStatus, UploadStatus } from '@weevil/prisma-client';
import { StorageService } from '@weevil/storage';

@Injectable()
export class ArtifactProcessingService {
  private readonly logger = new Logger(ArtifactProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async processUpload(reportId: string, uploadId: string): Promise<void> {
    const upload = await this.prisma.reportUpload.findFirstOrThrow({
      where: {
        id: uploadId,
        reportId,
      },
      include: {
        report: true,
      },
    });

    await this.markProcessing(reportId, uploadId);

    try {
      const objectMetadata = await this.storage.getObjectMetadata(upload.bucket, upload.objectKey);

      await this.prisma.reportUpload.update({
        where: { id: uploadId },
        data: {
          status: UploadStatus.READY,
          byteSize: upload.byteSize ?? BigInt(objectMetadata.size),
          metadata: {
            ...(upload.metadata as Prisma.JsonObject | null),
            storage: {
              etag: objectMetadata.etag,
              size: objectMetadata.size,
              lastModified: objectMetadata.lastModified?.toISOString(),
            },
          },
        },
      });

      await this.markReportReadyWhenUploadsReady(reportId);

      this.logger.log(`Processed upload ${uploadId} for report ${reportId}`);
    } catch (error) {
      await this.markFailed(reportId, uploadId, error);
      throw error;
    }
  }

  private async markProcessing(reportId: string, uploadId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.reportUpload.update({
        where: { id: uploadId },
        data: { status: UploadStatus.PROCESSING },
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.PROCESSING_STARTED,
          payload: {
            uploadId,
          },
        },
      }),
    ]);
  }

  private async markReportReadyWhenUploadsReady(reportId: string): Promise<void> {
    const pendingUploads = await this.prisma.reportUpload.count({
      where: {
        reportId,
        status: {
          not: UploadStatus.READY,
        },
      },
    });

    if (pendingUploads > 0) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.bugReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.READY },
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.PROCESSING_COMPLETED,
        },
      }),
    ]);
  }

  private async markFailed(reportId: string, uploadId: string, error: unknown): Promise<void> {
    const failureReason = error instanceof Error ? error.message : 'Unknown processing failure';

    await this.prisma.$transaction([
      this.prisma.reportUpload.update({
        where: { id: uploadId },
        data: {
          status: UploadStatus.FAILED,
          failureReason,
        },
      }),
      this.prisma.bugReport.update({
        where: { id: reportId },
        data: {
          status: ReportStatus.FAILED,
          failureReason,
        },
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.PROCESSING_FAILED,
          payload: {
            uploadId,
            failureReason,
          },
        },
      }),
    ]);
  }
}

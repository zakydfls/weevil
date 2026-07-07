import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CompleteUploadDto,
  CreateUploadDto,
  QueueEventTypes,
  QueueRoutingKeys,
  UploadDefaults,
  type CreateUploadResponse,
  type DownloadUrlResponse,
} from '@weevil/contracts';
import { PrismaService } from '@weevil/database';
import {
  Prisma,
  ReportEventKind,
  ReportStatus,
  UploadKind,
  UploadStatus,
} from '@weevil/prisma-client';
import { QueueService } from '@weevil/queue';
import { StorageService } from '@weevil/storage';
import { nanoid } from 'nanoid';
import { extensionFromContentType } from '../domain/content-type-extension.map';
import {
  assertReportTokenAccess,
  assertWorkspaceAccess,
  type ReportAccessOptions,
} from './report-access';

const UPLOAD_ID_SIZE = 21;
const MIN_SCREEN_RECORDING_BYTES = 1_024;
const MAX_UPLOAD_BYTES_BY_KIND: Partial<Record<UploadKind, number>> = {
  [UploadKind.SCREEN_RECORDING]: 250 * 1024 * 1024,
  [UploadKind.SCREENSHOT]: 25 * 1024 * 1024,
  [UploadKind.HAR]: 50 * 1024 * 1024,
  [UploadKind.DOM_SNAPSHOT]: 25 * 1024 * 1024,
  [UploadKind.CONSOLE_LOGS]: 10 * 1024 * 1024,
  [UploadKind.NETWORK_LOGS]: 50 * 1024 * 1024,
  [UploadKind.OTHER]: 50 * 1024 * 1024,
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  async create(
    reportId: string,
    dto: CreateUploadDto,
    options: ReportAccessOptions = {},
  ): Promise<CreateUploadResponse> {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        shareToken: true,
        ingestToken: true,
      },
    });
    assertReportTokenAccess(report, options.reportToken);
    assertUploadSizeWithinLimit(dto.kind, dto.byteSize);

    const uploadId = nanoid(UPLOAD_ID_SIZE);
    const objectKey = this.storage.buildReportObjectKey({
      workspaceId: report.workspaceId,
      projectId: report.projectId,
      reportId: report.id,
      uploadId,
      extension: extensionFromContentType(dto.contentType),
    });

    await this.prisma.$transaction([
      this.prisma.reportUpload.create({
        data: {
          id: uploadId,
          reportId,
          kind: dto.kind,
          bucket: this.storage.recordingsBucket,
          objectKey,
          contentType: dto.contentType,
          byteSize: dto.byteSize ? BigInt(dto.byteSize) : undefined,
          checksumSha256: dto.checksumSha256,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      }),
      this.prisma.bugReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.UPLOADING },
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.UPLOAD_CREATED,
          payload: {
            uploadId,
            kind: dto.kind,
            contentType: dto.contentType,
          },
        },
      }),
    ]);

    const putUrl = await this.storage.createPutUrl(this.storage.recordingsBucket, objectKey);

    return {
      uploadId,
      objectKey,
      putUrl,
      expiresInSeconds: UploadDefaults.PresignedPutExpirySeconds,
    };
  }

  async complete(
    reportId: string,
    uploadId: string,
    dto: CompleteUploadDto,
    options: ReportAccessOptions = {},
  ): Promise<CreateUploadResponse['uploadId']> {
    const upload = await this.prisma.reportUpload.findFirstOrThrow({
      where: { id: uploadId, reportId },
      select: {
        id: true,
        kind: true,
        bucket: true,
        objectKey: true,
        report: {
          select: {
            workspaceId: true,
            shareToken: true,
            ingestToken: true,
          },
        },
      },
    });
    assertReportTokenAccess(upload.report, options.reportToken);
    const objectMetadata = await this.storage.getObjectMetadata(upload.bucket, upload.objectKey);

    if (upload.kind === 'SCREEN_RECORDING' && objectMetadata.size < MIN_SCREEN_RECORDING_BYTES) {
      throw new BadRequestException(
        `Uploaded screen recording is too small (${objectMetadata.size} bytes).`,
      );
    }
    try {
      assertUploadSizeWithinLimit(upload.kind, objectMetadata.size);
    } catch (error) {
      await this.storage.removeObject(upload.bucket, upload.objectKey).catch((removeError) => {
        this.logger.warn(
          `Failed to remove oversized upload ${uploadId}: ${formatError(removeError)}`,
        );
      });
      throw error;
    }

    if (dto.byteSize && dto.byteSize !== objectMetadata.size) {
      this.logger.warn(
        `Upload byte size mismatch for ${uploadId}: client=${dto.byteSize} storage=${objectMetadata.size}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.reportUpload.update({
        where: { id: uploadId },
        data: {
          status: UploadStatus.UPLOADED,
          byteSize: BigInt(objectMetadata.size),
          checksumSha256: dto.checksumSha256,
          completedAt: new Date(),
        },
      }),
      this.prisma.bugReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.PROCESSING },
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.UPLOAD_COMPLETED,
          payload: {
            uploadId,
          },
        },
      }),
    ]);

    this.queue.publishJson(QueueRoutingKeys.UploadCompleted, {
      eventType: QueueEventTypes.UploadCompleted,
      reportId,
      uploadId,
      occurredAt: new Date().toISOString(),
    });

    return uploadId;
  }

  async createDownloadUrl(
    reportId: string,
    uploadId: string,
    options: { workspaceId?: string } = {},
  ): Promise<DownloadUrlResponse> {
    const upload = await this.prisma.reportUpload.findFirstOrThrow({
      where: { id: uploadId, reportId },
      select: {
        bucket: true,
        objectKey: true,
        report: {
          select: {
            workspaceId: true,
          },
        },
      },
    });
    assertWorkspaceAccess(upload.report, options.workspaceId);

    return {
      getUrl: await this.storage.createGetUrl(upload.bucket, upload.objectKey),
      expiresInSeconds: UploadDefaults.PresignedGetExpirySeconds,
    };
  }

  async createDownloadUrlByShareToken(
    shareToken: string,
    uploadId: string,
  ): Promise<DownloadUrlResponse> {
    const upload = await this.prisma.reportUpload.findFirst({
      where: {
        id: uploadId,
        report: {
          shareToken,
          deletedAt: null,
        },
      },
      select: {
        bucket: true,
        objectKey: true,
      },
    });

    if (!upload) {
      throw new NotFoundException('Shared upload not found.');
    }

    return {
      getUrl: await this.storage.createGetUrl(upload.bucket, upload.objectKey),
      expiresInSeconds: UploadDefaults.PresignedGetExpirySeconds,
    };
  }
}

function assertUploadSizeWithinLimit(kind: UploadKind, byteSize: number | undefined): void {
  if (!byteSize) return;
  const maxBytes = MAX_UPLOAD_BYTES_BY_KIND[kind] ?? MAX_UPLOAD_BYTES_BY_KIND[UploadKind.OTHER]!;
  if (byteSize > maxBytes) {
    throw new BadRequestException(
      `${kind} upload is too large. Maximum allowed size is ${maxBytes} bytes.`,
    );
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

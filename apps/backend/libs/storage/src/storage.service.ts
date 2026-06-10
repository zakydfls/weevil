import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';
import { StorageKeySegments, UploadDefaults } from '@weevil/contracts';
import { Client } from 'minio';

interface BuildReportObjectKeyParams {
  workspaceId: string;
  projectId: string;
  reportId: string;
  uploadId: string;
  extension: string;
}

export interface StorageObjectMetadata {
  etag?: string;
  size: number;
  lastModified?: Date;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Client;

  constructor(private readonly config: AppConfigService) {
    this.client = new Client({
      endPoint: this.config.minioEndpoint,
      port: this.config.minioPort,
      useSSL: this.config.minioUseSsl,
      accessKey: this.config.minioAccessKey,
      secretKey: this.config.minioSecretKey,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucketExists(this.recordingsBucket);
    } catch (error) {
      this.logger.warn(
        `Storage bucket startup check failed for ${this.recordingsBucket}. ` +
          `The app will continue, but uploads may fail until storage credentials/endpoint are valid. ` +
          `Reason: ${this.formatError(error)}`,
      );
    }
  }

  get recordingsBucket(): string {
    return this.config.recordingsBucket;
  }

  buildReportObjectKey(params: BuildReportObjectKeyParams): string {
    const safeExtension = params.extension.replace(/^\./, '').toLowerCase() || 'bin';

    return [
      StorageKeySegments.Workspaces,
      params.workspaceId,
      StorageKeySegments.Projects,
      params.projectId,
      StorageKeySegments.Reports,
      params.reportId,
      StorageKeySegments.Uploads,
      `${params.uploadId}.${safeExtension}`,
    ].join('/');
  }

  async createPutUrl(bucket: string, objectKey: string): Promise<string> {
    return this.client.presignedPutObject(
      bucket,
      objectKey,
      UploadDefaults.PresignedPutExpirySeconds,
    );
  }

  async createGetUrl(bucket: string, objectKey: string): Promise<string> {
    return this.client.presignedGetObject(
      bucket,
      objectKey,
      UploadDefaults.PresignedGetExpirySeconds,
    );
  }

  async getObjectMetadata(bucket: string, objectKey: string): Promise<StorageObjectMetadata> {
    try {
      const stat = await this.client.statObject(bucket, objectKey);

      return {
        etag: stat.etag,
        size: stat.size,
        lastModified: stat.lastModified,
      };
    } catch (error) {
      this.logger.debug(
        `Falling back to presigned HEAD metadata lookup for ${bucket}/${objectKey}: ${this.formatError(error)}`,
      );
      return this.getObjectMetadataViaPresignedHead(bucket, objectKey);
    }
  }

  private async ensureBucketExists(bucket: string): Promise<void> {
    const exists = await this.client.bucketExists(bucket);

    if (exists) {
      return;
    }

    await this.client.makeBucket(bucket);
    this.logger.log(`Created storage bucket ${bucket}`);
  }

  private async getObjectMetadataViaPresignedHead(
    bucket: string,
    objectKey: string,
  ): Promise<StorageObjectMetadata> {
    const getUrl = await this.createGetUrl(bucket, objectKey);
    const response = await fetch(getUrl, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`Presigned HEAD failed with status ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const lastModified = response.headers.get('last-modified');

    return {
      etag: response.headers.get('etag') ?? undefined,
      size: contentLength ? Number(contentLength) : 0,
      lastModified: lastModified ? new Date(lastModified) : undefined,
    };
  }

  private formatError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unknown storage error';
    }

    const details = error as Error & {
      code?: string;
      statusCode?: number;
      amzRequestid?: string;
      amzBucketRegion?: string;
    };
    const parts = [
      details.message || details.name,
      details.code ? `code=${details.code}` : null,
      details.statusCode ? `status=${details.statusCode}` : null,
      details.amzRequestid ? `requestId=${details.amzRequestid}` : null,
      details.amzBucketRegion ? `region=${details.amzBucketRegion}` : null,
    ].filter(Boolean);

    return parts.join(' ');
  }
}

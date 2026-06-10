import { UploadKind } from '@weevil/prisma-client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUploadDto {
  @IsEnum(UploadKind)
  kind: UploadKind;

  @IsString()
  @MaxLength(160)
  contentType: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  byteSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksumSha256?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CompleteUploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksumSha256?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  byteSize?: number;
}

export interface CreateUploadResponse {
  uploadId: string;
  objectKey: string;
  putUrl: string;
  expiresInSeconds: number;
}

export interface DownloadUrlResponse {
  getUrl: string;
  expiresInSeconds: number;
}

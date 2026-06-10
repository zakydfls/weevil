import {
  BackendTraceStatus,
  ConsoleLogLevel,
  DomEventKind,
  PageActionKind,
  PerformanceEntryKind,
  RuntimeErrorKind,
} from '@weevil/prisma-client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConsoleLogEntryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsEnum(ConsoleLogLevel)
  level: ConsoleLogLevel;

  @IsString()
  @MaxLength(8000)
  message: string;

  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  @Type(() => Date)
  @IsDate()
  timestamp: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs?: number;
}

export class AttachConsoleLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsoleLogEntryDto)
  entries: ConsoleLogEntryDto[];
}

export class NetworkRequestEntryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  requestId?: string;

  @IsString()
  @MaxLength(16)
  method: string;

  @IsString()
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  durationMs?: number;

  @IsOptional()
  @IsObject()
  requestHeaders?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  responseHeaders?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  requestBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  responseBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  error?: string;

  @Type(() => Date)
  @IsDate()
  startedAt: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endedAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs?: number;
}

export class AttachNetworkRequestsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NetworkRequestEntryDto)
  entries: NetworkRequestEntryDto[];
}

export class PageActionEntryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsEnum(PageActionKind)
  kind: PageActionKind;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  selector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  nodePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tagName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  textPreview?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  valuePreview?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  x?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  y?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  scrollX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  scrollY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs?: number;

  @Type(() => Date)
  @IsDate()
  occurredAt: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AttachPageActionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageActionEntryDto)
  entries: PageActionEntryDto[];
}

export class RuntimeErrorEntryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsEnum(RuntimeErrorKind)
  kind: RuntimeErrorKind;

  @IsString()
  @MaxLength(8000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  sourceUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  lineNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  columnNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  componentStack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs?: number;

  @Type(() => Date)
  @IsDate()
  occurredAt: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AttachRuntimeErrorsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuntimeErrorEntryDto)
  entries: RuntimeErrorEntryDto[];
}

export class PerformanceEntryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsEnum(PerformanceEntryKind)
  kind: PerformanceEntryKind;

  @IsString()
  @MaxLength(500)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  value?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  startTimeMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  rating?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  initiatorType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs?: number;

  @Type(() => Date)
  @IsDate()
  occurredAt: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AttachPerformanceEntriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceEntryDto)
  entries: PerformanceEntryDto[];
}

export class DomEventEntryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsEnum(DomEventKind)
  kind: DomEventKind;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  selector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  nodePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mutationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  previousValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  nextValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs?: number;

  @Type(() => Date)
  @IsDate()
  occurredAt: Date;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AttachDomEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DomEventEntryDto)
  entries: DomEventEntryDto[];
}

export class BackendTraceEntryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  traceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  spanId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  parentSpanId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  serviceName?: string;

  @IsString()
  @MaxLength(240)
  operationName: string;

  @IsOptional()
  @IsEnum(BackendTraceStatus)
  status?: BackendTraceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(3_600_000)
  durationMs?: number;

  @Type(() => Date)
  @IsDate()
  startedAt: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endedAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AttachBackendTracesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackendTraceEntryDto)
  entries: BackendTraceEntryDto[];
}

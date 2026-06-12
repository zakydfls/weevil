import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@weevil/prisma-client';

/**
 * Translate Prisma errors into proper HTTP responses so the client gets a
 * meaningful status code (and useful message in dev) instead of an opaque 500.
 *
 * Covered codes:
 *   P2002 — unique constraint violation                → 409 Conflict
 *   P2003 — foreign key constraint failed              → 409 Conflict
 *   P2014 — invalid relation (required relation missing) → 409 Conflict
 *   P2025 — record not found (findUniqueOrThrow, etc.) → 404 Not Found
 *   P1000 — auth failed against DB                     → 500 (developer error, but logged)
 *   P1001 — can't reach DB                             → 503 Service Unavailable
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PrismaExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error.';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Resource not found.';
          break;
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'A record with that value already exists.';
          break;
        case 'P2003':
        case 'P2014':
          status = HttpStatus.CONFLICT;
          message = 'Referenced record is invalid or missing.';
          break;
        case 'P1001':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'Database is unreachable.';
          break;
        default:
          this.logger.error(`Unhandled Prisma code ${exception.code}`, exception.message);
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid query payload.';
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Database connection could not be established.';
    }

    if (status >= 500) {
      this.logger.error(exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(process.env.NODE_ENV !== 'production' && exception instanceof Error
        ? { detail: exception.message }
        : {}),
    });

    // Pass-through for non-Prisma errors. (Shouldn't fire — @Catch restricts.)
    if (
      !(exception instanceof Prisma.PrismaClientKnownRequestError) &&
      !(exception instanceof Prisma.PrismaClientValidationError) &&
      !(exception instanceof Prisma.PrismaClientInitializationError) &&
      exception instanceof HttpException
    ) {
      throw exception;
    }
  }
}

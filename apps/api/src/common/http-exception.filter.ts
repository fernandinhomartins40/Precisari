import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@precisari/shared';

const STATUS_CODE: Record<number, string> = {
  400: ErrorCode.VALIDATION,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
  501: ErrorCode.NOT_IMPLEMENTED,
};

/** Normalizes every error to { code, message, details }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'code' in body) {
        const b = body as { code: string; message?: string; details?: unknown };
        res.status(status).json({ code: b.code, message: b.message ?? exception.message, details: b.details });
        return;
      }
      res.status(status).json({ code: STATUS_CODE[status] ?? 'HTTP_ERROR', message: exception.message });
      return;
    }
    this.logger.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: ErrorCode.INTERNAL, message: 'Erro inesperado' });
  }
}

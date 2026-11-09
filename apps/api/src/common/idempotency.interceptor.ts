import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { Observable, from, of, switchMap } from 'rxjs';
import { ErrorCode } from '@precisari/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from './app-error';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const KEY_RE = /^[A-Za-z0-9._:-]{1,200}$/;

/**
 * Idempotency for POST actions (docs/prd.md §8.4). Apply with `@UseInterceptors(IdempotencyInterceptor)`.
 * When the request carries `Idempotency-Key`, the first successful response is stored in `IdempotencyKey`
 * (scoped by user + method + path) and replayed verbatim for later requests with the same key.
 * Errors are not stored, so a failed request can be retried with the same key.
 * Works for unauthenticated routes too (e.g. webhooks): the scope then uses "anonymous".
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: { id: string } }>();
    const res = http.getResponse<Response>();
    const header = req.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) return next.handle();
    if (!KEY_RE.test(key)) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Idempotency-Key inválida');
    }
    const userId = req.user?.id ?? 'anonymous';
    const route = `${req.method} ${req.path}`;

    return from(this.prisma.idempotencyKey.findUnique({ where: { key_userId_route: { key, userId, route } } })).pipe(
      switchMap((stored) => {
        if (stored) {
          res.status(stored.statusCode);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(stored.response === null ? undefined : stored.response);
        }
        return next.handle().pipe(
          switchMap((body: unknown) =>
            from(this.store(key, userId, route, res.statusCode, body).then(() => body)),
          ),
        );
      }),
    );
  }

  private async store(key: string, userId: string, route: string, statusCode: number, body: unknown): Promise<void> {
    const response = (body === undefined ? Prisma.JsonNull : JSON.parse(JSON.stringify(body))) as Prisma.InputJsonValue;
    try {
      await this.prisma.idempotencyKey.create({ data: { key, userId, route, statusCode, response } });
    } catch (err) {
      // A concurrent request with the same key won the race — keep the first stored response.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }
}

import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, createParamDecorator } from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { Request } from 'express';
import { ErrorCode } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { AccessTokenClaims, AuthUser } from './auth.types';

type AuthedRequest = Request & { user?: AuthUser };

/** Verifies `Authorization: Bearer <jwt>` (HS256, JWT_ACCESS_SECRET) and sets req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Faça login para continuar');
    try {
      const { payload } = await jwtVerify(header.slice(7), new TextEncoder().encode(this.env.JWT_ACCESS_SECRET), {
        algorithms: ['HS256'],
      });
      const c = payload as unknown as AccessTokenClaims;
      req.user = { id: c.sub, email: c.email, role: c.role };
      return true;
    } catch {
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Sessão expirada');
    }
  }
}

/** Use after JwtAuthGuard: @UseGuards(JwtAuthGuard, AdminGuard). */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.role !== 'ADMIN') throw new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Acesso restrito');
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Faça login para continuar');
  return req.user;
});

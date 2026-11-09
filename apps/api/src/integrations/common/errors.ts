import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@precisari/shared';
import { AppError } from '../../common/app-error';
import { IntegrationError } from './http';

/** Error code for upstream (third-party) failures. */
export const UPSTREAM_ERROR = 'UPSTREAM_ERROR';

/** Map adapter errors to the API error envelope. */
export function toAppError(err: unknown, notFoundMessage = 'Não encontrado'): unknown {
  if (!(err instanceof IntegrationError)) return err;
  if (err.status === 404) return new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, notFoundMessage);
  if (err.status === 422) return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION, 'Endereço fora do Brasil ou incompleto');
  return new AppError(HttpStatus.BAD_GATEWAY, UPSTREAM_ERROR, 'Serviço externo indisponível, tente de novo', { integration: err.integration });
}

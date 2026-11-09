import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { ErrorCode } from '@precisari/shared';

/** Validates body/query/params with a Zod schema; errors map to { code: VALIDATION_ERROR, details }. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION,
        message: 'Dados inválidos',
        details: r.error.flatten(),
      });
    }
    return r.data as z.infer<T>;
  }
}

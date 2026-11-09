import { HttpException, HttpStatus } from '@nestjs/common';

/** Throw domain errors as `new AppError(status, code, message, details?)`. */
export class AppError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super({ code, message, details }, status);
  }
}

import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { DATA_CIPHER, dataCipherProvider } from './cipher.provider';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { PlanService } from './plan.service';

/** Cross-cutting services: audit log, plan limits, data cipher, idempotency (reusable by billing). */
@Global()
@Module({
  providers: [AuditService, PlanService, dataCipherProvider, IdempotencyInterceptor],
  exports: [AuditService, PlanService, DATA_CIPHER, IdempotencyInterceptor],
})
export class CommonModule {}

import { Global, Module } from '@nestjs/common';
import { JobsRegistry } from './jobs.registry';
import { JobQueueService } from './job-queue.service';
import { JobWorkerRunner } from './job-worker.runner';

@Global()
@Module({
  providers: [JobsRegistry, JobQueueService, JobWorkerRunner],
  exports: [JobsRegistry, JobQueueService, JobWorkerRunner],
})
export class JobsModule {}

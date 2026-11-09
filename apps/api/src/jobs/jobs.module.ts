import { Global, Module } from '@nestjs/common';
import { JobsRegistry } from './jobs.registry';
import { JobQueueService } from './job-queue.service';

@Global()
@Module({ providers: [JobsRegistry, JobQueueService], exports: [JobsRegistry, JobQueueService] })
export class JobsModule {}

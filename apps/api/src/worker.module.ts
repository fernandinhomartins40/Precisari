import { Module } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Worker = the AppModule graph started as an application context (no HTTP listener), so every module that
 * registers job handlers in onModuleInit (core and integrations) is available to the worker automatically.
 */
@Module({ imports: [AppModule] })
export class WorkerModule {}

import 'reflect-metadata';
import { loadDotenv } from './config/load-dotenv';

loadDotenv();

/**
 * Worker entrypoint (docs/prd.md §8.2/§8.5): same code as the API, no HTTP server.
 * Starts a BullMQ Worker per registered queue and upserts the repeatable schedules.
 */
async function bootstrap(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { Logger } = await import('nestjs-pino');
  const { WorkerModule } = await import('./worker.module');
  const { JobWorkerRunner } = await import('./jobs/job-worker.runner');
  const { loadEnv } = await import('./config/env');

  const env = loadEnv();
  if (!env.JOBS_ENABLED) {
    console.error('JOBS_ENABLED=false — the worker needs Redis/BullMQ. Set JOBS_ENABLED=true to run it.');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const runner = app.get(JobWorkerRunner);
  await runner.start();

  const shutdown = async (signal: string): Promise<void> => {
    app.get(Logger).log(`${signal} received, closing worker`);
    await runner.stop();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}
void bootstrap();

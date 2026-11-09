import 'reflect-metadata';
import { loadDotenv } from './config/load-dotenv';

loadDotenv();

async function bootstrap(): Promise<void> {
  // Imported after .env is loaded so module factories see the final environment.
  const { NestFactory } = await import('@nestjs/core');
  const { Logger } = await import('nestjs-pino');
  const { AppModule } = await import('./app.module');
  const { configureApp } = await import('./bootstrap');
  const { loadEnv } = await import('./config/env');

  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, env);
  await app.listen(env.API_PORT);
  app.get(Logger).log(`API listening on :${env.API_PORT} (docs at /docs)`);
}
void bootstrap();

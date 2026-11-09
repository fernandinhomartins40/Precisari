import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  app.enableCors({ origin: env.CORS_ORIGINS.split(','), credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(env.API_PORT);
}
void bootstrap();

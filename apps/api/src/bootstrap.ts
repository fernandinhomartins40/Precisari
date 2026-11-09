import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@precisari/shared';
import { HttpExceptionFilter } from './common/http-exception.filter';
import type { Env } from './config/env';

/** Shared HTTP setup for main.ts and the integration tests. */
export function configureApp(app: INestApplication, env: Env, opts: { swagger?: boolean } = {}): void {
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  if (opts.swagger !== false) setupSwagger(app, env);
}

/** OpenAPI at /docs (UI) and /docs-json. Request/response shapes live in @precisari/shared (Zod). */
export function setupSwagger(app: INestApplication, env: Env): void {
  const config = new DocumentBuilder()
    .setTitle('Precisari API')
    .setDescription('API REST do Precisari (prefixo /v1). Contratos Zod em @precisari/shared; erros no formato { code, message, details }.')
    .setVersion('0.1.0')
    .addServer(env.API_PUBLIC_URL)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
}

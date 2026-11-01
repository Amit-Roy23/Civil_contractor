// costing and dates follow Indian business days, whatever the host's clock is set to
process.env.TZ = process.env.BUSINESS_TZ || 'Asia/Kolkata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { validateEnv } from './core/config/env.validation.js';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FieldMaskingInterceptor } from './core/interceptors/field-masking.interceptor.js';

async function bootstrap() {
  // 1. Fail-fast environment validation
  validateEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Excel imports, logos and signature images are larger than the 100 KB default
  app.useBodyParser('json', { limit: process.env.BODY_LIMIT || '10mb' });

  // 2. Structured logging
  const logger = app.get(Logger);
  app.useLogger(logger);

  // 3. Middlewares
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    // comma-separated list, e.g. "https://wcm.vercel.app,http://localhost:5173"
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
  });

  // 4. Global Interceptors (ROLE-03: Rate & Amount masking)
  app.useGlobalInterceptors(new FieldMaskingInterceptor());

  // 5. Global API Prefix (exclude root redirect and health check)
  app.setGlobalPrefix('api', {
    exclude: ['/', 'health'],
  });

  // 6. OpenAPI / Swagger Documentation at /api/docs
  const config = new DocumentBuilder()
    .setTitle('Civil Contractor Works ERP API')
    .setDescription(
      'Production-Grade Works Contract Management ERP for Indian Road & Civil Contractors',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Civil Contractor ERP API running on http://localhost:${port}/api`);
  logger.log(`📖 OpenAPI documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();

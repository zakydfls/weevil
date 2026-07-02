import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '@weevil/config';
import { API_PREFIX, ApiRoutes } from '@weevil/contracts';
import helmet from 'helmet';
import { ApiModule } from './api.module';
import { PrismaExceptionFilter } from './prisma-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApiModule);
  const config = app.get(AppConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  // Lock CORS to configured browser origins by default. ENABLE_CORS=false is
  // an emergency/debug bypass that reflects any origin while still emitting
  // credentials-capable CORS headers.
  const browserOrigins = config.browserOrigins;
  app.enableCors({
    origin: !config.enableCors || browserOrigins.length === 0 ? true : browserOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  if (config.nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Weevil API')
      .setDescription('Backend API for bug recording reports, uploads, and telemetry.')
      .setVersion('0.1.0')
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(ApiRoutes.Docs, app, swaggerDocument);
  }

  app.enableShutdownHooks();

  await app.listen(config.apiPort);

  Logger.log(`API listening on http://localhost:${config.apiPort}/${API_PREFIX}`, 'Bootstrap');
}

void bootstrap();

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
  // Lock CORS to the configured web origin(s) in prod; reflect any origin when
  // WEB_ORIGIN is unset (dev). credentials:true is required for the session cookie.
  const webOrigins = config.webOrigins;
  app.enableCors({
    origin: webOrigins.length > 0 ? webOrigins : true,
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

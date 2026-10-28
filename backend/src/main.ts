// src/main.ts
import * as dotenv from 'dotenv';
dotenv.config(); // Carga el .env de forma forzosa

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { MicroserviceOptions } from '@nestjs/microservices';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { buildNotificacionesServerOptions } from './auth/messaging/rabbitmq.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás de Gateway / balanceador: el rate limit debe usar la IP real del
  // cliente (X-Forwarded-For) y no la del proxy. Se confía solo en N saltos
  // para que un cliente no pueda falsificar su IP.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.set('trust proxy', trustProxyHops);

  // Parsear cookies HttpOnly (cookie de sesión: "jwt")
  app.use(cookieParser());

  // Validación automática de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configuración de CORS
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      frontendUrl,
    ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization, x-api-key, Cookie',
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Microservicio Auth')
    .setDescription('Documentación de la API de Autenticación para TITEC')
    .setVersion('1.0')
    .addCookieAuth('jwt')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'x-api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Listener híbrido RabbitMQ: notificaciones.events -> correo_auth
  app.connectMicroservice<MicroserviceOptions>(buildNotificacionesServerOptions());

  // HTTP primero: si RabbitMQ no está disponible, /internal/validar-sesion
  // sigue respondiendo a Panel y Entradas.
  const port = process.env.PORT || 10000;
  await app.listen(port);
  logger.log(`Backend de Autenticación corriendo en el puerto ${port} (trust proxy = ${trustProxyHops})`);
  logger.log(`Documentación Swagger disponible en http://localhost:${port}/api/docs`);

  app
    .startAllMicroservices()
    .then(() => logger.log('Listener RabbitMQ (notificaciones.events -> correo_auth) activo'))
    .catch((error: unknown) =>
      logger.error(
        `No se pudo iniciar el listener RabbitMQ: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
}
bootstrap();

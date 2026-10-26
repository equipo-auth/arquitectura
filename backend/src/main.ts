import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { MicroserviceOptions } from '@nestjs/microservices';
import { buildNotificacionesServerOptions } from './auth/messaging/rabbitmq.config';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parsear cookies HttpOnly
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
    allowedHeaders: 'Content-Type, Accept, Authorization, x-api-key',
  });

  // Configuracion del swagger
  const config = new DocumentBuilder()
    .setTitle('Microservicio Auth')
    .setDescription('Documentación de la API de Autenticación para TITEC')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Listener híbrido: notificaciones.events -> correo_auth
  app.connectMicroservice<MicroserviceOptions>(buildNotificacionesServerOptions());
  await app.startAllMicroservices();

  const port = process.env.PORT || 10000;
  await app.listen(port);
  console.log(`Backend de Autenticación corriendo en el puerto ${port}`);
  console.log(`Documentación Swagger disponible en http://localhost:${port}/api/docs`);
}
bootstrap();

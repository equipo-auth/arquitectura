import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Middleware para parsear cookies HttpOnly
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
      'https://illustrious-bienenstitch-b47d01.netlify.app',
      frontendUrl,
    ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization, x-api-key',
  });

  const port = process.env.PORT || 10000;
  await app.listen(port);
  console.log(`Backend de Autenticación corriendo en el puerto ${port}`);
}
bootstrap();

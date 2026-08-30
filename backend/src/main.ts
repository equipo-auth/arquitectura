import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Crea la aplicación de NestJS basado en el módulo principal
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173', // Prueba en local
      'https://illustrious-bienenstitch-b47d01.netlify.app' // Prueba en la web
    ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  // Puerto dinámico render
  const port = process.env.PORT || 10000;

  // Encender el servidor para escuchar peticiones
  await app.listen(port);
  console.log(`Backend corriendo en el puerto ${port}`);
}
bootstrap();

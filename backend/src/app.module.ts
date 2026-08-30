import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
// Constructor principal de NestJS
@Module({
  imports: [AuthModule], //Aqui van los módulos que se vayan creando
  controllers: [AppController], //Aqui los archivos que reciben las peticiones HTTP (las rutas)
  providers: [], // Aqui van los "servicios"
})
export class AppModule {}

import { Controller, Get } from '@nestjs/common';

//Definir todas las rutas sean con /api
@Controller('api')
export class AppController {
    
  // Crear la ruta "health" para saber si el servidor no se ha caido
  @Get('health') 
  checkHealth() {

    return {
      status: 'OK',
      message: 'Auth funcionando',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString() //Hora exacta del servidor
    };
  }
  
}

import { Controller, Post, Body, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response } from 'express';

@Controller('api/auth')
export class AuthController {
  // Conectar el servicio AuthService para poder usar las funciones
  constructor(private readonly authService: AuthService) {}

  //Aqui añade los endpoints, usa @Body() para recibir los datos
  //del frontend y @Res() para enviar la cookie
  

  // POST /api/auth/register
  @Post('register')
  async register(@Body() body: any) {
    // Aqui pones la lógica para recibir el id,rut, email, etc
    // Guardalorlo en Neon DB usando Prisma y encriptar password con bcrypt
    return { message: 'Endpoint de registro listo para empezar a programarlo'};
  }

  // POST /api/auth/login
  @Post('login')
  async login(@Body() body: any, @Res({ passthrough: true}) response: Response) {
    // Aqui verificas el bcrypt, firmas el JWT y seteas la cookie HttpOnly
    // Recuerda que el token no se manda en el body, se manda en la cookie
  return { message: 'Endpoint de login listo para programarlo' };
  } 

  // POST /api/auth/recover
  @Post('recover')
  async recover(@Body() body: any) {
    // 1) Validar que el email exista en la BD 
    // 2) Generar el TokenRecuperación y guardarlo asociado al usuario
    // 3) Arma la URL temporal: estilo https://[URL_DEL_FRONT]/recover?token=xyz
    // 4) Recuerda Emitir el evento (ej: 'enviar_correo_recuperacion') a la cola de notificaciones
    // mandando el email del usuario y la URL temporal
    return { 
      status: 'OK',
      message: 'Endpoint de recuperar la contraseña listo para programarlo'};
  }
}

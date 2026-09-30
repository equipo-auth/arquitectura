import { Controller, Post, Body, Res, HttpCode, HttpStatus, UnauthorizedException, Get, UseGuards, Req, Header } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UpdatePasswordDto } from './dto/auth.dto';

export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      console.warn(`[JwtAuthGuard] Bloqueo de acceso: ${info?.message || err?.message || 'Token inválido'}`);
      throw err || new UnauthorizedException('Acceso no autorizado');
    }
    return user;
  }
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);

    if (result.requirePasswordChange) {
      const rawToken = await this.authService.generatePasswordResetToken(result.user.uuid);

      res.status(HttpStatus.FORBIDDEN); 
      return { 
        message: 'Acción requerida: Primer inicio, debe cambiar su clave.',
        action: 'REDIRECT',
        url: `/crear-clave?token=${rawToken}`
      };
    } 

    res.cookie('jwt_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict',
      maxAge: result.expiresInMs,
    });

    return { message: 'Inicio de sesión exitoso' };
  }

  @Post('update-password')
  @HttpCode(HttpStatus.OK)
  async updatePassword(@Body() dto: UpdatePasswordDto) {
    return this.authService.updateStaffPassword(dto.token, dto.newPassword);
  }

  // HU-B6 y Contrato de Integración: Introspección Centralizada
  @UseGuards(JwtAuthGuard)
  @Get('validar-sesion')
  @Header('Cache-Control', 'no-store')
  async validarSesion(@Req() req) {
    return this.authService.getPerfilValido(req.user.uuid);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jwt_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    
    return { status: 'OK', message: 'Sesión cerrada localmente' };
  }
}

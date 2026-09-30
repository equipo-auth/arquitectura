import { Controller, Post, Body, Res, HttpCode, HttpStatus, UnauthorizedException, Get, UseGuards, Req, Header } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UpdatePasswordDto } from './dto/auth.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';

export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      console.warn(`[JwtAuthGuard] Bloqueo de acceso: ${info?.message || err?.message || 'Token inválido'}`);
      throw err || new UnauthorizedException('Acceso no autorizado');
    }
    return user;
  }
}

@ApiTags('Autenticación')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'HU-B1: Registrar nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente. Se genera UUID v4 y token_version 0.' })
  @ApiResponse({ status: 409, description: 'Conflicto de unicidad: RUT o email ya existen.' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HU-B2: Iniciar sesión y emitir JWT RS256' })
  @ApiResponse({ status: 200, description: 'Login exitoso. Payload con sub, rol y token_version enviado en cookie HttpOnly, Secure, SameSite=Strict.' })
  @ApiResponse({ status: 401, description: 'Prevención de descubrimiento: Email inexistente o contraseña incorrecta.' })
  @ApiResponse({ status: 403, description: 'Intercepción: Acción requerida UPDATE_PASSWORD en Keycloak.' })
  @ApiResponse({ status: 429, description: 'Bloqueo por demasiados intentos fallidos.' })
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
  @ApiOperation({ summary: 'Completar cambio obligatorio de contraseña (Flujo Interceptado)' })
  @ApiResponse({ status: 200, description: 'Clave actualizada en Keycloak y base de datos.' })
  async updatePassword(@Body() dto: UpdatePasswordDto) {
    return this.authService.updateStaffPassword(dto.token, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('validar-sesion')
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'HU-B6: Contrato centralizado de sesión' })
  @ApiResponse({ status: 200, description: 'Sesión válida. Retorna objeto normalizado según Contrato de Integración.' })
  @ApiResponse({ status: 401, description: 'Token faltante, expirado o revocado.' })
  async validarSesion(@Req() req) {
    return this.authService.getPerfilValido(req.user.uuid);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HU-B3: Destrucción de cookie de sesión activa' })
  @ApiResponse({ status: 200, description: 'Instruye al navegador a destruir la cookie HttpOnly.' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jwt_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    
    return { status: 'OK', message: 'Sesión cerrada localmente' };
  }
}

import { Controller, Post, Body, Res, HttpCode, HttpStatus, UnauthorizedException, Get, UseGuards, Req, Header } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UpdatePasswordDto, RecoverDto, ResetPasswordDto, ValidateTokenDto } from './dto/auth.dto';
import { ProvisionDto } from './dto/provision.dto';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';

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
  @ApiResponse({ status: 403, description: 'Intercepción: primer_inicio=true (UPDATE_PASSWORD en Keycloak), o rol sin acceso al portal administrativo cuando admin=true.' })
  @ApiResponse({ status: 429, description: 'Bloqueo por demasiados intentos fallidos.' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);

    if (result.requirePasswordChange) {
      // No emitir un token de cambio de clave desde un login fallido.
      // El usuario debe utilizar su invitación o recuperación por correo.
      res.status(HttpStatus.FORBIDDEN);
      return {
        message: 'Debe configurar su contraseña desde la invitación recibida.',
        primer_inicio: true,
        action: 'REDIRECT',
        url: '/recuperar',
      };
    } 

    res.cookie('jwt', result.token, {
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

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HU-B5: Solicitar recuperación de contraseña' })
  @ApiResponse({ status: 200, description: 'Respuesta genérica (200 OK) para evitar enumeración de usuarios.' })
  async recoverPassword(@Body() recoverDto: RecoverDto) {
    // Falla silenciosa y asíncrona para no exponer tiempos de respuesta ni confirmar el email
    this.authService.processRecovery(recoverDto.email).catch(console.error);
    
    return { message: 'Si el correo existe, se han enviado las instrucciones.' };
  }

  @Post('validar-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HU-F4: Validar enlace de restablecimiento / creación de clave sin consumirlo' })
  @ApiResponse({ status: 200, description: 'El token existe, no está usado y no ha expirado.' })
  @ApiResponse({ status: 401, description: 'Token inválido, usado o expirado (respuesta genérica).' })
  async validarToken(@Body() dto: ValidateTokenDto) {
    return this.authService.validateResetToken(dto.token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HU-B5: Restablecer contraseña con token de un solo uso' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada y sesiones anteriores invalidadas mediante token_version.' })
  @ApiResponse({ status: 401, description: 'Token inválido o ya consumido.' })
  @ApiResponse({ status: 410, description: 'El token ha expirado.' })
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    await this.authService.resetPassword(resetDto.token, resetDto.nueva_clave);
    return { message: 'Contraseña actualizada exitosamente.' };
  }

  @Post('provision')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalApiKeyGuard)
  @ApiOperation({ summary: 'Endpoint interno de sincronización de respaldo (normalmente automático)' })
  @ApiResponse({ status: 201, description: 'Espejo con UUID nativo de Keycloak. Evento cuenta_staff publicado en auth.events.' })
  @ApiResponse({ status: 400, description: 'Email inválido o perfil/rol incompleto en Keycloak.' })
  @ApiResponse({ status: 403, description: 'Solo servicios internos con x-api-key.' })
  @ApiResponse({ status: 409, description: 'Email, RUT o UUID ya registrados.' })
  async provision(@Body() dto: ProvisionDto) {
    return this.authService.provisionStaff(dto);
  }

  @Post('provision/reenviar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalApiKeyGuard)
  @ApiOperation({ summary: 'Reenviar invitación de STAFF/ORGANIZADOR pendiente de activación' })
  @ApiResponse({ status: 200, description: 'Invitación encolada para publicación fiable: {programada: true}.' })
  @ApiResponse({ status: 403, description: 'API key inválida o cuenta no elegible.' })
  async reenviarInvitacionStaff(@Body() dto: RecoverDto) {
    return this.authService.reenviarInvitacionStaff(dto.email);
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
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    
    return { status: 'OK', message: 'Sesión cerrada localmente' };
  }
}

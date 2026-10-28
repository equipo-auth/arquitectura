// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
  Header,
} from '@nestjs/common';
import { CookieOptions, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiHeader } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  UpdatePasswordDto,
  RecoverDto,
  ResetPasswordDto,
  ValidateTokenDto,
} from './dto/auth.dto';
import { ProvisionDto } from './dto/provision.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SESSION_COOKIE, SessionUser } from './jwt.strategy';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';

const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
});

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
  @ApiResponse({ status: 200, description: 'Login exitoso. JWT en cookie "jwt" HttpOnly, Secure, SameSite=Strict.' })
  @ApiResponse({ status: 401, description: 'Prevención de descubrimiento: Email inexistente o contraseña incorrecta.' })
  @ApiResponse({ status: 403, description: 'Intercepción: primer_inicio=true (UPDATE_PASSWORD en Keycloak), o rol sin acceso al portal administrativo cuando admin=true.' })
  @ApiResponse({ status: 429, description: 'Bloqueo por demasiados intentos fallidos.' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);

    if (result.requirePasswordChange) {
      const rawToken = await this.authService.generatePasswordResetToken(result.user.uuid);

      res.status(HttpStatus.FORBIDDEN);
      return {
        message: 'Acción requerida: Primer inicio, debe cambiar su clave.',
        primer_inicio: true,
        action: 'REDIRECT',
        url: `/crear-clave?token=${rawToken}`,
      };
    }

    res.cookie(SESSION_COOKIE, result.token, {
      ...sessionCookieOptions(),
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
  recoverPassword(@Body() recoverDto: RecoverDto) {
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
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    await this.authService.resetPassword(resetDto.token, resetDto.nueva_clave);
    return { message: 'Contraseña actualizada exitosamente.' };
  }

  @Post('provision')
  @HttpCode(HttpStatus.CREATED)
  @SkipThrottle()
  @UseGuards(InternalApiKeyGuard)
  @ApiHeader({ name: 'x-api-key', required: true, description: 'Clave de servicio interno (INTERNAL_API_KEY)' })
  @ApiOperation({ summary: 'HU-B4: Provisión interna de cuentas ORGANIZADOR / STAFF (BD → Keycloak → RabbitMQ)' })
  @ApiResponse({ status: 201, description: 'Cuenta creada en BD y Keycloak. Evento cuenta_staff publicado en auth.events.' })
  @ApiResponse({ status: 400, description: 'Payload inválido (RUT, email, nombre, rol o creado_por_id).' })
  @ApiResponse({ status: 403, description: 'x-api-key ausente o inválida, o creado_por_id sin rol ORGANIZADOR/STAFF.' })
  @ApiResponse({ status: 409, description: 'RUT o email ya registrados (en BD o en Keycloak).' })
  @ApiResponse({ status: 500, description: 'Keycloak falló: la BD se revirtió y no se publicó el evento.' })
  async provision(@Body() dto: ProvisionDto) {
    return this.authService.provisionStaff(dto);
  }

  @Get('validar-sesion')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: 'HU-B6: Sesión del Frontend (mismo formato que /internal/validar-sesion)' })
  @ApiResponse({ status: 200, description: 'Sesión válida. Retorna objeto normalizado según Contrato de Integración.' })
  @ApiResponse({ status: 401, description: 'Token faltante, expirado o revocado.' })
  async validarSesion(@Req() req: { user: SessionUser }) {
    return this.authService.getPerfilValido(req.user.uuid);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({ summary: 'HU-B3: Destrucción de cookie de sesión activa' })
  @ApiResponse({ status: 200, description: 'Instruye al navegador a destruir la cookie HttpOnly "jwt".' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { status: 'OK', message: 'Sesión cerrada localmente' };
  }
}

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response, Request } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ProvisionDto } from './dto/provision.dto';
import { RecoverDto } from './dto/recover.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RevokeSessionDto } from './dto/revoke-session.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // HU-B1: API de Registro (POST /api/auth/register)
  @Post('api/auth/register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // HU-B2: API de Login (POST /api/auth/login)
  @Post('api/auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(dto, response);
  }

  // HU-B3: API de Cierre de Sesión (POST /api/auth/logout)
  @Post('api/auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    return this.authService.logout(response);
  }

  // HU-B4: API de Provisión de Cuentas (POST /api/auth/provision)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ORGANIZADOR')
  @Post('api/auth/provision')
  @HttpCode(HttpStatus.CREATED)
  async provisionUser(@Body() dto: ProvisionDto, @Req() req: any) {
    return this.authService.provisionUser(dto, req.user);
  }

  // HU-B5: Solicitud de Recuperación de Contraseña (POST /api/auth/recover)
  @Post('api/auth/recover')
  @HttpCode(HttpStatus.OK)
  async recoverPassword(@Body() dto: RecoverDto) {
    return this.authService.recoverPassword(dto);
  }

  // HU-B5: Restablecimiento de Contraseña (POST /api/auth/reset-password)
  @Post('api/auth/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // HU-B6: Consulta Interna de Identidad (GET /api/auth/internal/user/:id)
  @Get('api/auth/internal/user/:id')
  @HttpCode(HttpStatus.OK)
  async getInternalUser(
    @Param('id') userId: string,
    @Headers('x-api-key') apiKey: string,
  ) {
    return this.authService.getInternalUser(userId, apiKey);
  }

  // HU-B7: Endpoint Público JWKS (GET /.well-known/jwks.json)
  @Get('.well-known/jwks.json')
  @HttpCode(HttpStatus.OK)
  async getJwks() {
    return this.authService.getJwks();
  }

  // HU-B8: Revocación Administrativa de Sesión / Botón de Pánico (POST /api/auth/revoke)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ORGANIZADOR')
  @Post('api/auth/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeSession(@Body() dto: RevokeSessionDto, @Req() req: any) {
    return this.authService.revokeSession(dto, req.user);
  }
}

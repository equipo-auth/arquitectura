import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RsaKeyService } from './rsa-key.service';
import { NotificationService } from './notification.service';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ProvisionDto } from './dto/provision.dto';
import { RecoverDto } from './dto/recover.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RevokeSessionDto } from './dto/revoke-session.dto';

// Hash dummy constante para prevenir ataques de temporización si el usuario no existe
const DUMMY_HASH = '$2b$10$wE8wD0k8Y2iF2VzB.eL/.eXvA8W.7x0qXv1l.9qQ9k1.0w0.0w0.0';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rsaKeyService: RsaKeyService,
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
  ) {}

  // HU-B1: API de Registro
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ rut: dto.rut }, { email: dto.email }],
      },
    });

    if (existingUser) {
      // HU-B1 Criterio: Mensaje genérico de conflicto sin revelar qué campo colisionó
      throw new ConflictException('Los datos ingresados ya se encuentran registrados en la plataforma');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = await this.prisma.user.create({
      data: {
        rut: dto.rut,
        email: dto.email,
        nombre: dto.nombre,
        password_hash: hashedPassword,
        rol: 'COMPRADOR',
        token_version: 0,
        cambio_obligatorio: false,
      },
      select: {
        uuid: true,
        rut: true,
        email: true,
        nombre: true,
        rol: true,
        created_at: true,
      },
    });

    return {
      message: 'Usuario registrado exitosamente',
      user: newUser,
    };
  }

  // HU-B2: API de Login
  async login(dto: LoginDto, response: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const passwordToCompare = user ? user.password_hash : DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(dto.password, passwordToCompare);

    if (!user || !isPasswordValid) {
      // HU-B2 Criterio: Prevención de descubrimiento de cuentas (mismo mensaje 401)
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Expiración según rol (COMPRADOR: 2h, Administrativos: 12h)
    const isAdministrative = ['ADMIN', 'ORGANIZADOR', 'STAFF'].includes(user.rol);
    const expiresInSeconds = isAdministrative ? 12 * 60 * 60 : 2 * 60 * 60;
    const expiresInText = isAdministrative ? '12h' : '2h';

    const payload = {
      sub: user.uuid,
      rol: user.rol,
      token_version: user.token_version,
    };

    const token = this.jwtService.sign(payload, {
      privateKey: this.rsaKeyService.getPrivateKey(),
      algorithm: 'RS256',
      expiresIn: expiresInText,
      keyid: this.rsaKeyService.getKid(),
    });

    const isProduction = process.env.NODE_ENV === 'production';

    // Cookie HttpOnly; Secure; SameSite
    response.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: expiresInSeconds * 1000,
    });

    return {
      message: 'Inicio de sesión exitoso',
      user: {
        uuid: user.uuid,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        cambio_obligatorio: user.cambio_obligatorio,
      },
    };
  }

  // HU-B3: API de Cierre de Sesión (Logout)
  async logout(response: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    response.clearCookie('auth_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });

    return {
      status: 'OK',
      message: 'Sesión cerrada exitosamente',
    };
  }

  // HU-B4: API de Provisión de Cuentas (Organizador / Staff)
  async provisionUser(dto: ProvisionDto, currentUser: any) {
    // Control de jerarquía: ADMIN -> ORGANIZADOR, ORGANIZADOR -> STAFF
    if (currentUser.rol === 'ADMIN' && dto.rol !== 'ORGANIZADOR') {
      throw new ForbiddenException('El Administrador de Plataforma solo puede provisionar cuentas del rol ORGANIZADOR');
    }

    if (currentUser.rol === 'ORGANIZADOR' && dto.rol !== 'STAFF') {
      throw new ForbiddenException('El Organizador solo puede provisionar cuentas del rol STAFF');
    }

    if (!['ADMIN', 'ORGANIZADOR'].includes(currentUser.rol)) {
      throw new ForbiddenException('No posee permisos jerárquicos para provisionar cuentas');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ rut: dto.rut }, { email: dto.email }],
      },
    });

    if (existingUser) {
      throw new ConflictException('Los datos ingresados ya se encuentran registrados en la plataforma');
    }

    // Generar contraseña temporal
    const tempPassword = `Temp-${crypto.randomBytes(4).toString('hex')}!`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await this.prisma.user.create({
      data: {
        rut: dto.rut,
        email: dto.email,
        nombre: dto.nombre,
        password_hash: hashedPassword,
        rol: dto.rol,
        token_version: 0,
        cambio_obligatorio: true,
        creado_por_id: currentUser.uuid,
      },
      select: {
        uuid: true,
        rut: true,
        email: true,
        nombre: true,
        rol: true,
        cambio_obligatorio: true,
        created_at: true,
      },
    });

    return {
      message: 'Cuenta provisionada exitosamente',
      user: newUser,
      temporaryPassword: tempPassword,
    };
  }

  // HU-B5: Recuperación de Contraseña (Backend) - Solicitud
  async recoverPassword(dto: RecoverDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user) {
      // Generar token único de 15 minutos
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.passwordResetToken.create({
        data: {
          user_uuid: user.uuid,
          token_hash: token,
          expires_at: expiresAt,
        },
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/recover?token=${token}`;

      // Emitir evento a la cola de notificaciones
      await this.notificationService.sendPasswordRecoveryEvent(user.email, resetUrl, token);
    }

    // HU-B5 Criterio: Respuesta ofuscada (siempre 200 OK exista o no la cuenta)
    return {
      status: 'OK',
      message: 'Si la cuenta existe, se ha enviado un correo con instrucciones para restablecer la contraseña.',
    };
  }

  // HU-B5: Recuperación de Contraseña (Backend) - Restablecimiento
  async resetPassword(dto: ResetPasswordDto) {
    const resetRecord = await this.prisma.passwordResetToken.findUnique({
      where: { token_hash: dto.token },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.used_at !== null || new Date() > resetRecord.expires_at) {
      throw new UnauthorizedException('El enlace de recuperación es inválido, ya fue utilizado o ha expirado');
    }

    const newHashedPassword = await bcrypt.hash(dto.new_password, 10);

    // Actualizar usuario: nueva contraseña, cambio_obligatorio=false e incrementar token_version (+1) para invalidar sesiones activas
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { uuid: resetRecord.user_uuid },
        data: {
          password_hash: newHashedPassword,
          token_version: { increment: 1 },
          cambio_obligatorio: false,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { used_at: new Date() },
      }),
    ]);

    return {
      status: 'OK',
      message: 'Contraseña restablecida exitosamente. Todas las sesiones anteriores han sido cerradas por seguridad.',
    };
  }

  // HU-B6: Consulta Interna de Identidad
  async getInternalUser(userId: string, apiKey: string) {
    const expectedApiKey = process.env.INTERNAL_API_KEY || 'proyecto_titec_123';

    if (!apiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Acceso denegado: API key interna inválida');
    }

    const user = await this.prisma.user.findUnique({
      where: { uuid: userId },
      select: {
        rut: true,
        nombre: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  // HU-B7: Endpoint público JWKS
  getJwks() {
    return this.rsaKeyService.getJwks();
  }

  // HU-B8: Revocación Administrativa de Sesión ("Botón de Pánico")
  async revokeSession(dto: RevokeSessionDto, currentUser: any) {
    if (!['ADMIN', 'ORGANIZADOR'].includes(currentUser.rol)) {
      throw new ForbiddenException('No posee autoridad para forzar la revocación de sesiones');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { uuid: dto.target_user_id },
    });

    if (!targetUser) {
      throw new NotFoundException('El usuario objetivo no existe');
    }

    // Control jerárquico: Organizador solo puede revocar usuarios a su cargo o con rol STAFF
    if (currentUser.rol === 'ORGANIZADOR') {
      if (targetUser.creado_por_id !== currentUser.uuid && targetUser.rol !== 'STAFF') {
        throw new ForbiddenException('Solo puede revocar la sesión de usuarios pertenecientes a su jerarquía');
      }
    }

    // Transacción: Incrementar token_version (+1) y registrar en session_revocada
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { uuid: dto.target_user_id },
        data: {
          token_version: { increment: 1 },
        },
      }),
      this.prisma.sessionRevocada.create({
        data: {
          target_user_id: dto.target_user_id,
          revoked_by: currentUser.uuid,
          reason: dto.reason,
        },
      }),
    ]);

    return {
      status: 'OK',
      message: `Sesión del usuario ${targetUser.email} invalidada exitosamente.`,
    };
  }
}

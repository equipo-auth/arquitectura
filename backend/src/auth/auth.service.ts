import { Injectable, ConflictException, ForbiddenException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { KeycloakService } from '../keycloak/keycloak.service';
import { NotificationService } from './notification.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { ProvisionDto } from './dto/provision.dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

// HU-F3: roles con acceso al portal administrativo (/admin/login)
export const ROLES_ADMINISTRATIVOS = ['ADMIN', 'ORGANIZADOR', 'STAFF'];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private keycloakService: KeycloakService,
    private notificationService: NotificationService, // Añadido para RabbitMQ
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { rut: dto.rut }],
      },
    });

    if (exists) {
      throw new ConflictException('Los datos ingresados ya se encuentran registrados en la plataforma');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        rut: dto.rut,
        nombre: dto.nombre,
        password_hash: hashedPassword,
        rol: 'COMPRADOR',
        token_version: 0,
      },
      select: {
        uuid: true,
        email: true,
        nombre: true,
        rut: true,
        rol: true,
      },
    });

    return { message: 'Usuario registrado exitosamente', user: newUser };
  }

  async login(dto: LoginDto) {
    const genericError = new UnauthorizedException('Credenciales inválidas');

    this.logger.log(`Procesando intento de login para: ${dto.email}`);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw genericError;

    if (user.rol === 'COMPRADOR') {
      if (!user.password_hash) throw genericError;
      
      const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
      if (!isPasswordValid) throw genericError;
    } else {
      try {
        await this.keycloakService.validateUserCredentials(dto.email, dto.password);
      } catch (error) {
        if (error.message === 'resolve_required_actions') {
          this.logger.log(`Usuario administrativo requiere cambio de contraseña: ${dto.email}`);
          return { requirePasswordChange: true, user };
        }
        throw genericError; 
      }
    }

    // HU-F3: credenciales válidas pero rol sin acceso al portal administrativo
    if (dto.admin && !ROLES_ADMINISTRATIVOS.includes(user.rol)) {
      this.logger.warn(`Intento de acceso al portal administrativo con rol ${user.rol}: ${dto.email}`);
      throw new ForbiddenException('Acceso no autorizado');
    }

    const isStaff = user.rol !== 'COMPRADOR';
    const expiresInHours = isStaff ? 12 : 2;
    
    const payload = {
      sub: user.uuid,
      rol: user.rol,
      token_version: user.token_version,
    };

    const token = this.jwtService.sign(payload, { expiresIn: `${expiresInHours}h` });

    this.logger.log(`Login exitoso, generando JWT para: ${dto.email}`);
    return {
      token,
      expiresInMs: expiresInHours * 60 * 60 * 1000,
    };
  }

  async generatePasswordResetToken(userUuid: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.prisma.passwordResetToken.create({
      data: {
        user_uuid: userUuid,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    return rawToken;
  }

  async updateStaffPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!resetRecord) {
      throw new UnauthorizedException('El enlace ha expirado o es inválido.');
    }

    await this.keycloakService.updateUserPassword(resetRecord.user.email, newPassword);

    await this.prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { used_at: new Date() },
    });

    return { message: 'Contraseña actualizada correctamente. Ya puede iniciar sesión.' };
  }

  // HU-B5: Procesar solicitud de recuperación para enviarla a Notificaciones
  async processRecovery(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // Falla silenciosa para evitar enumeración

    // Reutilizamos tu método de generación de tokens hasheados en DB
    const rawToken = await this.generatePasswordResetToken(user.uuid);
    const recoveryUrl = `https://ticketu.cl/restablecer?token=${rawToken}`;

    this.notificationService.sendRecoveryEmail({
      Id_usuario: user.uuid,
      email_destino: user.email,
      url: recoveryUrl,
    });

    this.logger.log(`Evento de recuperación enviado a RabbitMQ para: ${email}`);
  }

  // HU-B5: Validar token y cambiar contraseña (para usuarios COMPRADOR)
  async resetPassword(token: string, nuevaClave: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
      },
    });

    if (!resetRecord) {
      throw new UnauthorizedException('El enlace ha expirado o es inválido.');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(nuevaClave, saltRounds);

    // Transacción para asegurar consistencia
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { uuid: resetRecord.user_uuid },
        data: {
          password_hash: hashedPassword,
          token_version: { increment: 1 }, // Invalidar sesiones antiguas
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { used_at: new Date() }, // Quemar token
      }),
    ]);

    this.logger.log(`Contraseña restablecida exitosamente para UUID: ${resetRecord.user_uuid}`);
  }

  // HU-B4: Provisión de cuentas administrativas (ORGANIZADOR / STAFF)
  // El usuario se crea manualmente en Keycloak; Auth solo persiste y notifica.
  async provisionStaff(dto: ProvisionDto, creadorUuid: string) {
    const conflictMsg = 'Los datos ingresados ya se encuentran registrados en la plataforma';
    const ttlHours = Number(process.env.STAFF_INVITE_TOKEN_TTL_HOURS) || 72;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    let newUser: { uuid: string; email: string; nombre: string; rut: string; rol: string; creado_por_id: string | null };

    try {
      newUser = await this.prisma.$transaction(async (tx) => {
        const creador = await tx.user.findUnique({
          where: { uuid: creadorUuid },
          select: { uuid: true },
        });
        if (!creador) {
          throw new UnauthorizedException('El usuario creador no existe');
        }

        const exists = await tx.user.findFirst({
          where: { OR: [{ email: dto.email }, { rut: dto.rut }] },
          select: { uuid: true },
        });
        if (exists) {
          throw new ConflictException(conflictMsg);
        }

        const user = await tx.user.create({
          data: {
            email: dto.email,
            rut: dto.rut,
            nombre: dto.nombre,
            rol: dto.rol,
            password_hash: null,
            cambio_obligatorio: true,
            token_version: 0,
            creado_por_id: creadorUuid,
          },
          select: { uuid: true, email: true, nombre: true, rut: true, rol: true, creado_por_id: true },
        });

        await tx.passwordResetToken.create({
          data: { user_uuid: user.uuid, token_hash: tokenHash, expires_at: expiresAt },
        });

        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(conflictMsg);
      }
      throw error;
    }

    // Publicación posterior al COMMIT: nunca se notifica una cuenta no persistida
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const notificacionPublicada = await this.notificationService.sendStaffAccountEmail({
      email_destino: newUser.email,
      url: `${frontendUrl}/crear-clave?token=${rawToken}`,
    });

    this.logger.log(
      `[HU-B4] Cuenta ${newUser.rol} provisionada uuid=${newUser.uuid} creado_por_id=${creadorUuid} evento_cuenta_staff=${notificacionPublicada ? 'PUBLICADO' : 'FALLIDO'}`,
    );

    return {
      message: 'Cuenta provisionada exitosamente',
      user: newUser,
      notificacion: {
        evento: 'cuenta_staff',
        publicada: notificacionPublicada,
        enlace_expira_en: expiresAt.toISOString(),
      },
    };
  }

  // HU-F4 / Primer inicio: validar enlace al abrir la página (sin consumir el token)
  async validateResetToken(token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!resetRecord) {
      throw new UnauthorizedException('El enlace ha expirado o es inválido.');
    }

    return { valido: true };
  }

  // HU-B6: Obtener perfil normalizado según Contrato de Integración
  async getPerfilValido(uuid: string) {
    const user = await this.prisma.user.findUnique({ where: { uuid } });
    
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado en la base de datos');
    }

    return {
      valido: true,
      usuario: {
        id_usuario: user.uuid,
        nombre_completo: user.nombre,
        rut: user.rut,
        correo_electronico: user.email,
        rol: user.rol
      }
    };
  }
}

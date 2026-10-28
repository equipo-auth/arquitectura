// src/auth/auth.service.ts
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { KeycloakService } from '../keycloak/keycloak.service';
import { NotificationService } from './notification.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { ProvisionDto } from './dto/provision.dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { mapRolContrato } from './rol-contrato';

// HU-F3: roles con acceso al portal administrativo (/admin/login)
export const ROLES_ADMINISTRATIVOS = ['ORGANIZADOR', 'STAFF'];

// Hash ficticio para igualar tiempos de respuesta cuando el email no existe
// (mitigación de enumeración de usuarios por timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

const CONFLICT_MSG = 'Los datos ingresados ya se encuentran registrados en la plataforma';

// La provisión llama a Keycloak dentro de la transacción: margen sobre el
// timeout HTTP de Keycloak (4 s por llamada, hasta 4 llamadas).
const PROVISION_TX_OPTIONS = { maxWait: 5000, timeout: 20000 };

/** Normalización única de correos: se guardan y buscan siempre en minúsculas. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private keycloakService: KeycloakService,
    private notificationService: NotificationService,
  ) {}

  /** Búsqueda por email tolerante a registros antiguos guardados con mayúsculas. */
  private findUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } },
    });
  }

  // HU-B1: Registro de comprador
  async register(dto: RegisterDto) {
    const email = normalizeEmail(dto.email);

    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: { equals: email, mode: 'insensitive' } }, { rut: dto.rut }],
      },
    });

    if (exists) {
      throw new ConflictException(CONFLICT_MSG);
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    try {
      const newUser = await this.prisma.user.create({
        data: {
          email,
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(CONFLICT_MSG);
      }
      throw error;
    }
  }

  // HU-B2 / HU-F3: Login
  async login(dto: LoginDto) {
    const genericError = new UnauthorizedException('Credenciales inválidas');
    const email = normalizeEmail(dto.email);

    this.logger.log(`Procesando intento de login para: ${email}`);

    const user = await this.findUserByEmail(email);

    if (!user) {
      // Anti-enumeración: mismo costo de CPU que una verificación real.
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      throw genericError;
    }

    if (user.rol === 'COMPRADOR') {
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        user.password_hash ?? DUMMY_PASSWORD_HASH,
      );
      if (!user.password_hash || !isPasswordValid) throw genericError;
    } else {
      try {
        await this.keycloakService.validateUserCredentials(user.email, dto.password);
      } catch (error) {
        if (error.message === 'resolve_required_actions') {
          this.logger.log(`Usuario administrativo requiere cambio de contraseña: ${email}`);
          return { requirePasswordChange: true, user };
        }
        throw genericError;
      }
    }

    // HU-F3: credenciales válidas pero rol sin acceso al portal administrativo
    if (dto.admin && !ROLES_ADMINISTRATIVOS.includes(user.rol)) {
      this.logger.warn(`Intento de acceso al portal administrativo con rol ${user.rol}: ${email}`);
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

    this.logger.log(`Login exitoso, generando JWT para: ${email}`);
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

  // Primer inicio Staff / Organizador: la clave se define en Keycloak
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
    const user = await this.findUserByEmail(email);
    if (!user) return; // Falla silenciosa para evitar enumeración

    const rawToken = await this.generatePasswordResetToken(user.uuid);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const recoveryUrl = `${frontendUrl}/restablecer?token=${rawToken}`;

    await this.notificationService.sendRecoveryEmail({
      Id_usuario: user.uuid,
      email_destino: user.email,
      url: recoveryUrl,
    });

    this.logger.log(`Evento recuperacion_cuenta procesado para UUID: ${user.uuid}`);
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

  /**
   * HU-B4: Provisión de cuentas ORGANIZADOR / STAFF (llamada interna, x-api-key).
   * Orden obligatorio:
   *   1) Guardar usuario + token en BD (transacción abierta).
   *   2) Crear usuario en Keycloak. Si falla → ROLLBACK de la BD.
   *   3) Solo tras COMMIT, publicar `cuenta_staff` en auth.events.
   */
  async provisionStaff(dto: ProvisionDto) {
    const email = normalizeEmail(dto.email);
    const creadoPorId = dto.creado_por_id ?? null;
    const ttlHours = Number(process.env.STAFF_INVITE_TOKEN_TTL_HOURS) || 72;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    let keycloakUserId: string | null = null;
    let newUser: {
      uuid: string;
      email: string;
      nombre: string;
      rut: string;
      rol: string;
      creado_por_id: string | null;
    };

    try {
      newUser = await this.prisma.$transaction(async (tx) => {
        if (creadoPorId) {
          const creador = await tx.user.findUnique({
            where: { uuid: creadoPorId },
            select: { rol: true },
          });
          if (!creador || !ROLES_ADMINISTRATIVOS.includes(creador.rol)) {
            throw new ForbiddenException('creado_por_id no corresponde a un ORGANIZADOR o STAFF');
          }
        }

        const exists = await tx.user.findFirst({
          where: {
            OR: [{ email: { equals: email, mode: 'insensitive' } }, { rut: dto.rut }],
          },
          select: { uuid: true },
        });
        if (exists) {
          throw new ConflictException(CONFLICT_MSG);
        }

        // 1) BD
        const user = await tx.user.create({
          data: {
            email,
            rut: dto.rut,
            nombre: dto.nombre,
            rol: dto.rol,
            password_hash: null,
            cambio_obligatorio: true,
            token_version: 0,
            creado_por_id: creadoPorId,
          },
          select: { uuid: true, email: true, nombre: true, rut: true, rol: true, creado_por_id: true },
        });

        await tx.passwordResetToken.create({
          data: { user_uuid: user.uuid, token_hash: tokenHash, expires_at: expiresAt },
        });

        // 2) Keycloak. Si lanza, Prisma revierte todo lo anterior.
        keycloakUserId = await this.keycloakService.createStaffUser({
          email,
          nombre: dto.nombre,
          rol: dto.rol,
        });

        return user;
      }, PROVISION_TX_OPTIONS);
    } catch (error) {
      // Keycloak creó el usuario pero el COMMIT falló: compensar en Keycloak.
      if (keycloakUserId) {
        this.logger.error(`[HU-B4] COMMIT fallido tras crear en Keycloak; compensando id=${keycloakUserId}`);
        await this.keycloakService.deleteUser(keycloakUserId).catch(() => undefined);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(CONFLICT_MSG);
      }
      this.logger.warn(`[HU-B4] Provisión revertida para ${email}: ${error.message}`);
      throw error;
    }

    // 3) RabbitMQ: solo tras BD + Keycloak exitosos
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const notificacionPublicada = await this.notificationService.sendStaffAccountEmail({
      email_destino: newUser.email,
      url: `${frontendUrl}/crear-clave?token=${rawToken}`,
    });

    this.logger.log(
      `[HU-B4] Cuenta ${newUser.rol} provisionada uuid=${newUser.uuid} keycloak_id=${keycloakUserId} creado_por_id=${creadoPorId} evento_cuenta_staff=${notificacionPublicada ? 'PUBLICADO' : 'FALLIDO'}`,
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

  // HU-B6: Perfil normalizado según Contrato de Integración (rol mapeado)
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
        rol: mapRolContrato(user.rol),
      },
    };
  }
}

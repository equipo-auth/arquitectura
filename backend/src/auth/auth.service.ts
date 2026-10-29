import { Injectable, ConflictException, ForbiddenException, UnauthorizedException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { KeycloakService } from '../keycloak/keycloak.service';
import { NotificationService } from './notification.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { ProvisionDto } from './dto/provision.dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { assertValidRut, formatRut, normalizeRut } from '../common/rut';
import { mapRolContrato } from './rol-contrato';

// HU-F3: roles con acceso al portal administrativo (/admin/login)
export const ROLES_ADMINISTRATIVOS = ['ADMIN', 'ORGANIZADOR', 'STAFF'];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private keycloakService: KeycloakService,
    private notificationService: NotificationService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    // El rol procede del flujo de registro, NO de cadenas dentro del email.
    const email = dto.email.trim().toLowerCase();
    const rut = assertValidRut(dto.rut);
    if (!dto.nombre.trim()) throw new BadRequestException('Nombre completo requerido');
    const exists = await this.prisma.user.findFirst({
      where: { OR: [
        { email: { equals: email, mode: 'insensitive' } },
        { rut: { in: [rut, normalizeRut(rut)] } },
      ] },
    });
    if (exists || await this.keycloakService.emailExists(email)) {
      throw new ConflictException('Los datos ingresados ya se encuentran registrados en la plataforma');
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    try {
      const newUser = await this.prisma.user.create({
        data: {
          email, rut, nombre: dto.nombre.trim(),
          password_hash, rol: 'COMPRADOR', token_version: 0,
        },
        select: { uuid: true, email: true, nombre: true, rut: true, rol: true },
      });
      void this.audit?.record({ event: 'BUYER_REGISTERED', outcome: 'SUCCESS', subjectUuid: newUser.uuid });
      return { message: 'Usuario registrado exitosamente', user: newUser };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Los datos ingresados ya se encuentran registrados en la plataforma');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const genericError = new UnauthorizedException('Credenciales inválidas');

    const email = dto.email.trim().toLowerCase();
    this.logger.log(`Procesando intento de login para: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.activo === false) throw genericError;

    if (user.rol === 'COMPRADOR') {
      if (!user.password_hash) throw genericError;
      
      const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
      if (!isPasswordValid) throw genericError;
    } else {
      try {
        await this.keycloakService.validateUserCredentials(email, dto.password);
      } catch (error) {
        if (error instanceof Error && error.message === 'resolve_required_actions') {
          this.logger.log(`Usuario administrativo requiere activar su cuenta: ${dto.email}`);
          return { requirePasswordChange: true, user };
        }
        throw genericError;
      }
      // Evitar que una identidad distinta de Keycloak use el espejo PostgreSQL.
      if (['STAFF', 'ORGANIZADOR'].includes(user.rol)) {
        const perfil = await this.keycloakService.getUserByEmail(email);
        if (!perfil.enabled || perfil.id !== user.uuid || perfil.rol !== user.rol) {
          throw genericError;
        }
      }
      if (user.cambio_obligatorio === true) {
        return { requirePasswordChange: true, user };
      }
    }

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
    void this.audit?.record({ event: 'LOGIN_SUCCESS', outcome: 'SUCCESS', subjectUuid: user.uuid, detail: `rol=${user.rol}` });
    return {
      token,
      expiresInMs: expiresInHours * 60 * 60 * 1000,
    };
  }

  async generatePasswordResetToken(userUuid: string, ttlMinutes = 15): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      // Invalidar todos los tokens anteriores sin consumir
      await tx.passwordResetToken.updateMany({
        where: {
          user_uuid: userUuid,
          used_at: null,
        },
        data: {
          used_at: new Date(),
        },
      });

      // Crear el nuevo token
      await tx.passwordResetToken.create({
        data: {
          user_uuid: userUuid,
          token_hash: tokenHash,
          expires_at: expiresAt,
        },
      });
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

    if (!['STAFF', 'ORGANIZADOR'].includes(resetRecord.user.rol)) {
      throw new ForbiddenException('Esta contraseña no se gestiona en Keycloak.');
    }

    await this.keycloakService.updateUserPassword(resetRecord.user.email, newPassword, resetRecord.user.uuid);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { used_at: new Date() },
      }),

      this.prisma.user.update({
        where: { uuid: resetRecord.user_uuid },
        data: {
          cambio_obligatorio: false,
          token_version: { increment: 1 },
        },
      }),
    ]);

    void this.audit?.record({ event: 'STAFF_PASSWORD_ACTIVATED', outcome: 'SUCCESS', subjectUuid: resetRecord.user_uuid });
    return { message: 'Contraseña actualizada correctamente. Ya puede iniciar sesión.' };
  }

  // HU-B5: Procesar solicitud de recuperación para enviarla a Notificaciones
  async processRecovery(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return; // No revelar existencia del email al cliente.

    if (user.rol !== 'COMPRADOR') {
      if (!['STAFF', 'ORGANIZADOR'].includes(user.rol)) return;
      // La cuenta administrativa ya debe existir en Keycloak; jamás crearla aquí.
      const keycloakUser = await this.keycloakService.getUserByEmail(user.email);
      if (!keycloakUser.enabled || keycloakUser.id !== user.uuid || keycloakUser.rol !== user.rol) {
        throw new ForbiddenException('La identidad administrativa no coincide con Keycloak');
      }
    }

    const rawToken = await this.generatePasswordResetToken(user.uuid);
    const frontendUrl = (
      user.rol === 'COMPRADOR'
        ? process.env.COMPRADOR_FRONTEND_URL || 'http://localhost:3000'
        : process.env.FRONTEND_URL || 'http://localhost:5173'
    ).replace(/\/+$/, '');
    const recoveryUrl = user.rol === 'COMPRADOR'
      ? `${frontendUrl}/restablecer?token=${rawToken}`
      : `${frontendUrl}/crear-clave?token=${rawToken}`;

    const publicada = await this.notificationService.sendRecoveryEmail({
      Id_usuario: user.uuid, email_destino: user.email, url: recoveryUrl,
    });
    this.logger.log(`[HU-B5] Evento de recuperación uuid=${user.uuid} publicado=${publicada}`);
    void this.audit?.record({ event: 'PASSWORD_RECOVERY_PUBLISHED', outcome: publicada ? 'SUCCESS' : 'ERROR', subjectUuid: user.uuid, detail: `rol=${user.rol}; rabbitmq=${publicada ? 'PUBLISHED' : 'FAILED'}` });
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
      include: { user: true },
    });

    if (!resetRecord) {
      throw new UnauthorizedException('El enlace ha expirado o es inválido.');
    }

    // Los usuarios administrativos deben cambiar su clave mediante Keycloak
    if (resetRecord.user.rol !== 'COMPRADOR') {
      throw new ForbiddenException(
        'La contraseña de esta cuenta se gestiona en Keycloak.',
      );
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
    void this.audit?.record({ event: 'BUYER_PASSWORD_RESET', outcome: 'SUCCESS', subjectUuid: resetRecord.user_uuid });
  }

  /**
   * Sincroniza una cuenta creada previamente en Keycloak. No necesita ADMIN
   * en PostgreSQL ni crea identidades en Keycloak.
   * Solo crea la invitación pendiente: OutboxWorker publica de modo confiable.
   */
  async provisionStaff(dto: ProvisionDto) {
    const email = dto.email.trim().toLowerCase();
    const kc = await this.keycloakService.getUserByEmail(email);
    if (!kc.enabled) throw new ForbiddenException('Cuenta deshabilitada en Keycloak');
    const conflictMsg = 'Email, RUT o UUID pertenecen a otra identidad PostgreSQL';
    try {
      return await this.prisma.$transaction(async (tx) => {
        const byUuid = await tx.user.findUnique({ where: { uuid: kc.id } });
        if (byUuid) {
          // Idempotencia: no volver a enviar si ya existe. Modificaciones
          // de rol/perfil se reconcilian por KeycloakSyncService.
          if (byUuid.email.toLowerCase() !== kc.email || byUuid.rol === 'COMPRADOR') {
            throw new ConflictException(conflictMsg);
          }
          return { user: byUuid, creada: false, invitacionProgramada: false };
        }
        const collision = await tx.user.findFirst({ where: { OR: [
          { email: { equals: kc.email, mode: 'insensitive' } },
          { rut: { in: [kc.rut, normalizeRut(kc.rut)] } },
        ] } });
        if (collision) throw new ConflictException(conflictMsg);
        const user = await tx.user.create({ data: {
          uuid: kc.id, email: kc.email, rut: kc.rut, nombre: kc.nombre,
          rol: kc.rol, password_hash: null, cambio_obligatorio: true,
          token_version: 0, creado_por_id: null, activo: true,
        }});
        await tx.staffInvitationOutbox.create({ data: { user_uuid: user.uuid } });
        return { user, creada: true, invitacionProgramada: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(conflictMsg);
      }
      throw error;
    }
  }

  /** Reenvío interno: encola una invitación nueva, sin acceso del navegador. */
  async reenviarInvitacionStaff(email: string): Promise<{ publicada: boolean; programada: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !['STAFF','ORGANIZADOR'].includes(user.rol) || !user.cambio_obligatorio || !user.activo) {
      throw new ForbiddenException('Cuenta no elegible para reenvío');
    }
    const kc = await this.keycloakService.getUserByEmail(user.email);
    if (!kc.enabled || kc.id !== user.uuid || kc.rol !== user.rol) {
      throw new ForbiddenException('La identidad ya no coincide con Keycloak');
    }
    await this.prisma.staffInvitationOutbox.upsert({
      where: { user_uuid: user.uuid },
      create: { user_uuid: user.uuid },
      update: { status: 'PENDING', next_attempt_at: new Date(), locked_until: null, sent_at: null },
    });
    // La respuesta no afirma envío; este lo confirma el worker mediante RabbitMQ.
    void this.audit?.record({ event: 'STAFF_INVITE_RESCHEDULED', outcome: 'PENDING', subjectUuid: user.uuid });
    return { publicada: false, programada: true };
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
        rut: formatRut(user.rut),
        correo_electronico: user.email,
        rol: mapRolContrato(user.rol)
      }
    };
  }
}

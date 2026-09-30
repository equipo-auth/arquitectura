import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { KeycloakService } from '../keycloak/keycloak.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private keycloakService: KeycloakService,
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

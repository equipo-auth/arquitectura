import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { KeycloakService } from '../keycloak/keycloak.service';
import { NotificationService } from './notification.service';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService: any = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    staffInvitationOutbox: { create: jest.fn(), upsert: jest.fn() },
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrismaService)),
  };

  const mockKeycloakService = {
    validateUserCredentials: jest.fn(),
    getUserByEmail: jest.fn(),
    emailExists: jest.fn(),
    updateUserPassword: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'token_generado_test'),
  };

  const mockNotificationService = {
    sendRecoveryEmail: jest.fn(),
    sendStaffAccountEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockKeycloakService.emailExists.mockResolvedValue(false);
    mockPrismaService.$transaction.mockImplementation((cb: (tx: any) => any) =>
      cb(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: KeycloakService, useValue: mockKeycloakService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('HU-B1: Registro (register)', () => {
    it('debe registrar un usuario correctamente', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        uuid: '123',
        email: 'test@test.com',
        nombre: 'Test User',
        rut: '11.111.111-1',
        rol: 'COMPRADOR',
      });

      const result = await service.register({
        rut: '11.111.111-1',
        email: 'test@test.com',
        password: 'password123',
        nombre: 'Test User',
      });

      expect(result.message).toBe('Usuario registrado exitosamente');
      expect(result.user.email).toBe('test@test.com');
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ rut: '11.111.111-1', password_hash: expect.any(String) }),
      }));
    });

    it('debe lanzar ConflictException si el usuario ya existe', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ uuid: '123' });

      await expect(
        service.register({
          rut: '11.111.111-1',
          email: 'test@test.com',
          password: 'password123',
          nombre: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('HU-B2 / HU-F3: Login (login)', () => {
    it('emite JWT para STAFF en el portal administrativo', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 's1',
        email: 'staff@t.cl',
        rol: 'STAFF',
        token_version: 0,
      });
      mockKeycloakService.validateUserCredentials.mockResolvedValue({});
      mockKeycloakService.getUserByEmail.mockResolvedValue({ id: 's1', rol: 'STAFF', enabled: true });

      const result: any = await service.login({
        email: 'staff@t.cl',
        password: 'x',
        admin: true,
      });

      expect(result.token).toBe('token_generado_test');
      expect(result.expiresInMs).toBe(12 * 60 * 60 * 1000);
    });

    it('responde 403 si un COMPRADOR entra por el portal administrativo', async () => {
      const hash = await bcrypt.hash('password123', 4);
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 'c1',
        email: 'c@t.cl',
        rol: 'COMPRADOR',
        password_hash: hash,
        token_version: 0,
      });

      await expect(
        service.login({
          email: 'c@t.cl',
          password: 'password123',
          admin: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('no revela el rol si la contraseña es incorrecta (401 antes que 403)', async () => {
      const hash = await bcrypt.hash('password123', 4);
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 'c1',
        email: 'c@t.cl',
        rol: 'COMPRADOR',
        password_hash: hash,
        token_version: 0,
      });

      await expect(
        service.login({ email: 'c@t.cl', password: 'otra', admin: true }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('el COMPRADOR sigue entrando normal sin el indicador admin', async () => {
      const hash = await bcrypt.hash('password123', 4);
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 'c1',
        email: 'c@t.cl',
        rol: 'COMPRADOR',
        password_hash: hash,
        token_version: 0,
      });

      const result: any = await service.login({
        email: 'c@t.cl',
        password: 'password123',
      });
      expect(result.token).toBe('token_generado_test');
      expect(result.expiresInMs).toBe(2 * 60 * 60 * 1000);
    });

    it('marca primer inicio cuando Keycloak exige acción requerida', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 's1',
        email: 'n@t.cl',
        rol: 'STAFF',
      });
      mockKeycloakService.validateUserCredentials.mockRejectedValue(
        new Error('resolve_required_actions'),
      );

      const result: any = await service.login({
        email: 'n@t.cl',
        password: 'x',
        admin: true,
      });
      expect(result.requirePasswordChange).toBe(true);
    });
  });

  describe('HU-B4: Sincronización automática desde Keycloak', () => {
    const dto = { email: 'nuevo@t.cl' };
    const kc = { id: 'u1', email: 'nuevo@t.cl', rut: '12.345.678-5',
      nombre: 'Nuevo', rol: 'STAFF' as const, enabled: true };
    beforeEach(() => {
      mockKeycloakService.getUserByEmail.mockResolvedValue(kc);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        uuid: kc.id, email: kc.email, rut: kc.rut, nombre: kc.nombre,
        rol: kc.rol, creado_por_id: null,
      });
      mockPrismaService.staffInvitationOutbox.create.mockResolvedValue({});
    });

    it('copia el UUID y los datos desde Keycloak sin un ADMIN PostgreSQL', async () => {
      const result = await service.provisionStaff(dto);
      expect(result.creada).toBe(true);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        uuid: kc.id, email: kc.email, rut: kc.rut, nombre: kc.nombre,
        rol: 'STAFF', creado_por_id: null, password_hash: null,
        cambio_obligatorio: true,
      }) });
      expect(mockPrismaService.staffInvitationOutbox.create).toHaveBeenCalledWith({ data: { user_uuid: kc.id } });
      expect(mockNotificationService.sendStaffAccountEmail).not.toHaveBeenCalled();
    });

    it('no crea duplicados ni nuevas invitaciones en ciclos repetidos', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ uuid: kc.id, email: kc.email, rol: 'STAFF' });
      const result = await service.provisionStaff(dto);
      expect(result.creada).toBe(false);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
      expect(mockPrismaService.staffInvitationOutbox.create).not.toHaveBeenCalled();
    });

    it('bloquea colisiones con compradores y RUT/email duplicados', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ uuid: 'otro' });
      await expect(service.provisionStaff(dto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('no crea usuarios si Keycloak no existe', async () => {
      mockKeycloakService.getUserByEmail.mockRejectedValue(new Error('no existe'));
      await expect(service.provisionStaff(dto)).rejects.toThrow('no existe');
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe('Roles y unicidad por email', () => {
    it('el correo con palabra admin sigue registrándose como COMPRADOR', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        uuid: 'comprador-1', email: 'diego.admin@ticketu.cl', rol: 'COMPRADOR',
      });
      const result = await service.register({
        email: 'Diego.Admin@ticketu.cl', rut: '11.111.111-1',
        nombre: 'Diego', password: 'segura123',
      });
      expect(result.user.rol).toBe('COMPRADOR');
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({
          email: 'diego.admin@ticketu.cl', rol: 'COMPRADOR',
        }) }),
      );
    });

    it('rechaza registro de comprador si el correo existe solo en Keycloak', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockKeycloakService.emailExists.mockResolvedValue(true);
      await expect(service.register({
        email: 'alguien@ticketu.cl', rut: '11.111.111-1',
        nombre: 'Prueba', password: 'segura123',
      })).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe('HU-B5: processRecovery', () => {
    it('publica recuperacion_cuenta con Id_usuario, email_destino y url', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 'u9',
        email: 'a@t.cl',
        rol: 'COMPRADOR',
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});
      mockNotificationService.sendRecoveryEmail.mockResolvedValue(true);

      await service.processRecovery('a@t.cl');

      const payload =
        mockNotificationService.sendRecoveryEmail.mock.calls[0][0];
      expect(Object.keys(payload).sort()).toEqual([
        'Id_usuario',
        'email_destino',
        'url',
      ]);
      expect(payload.Id_usuario).toBe('u9');
    });

    it('no publica nada si el email no existe (falla silenciosa)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await service.processRecovery('x@t.cl');
      expect(mockNotificationService.sendRecoveryEmail).not.toHaveBeenCalled();
    });
  });

  describe('Recuperación y reenvío diferenciados', () => {
    it('invalida los tokens antiguos antes de crear uno nuevo', async () => {
      await service.generatePasswordResetToken('u1');
      expect(mockPrismaService.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { user_uuid: 'u1', used_at: null },
        data: { used_at: expect.any(Date) },
      });
      expect(mockPrismaService.passwordResetToken.updateMany.mock.invocationCallOrder[0])
        .toBeLessThan(mockPrismaService.passwordResetToken.create.mock.invocationCallOrder[0]);
    });

    it('la recuperación de STAFF genera URL de crear-clave, no restablecer', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 'u1', email: 'staff@ticketu.cl', rol: 'STAFF',
      });
      mockKeycloakService.getUserByEmail.mockResolvedValue({
        id: 'u1', email: 'staff@ticketu.cl', rol: 'STAFF', enabled: true,
      });
      mockNotificationService.sendRecoveryEmail.mockResolvedValue(true);
      await service.processRecovery('staff@ticketu.cl');
      const evento = mockNotificationService.sendRecoveryEmail.mock.calls[0][0];
      expect(evento.url).toMatch(/\/crear-clave\?token=/);
      expect(evento.Id_usuario).toBe('u1');
    });

    it('reenviar cuenta pendiente deja un trabajo en outbox, sin fingir correo entregado', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 'u1', email: 'org@ticketu.cl', rol: 'ORGANIZADOR',
        cambio_obligatorio: true, activo: true,
      });
      mockKeycloakService.getUserByEmail.mockResolvedValue({
        id: 'u1', rol: 'ORGANIZADOR', enabled: true,
      });
      mockPrismaService.staffInvitationOutbox.upsert.mockResolvedValue({});
      expect(await service.reenviarInvitacionStaff('org@ticketu.cl'))
        .toEqual({ publicada: false, programada: true });
      expect(mockPrismaService.staffInvitationOutbox.upsert).toHaveBeenCalled();
      expect(mockNotificationService.sendStaffAccountEmail).not.toHaveBeenCalled();
    });;
  });

  describe('HU-F4: validateResetToken', () => {
    it('retorna valido=true para un token vigente', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 't1',
      });
      await expect(service.validateResetToken('abc')).resolves.toEqual({
        valido: true,
      });

      const where =
        mockPrismaService.passwordResetToken.findFirst.mock.calls[0][0].where;
      expect(where.used_at).toBeNull();
      expect(where.token_hash).toBe(
        crypto.createHash('sha256').update('abc').digest('hex'),
      );
    });

    it('lanza 401 genérico si el token está usado, expirado o no existe', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);
      await expect(service.validateResetToken('abc')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('HU-B6: getPerfilValido', () => {
    it('debe retornar el perfil normalizado según el contrato', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: '123',
        nombre: 'Juan',
        rut: '11.111.111-1',
        email: 'juan@test.com',
        rol: 'COMPRADOR',
      });

      const result = await service.getPerfilValido('123');
      expect(result.valido).toBe(true);
      expect(result.usuario.id_usuario).toBe('123');
      expect(result.usuario.correo_electronico).toBe('juan@test.com');
    });

    it('debe lanzar error si el usuario no existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.getPerfilValido('999')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

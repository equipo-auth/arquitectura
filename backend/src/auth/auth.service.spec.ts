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
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrismaService)),
  };

  const mockKeycloakService = {
    validateUserCredentials: jest.fn(),
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

  describe('HU-B4: Provisión de cuentas (provisionStaff)', () => {
    const dto = {
      rut: '12.345.678-5',
      email: 'nuevo@t.cl',
      nombre: 'Nuevo',
      rol: 'STAFF' as const,
    };
    const creado = {
      uuid: 'u1',
      email: dto.email,
      nombre: dto.nombre,
      rut: dto.rut,
      rol: 'STAFF',
      creado_por_id: 'admin-1',
    };

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue({ uuid: 'admin-1' });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(creado);
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});
      mockNotificationService.sendStaffAccountEmail.mockResolvedValue(true);
    });

    it('crea usuario y token dentro de una sola transacción', async () => {
      const result = await service.provisionStaff(dto, 'admin-1');

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rol: 'STAFF',
            password_hash: null,
            cambio_obligatorio: true,
            creado_por_id: 'admin-1',
          }),
        }),
      );
      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_uuid: 'u1',
          token_hash: expect.any(String),
        }),
      });
      expect(result.user.creado_por_id).toBe('admin-1');
      expect(result.notificacion.publicada).toBe(true);
    });

    it('el token expira en 72 horas', async () => {
      const antes = Date.now();
      await service.provisionStaff(dto, 'admin-1');
      const { expires_at } =
        mockPrismaService.passwordResetToken.create.mock.calls[0][0].data;
      const horas = (expires_at.getTime() - antes) / 3_600_000;
      expect(Math.round(horas)).toBe(72);
    });

    it('publica cuenta_staff solo con email_destino y url /crear-clave', async () => {
      await service.provisionStaff(dto, 'admin-1');

      const payload =
        mockNotificationService.sendStaffAccountEmail.mock.calls[0][0];
      expect(Object.keys(payload).sort()).toEqual(['email_destino', 'url']);
      expect(payload.email_destino).toBe('nuevo@t.cl');
      expect(payload.url).toMatch(/\/crear-clave\?token=[a-f0-9]{64}$/);

      // El hash guardado corresponde al token enviado en el enlace
      const raw = payload.url.split('token=')[1];
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      expect(
        mockPrismaService.passwordResetToken.create.mock.calls[0][0].data
          .token_hash,
      ).toBe(hash);
    });

    it('lanza 409 si el RUT o email ya existen y no publica evento', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ uuid: 'otro' });

      await expect(service.provisionStaff(dto, 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
      expect(
        mockNotificationService.sendStaffAccountEmail,
      ).not.toHaveBeenCalled();
    });

    it('traduce la violación de unicidad P2002 (carrera) a 409', async () => {
      mockPrismaService.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      await expect(service.provisionStaff(dto, 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(
        mockNotificationService.sendStaffAccountEmail,
      ).not.toHaveBeenCalled();
    });

    it('si falla la creación del token no se publica evento (rollback)', async () => {
      mockPrismaService.passwordResetToken.create.mockRejectedValue(
        new Error('db down'),
      );

      await expect(service.provisionStaff(dto, 'admin-1')).rejects.toThrow(
        'db down',
      );
      expect(
        mockNotificationService.sendStaffAccountEmail,
      ).not.toHaveBeenCalled();
    });

    it('rechaza si el creador ya no existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.provisionStaff(dto, 'admin-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('informa publicada=false si RabbitMQ falla, sin perder la cuenta', async () => {
      mockNotificationService.sendStaffAccountEmail.mockResolvedValue(false);
      const result = await service.provisionStaff(dto, 'admin-1');
      expect(result.user.uuid).toBe('u1');
      expect(result.notificacion.publicada).toBe(false);
    });
  });

  describe('HU-B5: processRecovery', () => {
    it('publica recuperacion_cuenta con Id_usuario, email_destino y url', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        uuid: 'u9',
        email: 'a@t.cl',
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

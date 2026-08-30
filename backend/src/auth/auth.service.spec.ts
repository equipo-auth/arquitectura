import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RsaKeyService } from './rsa-key.service';
import { NotificationService } from './notification.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let rsaKeyService: RsaKeyService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    sessionRevocada: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callbackOrArray) => {
      if (Array.isArray(callbackOrArray)) {
        return Promise.all(callbackOrArray);
      }
      return callbackOrArray(mockPrismaService);
    }),
  };

  const mockNotificationService = {
    sendPasswordRecoveryEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        RsaKeyService,
        JwtService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    rsaKeyService = module.get<RsaKeyService>(RsaKeyService);
    rsaKeyService.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('HU-B1: register', () => {
    it('debe registrar un usuario correctamente como COMPRADOR', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        uuid: 'test-uuid-1234',
        rut: '12345678-9',
        email: 'test@ejemplo.com',
        nombre: 'Usuario Prueba',
        rol: 'COMPRADOR',
        created_at: new Date(),
      });

      const result = await service.register({
        rut: '12345678-9',
        email: 'test@ejemplo.com',
        password: 'password123',
        nombre: 'Usuario Prueba',
      });

      expect(result.message).toBe('Usuario registrado exitosamente');
      expect(result.user.rol).toBe('COMPRADOR');
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si el RUT o email ya existen', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ uuid: 'existente' });

      await expect(
        service.register({
          rut: '12345678-9',
          email: 'test@ejemplo.com',
          password: 'password123',
          nombre: 'Usuario Prueba',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('HU-B6: getInternalUser', () => {
    it('debe retornar solo rut y nombre cuando el API key es válido', async () => {
      process.env.INTERNAL_API_KEY = 'clave_interna_test';
      mockPrismaService.user.findUnique.mockResolvedValue({
        rut: '12345678-9',
        nombre: 'Juan Perez',
      });

      const user = await service.getInternalUser('test-uuid-1234', 'clave_interna_test');
      expect(user).toEqual({ rut: '12345678-9', nombre: 'Juan Perez' });
      expect(user).not.toHaveProperty('email');
      expect(user).not.toHaveProperty('password_hash');
    });

    it('debe lanzar UnauthorizedException si la API key es inválida', async () => {
      await expect(
        service.getInternalUser('test-uuid-1234', 'clave_incorrecta'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('HU-B7: getJwks', () => {
    it('debe retornar el conjunto de llaves públicas JWKS en formato RS256', () => {
      const jwks = service.getJwks();
      expect(jwks).toHaveProperty('keys');
      expect(jwks.keys[0]).toHaveProperty('alg', 'RS256');
      expect(jwks.keys[0]).toHaveProperty('kty', 'RSA');
    });
  });
});

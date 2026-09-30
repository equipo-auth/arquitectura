import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { KeycloakService } from '../keycloak/keycloak.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockKeycloakService = {
    validateUserCredentials: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'token_generado_test'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: KeycloakService, useValue: mockKeycloakService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
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
      await expect(service.getPerfilValido('999')).rejects.toThrow(UnauthorizedException);
    });
  });
});

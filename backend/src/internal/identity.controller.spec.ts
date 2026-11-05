import { NotFoundException } from '@nestjs/common';
import { IdentityController } from './identity.controller';

describe('HU-B6 consulta minimizada', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const controller = new IdentityController(prisma as any);
  beforeEach(() => jest.clearAllMocks());

  it('retorna solo RUT y nombre, nunca email/contraseña', async () => {
    prisma.user.findUnique.mockResolvedValue({
      rut: '12345678-5', nombre: 'Prueba', activo: true, email: 'no-mostrar', password_hash: 'secreto',
    });
    await expect(controller.buscar('3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a'))
      .resolves.toEqual({ rut: '12.345.678-5', nombre: 'Prueba' });
  });
  it('UUID inexistente -> 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(controller.buscar('3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a'))
      .rejects.toThrow(NotFoundException);
  });
});

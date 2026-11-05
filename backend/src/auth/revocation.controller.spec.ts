import { NotFoundException } from '@nestjs/common';
import { RevocationController } from './revocation.controller';

describe('HU-B8 revocación', () => {
  const prisma = { user: { updateMany: jest.fn() } };
  const audit = { record: jest.fn() };
  const controller = new RevocationController(prisma as any, audit as any);
  beforeEach(() => { jest.clearAllMocks(); audit.record.mockResolvedValue(undefined); });
  const dto = { target_user_id: '3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a', reason: 'Cuenta comprometida' };
  it('incrementa la versión en 1 y audita', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    await expect(controller.revocar(dto)).resolves.toEqual({ revocada: true, id_usuario: dto.target_user_id });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { uuid: dto.target_user_id }, data: { token_version: { increment: 1 } },
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
  it('UUID inexistente -> 404', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(controller.revocar(dto)).rejects.toThrow(NotFoundException);
  });
});

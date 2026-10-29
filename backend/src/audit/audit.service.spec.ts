import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';

describe('AuditService: no filtrar secretos', () => {
  const prisma = { auditLog: { create: jest.fn() } };
  const audit = new AuditService(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.auditLog.create.mockResolvedValue({});
  });
  afterEach(() => jest.restoreAllMocks());

  it('guarda request sin query token y con UUID del usuario', async () => {
    await audit.record({
      event: 'HTTP_REQUEST', outcome: 'SUCCESS', method: 'GET',
      path: '/crear-clave?token=secreto-123', actorUuid: '3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a',
      statusCode: 200, durationMs: 12,
      detail: 'url=http://localhost:3000/crear-clave?token=secreto-123',
    });
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data.path).toBe('/crear-clave');
    expect(data.detail).not.toContain('secreto-123');
    expect(JSON.stringify(data)).not.toContain('http://');
    expect(data.actor_uuid).toBe('3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a');
  });

  it('si la tabla audit_logs no responde, no corta el flujo de autenticación', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db error'));
    await expect(audit.record({ event: 'LOGIN_SUCCESS', outcome: 'SUCCESS' })).resolves.toBeUndefined();
  });
});

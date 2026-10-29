import { KeycloakSyncService } from './keycloak-sync.service';
import { KeycloakService } from './keycloak.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

const u = { id: '12345678-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: 'staff@t.cl', enabled: true };
const kc = { ...u, rut: '12.345.678-5', nombre: 'Staff', rol: 'STAFF' };

describe('KeycloakSyncService: ciclo automático', () => {
  const keycloak = { listUsersPage: jest.fn(), getUserByEmail: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  };
  const auth = { provisionStaff: jest.fn() };
  let worker: KeycloakSyncService;
  beforeEach(() => {
    jest.clearAllMocks();
    worker = new KeycloakSyncService(
      keycloak as unknown as KeycloakService,
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
    );
    keycloak.listUsersPage.mockResolvedValue([u]);
    keycloak.getUserByEmail.mockResolvedValue(kc);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    auth.provisionStaff.mockResolvedValue({ creada: true });
  });

  it('sin necesidad de ADMIN PostgreSQL detecta usuarios Keycloak y crea espejo', async () => {
    await worker.syncOnce();
    expect(auth.provisionStaff).toHaveBeenCalledWith({ email: u.email });
  });

  it('si ya existe, actualiza el rol y revoca tokens previos', async () => {
    prisma.user.findUnique.mockResolvedValue({
      uuid: u.id, email: u.email, rut: kc.rut, nombre: kc.nombre,
      rol: 'ORGANIZADOR', activo: true,
    });
    await worker.syncOnce();
    expect(auth.provisionStaff).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { uuid: u.id },
      data: expect.objectContaining({ rol: 'STAFF', token_version: { increment: 1 } }),
    });
  });

  it('si Keycloak se cae no deshabilita masivamente usuarios en PostgreSQL', async () => {
    keycloak.listUsersPage.mockRejectedValue(new Error('Connection refused'));
    await worker.syncOnce();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('si una cuenta fue borrada de Keycloak deshabilita el espejo', async () => {
    prisma.user.findMany.mockResolvedValue([{ uuid: 'orphan-uuid' }]);
    await worker.syncOnce();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { uuid: 'orphan-uuid' },
      data: { activo: false, token_version: { increment: 1 } },
    });
  });
});

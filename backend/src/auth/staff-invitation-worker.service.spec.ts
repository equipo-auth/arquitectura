import { StaffInvitationWorkerService } from './staff-invitation-worker.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { KeycloakService } from '../keycloak/keycloak.service';
import { NotificationService } from './notification.service';

const job = { id: 'outbox-1', user_uuid: 'kc-uuid', attempts: 0, created_at: new Date() };
const user = { uuid: 'kc-uuid', email: 'staff@t.cl', rol: 'STAFF', activo: true, cambio_obligatorio: true };

describe('StaffInvitationWorkerService: entrega outbox', () => {
  const prisma = {
    staffInvitationOutbox: {
      findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const auth = { generatePasswordResetToken: jest.fn() };
  const keycloak = { getUserByEmail: jest.fn() };
  const notifications = { sendStaffAccountEmail: jest.fn() };
  let worker: StaffInvitationWorkerService;
  beforeEach(() => {
    jest.clearAllMocks();
    worker = new StaffInvitationWorkerService(
      prisma as unknown as PrismaService, auth as unknown as AuthService,
      keycloak as unknown as KeycloakService, notifications as unknown as NotificationService,
    );
    prisma.staffInvitationOutbox.findMany.mockResolvedValue([job]);
    prisma.staffInvitationOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue(user);
    keycloak.getUserByEmail.mockResolvedValue({ id: user.uuid, rol: user.rol, enabled: true });
    auth.generatePasswordResetToken.mockResolvedValue('secret-local-token');
    notifications.sendStaffAccountEmail.mockResolvedValue(true);
    prisma.staffInvitationOutbox.update.mockResolvedValue({});
  });
  it('genera token de 72h, publica contrato intacto y marca SENT', async () => {
    await worker.processPending();
    expect(auth.generatePasswordResetToken).toHaveBeenCalledWith('kc-uuid', 72 * 60);
    expect(notifications.sendStaffAccountEmail).toHaveBeenCalledWith({
      email_destino: 'staff@t.cl',
      url: expect.stringMatching(/\/crear-clave\?token=secret-local-token$/),
    });
    expect(prisma.staffInvitationOutbox.update).toHaveBeenCalledWith({
      where: { id: job.id }, data: expect.objectContaining({ status: 'SENT' }),
    });
  });
  it('si RabbitMQ falla queda pendiente y se reintenta sin perder el usuario', async () => {
    notifications.sendStaffAccountEmail.mockResolvedValue(false);
    await worker.processPending();
    expect(prisma.staffInvitationOutbox.update).toHaveBeenCalledWith({
      where: { id: job.id }, data: expect.objectContaining({ status: 'PENDING', attempts: 1 }),
    });
  });
  it('una cuenta ya activada no recibe nueva invitación', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, cambio_obligatorio: false });
    await worker.processPending();
    expect(notifications.sendStaffAccountEmail).not.toHaveBeenCalled();
    expect(prisma.staffInvitationOutbox.update).toHaveBeenCalledWith({
      where: { id: job.id }, data: { status: 'CANCELLED', locked_until: null },
    });
  });
  it('en modo demo desarrollo muestra URL SOLO si RabbitMQ confirmó publicación', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDemo = process.env.DEMO_LOG_INVITATION_URL;
    const { Logger } = require('@nestjs/common');
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      process.env.NODE_ENV = 'development';
      process.env.DEMO_LOG_INVITATION_URL = 'true';
      await worker.processPending();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[DEMO_LOCAL][URL_INVITACION]'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('token=secret-local-token'));

      warnSpy.mockClear();
      notifications.sendStaffAccountEmail.mockResolvedValue(false);
      await worker.processPending();
      expect(warnSpy.mock.calls.some(call => String(call[0]).includes('[DEMO_LOCAL][URL_INVITACION]'))).toBe(false);

      warnSpy.mockClear();
      process.env.NODE_ENV = 'production';
      notifications.sendStaffAccountEmail.mockResolvedValue(true);
      await worker.processPending();
      expect(warnSpy.mock.calls.some(call => String(call[0]).includes('[DEMO_LOCAL][URL_INVITACION]'))).toBe(false);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousDemo === undefined) delete process.env.DEMO_LOG_INVITATION_URL;
      else process.env.DEMO_LOG_INVITATION_URL = previousDemo;
      warnSpy.mockRestore();
    }
  });

});

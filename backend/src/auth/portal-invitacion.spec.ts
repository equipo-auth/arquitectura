import { StaffInvitationWorkerService } from './staff-invitation-worker.service';

/**
 * HU-B4: las dos cuentas administrativas nacen en Keycloak, Auth crea espejo
 * y outbox, y el worker publica cuenta_staff. Nunca inventa una clave temporal.
 */
describe('Invitación automática al activar un nuevo perfil administrativo', () => {
  for (const rol of ['STAFF', 'ORGANIZADOR'] as const) {
    it(`${rol}: publica enlace de creación de clave, sin contraseña ni secretos adicionales`, async () => {
      const user = {
        uuid: `kc-${rol.toLowerCase()}`,
        email: `${rol.toLowerCase()}@prueba.ticketu.cl`,
        rol,
        activo: true,
        cambio_obligatorio: true,
        password_hash: null,
      };
      const outbox = { id: 'outbox-qa', user_uuid: user.uuid, attempts: 0, created_at: new Date() };
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
        staffInvitationOutbox: {
          findMany: jest.fn().mockResolvedValue([outbox]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const auth = { generatePasswordResetToken: jest.fn().mockResolvedValue('token-solo-prueba') };
      const keycloak = { getUserByEmail: jest.fn().mockResolvedValue({ id: user.uuid, rol, enabled: true }) };
      const notifications = { sendStaffAccountEmail: jest.fn().mockResolvedValue(true) };

      const worker = new StaffInvitationWorkerService(
        prisma as any, auth as any, keycloak as any, notifications as any,
      );
      await worker.processPending();

      expect(auth.generatePasswordResetToken).toHaveBeenCalledWith(user.uuid, 72 * 60);
      const evento = notifications.sendStaffAccountEmail.mock.calls[0][0];
      expect(Object.keys(evento).sort()).toEqual(['email_destino', 'url']);
      expect(evento.email_destino).toBe(user.email);
      expect(evento.url).toMatch(/\/crear-clave\?token=token-solo-prueba$/);
      expect(prisma.staffInvitationOutbox.update).toHaveBeenCalledWith({
        where: { id: outbox.id },
        data: expect.objectContaining({ status: 'SENT' }),
      });
    });
  }
});

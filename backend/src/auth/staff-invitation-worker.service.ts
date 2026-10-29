import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { KeycloakService } from '../keycloak/keycloak.service';

/**
 * Publicación al menos una vez usando outbox persistente.
 * En cada intento se genera un nuevo token (sin guardar secretos reversibles).
 * Si RabbitMQ falla, se reintenta con backoff; no se pierde la invitación.
 */
@Injectable()
export class StaffInvitationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaffInvitationWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly keycloak: KeycloakService,
    private readonly notifications: NotificationService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  onModuleInit() {
    const interval = Math.max(3000, Number(process.env.STAFF_INVITATION_WORKER_MS) || 10000);
    this.logger.log(`Worker de invitaciones activo cada ${interval} ms (outbox PostgreSQL -> RabbitMQ)`);
    this.timer = setInterval(() => void this.processPending(), interval);
    setImmediate(() => void this.processPending());
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async processPending() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.prisma.staffInvitationOutbox.findMany({
        where: { OR: [
          { status: 'PENDING', next_attempt_at: { lte: now } },
          { status: 'PROCESSING', locked_until: { lt: now } },
        ] },
        orderBy: { created_at: 'asc' },
        take: 10,
      });
      for (const invitation of due) {
        const claimed = await this.prisma.staffInvitationOutbox.updateMany({
          where: { id: invitation.id, OR: [
            { status: 'PENDING', next_attempt_at: { lte: new Date() } },
            { status: 'PROCESSING', locked_until: { lt: new Date() } },
          ] },
          data: { status: 'PROCESSING', locked_until: new Date(Date.now() + 120000) },
        });
        if (claimed.count !== 1) continue;
        try {
          const user = await this.prisma.user.findUnique({ where: { uuid: invitation.user_uuid } });
          if (!user || !user.activo || !user.cambio_obligatorio || !['STAFF','ORGANIZADOR'].includes(user.rol)) {
            await this.prisma.staffInvitationOutbox.update({ where: { id: invitation.id }, data: { status: 'CANCELLED', locked_until: null } });
            void this.audit?.record({ event: 'STAFF_INVITE_CANCELLED', outcome: 'CANCELLED', subjectUuid: invitation.user_uuid });
            continue;
          }
          const kc = await this.keycloak.getUserByEmail(user.email);
          if (!kc.enabled || kc.id !== user.uuid || kc.rol !== user.rol) {
            throw new Error('Identidad administrativa no coincide con Keycloak');
          }
          const ttlHours = Math.max(1, Number(process.env.STAFF_INVITE_TOKEN_TTL_HOURS) || 72);
          const rawToken = await this.auth.generatePasswordResetToken(user.uuid, ttlHours * 60);
          const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
          const publicada = await this.notifications.sendStaffAccountEmail({
            email_destino: user.email,
            url: `${frontendUrl}/crear-clave?token=${rawToken}`,
          });
          if (!publicada) throw new Error('RabbitMQ no confirmó publicación');
          await this.prisma.staffInvitationOutbox.update({ where: { id: invitation.id }, data: {
            status: 'SENT', sent_at: new Date(), locked_until: null,
            attempts: { increment: 1 }, last_error: null,
          }});
          this.logger.log(`Evento cuenta_staff publicado: uuid=${user.uuid} exchange=auth.events routing_key=cuenta_staff`);
          void this.audit?.record({ event: 'STAFF_INVITE_PUBLISHED', outcome: 'SUCCESS', subjectUuid: user.uuid, detail: 'RabbitMQ aceptó publicacion cuenta_staff (correo real no confirmado)' });
          // EXCLUSIVAMENTE PARA DEMO LOCAL. En produccion NUNCA imprimir enlaces/tokens.
          // Esta URL NO se guarda en audit_logs ni en archivos de log persistentes.
          if (process.env.NODE_ENV === 'development' && process.env.DEMO_LOG_INVITATION_URL === 'true') {
            this.logger.warn(`[DEMO_LOCAL][URL_INVITACION] usuario_uuid=${user.uuid} url=${frontendUrl}/crear-clave?token=${rawToken}`);
            this.logger.warn('[DEMO_LOCAL] RabbitMQ confirmó PUBLICACIÓN; esto NO demuestra entrega de correo SMTP.');
          }
        } catch (error) {
          const attempts = invitation.attempts + 1;
          const delaySec = Math.min(3600, 10 * (2 ** Math.min(8, attempts - 1)));
          await this.prisma.staffInvitationOutbox.update({ where: { id: invitation.id }, data: {
            status: 'PENDING', attempts, locked_until: null,
            next_attempt_at: new Date(Date.now() + delaySec * 1000),
            last_error: error instanceof Error ? error.message.slice(0, 500) : 'Error',
          }}).catch(e => this.logger.error(`Outbox no pudo guardar reintento ${invitation.id}: ${e.message}`));
          this.logger.warn(`Invitación ${invitation.id} pendiente de reintento: ${error instanceof Error ? error.message : String(error)}`);
          void this.audit?.record({ event: 'STAFF_INVITE_RETRY', outcome: 'ERROR', subjectUuid: invitation.user_uuid, detail: 'Falló publicación; quedó pendiente en outbox' });
        }
      }
    } catch (error) {
      this.logger.warn(`Outbox no disponible: ${error instanceof Error ? error.message : String(error)}`);
    } finally { this.running = false; }
  }
}

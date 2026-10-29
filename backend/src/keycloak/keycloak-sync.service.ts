import { Injectable, Logger, OnModuleDestroy, OnModuleInit, BadRequestException, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { KeycloakService } from './keycloak.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

/**
 * Keycloak es la única fuente de creación/roles de STAFF y ORGANIZADOR.
 * Polling idempotente: al completar nombre/rut/realm role se crea automáticamente
 * el espejo en PostgreSQL y un outbox, sin ADMIN adicional en PostgreSQL.
 * La periodicidad es eventual (por defecto 30 s), no un webhook instantáneo.
 */
@Injectable()
export class KeycloakSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeycloakSyncService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly keycloak: KeycloakService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  onModuleInit() {
    if (process.env.KEYCLOAK_SYNC_ENABLED === 'false') return;
    const interval = Math.max(10000, Number(process.env.KEYCLOAK_SYNC_INTERVAL_MS) || 30000);
    this.timer = setInterval(() => void this.syncOnce(), interval);
    // El primer ciclo va después de arrancar el servidor, sin bloquear NestJS.
    setImmediate(() => void this.syncOnce());
    this.logger.log(`Sincronización Keycloak activada cada ${interval} ms`);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async syncOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let scanned = 0;
    let created = 0;
    let changed = 0;
    try {
      const pageSize = 100;
      const observedIds = new Set<string>();
      let completeScan = false;
      // No hay filtrado por nombre de email; solo por realm role real en Keycloak.
      for (let first = 0; first < 10000; first += pageSize) {
        const accounts = await this.keycloak.listUsersPage(first, pageSize);
        for (const account of accounts) {
          scanned++;
          if (account.id) observedIds.add(account.id);
          if (!account.id || !account.email) continue;
          try {
            const kc = await this.keycloak.getUserByEmail(account.email);
            const existing = await this.prisma.user.findUnique({ where: { uuid: kc.id } });
            if (!existing) {
              if (!kc.enabled) continue;
              const result = await this.auth.provisionStaff({ email: kc.email });
              if (result.creada) {
                created++;
                this.logger.log(`Espejo creado uuid=${kc.id} rol=${kc.rol}, invitación en outbox`);
                void this.audit?.record({ event: 'KEYCLOAK_MIRROR_CREATED', outcome: 'SUCCESS', subjectUuid: kc.id, detail: `rol=${kc.rol}; invitacion=PENDING` });
              }
              continue;
            }
            if (existing.rol === 'COMPRADOR') {
              this.logger.error(`Colisión de UUID con COMPRADOR uuid=${kc.id}`);
              continue;
            }
            // Sincroniza cambios manuales de nombre/rol/estado. Al cambiar rol o
            // habilitación, revoca JWT previos usando token_version.
            const changedRole = existing.rol !== kc.rol;
            const changedActive = existing.activo !== kc.enabled;
            if (changedRole || changedActive || existing.nombre !== kc.nombre || existing.rut !== kc.rut || existing.email !== kc.email) {
              changed++;
              await this.prisma.user.update({ where: { uuid: kc.id }, data: {
                nombre: kc.nombre, rut: kc.rut, email: kc.email, rol: kc.rol,
                activo: kc.enabled,
                ...(changedRole || changedActive ? { token_version: { increment: 1 } } : {}),
              }});
              void this.audit?.record({ event: 'KEYCLOAK_MIRROR_UPDATED', outcome: 'SUCCESS', subjectUuid: kc.id, detail: `rol=${kc.rol}; enabled=${kc.enabled}` });
            }
          } catch (error) {
            // Un usuario aún incompleto/no administrativo no debe provisionarse.
            if (!(error instanceof BadRequestException)) {
              this.logger.warn(`Sincronización de ${account.id} omitida: ${error instanceof Error ? error.message : String(error)}`);
            }
            // Si se elimina un rol administrativo o deshabilita una identidad
            // previamente reflejada, bloquea la sesión existente al próximo ciclo.
            const old = await this.prisma.user.findUnique({ where: { uuid: account.id } });
            if (old && ['STAFF','ORGANIZADOR'].includes(old.rol) &&
              (!account.enabled || error instanceof BadRequestException)) {
              if (old.activo) {
                await this.prisma.user.update({ where: { uuid: old.uuid }, data: {
                  activo: false, token_version: { increment: 1 },
                }}).catch(e => this.logger.warn(`No se pudo deshabilitar ${old.uuid}: ${e.message}`));
                void this.audit?.record({ event: 'KEYCLOAK_MIRROR_DISABLED', outcome: 'SUCCESS', subjectUuid: old.uuid, detail: 'Perfil incompleto, rol retirado o cuenta deshabilitada' });
              }
            }
          }
        }
        if (accounts.length < pageSize) { completeScan = true; break; }
      }
      // Solo cuando TODAS las páginas fueron leídas correctamente: revocar
      // sesiones de identidades eliminadas en Keycloak. Ante timeout no tocar.
      if (completeScan) {
        const mirrors = await this.prisma.user.findMany({
          where: { rol: { in: ['STAFF','ORGANIZADOR'] }, activo: true },
          select: { uuid: true },
        });
        for (const mirror of mirrors) {
          if (observedIds.has(mirror.uuid)) continue;
          await this.prisma.user.update({ where: { uuid: mirror.uuid }, data: {
            activo: false, token_version: { increment: 1 },
          }});
          this.logger.warn(`Cuenta eliminada de Keycloak; espejo deshabilitado uuid=${mirror.uuid}`);
          void this.audit?.record({ event: 'KEYCLOAK_MIRROR_DISABLED', outcome: 'SUCCESS', subjectUuid: mirror.uuid, detail: 'Cuenta ya no existe en Keycloak' });
        }
      }
      this.logger.log(`Ciclo Keycloak completado: revisados=${scanned}, creados=${created}, actualizados=${changed}`);
    } catch (error) {
      void this.audit?.record({ event: 'KEYCLOAK_SYNC_FAILED', outcome: 'ERROR', detail: 'Fallo de consulta/sincronizacion; revisar logs de Keycloak' });
      this.logger.warn(`Ciclo de sincronización Keycloak fallido: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

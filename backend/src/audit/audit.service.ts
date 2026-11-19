import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  event: string;
  outcome: 'SUCCESS' | 'ERROR' | 'PENDING' | 'CANCELLED';
  actorUuid?: string | null;
  subjectUuid?: string | null;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  requestId?: string;
  detail?: string;
}

/**
 * Traza mínima para PostgreSQL y consola. No almacena body, cookies, JWT,
 * cabeceras de autorización, contraseñas, URLs de invitación ni tokens.
 * Fallos de auditoría nunca impiden autenticar al usuario.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('TITEC-Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    const safePath = (entry.path ?? '').split('?')[0].slice(0, 255);
    const safeDetail = (entry.detail ?? '')
      .replace(/https?:\/\/[^\s]+/gi, '[URL_REDACTADA]')
      .replace(/\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, '[JWT_REDACTADO]')
      .replace(/\btoken\s*[:=]\s*[^\s,}]+/gi, 'token=[REDACTADO]')
      .slice(0, 300);

    const message = `${entry.event} ${entry.outcome}` +
      (entry.method ? ` ${entry.method}` : '') +
      (safePath ? ` ${safePath}` : '') +
      (entry.statusCode ? ` HTTP=${entry.statusCode}` : '') +
      (entry.durationMs !== undefined ? ` ${entry.durationMs}ms` : '') +
      (entry.subjectUuid ? ` sujeto=${entry.subjectUuid}` : '') +
      (entry.actorUuid ? ` actor=${entry.actorUuid}` : '') +
      (safeDetail ? ` detalle=${safeDetail}` : '');

    if (entry.outcome === 'ERROR') this.logger.warn(message);
    else this.logger.log(message);

    try {
      await this.prisma.auditLog.create({
        data: {
          event: entry.event.slice(0, 80),
          outcome: entry.outcome,
          actor_uuid: entry.actorUuid || null,
          subject_uuid: entry.subjectUuid || null,
          method: entry.method?.slice(0, 10) || null,
          path: safePath || null,
          status_code: entry.statusCode ?? null,
          duration_ms: entry.durationMs ?? null,
          request_id: entry.requestId?.slice(0, 36) || null,
          detail: safeDetail || null,
        },
      });
    } catch {
      // No imprimir datos sensibles ni bloquear operaciones de negocio.
      this.logger.warn('No fue posible guardar una auditoría en PostgreSQL; revisar tabla audit_logs');
    }
  }
}

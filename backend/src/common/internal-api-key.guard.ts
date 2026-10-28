// src/common/internal-api-key.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Autoriza únicamente a servicios internos que envían la cabecera
 * `x-api-key` igual a INTERNAL_API_KEY. Responde 403 en cualquier otro caso
 * (incluido INTERNAL_API_KEY no configurada: Fail-Secure).
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected) {
      this.logger.error(
        'INTERNAL_API_KEY no configurada: se rechazan todas las llamadas internas.',
      );
      throw new ForbiddenException('Servicio no autorizado');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-api-key'];
    const received = Array.isArray(header) ? header[0] : header;

    if (!received || !this.safeEqual(received, expected)) {
      this.logger.warn(
        `Llamada interna rechazada desde ${request.ip} a ${request.originalUrl}`,
      );
      throw new ForbiddenException('Servicio no autorizado');
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}

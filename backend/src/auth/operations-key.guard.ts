import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/** Clave operativa del encargado de Keycloak/infraestructura, NO un rol de usuario.
 * TicketU admite exclusivamente COMPRADOR, ORGANIZADOR y STAFF.
 * Solo autoriza una operación servidor-servidor de emergencia.
 * Nunca exponer AUTH_OPERATIONS_KEY al frontend ni compartirla.
 */
@Injectable()
export class OperationsKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.AUTH_OPERATIONS_KEY;
    const req = context.switchToHttp().getRequest<Request>();
    const input = req.headers['x-operations-key'];
    const value = Array.isArray(input) ? input[0] : input;
    if (!expected || expected.length < 32 || expected.startsWith('CAMBIAR_') || !value) {
      throw new ForbiddenException('Operación administrativa no autorizada');
    }
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Operación administrativa no autorizada');
    }
    return true;
  }
}

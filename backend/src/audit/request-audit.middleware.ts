import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AuditService } from './audit.service';

/** Observa peticiones HTTP sin capturar cuerpos, tokens ni query strings. */
@Injectable()
export class RequestAuditMiddleware implements NestMiddleware {
  constructor(private readonly audit: AuditService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Swagger sirve docenas de archivos estáticos; no llenar la tabla con ellos.
    const path = req.path;
    if (path.startsWith('/api/auth/docs') || path === '/favicon.ico') {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.once('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      const user = (req as Request & { user?: { uuid?: string } }).user;
      void this.audit.record({
        event: 'HTTP_REQUEST',
        outcome: res.statusCode >= 400 ? 'ERROR' : 'SUCCESS',
        actorUuid: user?.uuid,
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs,
        requestId,
      });
    });
    next();
  }
}

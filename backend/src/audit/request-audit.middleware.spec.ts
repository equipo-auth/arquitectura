import { EventEmitter } from 'events';
import { RequestAuditMiddleware } from './request-audit.middleware';
import { AuditService } from './audit.service';
import { Request, Response } from 'express';

describe('RequestAuditMiddleware: traza HTTP sin secretos', () => {
  it('registra ruta sin query, código, usuario autenticado y correlación', async () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const middleware = new RequestAuditMiddleware(audit as unknown as AuditService);
    const emitter = new EventEmitter();
    const headers: Record<string, string> = {};
    const req = { path: '/api/auth/validar-token', method: 'POST', user: { uuid: '3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a' } };
    const res = Object.assign(emitter, {
      statusCode: 200,
      setHeader: (name: string, val: string) => { headers[name] = val; },
    });
    const next = jest.fn();
    middleware.use(req as unknown as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(headers['X-Request-ID']).toBeDefined();
    res.emit('finish');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      event: 'HTTP_REQUEST', outcome: 'SUCCESS', method: 'POST',
      path: '/api/auth/validar-token', actorUuid: req.user.uuid,
      statusCode: 200, requestId: headers['X-Request-ID'],
    }));
    expect(JSON.stringify(audit.record.mock.calls[0][0])).not.toContain('password');
  });

  it('omite ficheros de Swagger para no saturar auditoría', () => {
    const audit = { record: jest.fn() };
    const middleware = new RequestAuditMiddleware(audit as unknown as AuditService);
    const next = jest.fn();
    middleware.use({ path: '/api/auth/docs/swagger-ui.css' } as Request,
      {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

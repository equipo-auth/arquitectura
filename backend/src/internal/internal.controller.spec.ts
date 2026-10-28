import {
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  ContractExceptionFilter,
  InternalController,
} from './internal.controller';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { extractJwtFromCookie } from '../auth/jwt.strategy';

describe('InternalController /internal/validar-sesion', () => {
  const controller = new InternalController();
  const baseUser = {
    uuid: '3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a',
    nombre: 'Javier Romero',
    rut: '21.111.111-1',
    email: 'javier@ejemplo.cl',
    token_version: 0,
  };

  it.each([
    ['COMPRADOR', 'usuario'],
    ['ORGANIZADOR', 'organizador'],
    ['STAFF', 'staff'],
  ])('mapea %s -> %s con el JSON exacto del contrato', (interno, contrato) => {
    const body = controller.validarSesion({
      user: { ...baseUser, rol: interno },
    } as any);
    expect(body).toEqual({
      valido: true,
      usuario: {
        id_usuario: baseUser.uuid,
        nombre_completo: 'Javier Romero',
        rut: '21.111.111-1',
        correo_electronico: 'javier@ejemplo.cl',
        rol: contrato,
      },
    });
  });

  it('un rol desconocido (ADMIN/CLIENTE) responde 401 (Fail-Secure)', () => {
    expect(() =>
      controller.validarSesion({ user: { ...baseUser, rol: 'ADMIN' } } as any),
    ).toThrow(UnauthorizedException);
  });

  it('aplica primero x-api-key y luego la sesión', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      InternalController.prototype.validarSesion,
    );
    expect(guards).toEqual([InternalApiKeyGuard, JwtAuthGuard]);
  });

  it('omite el rate limit (@SkipThrottle)', () => {
    const keys = Reflect.getMetadataKeys(InternalController);
    expect(keys.some((k) => String(k).startsWith('THROTTLER:SKIP'))).toBe(true);
  });
});

describe('extractJwtFromCookie', () => {
  it('lee SOLO la cookie "jwt"', () => {
    expect(extractJwtFromCookie({ cookies: { jwt: 'abc' } } as any)).toBe(
      'abc',
    );
    expect(
      extractJwtFromCookie({ cookies: { jwt_token: 'abc' } } as any),
    ).toBeNull();
    expect(
      extractJwtFromCookie({
        cookies: {},
        headers: { authorization: 'Bearer abc' },
      } as any),
    ).toBeNull();
  });
});

describe('ContractExceptionFilter', () => {
  const run = (exception: unknown) => {
    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/internal/validar-sesion',
        }),
      }),
    };
    new ContractExceptionFilter().catch(exception, host);
    return res;
  };

  it('401 con formato de contrato y no-store', () => {
    const res = run(new UnauthorizedException());
    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalledWith({
      valido: false,
      codigo_http: 401,
      error: 'unauthorized',
      mensaje: 'Sesión ausente, inválida, expirada o revocada',
    });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('403 para servicio no autorizado', () => {
    const res = run(new ForbiddenException());
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ codigo_http: 403, error: 'forbidden' }),
    );
  });

  it('500 para errores no controlados', () => {
    jest.spyOn(console, 'error').mockImplementation();
    const res = run(new Error('db down'));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        valido: false,
        codigo_http: 500,
        error: 'internal_error',
      }),
    );
  });
});

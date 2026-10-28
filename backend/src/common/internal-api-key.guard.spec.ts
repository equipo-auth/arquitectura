import { ForbiddenException } from '@nestjs/common';
import { InternalApiKeyGuard } from './internal-api-key.guard';

describe('InternalApiKeyGuard', () => {
  const guard = new InternalApiKeyGuard();
  const ctx = (headers: Record<string, string>): any => ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        ip: '10.0.0.1',
        originalUrl: '/internal/x',
      }),
    }),
  });
  const original = process.env.INTERNAL_API_KEY;

  afterEach(() => {
    process.env.INTERNAL_API_KEY = original;
  });

  it('permite con la x-api-key correcta', () => {
    process.env.INTERNAL_API_KEY = 'secreta';
    expect(guard.canActivate(ctx({ 'x-api-key': 'secreta' }))).toBe(true);
  });

  it('rechaza con 403 si falta o es incorrecta', () => {
    process.env.INTERNAL_API_KEY = 'secreta';
    expect(() => guard.canActivate(ctx({}))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ 'x-api-key': 'otra' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza todo si INTERNAL_API_KEY no está configurada (Fail-Secure)', () => {
    delete process.env.INTERNAL_API_KEY;
    expect(() => guard.canActivate(ctx({ 'x-api-key': '' }))).toThrow(
      ForbiddenException,
    );
  });
});

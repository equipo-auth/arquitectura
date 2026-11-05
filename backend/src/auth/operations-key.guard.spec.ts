import { ForbiddenException } from '@nestjs/common';
import { OperationsKeyGuard } from './operations-key.guard';

describe('HU-B8 control administrativo', () => {
  const original = process.env.AUTH_OPERATIONS_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_OPERATIONS_KEY;
    else process.env.AUTH_OPERATIONS_KEY = original;
  });
  const context = (key?: string): any => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: key ? { 'x-operations-key': key } : {} }) }),
  });
  it('fail-secure si falta configuración', () => {
    delete process.env.AUTH_OPERATIONS_KEY;
    expect(() => new OperationsKeyGuard().canActivate(context())).toThrow(ForbiddenException);
  });
  it('rechaza una clave incorrecta o ausente', () => {
    process.env.AUTH_OPERATIONS_KEY = 'abcdef123456abcdef123456abcdef123456';
    expect(() => new OperationsKeyGuard().canActivate(context())).toThrow(ForbiddenException);
    expect(() => new OperationsKeyGuard().canActivate(context('abc'))).toThrow(ForbiddenException);
  });
  it('acepta únicamente la clave larga configurada', () => {
    process.env.AUTH_OPERATIONS_KEY = 'abcdef123456abcdef123456abcdef123456';
    expect(new OperationsKeyGuard().canActivate(context(process.env.AUTH_OPERATIONS_KEY))).toBe(true);
  });
});

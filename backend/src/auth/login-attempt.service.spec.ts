import { HttpException, HttpStatus } from '@nestjs/common';
import { LoginAttemptService } from './login-attempt.service';

describe('HU-B2 límite de fallos', () => {
  it('comprador: cinco fallos permitidos, sexto 429', () => {
    const limiter = new LoginAttemptService();
    for (let n = 0; n < 5; n++) {
      limiter.assertAllowed('u@t.cl', '127.0.0.1', false);
      limiter.recordFailure('u@t.cl', '127.0.0.1', false);
    }
    expect(() => limiter.assertAllowed('u@t.cl', '127.0.0.1', false)).toThrow(HttpException);
    try { limiter.assertAllowed('u@t.cl', '127.0.0.1', false); }
    catch (error) { expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS); }
  });
  it('administrativo: tres fallos permitidos, cuarto 429', () => {
    const limiter = new LoginAttemptService();
    for (let n = 0; n < 3; n++) {
      limiter.assertAllowed('u@t.cl', '127.0.0.1', true);
      limiter.recordFailure('u@t.cl', '127.0.0.1', true);
    }
    expect(() => limiter.assertAllowed('u@t.cl', '127.0.0.1', true)).toThrow(HttpException);
  });
  it('un éxito reinicia fallos de esa identidad/origen', () => {
    const limiter = new LoginAttemptService();
    limiter.recordFailure('u@t.cl', '127.0.0.1', false);
    limiter.clear('u@t.cl', '127.0.0.1', false);
    expect(() => limiter.assertAllowed('u@t.cl', '127.0.0.1', false)).not.toThrow();
  });
});

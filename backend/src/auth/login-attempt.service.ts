import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/** HU-B2: 5 fallos comprador / 3 fallos portal administrativo, ventana fija 15 min.
 * Sólo se cuentan fallos de credenciales; las respuestas 403/5xx no se cuentan.
 * El almacenamiento es por proceso; en despliegues multirréplica usar Redis compartido.
 */
@Injectable()
export class LoginAttemptService {
  private readonly windowMs = 15 * 60 * 1000;
  private readonly entries = new Map<string, { failed: number; expiresAt: number }>();

  private key(email: string, ip: string, admin: boolean): string {
    return createHash('sha256')
      .update(`${admin ? 'admin' : 'comprador'}\0${ip}\0${email.trim().toLowerCase()}`)
      .digest('hex');
  }

  private entry(email: string, ip: string, admin: boolean) {
    const key = this.key(email, ip, admin);
    const old = this.entries.get(key);
    if (old && old.expiresAt > Date.now()) return { key, value: old };
    if (old) this.entries.delete(key);
    return { key, value: { failed: 0, expiresAt: Date.now() + this.windowMs } };
  }

  assertAllowed(email: string, ip: string, admin: boolean): void {
    const { value } = this.entry(email, ip, admin);
    if (value.failed >= (admin ? 3 : 5)) {
      throw new HttpException('Demasiados intentos fallidos. Espera 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  recordFailure(email: string, ip: string, admin: boolean): void {
    const { key, value } = this.entry(email, ip, admin);
    value.failed += 1;
    this.entries.set(key, value);
    // Impide crecimiento ilimitado con muchos correos distintos.
    if (this.entries.size > 10_000) {
      for (const [k, v] of this.entries) {
        if (v.expiresAt <= Date.now()) this.entries.delete(k);
      }
      while (this.entries.size > 10_000) {
        const first = this.entries.keys().next().value;
        if (first === undefined) break;
        this.entries.delete(first);
      }
    }
  }

  clear(email: string, ip: string, admin: boolean): void {
    this.entries.delete(this.key(email, ip, admin));
  }
}

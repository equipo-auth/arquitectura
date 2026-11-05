import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { createHash, createPublicKey, verify } from 'crypto';

type PublishedKey = {
  pem: string;
  kid: string;
  jwk: { kty: 'RSA'; kid: string; use: 'sig'; alg: 'RS256'; n: string; e: string };
};

/** HU-B7. Rotación: instalar private.pem/public.pem nuevos y guardar la clave
 * PÚBLICA anterior en previous-public.pem; reiniciar el backend.
 * previous-public.pem se publica solo hasta JWT_KEY_GRACE_HOURS desde su mtime.
 * No se escribe jamás una llave privada en logs/JWKS.
 */
@Injectable()
export class RsaKeyService {
  private readonly logger = new Logger(RsaKeyService.name);
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor() {
    const root = process.cwd();
    try {
      this.privateKey = fs.readFileSync(path.join(root, 'private.pem'), 'utf8');
      this.publicKey = fs.readFileSync(path.join(root, 'public.pem'), 'utf8');
      const privatePublic = createPublicKey(this.privateKey).export({ type: 'spki', format: 'pem' });
      const publicDer = createPublicKey(this.publicKey).export({ type: 'spki', format: 'der' });
      const privateDer = createPublicKey(privatePublic).export({ type: 'spki', format: 'der' });
      if (!Buffer.from(publicDer).equals(Buffer.from(privateDer))) {
        throw new Error('private.pem y public.pem no corresponden a la misma llave');
      }
      this.logger.log('Llaves RSA cargadas correctamente');
    } catch (error) {
      this.logger.error('No se pudieron validar private.pem y public.pem; revise la configuración RSA');
      throw error;
    }
  }

  getPrivateKey(): string { return this.privateKey; }
  getPublicKey(): string { return this.publicKey; }

  private publishKey(pem: string): PublishedKey {
    const key = createPublicKey(pem);
    const der = key.export({ type: 'spki', format: 'der' });
    const kid = createHash('sha256').update(Buffer.from(der)).digest('base64url');
    const publicJwk = key.export({ format: 'jwk' });
    if (publicJwk.kty !== 'RSA' || !publicJwk.n || !publicJwk.e) {
      throw new Error('JWKS requiere una llave pública RSA');
    }
    return {
      pem,
      kid,
      jwk: { kty: 'RSA', kid, use: 'sig', alg: 'RS256', n: publicJwk.n, e: publicJwk.e },
    };
  }

  getCurrentKid(): string { return this.publishKey(this.publicKey).kid; }

  getPublishedPublicKeys(): PublishedKey[] {
    const current = this.publishKey(this.publicKey);
    const keys = [current];
    const oldFile = path.join(process.cwd(), 'previous-public.pem');
    if (!fs.existsSync(oldFile)) return keys;

    const configured = Number(process.env.JWT_KEY_GRACE_HOURS ?? '24');
    const graceHours = Number.isFinite(configured) ? Math.max(0, configured) : 24;
    const age = Date.now() - fs.statSync(oldFile).mtimeMs;
    if (age < 0 || age > graceHours * 3600_000) return keys;
    const old = this.publishKey(fs.readFileSync(oldFile, 'utf8'));
    if (old.kid !== current.kid) keys.push(old);
    return keys;
  }

  /** La firma criptográfica se verifica antes de elegir la llave para Passport.
   * Así los JWT antiguos sin kid también funcionan durante la gracia.
   */
  selectPublicKey(rawJwt: string): string {
    try {
      const segments = rawJwt.split('.');
      if (segments.length !== 3) throw new Error('formato');
      const header = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'));
      if (header?.alg !== 'RS256') throw new Error('algoritmo');
      const signingInput = Buffer.from(`${segments[0]}.${segments[1]}`);
      const signature = Buffer.from(segments[2], 'base64url');
      for (const key of this.getPublishedPublicKeys()) {
        if (header.kid && header.kid !== key.kid) continue;
        if (verify('RSA-SHA256', signingInput, key.pem, signature)) return key.pem;
      }
    } catch {
      // Errores de formato/JWKS no se revelan al solicitante.
    }
    throw new UnauthorizedException('Token inválido o llave no vigente');
  }
}

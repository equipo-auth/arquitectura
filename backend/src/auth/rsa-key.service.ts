import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class RsaKeyService implements OnModuleInit {
  private privateKeyPem: string;
  private publicKeyPem: string;
  private kid = 'titec-auth-key-1';

  constructor() {
    this.initKeys();
  }

  onModuleInit() {
    this.initKeys();
  }

  private initKeys() {
    if (this.privateKeyPem && this.publicKeyPem) return;

    const envPrivate = process.env.JWT_PRIVATE_KEY;
    const envPublic = process.env.JWT_PUBLIC_KEY;

    if (envPrivate && envPublic && envPrivate.trim() !== '' && envPublic.trim() !== '') {
      this.privateKeyPem = envPrivate.replace(/\\n/g, '\n');
      this.publicKeyPem = envPublic.replace(/\\n/g, '\n');
    } else {
      // Generación automática de llaves RSA 2048 en memoria para desarrollo/demo
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      this.privateKeyPem = privateKey;
      this.publicKeyPem = publicKey;
    }
  }

  getPrivateKey(): string {
    return this.privateKeyPem;
  }

  getPublicKey(): string {
    return this.publicKeyPem;
  }

  getKid(): string {
    return this.kid;
  }

  getJwks() {
    const keyObject = crypto.createPublicKey(this.publicKeyPem);
    const jwk = keyObject.export({ format: 'jwk' }) as Record<string, any>;

    return {
      keys: [
        {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          use: 'sig',
          alg: 'RS256',
          kid: this.kid,
        },
      ],
    };
  }
}

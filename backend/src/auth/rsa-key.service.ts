import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RsaKeyService {
  private readonly logger = new Logger(RsaKeyService.name);
  private privateKey: string;
  private publicKey: string;

  constructor() {
    try {
      // process.cwd() apunta a la raíz del proyecto (fuera de dist/)
      const privateKeyPath = path.join(process.cwd(), 'private.pem');
      const publicKeyPath = path.join(process.cwd(), 'public.pem');

      this.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      
      this.logger.log('Llaves RSA cargadas correctamente desde la raíz');
    } catch (error) {
      this.logger.error('Error leyendo las llaves RSA. Verifica que private.pem y public.pem existan en la raíz del proyecto.', error.message);
      throw error;
    }
  }

  getPrivateKey(): string {
    return this.privateKey;
  }

  getPublicKey(): string {
    return this.publicKey;
  }
}

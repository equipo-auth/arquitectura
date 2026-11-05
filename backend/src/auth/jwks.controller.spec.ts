import { generateKeyPairSync } from 'crypto';
import { RsaKeyService } from './rsa-key.service';
import { JwksController } from './jwks.controller';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

describe('HU-B7 JWKS', () => {
  const initial = process.cwd();
  let temp: string;
  afterEach(() => { process.chdir(initial); if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
  it('entrega solo RSA pública con kid', () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'titec-jwks-'));
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    fs.writeFileSync(path.join(temp, 'private.pem'), privateKey);
    fs.writeFileSync(path.join(temp, 'public.pem'), publicKey);
    process.chdir(temp);
    const rsa = new RsaKeyService();
    const keys = new JwksController(rsa).getJwks().keys;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: expect.any(String) });
    expect(keys[0]).toHaveProperty('n');
    expect(keys[0]).toHaveProperty('e');
    expect(JSON.stringify(keys)).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(keys)).not.toContain('"d"');
  });
});

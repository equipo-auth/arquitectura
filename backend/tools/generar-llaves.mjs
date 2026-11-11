// Genera llaves RSA de desarrollo solo si NO existe ninguna de las dos.
// Ejecutar desde backend/: node tools/generar-llaves.mjs
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backend = resolve(import.meta.dirname, '..');
const privateFile = resolve(backend, 'private.pem');
const publicFile = resolve(backend, 'public.pem');
if (existsSync(privateFile) || existsSync(publicFile)) {
  console.error('No se generan llaves: ya existe private.pem o public.pem. Conservalas.');
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
writeFileSync(privateFile, privateKey, { flag: 'wx', mode: 0o600 });
writeFileSync(publicFile, publicKey, { flag: 'wx', mode: 0o644 });
console.log('Llaves de desarrollo generadas localmente. Nunca compartas private.pem.');

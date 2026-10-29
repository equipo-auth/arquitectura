import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Prueba de integración HTTP de /internal/validar-sesion (Contratos Panel v1.1
 * y Entradas v3.0) con la app Nest real y la BD simulada.
 */
describe('Integración /internal/validar-sesion (e2e)', () => {
  let app: INestApplication;
  const originalCwd = process.cwd();
  const API_KEY = 'clave-de-prueba';

  const comprador = {
    uuid: '3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a',
    email: 'sebastian@alumnos.uv.cl',
    nombre: 'Sebastián Fuentes',
    rut: '21.111.111-1',
    rol: 'COMPRADOR',
    token_version: 0,
    password_hash: bcrypt.hashSync('Password123!', 4),
  };

  const prismaMock = {
    user: {
      findFirst: jest.fn(async () => comprador),
      findUnique: jest.fn(async () => comprador),
    },
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-keys-'));
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync(path.join(dir, 'private.pem'), privateKey);
    fs.writeFileSync(path.join(dir, 'public.pem'), publicKey);
    // Pre-carga perezosa de Nest antes de cambiar el cwd (RsaKeyService lee las llaves desde cwd)
    require('amqp-connection-manager');
    require('amqplib');
    process.chdir(dir);
    process.env.INTERNAL_API_KEY = API_KEY;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.chdir(originalCwd);
  });

  const loginCookie = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'SEBASTIAN@alumnos.uv.cl', password: 'Password123!' })
      .expect(200);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const jwt = setCookie.find((c) => c.startsWith('jwt='));
    expect(jwt).toBeDefined();
    return jwt!.split(';')[0];
  };

  it('200 con el JSON exacto del contrato y Cache-Control: no-store', async () => {
    const cookie = await loginCookie();

    const res = await request(app.getHttpServer())
      .get('/internal/validar-sesion')
      .set('Cookie', cookie)
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      valido: true,
      usuario: {
        id_usuario: comprador.uuid,
        nombre_completo: comprador.nombre,
        rut: comprador.rut,
        correo_electronico: comprador.email,
        rol: 'usuario',
      },
    });
  });

  it('401 en formato de contrato si falta la cookie', async () => {
    const res = await request(app.getHttpServer())
      .get('/internal/validar-sesion')
      .set('x-api-key', API_KEY)
      .expect(401);

    expect(res.body).toEqual({
      valido: false,
      codigo_http: 401,
      error: 'unauthorized',
      mensaje: expect.any(String),
    });
  });

  it('401 si la cookie se llama jwt_token (solo se acepta "jwt")', async () => {
    const cookie = await loginCookie();
    await request(app.getHttpServer())
      .get('/internal/validar-sesion')
      .set('Cookie', cookie.replace(/^jwt=/, 'jwt_token='))
      .set('x-api-key', API_KEY)
      .expect(401);
  });

  it('401 si la sesión fue revocada (token_version distinto)', async () => {
    const cookie = await loginCookie();
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...comprador, token_version: 1 });
    await request(app.getHttpServer())
      .get('/internal/validar-sesion')
      .set('Cookie', cookie)
      .set('x-api-key', API_KEY)
      .expect(401);
  });

  it('403 en formato de contrato sin x-api-key', async () => {
    const cookie = await loginCookie();
    const res = await request(app.getHttpServer())
      .get('/internal/validar-sesion')
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body).toMatchObject({ valido: false, codigo_http: 403, error: 'forbidden' });
  });

  it('no aplica rate limit: 25 llamadas seguidas responden 200', async () => {
    const cookie = await loginCookie();
    for (let i = 0; i < 25; i++) {
      await request(app.getHttpServer())
        .get('/internal/validar-sesion')
        .set('Cookie', cookie)
        .set('x-api-key', API_KEY)
        .expect(200);
    }
  });

  it('/api/auth/provision sin API key responde 403', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/provision')
      .send({ rut: '12.345.678-5', email: 'n@t.cl', nombre: 'N', rol: 'STAFF' })
      .expect(403);
  });
});

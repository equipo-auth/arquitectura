import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

/**
 * Regresión HU-B2/HU-F3: el formulario público y el administrativo comparten
 * endpoint, pero nunca deben emitir sesiones para el rol del portal equivocado.
 * admin=true es un indicador de flujo, NO un cuarto rol en PostgreSQL.
 */
describe('Contratos de acceso por portal', () => {
  const claveCorrecta = 'ClaveSegura123';

  async function preparar(rol: 'COMPRADOR' | 'STAFF' | 'ORGANIZADOR') {
    const email = `${rol.toLowerCase()}@prueba.ticketu.cl`;
    const uuid = `uuid-${rol.toLowerCase()}`;
    const user = {
      uuid,
      email,
      rol,
      activo: true,
      cambio_obligatorio: false,
      token_version: 0,
      password_hash: rol === 'COMPRADOR' ? await bcrypt.hash(claveCorrecta, 4) : null,
    };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const jwt = { sign: jest.fn().mockReturnValue('jwt-de-prueba') };
    const keycloak = {
      validateUserCredentials: jest.fn().mockResolvedValue({}),
      getUserByEmail: jest.fn().mockResolvedValue({ id: uuid, email, rol, enabled: true }),
    };
    const notifications = {};
    const auth = new AuthService(
      prisma as any, jwt as any, keycloak as any, notifications as any,
    );
    return { auth, email, jwt, keycloak };
  }

  it('COMPRADOR entra por el flujo público con JWT de dos horas', async () => {
    const { auth, email, jwt } = await preparar('COMPRADOR');
    const result: any = await auth.login({ email, password: claveCorrecta });
    expect(result.expiresInMs).toBe(2 * 60 * 60 * 1000);
    expect(jwt.sign).toHaveBeenCalledTimes(1);
  });

  it('COMPRADOR no entra al flujo administrativo aunque conozca su contraseña', async () => {
    const { auth, email, jwt } = await preparar('COMPRADOR');
    await expect(auth.login({ email, password: claveCorrecta, admin: true }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  for (const rol of ['STAFF', 'ORGANIZADOR'] as const) {
    it(`${rol} no puede emitir JWT desde el flujo de compradores`, async () => {
      const { auth, email, jwt, keycloak } = await preparar(rol);
      await expect(auth.login({ email, password: claveCorrecta }))
        .rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.sign).not.toHaveBeenCalled();
      // El portal de compradores tampoco debe intentar validar credenciales
      // administrativas contra Keycloak.
      expect(keycloak.validateUserCredentials).not.toHaveBeenCalled();
    });

    it(`${rol} entra por el flujo administrativo con JWT de doce horas`, async () => {
      const { auth, email, jwt, keycloak } = await preparar(rol);
      const result: any = await auth.login({ email, password: claveCorrecta, admin: true });
      expect(result.expiresInMs).toBe(12 * 60 * 60 * 1000);
      expect(keycloak.validateUserCredentials).toHaveBeenCalledWith(email, claveCorrecta);
      expect(jwt.sign).toHaveBeenCalledTimes(1);
    });
  }
});

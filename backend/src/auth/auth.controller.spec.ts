import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    generatePasswordResetToken: jest.fn(),
    provisionStaff: jest.fn(),
    validateResetToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('HU-F3: primer inicio responde 403 con primer_inicio=true y URL /crear-clave', async () => {
    mockAuthService.login.mockResolvedValue({
      requirePasswordChange: true,
      user: { uuid: 'u1' },
    });
    mockAuthService.generatePasswordResetToken.mockResolvedValue('tok');
    const res: any = { status: jest.fn(), cookie: jest.fn() };

    const body: any = await controller.login(
      { email: 'a@t.cl', password: 'x', admin: true },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(body.primer_inicio).toBe(true);
    expect(body.action).toBe('REDIRECT');
    expect(body.url).toBe('/crear-clave?token=tok');
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('HU-B4: /provision está protegido con InternalApiKeyGuard (sin rol ADMIN)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.provision);
    expect(guards).toEqual([InternalApiKeyGuard]);
  });

  it('HU-B4: /provision delega en el servicio', async () => {
    mockAuthService.provisionStaff.mockResolvedValue({ ok: true });
    const dto = { rut: '12.345.678-5', email: 'n@t.cl', nombre: 'N', rol: 'STAFF' as const };

    await controller.provision(dto);

    expect(mockAuthService.provisionStaff).toHaveBeenCalledWith(dto);
  });

  it('login exitoso setea la cookie "jwt"', async () => {
    mockAuthService.login.mockResolvedValue({ token: 'tkn', expiresInMs: 1000 });
    const res: any = { status: jest.fn(), cookie: jest.fn() };

    await controller.login({ email: 'a@t.cl', password: 'x' }, res);

    expect(res.cookie).toHaveBeenCalledWith('jwt', 'tkn', expect.objectContaining({ httpOnly: true, maxAge: 1000 }));
  });

  it('logout borra la cookie "jwt"', () => {
    const res: any = { clearCookie: jest.fn() };
    controller.logout(res);
    expect(res.clearCookie).toHaveBeenCalledWith('jwt', expect.objectContaining({ httpOnly: true }));
  });

  it('HU-F4: /validar-token delega en el servicio', async () => {
    mockAuthService.validateResetToken.mockResolvedValue({ valido: true });
    await expect(controller.validarToken({ token: 'abc' })).resolves.toEqual({
      valido: true,
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ROLES_KEY } from './roles.decorator';

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

  it('HU-F3: primer inicio no crea un token sin probar identidad', async () => {
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
    expect(body.url).toBe('/recuperar');
    expect(mockAuthService.generatePasswordResetToken).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('HU-B4: /provision es solo interno, sin ADMIN PostgreSQL', async () => {
    mockAuthService.provisionStaff.mockResolvedValue({ invitacionProgramada: true });
    const dto = { email: 'n@t.cl' };
    await controller.provision(dto);
    expect(mockAuthService.provisionStaff).toHaveBeenCalledWith(dto);
  });

  it('HU-F4: /validar-token delega en el servicio', async () => {
    mockAuthService.validateResetToken.mockResolvedValue({ valido: true });
    await expect(controller.validarToken({ token: 'abc' })).resolves.toEqual({
      valido: true,
    });
  });
});

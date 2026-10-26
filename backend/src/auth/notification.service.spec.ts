import { of, throwError, NEVER } from 'rxjs';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const client: any = { emit: jest.fn(), close: jest.fn() };
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService(client);
  });

  it('publica cuenta_staff con los campos exactos del contrato', async () => {
    client.emit.mockReturnValue(of(undefined));

    const ok = await service.sendStaffAccountEmail({
      email_destino: 'a@t.cl',
      url: 'u',
      extra: 1,
    } as any);

    expect(ok).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('cuenta_staff', {
      email_destino: 'a@t.cl',
      url: 'u',
    });
  });

  it('publica recuperacion_cuenta con los campos exactos del contrato', async () => {
    client.emit.mockReturnValue(of(undefined));

    await service.sendRecoveryEmail({
      Id_usuario: 'u1',
      email_destino: 'a@t.cl',
      url: 'u',
    });

    expect(client.emit).toHaveBeenCalledWith('recuperacion_cuenta', {
      Id_usuario: 'u1',
      email_destino: 'a@t.cl',
      url: 'u',
    });
  });

  it('retorna false si el broker falla', async () => {
    client.emit.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
    await expect(
      service.sendStaffAccountEmail({ email_destino: 'a@t.cl', url: 'u' }),
    ).resolves.toBe(false);
  });

  it('retorna false si se supera el SLA de 5 segundos', async () => {
    jest.useFakeTimers();
    client.emit.mockReturnValue(NEVER);
    const promise = service.sendStaffAccountEmail({
      email_destino: 'a@t.cl',
      url: 'u',
    });
    jest.advanceTimersByTime(5001);
    await expect(promise).resolves.toBe(false);
    jest.useRealTimers();
  });
});

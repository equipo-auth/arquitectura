import { Logger } from '@nestjs/common';
import { NotificacionesListener } from './notificaciones.listener';

describe('NotificacionesListener (correo_auth)', () => {
  let listener: NotificacionesListener;
  let channel: { ack: jest.Mock };
  let message: any;
  let context: any;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    listener = new NotificacionesListener();
    channel = { ack: jest.fn() };
    message = {
      fields: { exchange: 'notificaciones.events', routingKey: 'correo_auth' },
      properties: {},
    };
    context = { getChannelRef: () => channel, getMessage: () => message };
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('registra ENTREGADO cuando estado_envio=exitoso y hace ack', async () => {
    await listener.handleCorreoAuth(
      { email_destino: 'a@t.cl', estado_envio: 'exitoso' },
      context,
    );

    expect(logSpy.mock.calls[0][0]).toContain('[CORREO_AUTH][ENTREGADO]');
    expect(logSpy.mock.calls[0][0]).toContain('a@t.cl');
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('registra REBOTADO con el motivo cuando estado_envio=error', async () => {
    await listener.handleCorreoAuth(
      {
        email_destino: 'a@t.cl',
        estado_envio: 'error',
        error_envio: 'Rechazo SMTP',
      },
      context,
    );

    expect(errorSpy.mock.calls[0][0]).toContain('[CORREO_AUTH][REBOTADO]');
    expect(errorSpy.mock.calls[0][0]).toContain('Rechazo SMTP');
    expect(channel.ack).toHaveBeenCalled();
  });

  it('registra PAYLOAD_INVALIDO si faltan campos obligatorios y hace ack igual', async () => {
    await listener.handleCorreoAuth({ estado_envio: 'otro' }, context);

    expect(errorSpy.mock.calls[0][0]).toContain(
      '[CORREO_AUTH][PAYLOAD_INVALIDO]',
    );
    expect(channel.ack).toHaveBeenCalled();
  });
});

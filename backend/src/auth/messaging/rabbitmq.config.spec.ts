import {
  CorreoAuthPlainDeserializer,
  PlainJsonSerializer,
  buildAuthEventsClientOptions,
  buildNotificacionesServerOptions,
} from './rabbitmq.config';

describe('rabbitmq.config', () => {
  it('serializa como JSON plano, sin envoltura de Nest', () => {
    const out = new PlainJsonSerializer().serialize({
      pattern: 'cuenta_staff',
      data: { email_destino: 'a', url: 'b' },
    });
    expect(out).toEqual({ email_destino: 'a', url: 'b' });
  });

  it('enruta JSON plano entrante al patrón correo_auth', () => {
    const out = new CorreoAuthPlainDeserializer().deserialize({
      email_destino: 'a',
      estado_envio: 'exitoso',
    });
    expect(out).toEqual({
      pattern: 'correo_auth',
      data: { email_destino: 'a', estado_envio: 'exitoso' },
    });
  });

  it('acepta también mensajes con envoltura de Nest', () => {
    const out = new CorreoAuthPlainDeserializer().deserialize({
      pattern: 'correo_auth',
      data: { x: 1 },
    });
    expect(out).toEqual({ pattern: 'correo_auth', data: { x: 1 } });
  });

  it('el cliente publica en auth.events y el servidor escucha notificaciones.events', () => {
    expect(buildAuthEventsClientOptions().options).toEqual(
      expect.objectContaining({
        exchange: 'auth.events',
        exchangeType: 'topic',
        wildcards: true,
      }),
    );
    expect(buildNotificacionesServerOptions().options).toEqual(
      expect.objectContaining({
        exchange: 'notificaciones.events',
        queue: 'auth.correo_auth',
        noAck: false,
      }),
    );
  });
});

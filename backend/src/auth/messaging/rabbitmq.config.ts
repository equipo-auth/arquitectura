import {
  ConsumerDeserializer,
  IncomingEvent,
  ReadPacket,
  RmqOptions,
  Serializer,
  Transport,
} from '@nestjs/microservices';

/** Token de inyección del ClientProxy que publica en auth.events */
export const RABBITMQ_NOTIFICATIONS = 'RABBITMQ_NOTIFICATIONS';

/** Routing keys publicadas por Auth (Contrato Auth ↔ Notificaciones v1.0) */
export const AUTH_EVENTS = {
  RECUPERACION_CUENTA: 'recuperacion_cuenta',
  CUENTA_STAFF: 'cuenta_staff',
} as const;

/** Routing keys consumidas por Auth */
export const NOTIFICACIONES_EVENTS = {
  CORREO_AUTH: 'correo_auth',
} as const;

export const rabbitConfig = () => ({
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  authExchange: process.env.RABBITMQ_AUTH_EXCHANGE || 'auth.events',
  notificacionesExchange:
    process.env.RABBITMQ_NOTIFICACIONES_EXCHANGE || 'notificaciones.events',
  exchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || 'topic',
  inboundQueue: process.env.RABBITMQ_AUTH_INBOUND_QUEUE || 'auth.correo_auth',
});

/**
 * Publica el payload como JSON plano (sin la envoltura { pattern, data } de Nest).
 * El pattern del emit() se usa como routing key en el exchange.
 */
export class PlainJsonSerializer implements Serializer<
  ReadPacket<Record<string, unknown>>,
  Record<string, unknown>
> {
  serialize(
    packet: ReadPacket<Record<string, unknown>>,
  ): Record<string, unknown> {
    return packet.data;
  }
}

const isNestEnvelope = (
  value: unknown,
): value is { pattern: string; data: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  'pattern' in value &&
  'data' in value;

/**
 * Recibe JSON plano desde notificaciones.events. La cola de entrada solo está
 * enlazada a la routing key correo_auth, por lo que todo mensaje plano se
 * enruta al handler @EventPattern('correo_auth').
 */
export class CorreoAuthPlainDeserializer implements ConsumerDeserializer {
  deserialize(value: unknown): IncomingEvent {
    if (isNestEnvelope(value)) {
      return { pattern: value.pattern, data: value.data };
    }
    return { pattern: NOTIFICACIONES_EVENTS.CORREO_AUTH, data: value };
  }
}
/** Cliente de salida: Auth -> exchange auth.events */
export const buildAuthEventsClientOptions = (): RmqOptions => {
  const cfg = rabbitConfig();
  return {
    transport: Transport.RMQ,
    options: {
      urls: [cfg.url],
      exchange: cfg.authExchange,
      exchangeType: cfg.exchangeType,
      wildcards: true,
      persistent: true,
      serializer: new PlainJsonSerializer(),
    },
  };
};

/** Servidor de entrada: exchange notificaciones.events -> cola de Auth */
export const buildNotificacionesServerOptions = (): RmqOptions => {
  const cfg = rabbitConfig();
  return {
    transport: Transport.RMQ,
    options: {
      urls: [cfg.url],
      queue: cfg.inboundQueue,
      queueOptions: { durable: true },
      exchange: cfg.notificacionesExchange,
      exchangeType: cfg.exchangeType,
      wildcards: true,
      noAck: false,
      prefetchCount: 10,
      deserializer: new CorreoAuthPlainDeserializer(),
    },
  };
};

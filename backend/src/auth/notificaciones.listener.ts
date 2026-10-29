import { Controller, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import type { Channel, Message } from 'amqplib';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CorreoAuthDto } from './dto/correo-auth.dto';
import {
  NOTIFICACIONES_EVENTS,
  rabbitConfig,
} from './messaging/rabbitmq.config';

@SkipThrottle()
@Controller()
export class NotificacionesListener {
  private readonly logger = new Logger(NotificacionesListener.name);

  constructor(
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // En segundo plano: la recepción RabbitMQ no depende de que el audit log esté disponible.
  private recordDelivery(email: string, outcome: 'SUCCESS' | 'ERROR') {
    if (!this.audit) return;
    void (async () => {
      try {
        const user = await this.prisma?.user.findUnique({
          where: { email: email.trim().toLowerCase() },
          select: { uuid: true },
        });
        await this.audit?.record({
          event: 'CORREO_AUTH_RESULT', outcome,
          subjectUuid: user?.uuid,
          detail: outcome === 'SUCCESS' ? 'Notificaciones reportó exitoso' : 'Notificaciones reportó error',
        });
      } catch {
        // No perjudicar el ACK por un fallo de auditoría.
      }
    })();
  }

  @EventPattern(NOTIFICACIONES_EVENTS.CORREO_AUTH)
  async handleCorreoAuth(
    @Payload() payload: unknown,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as Message;

    const traza = {
      evento: NOTIFICACIONES_EVENTS.CORREO_AUTH,
      exchange:
        message?.fields?.exchange || rabbitConfig().notificacionesExchange,
      routing_key: message.fields.routingKey,
      message_id: (message.properties.messageId as string | undefined) ?? null,
      recibido_en: new Date().toISOString(),
    };

    try {
      const dto = plainToInstance(CorreoAuthDto, payload);
      const errores = await validate(dto);

      if (errores.length > 0) {
        const detalle = errores.flatMap((e) =>
          Object.values(e.constraints ?? {}),
        );
        this.logger.error(
          `[CORREO_AUTH][PAYLOAD_INVALIDO] ${JSON.stringify({ ...traza, errores: detalle })}`,
        );
        return;
      }

      const registro = JSON.stringify({
        ...traza,
        email_destino: dto.email_destino,
        estado_envio: dto.estado_envio,
        error_envio: dto.error_envio ?? null,
      });

      if (dto.estado_envio === 'exitoso') {
        this.logger.log(`[CORREO_AUTH][ENTREGADO] ${registro}`);
        this.recordDelivery(dto.email_destino, 'SUCCESS');
      } else {
        this.logger.error(`[CORREO_AUTH][REBOTADO] ${registro}`);
        this.recordDelivery(dto.email_destino, 'ERROR');
      }
    } catch (error) {
      this.logger.error(
        `[CORREO_AUTH][ERROR_PROCESAMIENTO] ${JSON.stringify(traza)} error=${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      channel.ack(message);
    }
  }
}

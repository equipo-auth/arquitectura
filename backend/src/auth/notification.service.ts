import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import {
  AUTH_EVENTS,
  RABBITMQ_NOTIFICATIONS,
  rabbitConfig,
} from './messaging/rabbitmq.config';
import {
  CuentaStaffEvent,
  RecuperacionCuentaEvent,
} from './messaging/auth-events.interface';

const PUBLISH_TIMEOUT_MS = 5000; // SLA contrato v1.0 (≤ 5 s)

@Injectable()
export class NotificationService implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(RABBITMQ_NOTIFICATIONS) private readonly rabbitClient: ClientProxy,
  ) {}

  /** HU-B5 — firma original conservada */
  async sendRecoveryEmail(payload: RecuperacionCuentaEvent): Promise<boolean> {
    return this.publish(AUTH_EVENTS.RECUPERACION_CUENTA, {
      Id_usuario: payload.Id_usuario,
      email_destino: payload.email_destino,
      url: payload.url,
    });
  }

  /** HU-B4 */
  async sendStaffAccountEmail(payload: CuentaStaffEvent): Promise<boolean> {
    return this.publish(AUTH_EVENTS.CUENTA_STAFF, {
      email_destino: payload.email_destino,
      url: payload.url,
    });
  }

  private async publish(
    routingKey: string,
    payload: CuentaStaffEvent | RecuperacionCuentaEvent,
  ): Promise<boolean> {
    const exchange = rabbitConfig().authExchange;
    try {
      await lastValueFrom(
        this.rabbitClient
          .emit(routingKey, payload)
          .pipe(timeout(PUBLISH_TIMEOUT_MS)),
        { defaultValue: undefined },
      );
      this.logger.log(
        `[PUBLICADO] exchange=${exchange} routing_key=${routingKey} email_destino=${payload.email_destino}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `[FALLO_PUBLICACION] exchange=${exchange} routing_key=${routingKey} email_destino=${payload.email_destino} error=${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async onApplicationShutdown() {
    await this.rabbitClient.close();
  }
}

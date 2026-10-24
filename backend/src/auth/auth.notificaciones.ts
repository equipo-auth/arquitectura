import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class NotificationService {
  constructor(
    @Inject('RABBITMQ_NOTIFICATIONS') private rabbitClient: ClientProxy, 
  ) {}

  async sendRecoveryEmail(payload: { Id_usuario: string; email_destino: string; url: string }) {
    try {
      this.rabbitClient.emit('recuperacion_cuenta', payload);
      console.log(`Evento de recuperación enviado a RabbitMQ para: ${payload.email_destino}`);
    } catch (error) {
      console.error('Error al publicar evento en RabbitMQ:', error);
    }
  }
}

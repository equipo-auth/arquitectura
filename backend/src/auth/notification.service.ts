import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly queueName = 'notificaciones_recuperacion';


  async onModuleInit() {
    const rabbitUrl = process.env.RABBITMQ_URL;
    if (rabbitUrl) {
      try {
        this.connection = await amqp.connect(rabbitUrl);
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(this.queueName, { durable: true });
        this.logger.log('Conectado exitosamente a RabbitMQ para notificaciones.');
      } catch (error) {
        this.logger.warn(`No se pudo conectar a RabbitMQ: ${error.message}. Se usará fallback por logger.`);
      }
    } else {
      this.logger.log('RABBITMQ_URL no configurado. Las notificaciones se registrarán en los logs.');
    }
  }

  async sendPasswordRecoveryEvent(email: string, resetUrl: string, token: string) {
    const eventPayload = {
      tipo: 'enviar_correo_recuperacion',
      email,
      resetUrl,
      token,
      timestamp: new Date().toISOString(),
    };

    if (this.channel) {
      try {
        this.channel.sendToQueue(
          this.queueName,
          Buffer.from(JSON.stringify(eventPayload)),
          { persistent: true },
        );
        this.logger.log(`Evento de recuperación enviado a la cola para ${email}`);
        return;
      } catch (err) {
        this.logger.error(`Error publicando evento en RabbitMQ: ${err.message}`);
      }
    }

    // Fallback: Registrar en logger
    this.logger.log(`[NOTIFICACIÓN] Para: ${email} | URL Recuperación: ${resetUrl}`);
  }
}

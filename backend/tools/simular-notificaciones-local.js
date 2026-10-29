/**
 * Simulador LOCAL de Notificaciones: solo verifica el circuito RabbitMQ.
 * Nunca manda correos. NO ejecutarlo junto al consumidor real.
 * Ejecutar desde backend/: node tools/simular-notificaciones-local.js
 */
require('dotenv').config();
const amqp = require('amqplib');

async function main() {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('Configura RABBITMQ_URL en backend/.env');
  const inExchange = process.env.RABBITMQ_AUTH_EXCHANGE || 'auth.events';
  const outExchange = process.env.RABBITMQ_NOTIFICACIONES_EXCHANGE || 'notificaciones.events';
  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  await channel.assertExchange(inExchange, 'topic', { durable: true });
  await channel.assertExchange(outExchange, 'topic', { durable: true });
  const { queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  for (const key of ['recuperacion_cuenta', 'cuenta_staff']) {
    await channel.bindQueue(queue, inExchange, key);
  }
  console.log(`[SIMULADOR] Escuchando ${inExchange}: recuperacion_cuenta, cuenta_staff`);
  console.log('[SIMULADOR] Las confirmaciones son simuladas: NO se han entregado correos.');

  await channel.consume(queue, async (message) => {
    if (!message) return;
    try {
      const payload = JSON.parse(message.content.toString('utf8'));
      // No mostrar tokens ni URLs secretas en consola.
      if (!payload.email_destino || !payload.url) throw new Error('Falta email_destino o url');
      if (message.fields.routingKey === 'recuperacion_cuenta' && !payload.Id_usuario) {
        throw new Error('Falta Id_usuario');
      }
      console.log(`[SIMULADOR] Recibido ${message.fields.routingKey} para ${payload.email_destino}`);
      channel.publish(outExchange, 'correo_auth', Buffer.from(JSON.stringify({
        email_destino: payload.email_destino, estado_envio: 'exitoso',
      })), { persistent: true, contentType: 'application/json' });
      await channel.waitForConfirms();
      channel.ack(message);
    } catch (err) {
      console.error('[SIMULADOR] Evento inválido:', err.message);
      channel.nack(message, false, false);
    }
  }, { noAck: false });

  const shutdown = async () => { await channel.close(); await connection.close(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
main().catch((err) => { console.error(err.message); process.exit(1); });

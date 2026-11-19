import {
  BadGatewayException,
  Controller,
  ForbiddenException,
  GatewayTimeoutException,
  Get,
  Logger,
  NotFoundException,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

/**
 * GW1 — Auth consume el centro de notificaciones del usuario mediante Gateway.
 * Notificaciones revalida la cookie JWT con Auth; no se inventa la identidad.
 * Este controlador no modifica datos y no participa del flujo de login.
 */
@Controller('api/auth')
export class NotificacionesGatewayController {
  private readonly logger = new Logger(NotificacionesGatewayController.name);

  @Get('mis-notificaciones')
  @UseGuards(AuthGuard('jwt'))
  async obtener(@Req() req: Request): Promise<unknown[]> {
    const gateway = process.env.API_GATEWAY_URL?.trim();
    const ruta = process.env.NOTIFICACIONES_API_PATH?.trim() || '/api/notificaciones';
    const timeout = Number(process.env.NOTIFICACIONES_TIMEOUT_MS || '3000');

    if (!gateway || !ruta.startsWith('/api/notificaciones') || ruta.startsWith('//') ||
        !Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30000) {
      throw new ServiceUnavailableException('Centro de notificaciones no configurado');
    }

    let destino: URL;
    try {
      destino = new URL(ruta, gateway);
      const base = new URL(gateway);
      if (!['http:', 'https:'].includes(base.protocol) || destino.origin !== base.origin ||
          base.username || base.password) throw new Error('Gateway inválido');
    } catch {
      throw new ServiceUnavailableException('Configuración de Gateway inválida');
    }

    // Solo reenviar la cookie JWT, nunca otros datos de sesión ni API keys.
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)(jwt=[^;\s]+)/)?.[1];
    if (!cookie) throw new UnauthorizedException('Inicia sesión para consultar tus notificaciones');

    const inicio = Date.now();
    let respuesta: Response;
    try {
      respuesta = await fetch(destino, {
        method: 'GET',
        headers: { Cookie: cookie, Accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      const agotado = error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.warn(`GW1 GET ${ruta} Gateway sin respuesta timeout=${agotado} duracion_ms=${Date.now() - inicio}`);
      if (agotado) throw new GatewayTimeoutException('Notificaciones no respondió a tiempo');
      throw new ServiceUnavailableException('Centro de notificaciones temporalmente no disponible');
    }

    this.logger.log(`GW1 GET ${ruta} Gateway HTTP=${respuesta.status} duracion_ms=${Date.now() - inicio}`);
    if (respuesta.status === 401) throw new UnauthorizedException('La sesión no es válida en Notificaciones');
    if (respuesta.status === 403) throw new ForbiddenException('Notificaciones rechazó el acceso');
    if (respuesta.status === 404) throw new NotFoundException('Ruta de Notificaciones no disponible en el Gateway');
    if (!respuesta.ok) throw new ServiceUnavailableException('Centro de notificaciones no disponible');

    let datos: unknown;
    try { datos = await respuesta.json(); }
    catch { throw new BadGatewayException('Respuesta inválida de Notificaciones'); }
    if (!Array.isArray(datos)) throw new BadGatewayException('Formato de Notificaciones incompatible');

    // Restringir los campos devueltos por el proveedor y el tamaño de la vista.
    const salida = datos.slice(0, 50).map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadGatewayException('Elemento de notificación inválido');
      }
      const valor = item as Record<string, unknown>;
      return {
        id_notificacion: String(valor.id_notificacion ?? '').slice(0, 80),
        tipo: String(valor.tipo ?? valor.titulo ?? 'Notificación').slice(0, 80),
        mensaje: String(valor.mensaje ?? '').slice(0, 1200),
        estado_lectura: String(valor.estado_lectura ?? 'NO_LEIDA').slice(0, 20),
        created_at: String(valor.created_at ?? '').slice(0, 50),
      };
    });
    this.logger.log(`GW1 listado confirmado total=${salida.length}`);
    return salida;
  }
}

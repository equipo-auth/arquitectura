import {
  BadGatewayException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificacionesGatewayController } from './notificaciones-gateway.controller';
import { Request } from 'express';

describe('GW1 Auth consume Notificaciones a través de API Gateway', () => {
  const originalFetch = global.fetch;
  const originalGateway = process.env.API_GATEWAY_URL;
  const originalRuta = process.env.NOTIFICACIONES_API_PATH;
  const originalTimeout = process.env.NOTIFICACIONES_TIMEOUT_MS;
  let controller: NotificacionesGatewayController;

  const req = (cookie?: string) => ({headers:{cookie}} as Request);

  beforeEach(() => {
    controller = new NotificacionesGatewayController();
    process.env.API_GATEWAY_URL = 'http://gateway-pruebas:8080';
    process.env.NOTIFICACIONES_API_PATH = '/api/notificaciones';
    process.env.NOTIFICACIONES_TIMEOUT_MS = '3000';
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalGateway === undefined) delete process.env.API_GATEWAY_URL;
    else process.env.API_GATEWAY_URL = originalGateway;
    if (originalRuta === undefined) delete process.env.NOTIFICACIONES_API_PATH;
    else process.env.NOTIFICACIONES_API_PATH = originalRuta;
    if (originalTimeout === undefined) delete process.env.NOTIFICACIONES_TIMEOUT_MS;
    else process.env.NOTIFICACIONES_TIMEOUT_MS = originalTimeout;
  });

  it('obtiene el JSON del proveedor por Gateway, reenviando solo jwt', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify([{id_notificacion:1,tipo:'COMPRA',mensaje:'Compra confirmada',estado_lectura:'NO_LEIDA',created_at:'2026-11-18T00:00:00Z'}]), {status:200,headers:{'content-type':'application/json'}}));
    const result = await controller.obtener(req('jwt=prueba.firma; otro=secreto'));
    expect(result).toHaveLength(1);
    const [url, opciones] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://gateway-pruebas:8080/api/notificaciones');
    expect(opciones.headers).toEqual({Cookie:'jwt=prueba.firma',Accept:'application/json'});
  });

  it('rechaza ausencia de sesión', async () => {
    await expect(controller.obtener(req())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('trata 404 como ruta ausente, sin derribar Auth', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}',{status:404}));
    await expect(controller.obtener(req('jwt=prueba'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maneja errores 5xx del proveedor', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}',{status:502}));
    await expect(controller.obtener(req('jwt=prueba'))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maneja timeouts de forma controlada', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(Object.assign(new Error('timeout'), {name:'TimeoutError'}));
    await expect(controller.obtener(req('jwt=prueba'))).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('rechaza respuestas JSON con formato inesperado', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{"foo":true}',{status:200}));
    await expect(controller.obtener(req('jwt=prueba'))).rejects.toBeInstanceOf(BadGatewayException);
  });
});

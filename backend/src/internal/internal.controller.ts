// src/internal/internal.controller.ts
import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { mapRolContrato, RolContrato } from '../auth/rol-contrato';
import type { SessionUser } from '../auth/jwt.strategy';
import { formatRut } from '../common/rut';

/** Respuesta 200 según contrato general de Auth */
export interface ValidarSesionResponse {
  valido: true;
  usuario: {
    id_usuario: string;
    nombre_completo: string;
    rut: string;
    correo_electronico: string;
    rol: RolContrato;
  };
}

/** Respuesta de error unificada para /internal */
export interface ContractErrorResponse {
  valido: false;
  codigo_http: number;
  error: string;
  mensaje: string;
}

const ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.TOO_MANY_REQUESTS]: 'too_many_requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal_error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};

const DEFAULT_MESSAGES: Record<number, string> = {
  [HttpStatus.UNAUTHORIZED]: 'Sesión ausente, inválida, expirada o revocada',
  [HttpStatus.FORBIDDEN]: 'Servicio no autorizado a consultar la red interna',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Error interno en Auth',
};

/** Convierte cualquier excepción de /internal al formato de error del contrato. */
@Catch()
export class ContractExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ContractExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(
        `[INTERNAL] ${request.method} ${request.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[INTERNAL] ${request.method} ${request.originalUrl} -> ${status}`,
      );
    }

    const body: ContractErrorResponse = {
      valido: false,
      codigo_http: status,
      error: ERROR_CODES[status] ?? 'error',
      mensaje:
        DEFAULT_MESSAGES[status] ??
        (exception instanceof HttpException
          ? exception.message
          : 'Error interno en Auth'),
    };

    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json(body);
  }
}

@ApiTags('Interno (Introspección)')
@SkipThrottle()
@UseFilters(ContractExceptionFilter)
@Controller('internal')
export class InternalController {
  @Get('validar-sesion')
  @UseGuards(InternalApiKeyGuard, JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'x-api-key',
    required: true,
    description: 'Clave de servicio interno',
  })
  @ApiHeader({
    name: 'Cookie',
    required: true,
    description: 'Cookie original del Frontend: jwt=...',
  })
  @ApiOperation({
    summary:
      'Introspección centralizada de sesión para servicios autorizados',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión válida. Perfil normalizado con rol del contrato.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Cookie ausente/inválida, JWT expirado/revocado o usuario inexistente.',
  })
  @ApiResponse({
    status: 403,
    description: 'Servicio no autorizado (x-api-key ausente o inválida).',
  })
  @ApiResponse({ status: 500, description: 'Error interno en Auth.' })
  validarSesion(
    @Req() req: Request & { user: SessionUser },
  ): ValidarSesionResponse {
    const user = req.user;
    return {
      valido: true,
      usuario: {
        id_usuario: user.uuid,
        nombre_completo: user.nombre,
        rut: formatRut(user.rut),
        correo_electronico: user.email,
        rol: mapRolContrato(user.rol),
      },
    };
  }
}

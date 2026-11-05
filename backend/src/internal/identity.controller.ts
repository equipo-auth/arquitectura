import {
  Controller, Get, Param, ParseUUIDPipe, UseFilters, UseGuards,
  NotFoundException, Header,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';
import { ContractExceptionFilter } from './internal.controller';
import { formatRut } from '../common/rut';

/** HU-B6: consulta por UUID, solo intranet + x-api-key; nunca pasa por Gateway público. */
@ApiTags('Interno (Identidad)')
@Controller('internal')
@UseFilters(ContractExceptionFilter)
@UseGuards(InternalApiKeyGuard)
@SkipThrottle()
export class IdentityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('identidad/:uuid')
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiOperation({ summary: 'HU-B6: devuelve exclusivamente RUT y nombre de un UUID' })
  @ApiResponse({ status: 200, description: '{rut, nombre}' })
  @ApiResponse({ status: 403, description: 'API Key incorrecta o ausente' })
  @ApiResponse({ status: 404, description: 'Identidad inexistente' })
  async buscar(@Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string) {
    const user = await this.prisma.user.findUnique({
      where: { uuid },
      select: { rut: true, nombre: true, activo: true },
    });
    if (!user || !user.activo) throw new NotFoundException('Identidad no encontrada');
    return { rut: formatRut(user.rut), nombre: user.nombre };
  }
}

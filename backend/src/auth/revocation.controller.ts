import {
  Body, Controller, HttpCode, HttpStatus, NotFoundException, Post, UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OperationsKeyGuard } from './operations-key.guard';
import { RevokeSessionDto } from './dto/revoke-session.dto';

/** HU-B8: revocación segura en Auth sin crear un cuarto rol en PostgreSQL. */
@ApiTags('Administración operativa')
@Controller('api/auth')
export class RevocationController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Post('revoke-session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OperationsKeyGuard)
  @ApiHeader({ name: 'x-operations-key', required: true, description: 'Secreto operativo exclusivo del backend; no enviar desde browser' })
  @ApiOperation({ summary: 'HU-B8: fuerza revocación incrementando token_version' })
  @ApiResponse({ status: 200, description: 'Todas las cookies JWT previas del usuario quedan invalidadas' })
  @ApiResponse({ status: 403, description: 'Falta o es incorrecta x-operations-key' })
  @ApiResponse({ status: 404, description: 'UUID no encontrado' })
  async revocar(@Body() dto: RevokeSessionDto) {
    const result = await this.prisma.user.updateMany({
      where: { uuid: dto.target_user_id },
      data: { token_version: { increment: 1 } },
    });
    if (result.count !== 1) throw new NotFoundException('Cuenta no encontrada');
    await this.audit.record({
      event: 'SESSION_REVOKED_BY_OPERATOR', outcome: 'SUCCESS', subjectUuid: dto.target_user_id,
      detail: `motivo=${dto.reason.slice(0, 100)}`,
    });
    return { revocada: true, id_usuario: dto.target_user_id };
  }
}

import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** El resto del perfil se obtiene EXCLUSIVAMENTE de Keycloak. */
export class ProvisionDto {
  @ApiProperty({ example: 'organizador@ticketu.cl' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

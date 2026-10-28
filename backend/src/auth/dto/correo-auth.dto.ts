import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/** Respuesta de Notificaciones (Contrato v1.0, sección 2.6) */
export class CorreoAuthDto {
  @IsNotEmpty()
  @IsEmail()
  email_destino: string;

  @IsNotEmpty()
  @IsIn(['exitoso', 'error'])
  estado_envio: 'exitoso' | 'error';

  @IsOptional()
  @IsString()
  error_envio?: string;
}

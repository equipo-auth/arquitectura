import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RevokeSessionDto {
  @IsNotEmpty({ message: 'El ID del usuario objetivo es obligatorio' })
  @IsUUID('4', { message: 'El ID debe ser un UUID v4 válido' })
  target_user_id: string;

  @IsNotEmpty({ message: 'El motivo de revocación es obligatorio' })
  @IsString()
  reason: string;
}

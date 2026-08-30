import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'El token de recuperación es obligatorio' })
  @IsString()
  token: string;

  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
  @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres' })
  new_password: string;
}

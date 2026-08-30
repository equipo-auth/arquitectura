import { IsEmail, IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'El RUT es obligatorio' })
  @IsString()
  @Matches(/^(\d{1,2}\.\d{3}\.\d{3}[-][0-9kK]|\d{7,8}[-][0-9kK]|\d{7,8}[0-9kK])$/, {
    message: 'El RUT entregado no tiene un formato válido',
  })
  rut: string;

  @IsNotEmpty({ message: 'El email es obligatorio' })
  @IsEmail({}, { message: 'Formato de email inválido' })
  email: string;

  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  nombre: string;
}

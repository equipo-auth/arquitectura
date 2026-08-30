import { IsEmail, IsNotEmpty, IsString, IsIn, Matches } from 'class-validator';

export class ProvisionDto {
  @IsNotEmpty({ message: 'El RUT es obligatorio' })
  @IsString()
  @Matches(/^(\d{1,2}\.\d{3}\.\d{3}[-][0-9kK]|\d{7,8}[-][0-9kK]|\d{7,8}[0-9kK])$/, {
    message: 'El RUT entregado no tiene un formato válido',
  })
  rut: string;

  @IsNotEmpty({ message: 'El email es obligatorio' })
  @IsEmail({}, { message: 'Formato de email inválido' })
  email: string;

  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  nombre: string;

  @IsNotEmpty({ message: 'El rol es obligatorio' })
  @IsIn(['ORGANIZADOR', 'STAFF'], { message: 'El rol asignable debe ser ORGANIZADOR o STAFF' })
  rol: 'ORGANIZADOR' | 'STAFF';
}

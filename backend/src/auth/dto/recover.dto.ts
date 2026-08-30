import { IsEmail, IsNotEmpty } from 'class-validator';

export class RecoverDto {
  @IsNotEmpty({ message: 'El email es obligatorio' })
  @IsEmail({}, { message: 'Formato de email inválido' })
  email: string;
}

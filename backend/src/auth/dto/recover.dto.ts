import { IsEmail, IsNotEmpty } from 'class-validator';

export class RecoverDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}



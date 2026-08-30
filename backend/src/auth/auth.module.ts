import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RsaKeyService } from './rsa-key.service';
import { NotificationService } from './notification.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, RsaKeyService, NotificationService, JwtStrategy],
  exports: [AuthService, RsaKeyService],
})
export class AuthModule {}

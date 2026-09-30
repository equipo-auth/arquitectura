import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RsaKeyService } from './rsa-key.service';
import { NotificationService } from './notification.service';
import { JwtStrategy } from './jwt.strategy';
import { KeycloakModule } from '../keycloak/keycloak.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    
    // Configuración directa y estricta para RSA-256
    JwtModule.registerAsync({
      inject: [RsaKeyService],
      extraProviders: [RsaKeyService], 
      useFactory: (rsaKeyService: RsaKeyService) => ({
        privateKey: rsaKeyService.getPrivateKey(),
        publicKey: rsaKeyService.getPublicKey(),
        signOptions: { 
          algorithm: 'RS256', // Exigencia HU-B2
        },
      }),
    }),
    
    HttpModule,
    ConfigModule,
    KeycloakModule
  ],
  controllers: [AuthController],
  providers: [AuthService, RsaKeyService, NotificationService, JwtStrategy],
  exports: [AuthService, RsaKeyService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule } from '@nestjs/microservices';
import { AuthController } from './auth.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RsaKeyService } from './rsa-key.service';
import { NotificationService } from './notification.service';
import { JwtStrategy } from './jwt.strategy';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { NotificacionesListener } from './notificaciones.listener';
import { RolesGuard } from './roles.guard';
import { RABBITMQ_NOTIFICATIONS, buildAuthEventsClientOptions } from './messaging/rabbitmq.config';

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
    KeycloakModule,

    // Cliente RabbitMQ: publica JSON plano en el exchange auth.events
    ClientsModule.registerAsync([
      {
        name: RABBITMQ_NOTIFICATIONS,
        useFactory: buildAuthEventsClientOptions,
      },
    ]),
  ],
  controllers: [AuthController, NotificacionesListener],
  providers: [AuthService, RsaKeyService, NotificationService, JwtStrategy, RolesGuard],
  exports: [AuthService, RsaKeyService],
})
export class AuthModule {}

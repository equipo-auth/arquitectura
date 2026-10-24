import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices'; 
import { AuthController } from './auth.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RsaKeyService } from './rsa-key.service';
import { NotificationService } from './auth.notificaciones';
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
    KeycloakModule,

    // Configuración del cliente de RabbitMQ para el NotificationService
    ClientsModule.register([
      {
        name: 'RABBITMQ_NOTIFICATIONS',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'notificaciones_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, RsaKeyService, NotificationService, JwtStrategy],
  exports: [AuthService, RsaKeyService],
})
export class AuthModule {}

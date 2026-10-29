import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { RequestAuditMiddleware } from './audit/request-audit.middleware';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { InternalController } from './internal/internal.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    // Rate Limiting: 10 peticiones por ventana de 15 minutos (900 segundos) por IP por defecto
    ThrottlerModule.forRoot([
      {
        ttl: 15 * 60 * 1000,
        limit: 10,
      },
    ]),
    AuthModule,
  ],
  controllers: [AppController, InternalController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestAuditMiddleware).forRoutes('*');
  }
}

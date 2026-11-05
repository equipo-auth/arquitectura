import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { RequestAuditMiddleware } from './audit/request-audit.middleware';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { InternalController } from './internal/internal.controller';
import { IdentityController } from './internal/identity.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    // Rate Limiting global para rutas públicas; login aplica su propia política de fallos (HU-B2).
    ThrottlerModule.forRoot([
      {
        ttl: 15 * 60 * 1000,
        limit: 300,
      },
    ]),
    AuthModule,
  ],
  controllers: [AppController, InternalController, IdentityController],
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

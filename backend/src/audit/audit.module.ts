import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequestAuditMiddleware } from './request-audit.middleware';

@Global()
@Module({
  providers: [AuditService, RequestAuditMiddleware],
  exports: [AuditService, RequestAuditMiddleware],
})
export class AuditModule {}

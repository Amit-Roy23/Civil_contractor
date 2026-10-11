import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { RbacGuard } from './rbac/rbac.guard.js';
import { ScopeService } from './scope/scope.service.js';
import { AuditService } from './audit/audit.service.js';
import { NumberingService } from './numbering/numbering.service.js';
import { FinancialYearService } from './fy/fy.service.js';
import { ApprovalsService } from './approvals/approvals.service.js';
import { ApprovalsController } from './approvals/approvals.controller.js';
import { AttachmentsService } from './attachments/attachments.service.js';
import { FieldMaskingInterceptor } from './interceptors/field-masking.interceptor.js';

@Global()
@Module({
  controllers: [AuthController, ApprovalsController],
  providers: [
    AuthService,
    AuthGuard,
    RbacGuard,
    ScopeService,
    AuditService,
    NumberingService,
    FinancialYearService,
    ApprovalsService,
    AttachmentsService,
    FieldMaskingInterceptor,
  ],
  exports: [
    AuthService,
    AuthGuard,
    RbacGuard,
    ScopeService,
    AuditService,
    NumberingService,
    FinancialYearService,
    ApprovalsService,
    AttachmentsService,
    FieldMaskingInterceptor,
  ],
})
export class CoreModule {}

import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { ApprovalsService } from './approvals.service.js';
import { PostingService } from '../../ledger/posting.service.js';
import { ApprovalActionDto, ApprovalActionSchema, VoucherType } from '@civil/shared';
import { JwtUserPayload } from '../auth/auth.types.js';
import { db } from '../../drizzle/db.js';
import { roles, userRoles } from '../../drizzle/schema/core.js';
import { eq, inArray } from 'drizzle-orm';

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(AuthGuard, RbacGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly approvalsService: ApprovalsService,
    private readonly postingService: PostingService,
  ) {}

  @Get('inbox')
  @ApiOperation({ summary: 'Pending approval inbox for user roles (APR-02)' })
  async getInbox(@CurrentUser() user: JwtUserPayload) {
    // Resolve user's role IDs
    const userRoleLinks = await db.query.userRoles.findMany({
      where: eq(userRoles.userId, user.userId),
    });
    const roleIds = userRoleLinks.map((r) => r.roleId);

    return this.approvalsService.getPendingInbox(user.companyId, roleIds);
  }

  @Post('action')
  @ApiOperation({ summary: 'Approve, Reject, or Send Back voucher (APR-02)' })
  async processAction(@Body() body: ApprovalActionDto, @CurrentUser() user: JwtUserPayload) {
    const validated = ApprovalActionSchema.parse(body);
    const result = await this.approvalsService.processApprovalAction(validated, user.userId);

    // If approved, trigger posting to ledgers
    if (validated.action === 'APPROVE') {
      const canOverrideNeg = user.permissions.includes('stock.override_negative');
      if (validated.voucherType === VoucherType.WASTAGE) {
        await this.postingService.postWastage(validated.voucherId, user.userId, canOverrideNeg);
      } else if (validated.voucherType === VoucherType.STOCK_ADJUSTMENT) {
        await this.postingService.postStockAdjustment(validated.voucherId, user.userId, canOverrideNeg);
      }
    }

    return result;
  }
}

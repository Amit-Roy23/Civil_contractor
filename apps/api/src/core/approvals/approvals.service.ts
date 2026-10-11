import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '../../drizzle/db.js';
import { approvalRules, approvalRequests, notifications, roles } from '../../drizzle/schema/core.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { ApprovalActionDto, VoucherStatus, VoucherType } from '@civil/shared';
import { Decimal } from '@civil/shared';

@Injectable()
export class ApprovalsService {
  /**
   * Evaluates if voucher requires approval and dispatches approval request (APR-01)
   */
  async checkAndCreateApprovalRequest(params: {
    companyId: string;
    voucherType: VoucherType;
    voucherId: string;
    voucherNo: string;
    amount: string | number;
    locationId?: string;
    requestedBy: string;
    tx?: any;
  }): Promise<boolean> {
    const executor = params.tx || db;

    // Fetch applicable rules for this voucher type
    const rules = await executor.query.approvalRules.findMany({
      where: and(
        eq(approvalRules.companyId, params.companyId),
        eq(approvalRules.voucherType, params.voucherType),
        eq(approvalRules.isActive, true),
      ),
      orderBy: [approvalRules.stepOrder],
    });

    const amountDecimal = new Decimal(params.amount);
    const applicableRule = rules.find((r: any) => {
      const threshold = new Decimal(r.minAmount);
      const matchesAmount = amountDecimal.greaterThanOrEqualTo(threshold);
      const matchesLocation = !r.locationId || r.locationId === params.locationId;
      return matchesAmount && matchesLocation;
    });

    // Default rule: Wastage & Stock Adjustments always require Project Manager/Admin approval
    let targetRoleId = applicableRule?.requiredRoleId;
    if (!targetRoleId && (params.voucherType === VoucherType.WASTAGE || params.voucherType === VoucherType.STOCK_ADJUSTMENT)) {
      const adminRole = await executor.query.roles.findFirst({
        where: and(eq(roles.companyId, params.companyId), eq(roles.code, 'ADMIN')),
      });
      targetRoleId = adminRole?.id;
    }

    if (!targetRoleId) {
      return false; // Does not require approval, can post immediately
    }

    // Insert approval request
    await executor.insert(approvalRequests).values({
      companyId: params.companyId,
      voucherType: params.voucherType,
      voucherId: params.voucherId,
      voucherNo: params.voucherNo,
      requestedBy: params.requestedBy,
      approverRoleId: targetRoleId,
      action: 'PENDING',
    });

    return true;
  }

  /**
   * Pending approval inbox for the user (APR-02)
   */
  async getPendingInbox(companyId: string, roleIds: string[]) {
    if (!roleIds || roleIds.length === 0) return [];

    return db.query.approvalRequests.findMany({
      where: and(
        eq(approvalRequests.companyId, companyId),
        eq(approvalRequests.action, 'PENDING'),
        inArray(approvalRequests.approverRoleId, roleIds),
      ),
      orderBy: [desc(approvalRequests.createdAt)],
    });
  }

  /**
   * Action: APPROVE, REJECT, or SEND_BACK (APR-02)
   */
  async processApprovalAction(dto: ApprovalActionDto, userId: string) {
    const request = await db.query.approvalRequests.findFirst({
      where: and(
        eq(approvalRequests.voucherId, dto.voucherId),
        eq(approvalRequests.action, 'PENDING'),
      ),
    });

    if (!request) {
      throw new NotFoundException('Pending approval request not found for this voucher');
    }

    const updated = await db
      .update(approvalRequests)
      .set({
        action: dto.action,
        actionBy: userId,
        actionRemarks: dto.remark || null,
        actionAt: new Date(),
      })
      .where(eq(approvalRequests.id, request.id))
      .returning();

    // Create in-app notification for the requester (APR-02)
    await db.insert(notifications).values({
      companyId: request.companyId,
      userId: request.requestedBy,
      title: `Voucher ${dto.action.replace('_', ' ')}: ${request.voucherNo}`,
      message: `Your voucher ${request.voucherNo} (${request.voucherType}) was ${dto.action.toLowerCase()}${dto.remark ? ': ' + dto.remark : '.'}`,
      link: `/inventory/vouchers/${request.voucherId}`,
    });

    return { success: true, status: dto.action };
  }
}

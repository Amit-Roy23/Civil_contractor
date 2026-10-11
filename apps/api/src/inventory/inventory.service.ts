import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import {
  purchaseOrders,
  purchaseOrderLines,
  grnHeaders,
  grnLines,
  transferIssues,
  transferIssueLines,
  transferReceipts,
  transferReceiptLines,
  siteConsumptions,
  siteConsumptionLines,
  wastageVouchers,
  wastageVoucherLines,
  stockAdjustments,
  stockAdjustmentLines,
  locations,
  items,
  itemUnitConversions,
} from '../drizzle/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import {
  CreatePoDto,
  CreateGrnDto,
  CreateTransferIssueDto,
  ConfirmTransferReceiptDto,
  CreateConsumptionDto,
  CreateWastageDto,
  CreateAdjustmentDto,
  VoucherStatus,
  VoucherType,
  Decimal,
  toMoney,
  convertToBaseQty,
} from '@civil/shared';
import { NumberingService } from '../core/numbering/numbering.service.js';
import { FinancialYearService } from '../core/fy/fy.service.js';
import { PostingService } from '../ledger/posting.service.js';
import { ApprovalsService } from '../core/approvals/approvals.service.js';
import { ScopeService } from '../core/scope/scope.service.js';
import { AuditService } from '../core/audit/audit.service.js';

@Injectable()
export class InventoryService {
  constructor(
    private readonly numberingService: NumberingService,
    private readonly fyService: FinancialYearService,
    private readonly postingService: PostingService,
    private readonly approvalsService: ApprovalsService,
    private readonly scopeService: ScopeService,
    private readonly auditService: AuditService,
  ) {}

  private async getItemConversionFactor(
    itemId: string,
    enteredUnitCode: string,
    tx: any,
  ): Promise<Decimal.Value> {
    const item = await tx.query.items.findFirst({ where: eq(items.id, itemId) });
    if (!item || item.baseUnitCode === enteredUnitCode) {
      return 1;
    }
    const conversion = await tx.query.itemUnitConversions.findFirst({
      where: and(
        eq(itemUnitConversions.itemId, itemId),
        eq(itemUnitConversions.unitCode, enteredUnitCode),
      ),
    });
    return conversion ? conversion.conversionFactor : 1;
  }

  // ==========================================
  // 1. PURCHASE ORDER (PUR-03)
  // ==========================================
  async createPurchaseOrder(dto: CreatePoDto, userId: string, userPermissions: string[] = []) {
    await this.fyService.validateTxnDate(dto.companyId, dto.financialYearId, dto.txnDate, userPermissions);
    await this.scopeService.assertLocationAllowed(dto.deliveryLocationId);

    const activeFy = await this.fyService.getActiveFinancialYear(dto.companyId);
    const fyCode = activeFy?.code.replace('20', '') || '26-27';

    const voucherNo = await this.numberingService.nextVoucherNumber(
      dto.companyId,
      VoucherType.PURCHASE_ORDER,
      dto.deliveryLocationId,
      fyCode,
    );

    let subTotal = new Decimal(0);
    let taxTotal = new Decimal(0);

    return db.transaction(async (tx) => {
      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          companyId: dto.companyId,
          financialYearId: dto.financialYearId,
          voucherNo,
          supplierId: dto.supplierId,
          deliveryLocationId: dto.deliveryLocationId,
          txnDate: dto.txnDate,
          status: VoucherStatus.POSTED, // POs can be posted to order status immediately
          paymentTerms: dto.paymentTerms || null,
          deliveryTerms: dto.deliveryTerms || null,
          remarks: dto.remarks || null,
          createdBy: userId,
        })
        .returning();

      for (const line of dto.lines) {
        const factor = await this.getItemConversionFactor(line.itemId, line.enteredUnitCode, tx);
        const baseQty = convertToBaseQty(line.enteredQty, factor);

        const qtyDec = new Decimal(line.enteredQty);
        const rateDec = new Decimal(line.unitRate);
        const lineAmt = toMoney(qtyDec.times(rateDec));
        const taxAmt = toMoney(lineAmt.times(line.gstPercent).dividedBy(100));

        subTotal = subTotal.plus(lineAmt);
        taxTotal = taxTotal.plus(taxAmt);

        await tx.insert(purchaseOrderLines).values({
          poId: po.id,
          itemId: line.itemId,
          enteredQty: line.enteredQty,
          enteredUnitCode: line.enteredUnitCode,
          baseQty: baseQty.toFixed(4),
          receivedQty: '0.0000',
          unitRate: line.unitRate,
          gstPercent: line.gstPercent.toString(),
          lineAmount: lineAmt.toFixed(2),
          remarks: line.remarks || null,
        });
      }

      const grandTotal = subTotal.plus(taxTotal);
      await tx
        .update(purchaseOrders)
        .set({
          subTotal: subTotal.toFixed(2),
          taxTotal: taxTotal.toFixed(2),
          grandTotal: grandTotal.toFixed(2),
        })
        .where(eq(purchaseOrders.id, po.id));

      await this.auditService.log({
        companyId: dto.companyId,
        userId,
        entity: 'PURCHASE_ORDER',
        entityId: po.id,
        action: 'CREATE',
        afterJson: { voucherNo, grandTotal: grandTotal.toFixed(2) },
        tx,
      });

      return { id: po.id, voucherNo, grandTotal: grandTotal.toFixed(2) };
    });
  }

  // ==========================================
  // 2. GOODS RECEIPT NOTE (GRN) (PUR-04 / MAT-02)
  // ==========================================
  async createGrn(dto: CreateGrnDto, userId: string, userPermissions: string[] = []) {
    await this.fyService.validateTxnDate(dto.companyId, dto.financialYearId, dto.txnDate, userPermissions);
    await this.scopeService.assertLocationAllowed(dto.locationId);

    const activeFy = await this.fyService.getActiveFinancialYear(dto.companyId);
    const fyCode = activeFy?.code.replace('20', '') || '26-27';

    const voucherNo = await this.numberingService.nextVoucherNumber(
      dto.companyId,
      VoucherType.GRN,
      dto.locationId,
      fyCode,
    );

    const canOverrideNeg = userPermissions.includes('stock.override_negative');

    const grn = await db.transaction(async (tx) => {
      const [newGrn] = await tx
        .insert(grnHeaders)
        .values({
          companyId: dto.companyId,
          financialYearId: dto.financialYearId,
          voucherNo,
          poId: dto.poId || null,
          supplierId: dto.supplierId,
          locationId: dto.locationId,
          txnDate: dto.txnDate,
          status: VoucherStatus.DRAFT, // Will be posted via postingService
          supplierChallanNo: dto.supplierChallanNo,
          supplierChallanDate: dto.supplierChallanDate || null,
          vehicleNumber: dto.vehicleNumber,
          weighbridgeSlipNo: dto.weighbridgeSlipNo || null,
          grossWeightKg: dto.grossWeightKg || null,
          tareWeightKg: dto.tareWeightKg || null,
          netWeightKg: dto.netWeightKg || null,
          remarks: dto.remarks || null,
          createdBy: userId,
        })
        .returning();

      for (const line of dto.lines) {
        const factor = await this.getItemConversionFactor(line.itemId, line.enteredUnitCode, tx);
        const baseQty = convertToBaseQty(line.acceptedQty, factor);
        const lineVal = toMoney(new Decimal(line.acceptedQty).times(line.unitRate));

        await tx.insert(grnLines).values({
          grnId: newGrn.id,
          poLineId: line.poLineId || null,
          itemId: line.itemId,
          receivedQty: line.receivedQty,
          acceptedQty: line.acceptedQty,
          rejectedQty: line.rejectedQty || '0',
          enteredUnitCode: line.enteredUnitCode,
          baseQty: baseQty.toFixed(4),
          unitRate: line.unitRate,
          gstPercent: line.gstPercent.toString(),
          lineValue: lineVal.toFixed(2),
          remarks: line.remarks || null,
        });
      }

      return newGrn;
    });

    // Automatically post GRN to Stock Ledger and Party Ledger
    await this.postingService.postGrn(grn.id, userId, canOverrideNeg);

    return { id: grn.id, voucherNo, status: VoucherStatus.POSTED };
  }

  // ==========================================
  // 3. TRANSFER ISSUE (STR-01 / MAT-01)
  // ==========================================
  async createTransferIssue(dto: CreateTransferIssueDto, userId: string, userPermissions: string[] = []) {
    await this.fyService.validateTxnDate(dto.companyId, dto.financialYearId, dto.txnDate, userPermissions);
    await this.scopeService.assertLocationAllowed(dto.fromLocationId);

    // Find the virtual IN_TRANSIT location corresponding to destination or company
    const inTransitLoc = await db.query.locations.findFirst({
      where: and(eq(locations.companyId, dto.companyId), eq(locations.type, 'IN_TRANSIT')),
    });
    if (!inTransitLoc) {
      throw new BadRequestException('No virtual IN_TRANSIT location configured for this company');
    }

    const activeFy = await this.fyService.getActiveFinancialYear(dto.companyId);
    const fyCode = activeFy?.code.replace('20', '') || '26-27';

    const voucherNo = await this.numberingService.nextVoucherNumber(
      dto.companyId,
      VoucherType.TRANSFER_ISSUE,
      dto.fromLocationId,
      fyCode,
    );

    const canOverrideNeg = userPermissions.includes('stock.override_negative');

    const issue = await db.transaction(async (tx) => {
      const [newIssue] = await tx
        .insert(transferIssues)
        .values({
          companyId: dto.companyId,
          financialYearId: dto.financialYearId,
          voucherNo,
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          inTransitLocationId: inTransitLoc.id,
          txnDate: dto.txnDate,
          status: VoucherStatus.DRAFT,
          challanNo: dto.challanNo,
          vehicleNumber: dto.vehicleNumber,
          driverName: dto.driverName || null,
          driverMobile: dto.driverMobile || null,
          remarks: dto.remarks || null,
          createdBy: userId,
        })
        .returning();

      for (const line of dto.lines) {
        const factor = await this.getItemConversionFactor(line.itemId, line.enteredUnitCode, tx);
        const baseQty = convertToBaseQty(line.enteredQty, factor);

        await tx.insert(transferIssueLines).values({
          transferIssueId: newIssue.id,
          itemId: line.itemId,
          enteredQty: line.enteredQty,
          enteredUnitCode: line.enteredUnitCode,
          baseQty: baseQty.toFixed(4),
          remarks: line.remarks || null,
        });
      }

      return newIssue;
    });

    // Post transfer issue (deduct from store, add to IN_TRANSIT)
    await this.postingService.postTransferIssue(issue.id, userId, canOverrideNeg);

    return { id: issue.id, voucherNo, status: VoucherStatus.POSTED };
  }

  // ==========================================
  // 4. CONFIRM TRANSFER RECEIPT (MAT-05)
  // ==========================================
  async confirmTransferReceipt(dto: ConfirmTransferReceiptDto, userId: string, userPermissions: string[] = []) {
    await this.scopeService.assertLocationAllowed(dto.receivedLocationId);

    const issue = await db.query.transferIssues.findFirst({
      where: eq(transferIssues.id, dto.transferIssueId),
    });
    if (!issue) throw new NotFoundException('Transfer issue not found');

    const activeFy = await this.fyService.getActiveFinancialYear(issue.companyId);
    const fyCode = activeFy?.code.replace('20', '') || '26-27';

    const voucherNo = await this.numberingService.nextVoucherNumber(
      issue.companyId,
      VoucherType.TRANSFER_RECEIPT,
      dto.receivedLocationId,
      fyCode,
    );

    const canOverrideNeg = userPermissions.includes('stock.override_negative');

    const rcpt = await db.transaction(async (tx) => {
      const [newRcpt] = await tx
        .insert(transferReceipts)
        .values({
          companyId: issue.companyId,
          financialYearId: issue.financialYearId,
          voucherNo,
          transferIssueId: issue.id,
          receivedLocationId: dto.receivedLocationId,
          txnDate: dto.txnDate,
          status: VoucherStatus.DRAFT,
          remarks: dto.remarks || null,
          createdBy: userId,
        })
        .returning();

      for (const line of dto.lines) {
        const issueLine = await tx.query.transferIssueLines.findFirst({
          where: eq(transferIssueLines.id, line.transferLineId),
        });
        if (!issueLine) {
          throw new BadRequestException(`Transfer line ${line.transferLineId} not found`);
        }
        const factor = await this.getItemConversionFactor(issueLine.itemId, issueLine.enteredUnitCode, tx);
        const baseQty = convertToBaseQty(line.acceptedQty, factor);

        await tx.insert(transferReceiptLines).values({
          transferReceiptId: newRcpt.id,
          transferLineId: line.transferLineId,
          itemId: issueLine.itemId,
          acceptedQty: line.acceptedQty,
          rejectedQty: line.rejectedQty || '0',
          enteredUnitCode: issueLine.enteredUnitCode,
          baseQty: baseQty.toFixed(4),
          remarks: line.remarks || null,
        });
      }

      return newRcpt;
    });

    await this.postingService.postTransferReceipt(rcpt.id, userId, canOverrideNeg);

    return { id: rcpt.id, voucherNo, status: VoucherStatus.POSTED };
  }

  // ==========================================
  // 5. SITE CONSUMPTION (MAT-04)
  // ==========================================
  async createConsumption(dto: CreateConsumptionDto, userId: string, userPermissions: string[] = []) {
    await this.fyService.validateTxnDate(dto.companyId, dto.financialYearId, dto.txnDate, userPermissions);
    this.scopeService.assertSiteAllowed(dto.siteId);
    await this.scopeService.assertLocationAllowed(dto.locationId);

    const activeFy = await this.fyService.getActiveFinancialYear(dto.companyId);
    const fyCode = activeFy?.code.replace('20', '') || '26-27';

    const voucherNo = await this.numberingService.nextVoucherNumber(
      dto.companyId,
      VoucherType.SITE_CONSUMPTION,
      dto.locationId,
      fyCode,
    );

    const canOverrideNeg = userPermissions.includes('stock.override_negative');

    const csmp = await db.transaction(async (tx) => {
      const [newCsmp] = await tx
        .insert(siteConsumptions)
        .values({
          companyId: dto.companyId,
          financialYearId: dto.financialYearId,
          voucherNo,
          siteId: dto.siteId,
          locationId: dto.locationId,
          txnDate: dto.txnDate,
          status: VoucherStatus.DRAFT,
          workSection: dto.workSection || null,
          remarks: dto.remarks || null,
          createdBy: userId,
        })
        .returning();

      for (const line of dto.lines) {
        const factor = await this.getItemConversionFactor(line.itemId, line.enteredUnitCode, tx);
        const baseQty = convertToBaseQty(line.enteredQty, factor);

        await tx.insert(siteConsumptionLines).values({
          consumptionId: newCsmp.id,
          itemId: line.itemId,
          enteredQty: line.enteredQty,
          enteredUnitCode: line.enteredUnitCode,
          baseQty: baseQty.toFixed(4),
          boqItemId: line.boqItemId || null,
          chainageText: line.chainageText || null,
          purpose: line.purpose || null,
        });
      }

      return newCsmp;
    });

    await this.postingService.postSiteConsumption(csmp.id, userId, canOverrideNeg);

    return { id: csmp.id, voucherNo, status: VoucherStatus.POSTED };
  }

  // ==========================================
  // 6. WASTAGE & STOCK ADJUSTMENT (MAT-07, MAT-08)
  // ==========================================
  async createWastage(dto: CreateWastageDto, userId: string, userPermissions: string[] = []) {
    await this.fyService.validateTxnDate(dto.companyId, dto.financialYearId, dto.txnDate, userPermissions);
    await this.scopeService.assertLocationAllowed(dto.locationId);

    const activeFy = await this.fyService.getActiveFinancialYear(dto.companyId);
    const fyCode = activeFy?.code.replace('20', '') || '26-27';

    const voucherNo = await this.numberingService.nextVoucherNumber(
      dto.companyId,
      VoucherType.WASTAGE,
      dto.locationId,
      fyCode,
    );

    return db.transaction(async (tx) => {
      const [wastage] = await tx
        .insert(wastageVouchers)
        .values({
          companyId: dto.companyId,
          financialYearId: dto.financialYearId,
          voucherNo,
          locationId: dto.locationId,
          txnDate: dto.txnDate,
          status: VoucherStatus.PENDING_APPROVAL,
          reasonDescription: dto.reasonDescription,
          remarks: dto.remarks || null,
          createdBy: userId,
        })
        .returning();

      for (const line of dto.lines) {
        const factor = await this.getItemConversionFactor(line.itemId, line.enteredUnitCode, tx);
        const baseQty = convertToBaseQty(line.enteredQty, factor);

        await tx.insert(wastageVoucherLines).values({
          wastageId: wastage.id,
          itemId: line.itemId,
          enteredQty: line.enteredQty,
          enteredUnitCode: line.enteredUnitCode,
          baseQty: baseQty.toFixed(4),
          reason: line.reason,
        });
      }

      // Create approval request (APR-01)
      await this.approvalsService.checkAndCreateApprovalRequest({
        companyId: dto.companyId,
        voucherType: VoucherType.WASTAGE,
        voucherId: wastage.id,
        voucherNo,
        amount: '0.00',
        locationId: dto.locationId,
        requestedBy: userId,
        tx,
      });

      return { id: wastage.id, voucherNo, status: VoucherStatus.PENDING_APPROVAL };
    });
  }

  async createStockAdjustment(dto: CreateAdjustmentDto, userId: string, userPermissions: string[] = []) {
    await this.fyService.validateTxnDate(dto.companyId, dto.financialYearId, dto.txnDate, userPermissions);
    await this.scopeService.assertLocationAllowed(dto.locationId);

    const activeFy = await this.fyService.getActiveFinancialYear(dto.companyId);
    const fyCode = activeFy?.code.replace('20', '') || '26-27';

    const voucherNo = await this.numberingService.nextVoucherNumber(
      dto.companyId,
      VoucherType.STOCK_ADJUSTMENT,
      dto.locationId,
      fyCode,
    );

    return db.transaction(async (tx) => {
      const [adj] = await tx
        .insert(stockAdjustments)
        .values({
          companyId: dto.companyId,
          financialYearId: dto.financialYearId,
          voucherNo,
          locationId: dto.locationId,
          txnDate: dto.txnDate,
          status: VoucherStatus.PENDING_APPROVAL,
          remarks: dto.remarks || null,
          createdBy: userId,
        })
        .returning();

      for (const line of dto.lines) {
        const factor = await this.getItemConversionFactor(line.itemId, line.enteredUnitCode, tx);
        const baseVariance = convertToBaseQty(line.varianceQty, factor);

        await tx.insert(stockAdjustmentLines).values({
          adjustmentId: adj.id,
          itemId: line.itemId,
          systemQty: line.systemQty,
          physicalQty: line.physicalQty,
          varianceQty: line.varianceQty,
          enteredUnitCode: line.enteredUnitCode,
          baseVarianceQty: baseVariance.toFixed(4),
          reason: line.reason,
        });
      }

      await this.approvalsService.checkAndCreateApprovalRequest({
        companyId: dto.companyId,
        voucherType: VoucherType.STOCK_ADJUSTMENT,
        voucherId: adj.id,
        voucherNo,
        amount: '0.00',
        locationId: dto.locationId,
        requestedBy: userId,
        tx,
      });

      return { id: adj.id, voucherNo, status: VoucherStatus.PENDING_APPROVAL };
    });
  }

  // --- QUERY VOUCHERS ---
  async getPurchaseOrders(companyId: string) {
    return db.query.purchaseOrders.findMany({
      where: eq(purchaseOrders.companyId, companyId),
      orderBy: [desc(purchaseOrders.createdAt)],
    });
  }

  async getGrns(companyId: string) {
    return db.query.grnHeaders.findMany({
      where: eq(grnHeaders.companyId, companyId),
      orderBy: [desc(grnHeaders.createdAt)],
    });
  }

  async getTransferIssues(companyId: string) {
    return db.query.transferIssues.findMany({
      where: eq(transferIssues.companyId, companyId),
      orderBy: [desc(transferIssues.createdAt)],
    });
  }

  async getConsumptions(companyId: string) {
    return db.query.siteConsumptions.findMany({
      where: eq(siteConsumptions.companyId, companyId),
      orderBy: [desc(siteConsumptions.createdAt)],
    });
  }
}

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import {
  grnHeaders,
  grnLines,
  purchaseOrderLines,
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
} from '../drizzle/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { StockLedgerService } from './stock-ledger.service.js';
import { CostLedgerService } from './cost-ledger.service.js';
import { PartyLedgerService } from './party-ledger.service.js';
import { AuditService } from '../core/audit/audit.service.js';
import { CostHead, PartyType, VoucherStatus, VoucherType, Decimal } from '@civil/shared';

@Injectable()
export class PostingService {
  constructor(
    private readonly stockLedgerService: StockLedgerService,
    private readonly costLedgerService: CostLedgerService,
    private readonly partyLedgerService: PartyLedgerService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Post GRN to Stock Ledger and Party Ledger (PUR-04 / MAT-02)
   */
  async postGrn(grnId: string, userId: string, canOverrideNegative = false) {
    return db.transaction(async (tx) => {
      const grn = await tx.query.grnHeaders.findFirst({
        where: eq(grnHeaders.id, grnId),
      });
      if (!grn) throw new NotFoundException('GRN not found');
      if (grn.status === VoucherStatus.POSTED) {
        throw new BadRequestException('GRN is already posted');
      }

      const lines = await tx.query.grnLines.findMany({
        where: eq(grnLines.grnId, grnId),
      });

      let totalVal = new Decimal(0);

      for (const line of lines) {
        // Stock In at receiving location
        const postRes = await this.stockLedgerService.postMovement({
          companyId: grn.companyId,
          locationId: grn.locationId,
          itemId: line.itemId,
          txnDate: grn.txnDate,
          voucherType: VoucherType.GRN,
          voucherId: grn.id,
          voucherLineId: line.id,
          voucherNo: grn.voucherNo,
          qtyIn: line.baseQty,
          receiptRate: line.unitRate,
          canOverrideNegative,
          tx,
        });

        totalVal = totalVal.plus(postRes.totalValue);

        // If tied to PO, increment receivedQty
        if (line.poLineId) {
          const poLine = await tx.query.purchaseOrderLines.findFirst({
            where: eq(purchaseOrderLines.id, line.poLineId),
          });
          if (poLine) {
            const updatedReceived = new Decimal(poLine.receivedQty).plus(line.baseQty);
            await tx
              .update(purchaseOrderLines)
              .set({ receivedQty: updatedReceived.toFixed(4) })
              .where(eq(purchaseOrderLines.id, poLine.id));
          }
        }
      }

      // Party Ledger Credit for Supplier
      await this.partyLedgerService.postEntry({
        companyId: grn.companyId,
        partyId: grn.supplierId,
        partyType: PartyType.SUPPLIER,
        txnDate: grn.txnDate,
        credit: totalVal,
        voucherType: VoucherType.GRN,
        voucherId: grn.id,
        voucherNo: grn.voucherNo,
        remarks: `GRN against challan ${grn.supplierChallanNo}`,
        tx,
      });

      // Update GRN status
      await tx
        .update(grnHeaders)
        .set({
          status: VoucherStatus.POSTED,
          totalValue: totalVal.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(grnHeaders.id, grn.id));

      await this.auditService.log({
        companyId: grn.companyId,
        userId,
        entity: 'GRN',
        entityId: grn.id,
        action: 'STATUS_CHANGE',
        beforeJson: { status: grn.status },
        afterJson: { status: VoucherStatus.POSTED, totalValue: totalVal.toFixed(2) },
        reason: 'Posted to stock & party ledger',
        tx,
      });

      return { success: true, voucherNo: grn.voucherNo, totalValue: totalVal.toFixed(2) };
    });
  }

  /**
   * Cancel GRN with full reversal & negative stock check (SEC-03, MAT-10)
   */
  async cancelGrn(grnId: string, reason: string, userId: string, canOverrideNegative = false) {
    return db.transaction(async (tx) => {
      const grn = await tx.query.grnHeaders.findFirst({
        where: eq(grnHeaders.id, grnId),
      });
      if (!grn) throw new NotFoundException('GRN not found');
      if (grn.status !== VoucherStatus.POSTED) {
        throw new BadRequestException('Only POSTED GRNs can be cancelled');
      }

      const lines = await tx.query.grnLines.findMany({
        where: eq(grnLines.grnId, grnId),
      });

      // Reverse stock movements: issue back the items received
      for (const line of lines) {
        await this.stockLedgerService.postMovement({
          companyId: grn.companyId,
          locationId: grn.locationId,
          itemId: line.itemId,
          txnDate: grn.txnDate,
          voucherType: 'GRN_REVERSAL',
          voucherId: grn.id,
          voucherLineId: line.id,
          voucherNo: `REV-${grn.voucherNo}`,
          qtyOut: line.baseQty,
          canOverrideNegative,
          tx,
        });

        // Revert PO line receivedQty if applicable
        if (line.poLineId) {
          const poLine = await tx.query.purchaseOrderLines.findFirst({
            where: eq(purchaseOrderLines.id, line.poLineId),
          });
          if (poLine) {
            const reverted = Decimal.max(0, new Decimal(poLine.receivedQty).minus(line.baseQty));
            await tx
              .update(purchaseOrderLines)
              .set({ receivedQty: reverted.toFixed(4) })
              .where(eq(purchaseOrderLines.id, poLine.id));
          }
        }
      }

      // Reverse party ledger entries
      await this.partyLedgerService.reverseEntries(grn.id, VoucherType.GRN, tx);

      // Mark GRN CANCELLED
      await tx
        .update(grnHeaders)
        .set({
          status: VoucherStatus.CANCELLED,
          cancelReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(grnHeaders.id, grn.id));

      await this.auditService.log({
        companyId: grn.companyId,
        userId,
        entity: 'GRN',
        entityId: grn.id,
        action: 'STATUS_CHANGE',
        beforeJson: { status: grn.status },
        afterJson: { status: VoucherStatus.CANCELLED, cancelReason: reason },
        reason,
        tx,
      });

      return { success: true, message: `GRN ${grn.voucherNo} cancelled successfully` };
    });
  }

  /**
   * Post Transfer Issue from Central Store to virtual IN_TRANSIT (STR-01 / MAT-01)
   */
  async postTransferIssue(transferIssueId: string, userId: string, canOverrideNegative = false) {
    return db.transaction(async (tx) => {
      const issue = await tx.query.transferIssues.findFirst({
        where: eq(transferIssues.id, transferIssueId),
      });
      if (!issue) throw new NotFoundException('Transfer issue not found');
      if (issue.status === VoucherStatus.POSTED) {
        throw new BadRequestException('Transfer issue already posted');
      }

      const lines = await tx.query.transferIssueLines.findMany({
        where: eq(transferIssueLines.transferIssueId, transferIssueId),
      });

      for (const line of lines) {
        // 1. Issue OUT from Source Location (e.g. Central Store)
        const outRes = await this.stockLedgerService.postMovement({
          companyId: issue.companyId,
          locationId: issue.fromLocationId,
          itemId: line.itemId,
          txnDate: issue.txnDate,
          voucherType: VoucherType.TRANSFER_ISSUE,
          voucherId: issue.id,
          voucherLineId: line.id,
          voucherNo: issue.voucherNo,
          qtyOut: line.baseQty,
          canOverrideNegative,
          tx,
        });

        // 2. Receipt IN at virtual IN_TRANSIT location at same valuation rate
        await this.stockLedgerService.postMovement({
          companyId: issue.companyId,
          locationId: issue.inTransitLocationId,
          itemId: line.itemId,
          txnDate: issue.txnDate,
          voucherType: VoucherType.TRANSFER_ISSUE,
          voucherId: issue.id,
          voucherLineId: line.id,
          voucherNo: issue.voucherNo,
          qtyIn: line.baseQty,
          receiptRate: outRes.appliedRate,
          canOverrideNegative: true, // in-transit cannot go negative on inflow
          tx,
        });

        await tx
          .update(transferIssueLines)
          .set({
            valuationRate: outRes.appliedRate.toFixed(4),
            lineValue: outRes.totalValue.toFixed(2),
          })
          .where(eq(transferIssueLines.id, line.id));
      }

      await tx
        .update(transferIssues)
        .set({ status: VoucherStatus.POSTED, updatedAt: new Date() })
        .where(eq(transferIssues.id, issue.id));

      await this.auditService.log({
        companyId: issue.companyId,
        userId,
        entity: 'TRANSFER_ISSUE',
        entityId: issue.id,
        action: 'STATUS_CHANGE',
        beforeJson: { status: issue.status },
        afterJson: { status: VoucherStatus.POSTED },
        reason: 'Dispatched to In-Transit',
        tx,
      });

      return { success: true, voucherNo: issue.voucherNo };
    });
  }

  /**
   * Site Confirms Transfer Receipt from IN_TRANSIT (MAT-05)
   */
  async postTransferReceipt(receiptId: string, userId: string, canOverrideNegative = false) {
    return db.transaction(async (tx) => {
      const rcpt = await tx.query.transferReceipts.findFirst({
        where: eq(transferReceipts.id, receiptId),
      });
      if (!rcpt) throw new NotFoundException('Transfer receipt not found');
      if (rcpt.status === VoucherStatus.POSTED) {
        throw new BadRequestException('Transfer receipt already posted');
      }

      const issue = await tx.query.transferIssues.findFirst({
        where: eq(transferIssues.id, rcpt.transferIssueId),
      });
      if (!issue) throw new NotFoundException('Associated transfer issue not found');

      const lines = await tx.query.transferReceiptLines.findMany({
        where: eq(transferReceiptLines.transferReceiptId, receiptId),
      });

      for (const line of lines) {
        const issueLine = await tx.query.transferIssueLines.findFirst({
          where: eq(transferIssueLines.id, line.transferLineId),
        });
        const transferRate = issueLine?.valuationRate || '0.0000';

        // 1. Deduct accepted quantity from virtual IN_TRANSIT location
        await this.stockLedgerService.postMovement({
          companyId: rcpt.companyId,
          locationId: issue.inTransitLocationId,
          itemId: line.itemId,
          txnDate: rcpt.txnDate,
          voucherType: VoucherType.TRANSFER_RECEIPT,
          voucherId: rcpt.id,
          voucherLineId: line.id,
          voucherNo: rcpt.voucherNo,
          qtyOut: line.baseQty,
          canOverrideNegative,
          tx,
        });

        // 2. Add stock to Site Destination Store
        const inRes = await this.stockLedgerService.postMovement({
          companyId: rcpt.companyId,
          locationId: rcpt.receivedLocationId,
          itemId: line.itemId,
          txnDate: rcpt.txnDate,
          voucherType: VoucherType.TRANSFER_RECEIPT,
          voucherId: rcpt.id,
          voucherLineId: line.id,
          voucherNo: rcpt.voucherNo,
          qtyIn: line.baseQty,
          receiptRate: transferRate,
          canOverrideNegative: true,
          tx,
        });

        // Update confirmedQty on issue line
        if (issueLine) {
          const newConfirmed = new Decimal(issueLine.confirmedQty).plus(line.baseQty);
          await tx
            .update(transferIssueLines)
            .set({ confirmedQty: newConfirmed.toFixed(4) })
            .where(eq(transferIssueLines.id, issueLine.id));
        }

        await tx
          .update(transferReceiptLines)
          .set({
            valuationRate: transferRate,
            lineValue: inRes.totalValue.toFixed(2),
          })
          .where(eq(transferReceiptLines.id, line.id));
      }

      await tx
        .update(transferReceipts)
        .set({ status: VoucherStatus.POSTED, updatedAt: new Date() })
        .where(eq(transferReceipts.id, rcpt.id));

      await this.auditService.log({
        companyId: rcpt.companyId,
        userId,
        entity: 'TRANSFER_RECEIPT',
        entityId: rcpt.id,
        action: 'STATUS_CHANGE',
        beforeJson: { status: rcpt.status },
        afterJson: { status: VoucherStatus.POSTED },
        reason: 'Site receipt confirmed from in-transit',
        tx,
      });

      return { success: true, voucherNo: rcpt.voucherNo };
    });
  }

  /**
   * Post Site Consumption to Stock Ledger and Cost Ledger (MAT-04, CST-01)
   */
  async postSiteConsumption(consumptionId: string, userId: string, canOverrideNegative = false) {
    return db.transaction(async (tx) => {
      const csmp = await tx.query.siteConsumptions.findFirst({
        where: eq(siteConsumptions.id, consumptionId),
      });
      if (!csmp) throw new NotFoundException('Site consumption voucher not found');
      if (csmp.status === VoucherStatus.POSTED) {
        throw new BadRequestException('Consumption voucher already posted');
      }

      const lines = await tx.query.siteConsumptionLines.findMany({
        where: eq(siteConsumptionLines.consumptionId, consumptionId),
      });

      let totalVal = new Decimal(0);

      for (const line of lines) {
        // 1. Issue OUT from site store in Stock Ledger
        const outRes = await this.stockLedgerService.postMovement({
          companyId: csmp.companyId,
          locationId: csmp.locationId,
          itemId: line.itemId,
          siteId: csmp.siteId,
          txnDate: csmp.txnDate,
          voucherType: VoucherType.SITE_CONSUMPTION,
          voucherId: csmp.id,
          voucherLineId: line.id,
          voucherNo: csmp.voucherNo,
          boqItemId: line.boqItemId || undefined,
          qtyOut: line.baseQty,
          canOverrideNegative,
          tx,
        });

        totalVal = totalVal.plus(outRes.totalValue);

        await tx
          .update(siteConsumptionLines)
          .set({
            valuationRate: outRes.appliedRate.toFixed(4),
            lineValue: outRes.totalValue.toFixed(2),
          })
          .where(eq(siteConsumptionLines.id, line.id));

        // 2. Post directly to Cost Ledger under MATERIAL cost head (CST-01)
        await this.costLedgerService.postCost({
          companyId: csmp.companyId,
          siteId: csmp.siteId,
          txnDate: csmp.txnDate,
          costHead: CostHead.MATERIAL,
          subHead: csmp.workSection || 'Direct Site Consumption',
          amount: outRes.totalValue,
          qty: line.baseQty,
          unit: line.enteredUnitCode,
          sourceVoucherType: VoucherType.SITE_CONSUMPTION,
          sourceVoucherId: csmp.id,
          sourceVoucherNo: csmp.voucherNo,
          boqItemId: line.boqItemId || undefined,
          tx,
        });
      }

      await tx
        .update(siteConsumptions)
        .set({
          status: VoucherStatus.POSTED,
          totalValue: totalVal.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(siteConsumptions.id, csmp.id));

      await this.auditService.log({
        companyId: csmp.companyId,
        userId,
        entity: 'SITE_CONSUMPTION',
        entityId: csmp.id,
        action: 'STATUS_CHANGE',
        beforeJson: { status: csmp.status },
        afterJson: { status: VoucherStatus.POSTED, totalValue: totalVal.toFixed(2) },
        reason: 'Posted consumption to stock and cost ledger',
        tx,
      });

      return { success: true, voucherNo: csmp.voucherNo, status: VoucherStatus.POSTED, totalValue: totalVal.toFixed(2) };
    });
  }

  /**
   * Cancel Site Consumption with stock reversal and cost ledger reversal (SEC-03)
   */
  async cancelSiteConsumption(
    consumptionId: string,
    reason: string,
    userId: string,
    canOverrideNegative = false,
  ) {
    return db.transaction(async (tx) => {
      const csmp = await tx.query.siteConsumptions.findFirst({
        where: eq(siteConsumptions.id, consumptionId),
      });
      if (!csmp) throw new NotFoundException('Site consumption voucher not found');
      if (csmp.status !== VoucherStatus.POSTED) {
        throw new BadRequestException('Only POSTED consumption vouchers can be cancelled');
      }

      const lines = await tx.query.siteConsumptionLines.findMany({
        where: eq(siteConsumptionLines.consumptionId, consumptionId),
      });

      // 1. Reverse stock movements: put stock back into location
      for (const line of lines) {
        await this.stockLedgerService.postMovement({
          companyId: csmp.companyId,
          locationId: csmp.locationId,
          itemId: line.itemId,
          siteId: csmp.siteId,
          txnDate: csmp.txnDate,
          voucherType: 'CONSUMPTION_REVERSAL',
          voucherId: csmp.id,
          voucherLineId: line.id,
          voucherNo: `REV-${csmp.voucherNo}`,
          qtyIn: line.baseQty,
          receiptRate: line.valuationRate,
          canOverrideNegative: true,
          tx,
        });
      }

      // 2. Reverse cost ledger entries
      await this.costLedgerService.reverseCost(csmp.id, VoucherType.SITE_CONSUMPTION, tx);

      // 3. Mark CANCELLED
      await tx
        .update(siteConsumptions)
        .set({
          status: VoucherStatus.CANCELLED,
          cancelReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(siteConsumptions.id, csmp.id));

      await this.auditService.log({
        companyId: csmp.companyId,
        userId,
        entity: 'SITE_CONSUMPTION',
        entityId: csmp.id,
        action: 'STATUS_CHANGE',
        beforeJson: { status: csmp.status },
        afterJson: { status: VoucherStatus.CANCELLED, cancelReason: reason },
        reason,
        tx,
      });

      return { success: true, message: `Consumption ${csmp.voucherNo} cancelled successfully` };
    });
  }

  /**
   * Post Approved Wastage Voucher (MAT-07)
   */
  async postWastage(wastageId: string, userId: string, canOverrideNegative = false) {
    return db.transaction(async (tx) => {
      const wastage = await tx.query.wastageVouchers.findFirst({
        where: eq(wastageVouchers.id, wastageId),
      });
      if (!wastage) throw new NotFoundException('Wastage voucher not found');

      const lines = await tx.query.wastageVoucherLines.findMany({
        where: eq(wastageVoucherLines.wastageId, wastageId),
      });

      let totalVal = new Decimal(0);

      for (const line of lines) {
        const outRes = await this.stockLedgerService.postMovement({
          companyId: wastage.companyId,
          locationId: wastage.locationId,
          itemId: line.itemId,
          txnDate: wastage.txnDate,
          voucherType: VoucherType.WASTAGE,
          voucherId: wastage.id,
          voucherLineId: line.id,
          voucherNo: wastage.voucherNo,
          qtyOut: line.baseQty,
          canOverrideNegative,
          tx,
        });

        totalVal = totalVal.plus(outRes.totalValue);

        await tx
          .update(wastageVoucherLines)
          .set({
            valuationRate: outRes.appliedRate.toFixed(4),
            lineValue: outRes.totalValue.toFixed(2),
          })
          .where(eq(wastageVoucherLines.id, line.id));
      }

      await tx
        .update(wastageVouchers)
        .set({
          status: VoucherStatus.POSTED,
          totalValue: totalVal.toFixed(2),
          approvedBy: userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(wastageVouchers.id, wastage.id));

      return { success: true, voucherNo: wastage.voucherNo, totalValue: totalVal.toFixed(2) };
    });
  }

  /**
   * Post Approved Physical Stock Adjustment (MAT-08)
   */
  async postStockAdjustment(adjustmentId: string, userId: string, canOverrideNegative = false) {
    return db.transaction(async (tx) => {
      const adj = await tx.query.stockAdjustments.findFirst({
        where: eq(stockAdjustments.id, adjustmentId),
      });
      if (!adj) throw new NotFoundException('Stock adjustment voucher not found');

      const lines = await tx.query.stockAdjustmentLines.findMany({
        where: eq(stockAdjustmentLines.adjustmentId, adjustmentId),
      });

      for (const line of lines) {
        const variance = new Decimal(line.baseVarianceQty);

        if (variance.greaterThan(0)) {
          // Surplus adjustment: Stock In
          const inRes = await this.stockLedgerService.postMovement({
            companyId: adj.companyId,
            locationId: adj.locationId,
            itemId: line.itemId,
            txnDate: adj.txnDate,
            voucherType: VoucherType.STOCK_ADJUSTMENT,
            voucherId: adj.id,
            voucherLineId: line.id,
            voucherNo: adj.voucherNo,
            qtyIn: variance,
            receiptRate: line.valuationRate,
            canOverrideNegative: true,
            tx,
          });

          await tx
            .update(stockAdjustmentLines)
            .set({ varianceValue: inRes.totalValue.toFixed(2) })
            .where(eq(stockAdjustmentLines.id, line.id));
        } else if (variance.isNegative()) {
          // Shortage adjustment: Stock Out
          const outRes = await this.stockLedgerService.postMovement({
            companyId: adj.companyId,
            locationId: adj.locationId,
            itemId: line.itemId,
            txnDate: adj.txnDate,
            voucherType: VoucherType.STOCK_ADJUSTMENT,
            voucherId: adj.id,
            voucherLineId: line.id,
            voucherNo: adj.voucherNo,
            qtyOut: variance.abs(),
            canOverrideNegative,
            tx,
          });

          await tx
            .update(stockAdjustmentLines)
            .set({ varianceValue: outRes.totalValue.negated().toFixed(2) })
            .where(eq(stockAdjustmentLines.id, line.id));
        }
      }

      await tx
        .update(stockAdjustments)
        .set({
          status: VoucherStatus.POSTED,
          approvedBy: userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(stockAdjustments.id, adj.id));

      return { success: true, voucherNo: adj.voucherNo };
    });
  }
}

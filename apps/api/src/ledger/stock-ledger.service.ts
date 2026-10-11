import { Injectable, BadRequestException } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import { stockLedger, stockBalance } from '../drizzle/schema/ledgers.js';
import { eq, and, sql, gte, asc } from 'drizzle-orm';
import { Decimal, toMoney, toQty, toRate } from '@civil/shared';
import { ValuationService } from './valuation.service.js';

export interface PostMovementParams {
  companyId: string;
  locationId: string;
  itemId: string;
  siteId?: string;
  txnDate: string; // YYYY-MM-DD
  voucherType: string;
  voucherId: string;
  voucherLineId?: string;
  voucherNo: string;
  boqItemId?: string;
  qtyIn?: Decimal.Value;
  qtyOut?: Decimal.Value;
  receiptRate?: Decimal.Value; // For receipts (e.g. GRN)
  canOverrideNegative?: boolean; // stock.override_negative permission
  tx: any; // Mandatory database transaction
}

@Injectable()
export class StockLedgerService {
  constructor(private readonly valuationService: ValuationService) {}

  /**
   * Posts an item movement to stock_ledger & stock_balance atomically with FOR UPDATE lock (Rules #1, #2, #5, #6)
   */
  async postMovement(params: PostMovementParams) {
    const { tx } = params;
    const qtyIn = new Decimal(params.qtyIn || 0);
    const qtyOut = new Decimal(params.qtyOut || 0);

    if (qtyIn.isZero() && qtyOut.isZero()) {
      throw new BadRequestException('Movement must specify either qtyIn or qtyOut');
    }

    // 1. Acquire row-level lock on stock_balance using SELECT ... FOR UPDATE (Rule #5)
    let balanceRows = await tx
      .select()
      .from(stockBalance)
      .where(and(eq(stockBalance.locationId, params.locationId), eq(stockBalance.itemId, params.itemId)))
      .for('update');

    let currentBalance = balanceRows[0];
    if (!currentBalance) {
      // First transaction for this item at this location: initialize balance row
      const [newRow] = await tx
        .insert(stockBalance)
        .values({
          companyId: params.companyId,
          locationId: params.locationId,
          itemId: params.itemId,
          currentQty: '0.0000',
          currentValue: '0.00',
          valuationRate: '0.0000',
          lastUpdatedTxnDate: params.txnDate,
        })
        .returning();
      currentBalance = newRow;
    }

    const currentQty = new Decimal(currentBalance.currentQty);
    const currentValue = new Decimal(currentBalance.currentValue);
    const currentRate = new Decimal(currentBalance.valuationRate);

    let newRunningQty: Decimal;
    let newRunningValue: Decimal;
    let newValuationRate: Decimal;
    let rate: Decimal;
    let valueIn = new Decimal(0);
    let valueOut = new Decimal(0);

    if (qtyIn.greaterThan(0)) {
      // INFLOW / RECEIPT
      rate = new Decimal(params.receiptRate || currentRate);
      const valResult = this.valuationService.calculateReceipt(
        currentQty,
        currentValue,
        qtyIn,
        rate,
      );
      newRunningQty = valResult.newQty;
      newRunningValue = valResult.newValue;
      newValuationRate = valResult.newRate;
      valueIn = toMoney(qtyIn.times(rate));
    } else {
      // OUTFLOW / ISSUE
      // Check negative stock on current balance (Rule #6 / MAT-10)
      if (currentQty.minus(qtyOut).isNegative()) {
        if (!params.canOverrideNegative) {
          throw new BadRequestException(
            `Insufficient stock for item at location. Available: ${currentQty.toFixed(4)}, Attempted issue: ${qtyOut.toFixed(4)} (MAT-10).`,
          );
        }
      }

      // Check point-in-time negative stock for back-dated issues (Section 4.3, MAT-10)
      if (currentBalance.lastUpdatedTxnDate && params.txnDate < currentBalance.lastUpdatedTxnDate) {
        await this.validateFutureBalancesNotNegative(
          params.locationId,
          params.itemId,
          params.txnDate,
          qtyOut,
          params.canOverrideNegative,
          tx,
        );
      }

      const valResult = this.valuationService.calculateIssue(
        currentQty,
        currentValue,
        currentRate,
        qtyOut,
      );
      newRunningQty = valResult.newRunningQty;
      newRunningValue = valResult.newRunningValue;
      newValuationRate = valResult.newValuationRate;
      rate = valResult.issueCostRate;
      valueOut = valResult.issueTotalValue;
    }

    // 2. Insert into append-only stock_ledger (Section 4.3)
    const [ledgerRow] = await tx
      .insert(stockLedger)
      .values({
        companyId: params.companyId,
        locationId: params.locationId,
        itemId: params.itemId,
        txnDate: params.txnDate,
        voucherType: params.voucherType,
        voucherId: params.voucherId,
        voucherLineId: params.voucherLineId || null,
        voucherNo: params.voucherNo,
        qtyIn: qtyIn.toFixed(4),
        qtyOut: qtyOut.toFixed(4),
        rate: rate.toFixed(4),
        valueIn: valueIn.toFixed(2),
        valueOut: valueOut.toFixed(2),
        runningQty: newRunningQty.toFixed(4),
        runningValue: newRunningValue.toFixed(2),
        valuationRate: newValuationRate.toFixed(4),
        siteId: params.siteId || null,
        boqItemId: params.boqItemId || null,
      })
      .returning();

    // 3. Update materialized stock_balance
    await tx
      .update(stockBalance)
      .set({
        currentQty: newRunningQty.toFixed(4),
        currentValue: newRunningValue.toFixed(2),
        valuationRate: newValuationRate.toFixed(4),
        lastUpdatedTxnDate:
          !currentBalance.lastUpdatedTxnDate || params.txnDate > currentBalance.lastUpdatedTxnDate
            ? params.txnDate
            : currentBalance.lastUpdatedTxnDate,
        updatedAt: new Date(),
      })
      .where(eq(stockBalance.id, currentBalance.id));

    return {
      ledgerRow,
      valuationRate: newValuationRate,
      appliedRate: rate,
      totalValue: qtyIn.greaterThan(0) ? valueIn : valueOut,
    };
  }

  /**
   * Validates that stock would not drop below zero at ANY historical/future date (MAT-10)
   */
  private async validateFutureBalancesNotNegative(
    locationId: string,
    itemId: string,
    backdatedTxnDate: string,
    qtyOut: Decimal,
    canOverrideNegative = false,
    tx: any,
  ) {
    if (canOverrideNegative) return;

    // Fetch subsequent ledger entries ordered by txn_date
    const subsequentEntries = await tx.query.stockLedger.findMany({
      where: and(
        eq(stockLedger.locationId, locationId),
        eq(stockLedger.itemId, itemId),
        gte(stockLedger.txnDate, backdatedTxnDate),
      ),
      orderBy: [asc(stockLedger.txnDate), asc(stockLedger.createdAt)],
    });

    for (const entry of subsequentEntries) {
      const runningAfterDeduction = new Decimal(entry.runningQty).minus(qtyOut);
      if (runningAfterDeduction.isNegative()) {
        throw new BadRequestException(
          `Back-dated entry would drive stock negative on date ${entry.txnDate} (balance would become ${runningAfterDeduction.toFixed(4)}) (MAT-10).`,
        );
      }
    }
  }

  /**
   * Fetch current stock balance for item at location
   */
  async getCurrentBalance(locationId: string, itemId: string) {
    return db.query.stockBalance.findFirst({
      where: and(eq(stockBalance.locationId, locationId), eq(stockBalance.itemId, itemId)),
    });
  }
}

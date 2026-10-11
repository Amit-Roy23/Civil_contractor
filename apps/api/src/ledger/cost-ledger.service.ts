import { Injectable } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import { costLedger } from '../drizzle/schema/ledgers.js';
import { CostHead, Decimal, toMoney } from '@civil/shared';
import { eq, and, sql } from 'drizzle-orm';

export interface PostCostParams {
  companyId: string;
  siteId: string;
  txnDate: string;
  costHead: CostHead | string;
  subHead?: string;
  amount: Decimal.Value;
  qty?: Decimal.Value;
  unit?: string;
  sourceVoucherType: string;
  sourceVoucherId: string;
  sourceVoucherNo: string;
  boqItemId?: string;
  vehicleId?: string;
  plantId?: string;
  tx?: any;
}

@Injectable()
export class CostLedgerService {
  /**
   * Posts an entry to the append-only site cost ledger (Section 4.4, CST-01)
   */
  async postCost(params: PostCostParams) {
    const executor = params.tx || db;
    const amountVal = toMoney(params.amount);

    const [row] = await executor
      .insert(costLedger)
      .values({
        companyId: params.companyId,
        siteId: params.siteId,
        txnDate: params.txnDate,
        costHead: params.costHead,
        subHead: params.subHead || null,
        amount: amountVal.toFixed(2),
        qty: params.qty ? new Decimal(params.qty).toFixed(4) : null,
        unit: params.unit || null,
        sourceVoucherType: params.sourceVoucherType,
        sourceVoucherId: params.sourceVoucherId,
        sourceVoucherNo: params.sourceVoucherNo,
        boqItemId: params.boqItemId || null,
        vehicleId: params.vehicleId || null,
        plantId: params.plantId || null,
        status: 'POSTED',
      })
      .returning();

    return row;
  }

  /**
   * Reverses an existing cost entry when a voucher is cancelled (SEC-03)
   */
  async reverseCost(sourceVoucherId: string, sourceVoucherType: string, tx?: any) {
    const executor = tx || db;
    const entries = await executor.query.costLedger.findMany({
      where: and(
        eq(costLedger.sourceVoucherId, sourceVoucherId),
        eq(costLedger.sourceVoucherType, sourceVoucherType),
        eq(costLedger.status, 'POSTED'),
      ),
    });

    for (const entry of entries) {
      // Post reversing negative entry
      await executor.insert(costLedger).values({
        companyId: entry.companyId,
        siteId: entry.siteId,
        txnDate: entry.txnDate,
        costHead: entry.costHead,
        subHead: `REVERSAL: ${entry.subHead || ''}`,
        amount: new Decimal(entry.amount).negated().toFixed(2),
        qty: entry.qty ? new Decimal(entry.qty).negated().toFixed(4) : null,
        unit: entry.unit,
        sourceVoucherType: entry.sourceVoucherType,
        sourceVoucherId: entry.sourceVoucherId,
        sourceVoucherNo: `REV-${entry.sourceVoucherNo}`,
        boqItemId: entry.boqItemId,
        vehicleId: entry.vehicleId,
        plantId: entry.plantId,
        status: 'REVERSED',
      });
    }
  }

  /**
   * Queries site cost sheet breakdown (CST-01)
   */
  async getSiteCostSummary(siteId: string, fromDate?: string, toDate?: string) {
    const query = db
      .select({
        costHead: costLedger.costHead,
        totalAmount: sql<string>`sum(${costLedger.amount})`,
      })
      .from(costLedger)
      .where(eq(costLedger.siteId, siteId))
      .groupBy(costLedger.costHead);

    return query;
  }
}

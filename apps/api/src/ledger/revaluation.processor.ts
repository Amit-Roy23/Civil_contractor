import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import { stockLedger, stockBalance } from '../drizzle/schema/ledgers.js';
import { eq, and, gte, asc } from 'drizzle-orm';
import { Decimal, toMoney, toQty, toRate } from '@civil/shared';
import { ValuationService } from './valuation.service.js';

export interface RevaluationJobData {
  locationId: string;
  itemId: string;
  fromTxnDate: string; // The back-dated date
}

@Processor('revaluation-queue')
@Injectable()
export class RevaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(RevaluationProcessor.name);

  constructor(private readonly valuationService: ValuationService) {
    super();
  }

  async process(job: Job<RevaluationJobData>): Promise<any> {
    const { locationId, itemId, fromTxnDate } = job.data;
    this.logger.log(
      `Starting background revaluation for Location ${locationId}, Item ${itemId} from date ${fromTxnDate} (MAT-14)...`,
    );

    // 1. Fetch the state just before the back-dated entry
    const previousEntries = await db.query.stockLedger.findMany({
      where: and(
        eq(stockLedger.locationId, locationId),
        eq(stockLedger.itemId, itemId),
      ),
      orderBy: [asc(stockLedger.txnDate), asc(stockLedger.createdAt)],
    });

    let runningQty = new Decimal(0);
    let runningValue = new Decimal(0);
    let valuationRate = new Decimal(0);

    for (const entry of previousEntries) {
      const qIn = new Decimal(entry.qtyIn);
      const qOut = new Decimal(entry.qtyOut);

      if (qIn.greaterThan(0)) {
        const valRes = this.valuationService.calculateReceipt(
          runningQty,
          runningValue,
          qIn,
          new Decimal(entry.rate),
        );
        runningQty = valRes.newQty;
        runningValue = valRes.newValue;
        valuationRate = valRes.newRate;

        // Update entry with recomputed running metrics
        await db
          .update(stockLedger)
          .set({
            runningQty: runningQty.toFixed(4),
            runningValue: runningValue.toFixed(2),
            valuationRate: valuationRate.toFixed(4),
          })
          .where(eq(stockLedger.id, entry.id));
      } else {
        const valRes = this.valuationService.calculateIssue(
          runningQty,
          runningValue,
          valuationRate,
          qOut,
        );
        runningQty = valRes.newRunningQty;
        runningValue = valRes.newRunningValue;
        valuationRate = valRes.newValuationRate;

        // Re-price dependent issue rows with newly recomputed average rate
        await db
          .update(stockLedger)
          .set({
            rate: valRes.issueCostRate.toFixed(4),
            valueOut: valRes.issueTotalValue.toFixed(2),
            runningQty: runningQty.toFixed(4),
            runningValue: runningValue.toFixed(2),
            valuationRate: valuationRate.toFixed(4),
          })
          .where(eq(stockLedger.id, entry.id));
      }
    }

    // Update materialized current stock balance
    await db
      .update(stockBalance)
      .set({
        currentQty: runningQty.toFixed(4),
        currentValue: runningValue.toFixed(2),
        valuationRate: valuationRate.toFixed(4),
        updatedAt: new Date(),
      })
      .where(and(eq(stockBalance.locationId, locationId), eq(stockBalance.itemId, itemId)));

    this.logger.log(
      `Revaluation completed for Location ${locationId}, Item ${itemId}. Final Qty: ${runningQty.toFixed(4)}, Value: ₹${runningValue.toFixed(2)}, Rate: ₹${valuationRate.toFixed(4)}.`,
    );

    return { runningQty: runningQty.toString(), runningValue: runningValue.toString() };
  }
}

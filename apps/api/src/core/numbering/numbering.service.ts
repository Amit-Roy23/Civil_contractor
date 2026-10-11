import { Injectable } from '@nestjs/common';
import { db } from '../../drizzle/db.js';
import { voucherSeries, locations } from '../../drizzle/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';

const VOUCHER_TYPE_PREFIXES: Record<string, string> = {
  PURCHASE_ORDER: 'PO',
  GRN: 'GRN',
  TRANSFER_ISSUE: 'ISSUE',
  TRANSFER_RECEIPT: 'RCPT',
  SITE_CONSUMPTION: 'CSMP',
  WASTAGE: 'WASTE',
  STOCK_ADJUSTMENT: 'ADJ',
  FUEL_PURCHASE: 'FUEL-P',
  FUEL_ISSUE: 'FUEL-I',
  VEHICLE_LOG: 'LOG',
  LABOUR_ATTENDANCE: 'ATTN',
  EXPENSE_VOUCHER: 'EXP',
  PLANT_PRODUCTION: 'PROD',
  PLANT_DISPATCH: 'DISP',
  RA_BILL: 'RABILL',
};

@Injectable()
export class NumberingService {
  /**
   * Concurrency-safe voucher number generator (Section 4.9)
   * Example: GRN/CS/26-27/00042
   */
  async nextVoucherNumber(
    companyId: string,
    voucherType: string,
    locationId: string,
    financialYearCode: string, // e.g. '26-27'
    tx?: any,
  ): Promise<string> {
    const executor = tx || db;

    // Get location code/prefix
    const loc = await db.query.locations.findFirst({
      where: eq(locations.id, locationId),
    });
    const locPrefix = loc ? loc.code.toUpperCase().substring(0, 4) : 'GEN';
    const typePrefix = VOUCHER_TYPE_PREFIXES[voucherType] || 'DOC';

    // Atomic increment of sequence row in voucher_series
    const result = await executor
      .insert(voucherSeries)
      .values({
        companyId,
        voucherType,
        prefix: typePrefix,
        locationPrefix: locPrefix,
        financialYearCode,
        currentNumber: 1,
      })
      .onConflictDoUpdate({
        target: [
          voucherSeries.companyId,
          voucherSeries.voucherType,
          voucherSeries.locationPrefix,
          voucherSeries.financialYearCode,
        ],
        set: {
          currentNumber: sql`${voucherSeries.currentNumber} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const sequenceNum = result[0]?.currentNumber ?? 1;
    const padded = String(sequenceNum).padStart(5, '0');

    return `${typePrefix}/${locPrefix}/${financialYearCode}/${padded}`;
  }
}

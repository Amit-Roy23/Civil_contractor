import { Injectable } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import { partyLedger } from '../drizzle/schema/ledgers.js';
import { PartyType, Decimal, toMoney } from '@civil/shared';
import { eq, and } from 'drizzle-orm';

export interface PostPartyTxnParams {
  companyId: string;
  partyId: string;
  partyType: PartyType | string;
  txnDate: string;
  debit?: Decimal.Value;
  credit?: Decimal.Value;
  voucherType: string;
  voucherId: string;
  voucherNo: string;
  dueDate?: string;
  remarks?: string;
  tx?: any;
}

@Injectable()
export class PartyLedgerService {
  /**
   * Posts to the party sub-ledger (Section 4.5, SUP-01, SUP-02)
   */
  async postEntry(params: PostPartyTxnParams) {
    const executor = params.tx || db;
    const debit = toMoney(params.debit || 0);
    const credit = toMoney(params.credit || 0);

    const [row] = await executor
      .insert(partyLedger)
      .values({
        companyId: params.companyId,
        partyId: params.partyId,
        partyType: params.partyType,
        txnDate: params.txnDate,
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        voucherType: params.voucherType,
        voucherId: params.voucherId,
        voucherNo: params.voucherNo,
        dueDate: params.dueDate || null,
        remarks: params.remarks || null,
      })
      .returning();

    return row;
  }

  /**
   * Reverses party ledger entries on cancellation (SEC-03)
   */
  async reverseEntries(voucherId: string, voucherType: string, tx?: any) {
    const executor = tx || db;
    const entries = await executor.query.partyLedger.findMany({
      where: and(
        eq(partyLedger.voucherId, voucherId),
        eq(partyLedger.voucherType, voucherType),
      ),
    });

    for (const entry of entries) {
      await executor.insert(partyLedger).values({
        companyId: entry.companyId,
        partyId: entry.partyId,
        partyType: entry.partyType,
        txnDate: entry.txnDate,
        // Swap debit and credit to achieve perfect financial reversal
        debit: entry.credit,
        credit: entry.debit,
        voucherType: entry.voucherType,
        voucherId: entry.voucherId,
        voucherNo: `REV-${entry.voucherNo}`,
        dueDate: entry.dueDate,
        remarks: `REVERSAL of ${entry.voucherNo}`,
      });
    }
  }
}

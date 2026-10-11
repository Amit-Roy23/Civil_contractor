import { Injectable, BadRequestException } from '@nestjs/common';
import { db } from '../../drizzle/db.js';
import { financialYears, periodLocks, companySettings } from '../../drizzle/schema/core.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { differenceInCalendarDays, parseISO } from 'date-fns';

@Injectable()
export class FinancialYearService {
  /**
   * Validates transaction date against Financial Year, Period Locks and Backdate Limits (SEC-04, MAT-14)
   */
  async validateTxnDate(
    companyId: string,
    financialYearId: string,
    txnDate: string, // YYYY-MM-DD
    userPermissions: string[] = [],
  ): Promise<{ requiresBackdateApproval: boolean; daysBackdated: number }> {
    // 1. Check if financial year exists and is not closed (SEC-04)
    const fy = await db.query.financialYears.findFirst({
      where: and(eq(financialYears.id, financialYearId), eq(financialYears.companyId, companyId)),
    });

    if (!fy) {
      throw new BadRequestException('Financial year not found for this company');
    }

    if (fy.isClosed) {
      throw new BadRequestException(`Financial Year ${fy.code} is closed. New postings are rejected (SEC-04).`);
    }

    if (txnDate < fy.startDate || txnDate > fy.endDate) {
      throw new BadRequestException(
        `Transaction date ${txnDate} falls outside the active Financial Year range (${fy.startDate} to ${fy.endDate}).`,
      );
    }

    // 2. Check period locks (SEC-04)
    const activeLock = await db.query.periodLocks.findFirst({
      where: and(
        eq(periodLocks.companyId, companyId),
        eq(periodLocks.financialYearId, financialYearId),
        gte(periodLocks.lockedUntilDate, txnDate),
      ),
    });

    if (activeLock) {
      const canBypassPeriodLock = userPermissions.includes('period.edit_locked');
      if (!canBypassPeriodLock) {
        throw new BadRequestException(
          `Period is locked until ${activeLock.lockedUntilDate} (${activeLock.reason || 'Period Locked'}). Transactions before this date are blocked (SEC-04).`,
        );
      }
    }

    // 3. Check backdate days (MAT-14)
    const settings = await db.query.companySettings.findFirst({
      where: eq(companySettings.companyId, companyId),
    });

    const maxDays = settings?.maxBackdateDays ?? 3;
    const today = new Date();
    const entryDate = parseISO(txnDate);
    const daysBackdated = differenceInCalendarDays(today, entryDate);

    const requiresApproval = daysBackdated > maxDays && !userPermissions.includes('backdate.beyond_limit');

    return {
      requiresBackdateApproval: requiresApproval,
      daysBackdated: Math.max(0, daysBackdated),
    };
  }

  async getActiveFinancialYear(companyId: string) {
    const todayStr = new Date().toISOString().substring(0, 10);
    const active = await db.query.financialYears.findFirst({
      where: and(
        eq(financialYears.companyId, companyId),
        eq(financialYears.isClosed, false),
        lte(financialYears.startDate, todayStr),
        gte(financialYears.endDate, todayStr),
      ),
    });
    return active;
  }
}

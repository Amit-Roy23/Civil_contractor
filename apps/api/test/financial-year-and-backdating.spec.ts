import { describe, it, expect, beforeAll } from 'vitest';
import { FinancialYearService } from '../src/core/fy/fy.service.js';
import { db } from '../src/drizzle/db.js';
import { financialYears, periodLocks, users } from '../src/drizzle/schema/core.js';
import { companies } from '../src/drizzle/schema/masters.js';
import { eq } from 'drizzle-orm';

describe('SEC-04 / MAT-14 - Financial Year & Backdating Constraints', () => {
  const fyService = new FinancialYearService();
  let companyId: string;
  let activeFyId: string;

  beforeAll(async () => {
    const comp = await db.query.companies.findFirst({
      where: eq(companies.code, 'AROHON'),
    });
    if (!comp) {
      throw new Error('Seeded company AROHON not found in test db');
    }
    companyId = comp.id;

    const fy = await db.query.financialYears.findFirst({
      where: eq(financialYears.companyId, companyId),
    });
    if (!fy) {
      throw new Error('Seeded financial year not found');
    }
    activeFyId = fy.id;
  });

  it('allows transaction dates within the active financial year and within backdate limit', async () => {
    // Current test date in FY 2026-2027
    const result = await fyService.validateTxnDate(
      companyId,
      activeFyId,
      '2026-04-10',
      ['inventory.create'],
    );
    expect(result).toBeDefined();
  });

  it('rejects dates outside the financial year date boundary', async () => {
    // Attempt transaction in FY 2025 (before 2026-04-01)
    await expect(
      fyService.validateTxnDate(
        companyId,
        activeFyId,
        '2025-12-31',
        ['inventory.create'],
      ),
    ).rejects.toThrowError(/outside the active Financial Year range/);
  });

  it('detects backdating beyond threshold and requires approval unless user has permission', async () => {
    // Date is within FY (2026-04-01)
    const resultNoPerm = await fyService.validateTxnDate(
      companyId,
      activeFyId,
      '2026-04-01',
      [],
    );
    expect(resultNoPerm.requiresBackdateApproval).toBe(true);
    expect(resultNoPerm.daysBackdated).toBeGreaterThan(3);

    // User with backdate.beyond_limit permission bypasses approval requirement
    const resultWithPerm = await fyService.validateTxnDate(
      companyId,
      activeFyId,
      '2026-04-01',
      ['backdate.beyond_limit'],
    );
    expect(resultWithPerm.requiresBackdateApproval).toBe(false);
  });

  it('rejects dates prior to locked period date unless user has period.edit_locked', async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.companyId, companyId),
    });

    // Create temporary period lock until 2026-04-05
    const [lock] = await db
      .insert(periodLocks)
      .values({
        companyId,
        financialYearId: activeFyId,
        lockedUntilDate: '2026-04-05',
        reason: 'Monthly Accounts Closed',
        lockedBy: user!.id,
      })
      .returning();

    try {
      // Date on or before locked date should fail without permission
      await expect(
        fyService.validateTxnDate(
          companyId,
          activeFyId,
          '2026-04-03',
          ['inventory.create'],
        ),
      ).rejects.toThrowError(/Period is locked until/);

      // With period.edit_locked permission, it is allowed
      const allowed = await fyService.validateTxnDate(
        companyId,
        activeFyId,
        '2026-04-03',
        ['period.edit_locked'],
      );
      expect(allowed).toBeDefined();
    } finally {
      await db.delete(periodLocks).where(eq(periodLocks.id, lock.id));
    }
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/drizzle/db.js';
import { companies, locations, items } from '../src/drizzle/schema/masters.js';
import { financialYears, users } from '../src/drizzle/schema/core.js';
import { stockBalance, stockLedger, costLedger } from '../src/drizzle/schema/ledgers.js';
import { siteConsumptions, siteConsumptionLines } from '../src/drizzle/schema/vouchers.js';
import { PostingService } from '../src/ledger/posting.service.js';
import { StockLedgerService } from '../src/ledger/stock-ledger.service.js';
import { CostLedgerService } from '../src/ledger/cost-ledger.service.js';
import { PartyLedgerService } from '../src/ledger/party-ledger.service.js';
import { ValuationService } from '../src/ledger/valuation.service.js';
import { AuditService } from '../src/core/audit/audit.service.js';
import { eq, and } from 'drizzle-orm';
import { VoucherType, VoucherStatus, CostHead } from '@civil/shared';
import Decimal from 'decimal.js';

describe('SEC-03 / STR-01 / MAT-04 / MAT-10 - Posting and Cancellation Flow', () => {
  let valuationService: ValuationService;
  let stockLedgerService: StockLedgerService;
  let costLedgerService: CostLedgerService;
  let partyLedgerService: PartyLedgerService;
  let auditService: AuditService;
  let postingService: PostingService;

  let companyId: string;
  let fyId: string;
  let userId: string;
  let nh31StoreLocId: string;
  let cementItemId: string;
  let nh31SiteId: string;

  beforeAll(async () => {
    valuationService = new ValuationService();
    stockLedgerService = new StockLedgerService(valuationService);
    costLedgerService = new CostLedgerService();
    partyLedgerService = new PartyLedgerService();
    auditService = new AuditService();

    postingService = new PostingService(
      stockLedgerService,
      costLedgerService,
      partyLedgerService,
      auditService,
    );

    const comp = await db.query.companies.findFirst({ where: eq(companies.code, 'AROHON') });
    companyId = comp!.id;

    const fy = await db.query.financialYears.findFirst({ where: eq(financialYears.companyId, companyId) });
    fyId = fy!.id;

    const testUser = await db.query.users.findFirst({ where: eq(users.companyId, companyId) });
    userId = testUser!.id;

    const siteStore = await db.query.locations.findFirst({
      where: and(eq(locations.companyId, companyId), eq(locations.code, 'ST-NH31')),
    });
    nh31StoreLocId = siteStore!.id;
    nh31SiteId = siteStore!.siteId!;

    const cement = await db.query.items.findFirst({
      where: and(eq(items.companyId, companyId), eq(items.code, 'MAT-CEM-OPC53')),
    });
    cementItemId = cement!.id;
  });

  it('verifies seeded stock balance at NH-31 site store', async () => {
    const bal = await db.query.stockBalance.findFirst({
      where: and(eq(stockBalance.locationId, nh31StoreLocId), eq(stockBalance.itemId, cementItemId)),
    });

    expect(bal).toBeDefined();
    expect(new Decimal(bal!.currentQty).toNumber()).toBeGreaterThanOrEqual(5000);
  });

  it('posts site consumption and updates both stock balance and cost ledger (MAT-04)', async () => {
    const preBal = await db.query.stockBalance.findFirst({
      where: and(eq(stockBalance.locationId, nh31StoreLocId), eq(stockBalance.itemId, cementItemId)),
    });
    const preQty = new Decimal(preBal!.currentQty);

    const testVoucherNo = `TEST-CSMP-${Date.now()}`;
    const consumeKg = '500.0000'; // 10 bags

    // Create draft consumption
    const [csmp] = await db
      .insert(siteConsumptions)
      .values({
        companyId,
        financialYearId: fyId,
        voucherNo: testVoucherNo,
        siteId: nh31SiteId,
        locationId: nh31StoreLocId,
        txnDate: '2026-04-18',
        status: VoucherStatus.DRAFT,
        workSection: 'Pier cap P-12 casting',
        createdBy: userId,
      })
      .returning();

    await db.insert(siteConsumptionLines).values({
      consumptionId: csmp.id,
      itemId: cementItemId,
      enteredQty: '10.0000',
      enteredUnitCode: 'BAG',
      baseQty: consumeKg,
      purpose: 'Structural pier casting',
    });

    // Post consumption
    const postRes = await postingService.postSiteConsumption(csmp.id, userId);
    expect(postRes.status).toBe(VoucherStatus.POSTED);

    // Verify stock balance decremented
    const postBal = await db.query.stockBalance.findFirst({
      where: and(eq(stockBalance.locationId, nh31StoreLocId), eq(stockBalance.itemId, cementItemId)),
    });
    const expectedQty = preQty.minus(new Decimal(consumeKg));
    expect(postBal!.currentQty).toBe(expectedQty.toFixed(4));

    // Verify cost ledger row created under MATERIAL cost head (CST-01)
    const costRow = await db.query.costLedger.findFirst({
      where: and(
        eq(costLedger.sourceVoucherId, csmp.id),
        eq(costLedger.sourceVoucherType, VoucherType.SITE_CONSUMPTION),
      ),
    });
    expect(costRow).toBeDefined();
    expect(costRow!.costHead).toBe(CostHead.MATERIAL);
    expect(costRow!.siteId).toBe(nh31SiteId);
    expect(new Decimal(costRow!.amount).toNumber()).toBeGreaterThan(0);

    // Now test cancellation reversal (SEC-03)
    await postingService.cancelSiteConsumption(
      csmp.id,
      'Incorrect batch logged',
      userId,
    );

    // Verify stock balance restored exactly
    const afterCancelBal = await db.query.stockBalance.findFirst({
      where: and(eq(stockBalance.locationId, nh31StoreLocId), eq(stockBalance.itemId, cementItemId)),
    });
    expect(afterCancelBal!.currentQty).toBe(preQty.toFixed(4));

    // Verify append-only cost reversal brings net voucher cost to zero (SEC-03)
    const costEntries = await db.query.costLedger.findMany({
      where: and(
        eq(costLedger.sourceVoucherId, csmp.id),
        eq(costLedger.sourceVoucherType, VoucherType.SITE_CONSUMPTION),
      ),
    });
    expect(costEntries.length).toBe(2); // Original row + reversing row
    const netCost = costEntries.reduce(
      (sum, e) => sum.plus(new Decimal(e.amount)),
      new Decimal(0),
    );
    expect(netCost.toFixed(2)).toBe('0.00');
  });

  it('strictly blocks issue/consumption that would cause negative stock (MAT-10)', async () => {
    const currentBal = await db.query.stockBalance.findFirst({
      where: and(eq(stockBalance.locationId, nh31StoreLocId), eq(stockBalance.itemId, cementItemId)),
    });
    const currentStock = new Decimal(currentBal!.currentQty);

    // Attempt to consume more than available stock
    const excessiveQty = currentStock.plus(10000).toFixed(4);

    const testVoucherNo = `TEST-OVER-${Date.now()}`;
    const [csmp] = await db
      .insert(siteConsumptions)
      .values({
        companyId,
        financialYearId: fyId,
        voucherNo: testVoucherNo,
        siteId: nh31SiteId,
        locationId: nh31StoreLocId,
        txnDate: '2026-04-19',
        status: VoucherStatus.DRAFT,
        createdBy: userId,
      })
      .returning();

    await db.insert(siteConsumptionLines).values({
      consumptionId: csmp.id,
      itemId: cementItemId,
      enteredQty: '1000.0000',
      enteredUnitCode: 'KG',
      baseQty: excessiveQty,
    });

    // Should throw BadRequestException unless canOverrideNegative is true
    await expect(
      postingService.postSiteConsumption(
        csmp.id,
        userId,
        false, // canOverrideNegative = false
      ),
    ).rejects.toThrowError(/Insufficient stock/);
  });
});

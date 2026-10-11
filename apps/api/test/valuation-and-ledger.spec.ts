import { describe, it, expect } from 'vitest';
import { ValuationService } from '../src/ledger/valuation.service.js';
import Decimal from 'decimal.js';

describe('MAT-11 / Weighted Average Valuation Engine', () => {
  const valuation = new ValuationService();

  it('computes correct weighted average rate after successive receipts at different rates', () => {
    // Initial state: 0 stock
    // Receipt 1: 100 MT @ ₹ 5,000 / MT -> Value = ₹ 5,00,000, Rate = ₹ 5,000
    const rec1 = valuation.calculateReceipt(
      new Decimal(0),
      new Decimal(0),
      new Decimal('100.0000'),
      new Decimal('5000.0000'),
    );
    expect(rec1.newQty.toFixed(4)).toBe('100.0000');
    expect(rec1.newValue.toFixed(2)).toBe('500000.00');
    expect(rec1.newRate.toFixed(4)).toBe('5000.0000');

    // Receipt 2: 50 MT @ ₹ 5,600 / MT -> Added Value = ₹ 2,80,000
    // Total Qty = 150 MT, Total Value = ₹ 7,80,000
    // Weighted Average Rate = 7,80,000 / 150 = ₹ 5,200.00 / MT
    const rec2 = valuation.calculateReceipt(
      rec1.newQty,
      rec1.newValue,
      new Decimal('50.0000'),
      new Decimal('5600.0000'),
    );
    expect(rec2.newQty.toFixed(4)).toBe('150.0000');
    expect(rec2.newValue.toFixed(2)).toBe('780000.00');
    expect(rec2.newRate.toFixed(4)).toBe('5200.0000');
  });

  it('correctly calculates issue at current weighted average rate without altering valuation rate', () => {
    // Current stock: 150 MT, Value: ₹ 7,80,000, Rate: ₹ 5,200 / MT
    // Issue 60 MT to NH-31 Site
    // Issue value = 60 * 5,200 = ₹ 3,12,000
    // Remaining stock = 90 MT, Remaining Value = ₹ 4,68,000
    // Remaining Rate = 4,68,000 / 90 = ₹ 5,200 / MT
    const issue1 = valuation.calculateIssue(
      new Decimal('150.0000'),
      new Decimal('780000.00'),
      new Decimal('5200.0000'),
      new Decimal('60.0000'),
    );

    expect(issue1.issueCostRate.toFixed(4)).toBe('5200.0000');
    expect(issue1.issueTotalValue.toFixed(2)).toBe('312000.00');
    expect(issue1.newRunningQty.toFixed(4)).toBe('90.0000');
    expect(issue1.newRunningValue.toFixed(2)).toBe('468000.00');
    expect(issue1.newValuationRate.toFixed(4)).toBe('5200.0000');
  });

  it('handles third receipt at lower rate and subsequent issue accurately', () => {
    // Current: 90 MT @ ₹ 5,200 (₹ 4,68,000)
    // Receipt 3: 110 MT @ ₹ 4,800 (₹ 5,28,000)
    // Total Qty = 200 MT, Total Value = ₹ 9,96,000
    // New Weighted Avg Rate = 9,96,000 / 200 = ₹ 4,980.00 / MT
    const rec3 = valuation.calculateReceipt(
      new Decimal('90.0000'),
      new Decimal('468000.00'),
      new Decimal('110.0000'),
      new Decimal('4800.0000'),
    );

    expect(rec3.newQty.toFixed(4)).toBe('200.0000');
    expect(rec3.newValue.toFixed(2)).toBe('996000.00');
    expect(rec3.newRate.toFixed(4)).toBe('4980.0000');

    // Issue 150 MT
    // Value = 150 * 4,980 = ₹ 7,47,000
    // Remaining: 50 MT, Value: ₹ 2,49,000, Rate: ₹ 4,980
    const issue2 = valuation.calculateIssue(
      rec3.newQty,
      rec3.newValue,
      rec3.newRate,
      new Decimal('150.0000'),
    );

    expect(issue2.issueCostRate.toFixed(4)).toBe('4980.0000');
    expect(issue2.issueTotalValue.toFixed(2)).toBe('747000.00');
    expect(issue2.newRunningQty.toFixed(4)).toBe('50.0000');
    expect(issue2.newRunningValue.toFixed(2)).toBe('249000.00');
    expect(issue2.newValuationRate.toFixed(4)).toBe('4980.0000');
  });

  it('simulates back-dated receipt recalculation impact on subsequent issues', () => {
    // Scenario:
    // Day 1: 100 bags received @ ₹ 350 = ₹ 35,000
    // Day 5: 60 bags issued @ ₹ 350 = ₹ 21,000
    //
    // Back-dated entry on Day 3: 100 bags received @ ₹ 400 = ₹ 40,000
    // If Day 3 is inserted:
    // Position on Day 3 becomes: 200 bags, Total value = ₹ 75,000 -> New rate = ₹ 375 / bag
    // The Day 5 issue must now be repriced at ₹ 375 instead of ₹ 350!
    // Day 5 issue value updated: 60 * 375 = ₹ 22,500 (+₹ 1,500 cost difference)
    const day1Qty = new Decimal('100.0000');
    const day1Val = new Decimal('35000.00');

    const day3ReceiptQty = new Decimal('100.0000');
    const day3ReceiptRate = new Decimal('400.0000');

    const recalculatedAtDay3 = valuation.calculateReceipt(
      day1Qty,
      day1Val,
      day3ReceiptQty,
      day3ReceiptRate,
    );

    expect(recalculatedAtDay3.newQty.toFixed(4)).toBe('200.0000');
    expect(recalculatedAtDay3.newValue.toFixed(2)).toBe('75000.00');
    expect(recalculatedAtDay3.newRate.toFixed(4)).toBe('375.0000');

    const revaluedDay5Issue = valuation.calculateIssue(
      recalculatedAtDay3.newQty,
      recalculatedAtDay3.newValue,
      recalculatedAtDay3.newRate,
      new Decimal('60.0000'),
    );

    expect(revaluedDay5Issue.issueCostRate.toFixed(4)).toBe('375.0000');
    expect(revaluedDay5Issue.issueTotalValue.toFixed(2)).toBe('22500.00');
  });
});

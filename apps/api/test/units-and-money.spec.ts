import { describe, it, expect } from 'vitest';
import {
  convertToBaseQty,
  convertFromBaseQty,
  STANDARD_UNITS,
  STANDARD_CONVERSIONS,
  toMoney,
  toRate,
  toQuantity,
  formatINR,
  formatQtyDisplay,
} from '@civil/shared';
import Decimal from 'decimal.js';

describe('MAT-12 / Units and Money Engine', () => {
  it('converts bags to kg to MT round-trip without floating-point drift', () => {
    // 1 bag = 50 kg; 1 MT = 1000 kg (so 20 bags = 1 MT)
    const bagFactor = 50; // 1 BAG = 50 KG
    const mtFactor = 1000; // 1 MT = 1000 KG

    const originalBags = '20.0000';
    // Convert 20 bags to base (KG)
    const kg = convertToBaseQty(originalBags, bagFactor);
    expect(kg.toString()).toBe('1000');

    // Convert 1000 KG to MT
    const mt = convertFromBaseQty(kg, mtFactor);
    expect(mt.toString()).toBe('1');

    // Convert back: 1 MT to KG
    const backToKg = convertToBaseQty(mt, mtFactor);
    expect(backToKg.toString()).toBe('1000');

    // Convert back: 1000 KG to Bags
    const backToBags = convertFromBaseQty(backToKg, bagFactor);
    expect(backToBags.toFixed(4)).toBe('20.0000');
  });

  it('converts non-integer fractional quantities accurately', () => {
    // 7.35 bags of cement
    const bags = '7.3500';
    const kg = convertToBaseQty(bags, 50);
    expect(kg.toFixed(4)).toBe('367.5000');

    const recoveredBags = convertFromBaseQty(kg, 50);
    expect(recoveredBags.toFixed(4)).toBe('7.3500');
  });

  it('preserves exact decimal money arithmetic (Rule #1)', () => {
    const qty = new Decimal('35.2500');
    const rate = new Decimal('345.5000');
    const total = toMoney(qty.times(rate));

    // 35.25 * 345.5 = 12178.875 -> half-up rounding to 12178.88
    expect(total.toFixed(2)).toBe('12178.88');
  });

  it('formats INR according to en-IN numbering system', () => {
    // ₹ 12,34,567.00
    const formatted = formatINR('1234567.00');
    expect(formatted).toContain('12,34,567.00');
  });

  it('formats quantities with base unit equivalents', () => {
    const formatted = formatQtyDisplay('500.0000', 'BAG');
    expect(formatted).toBe('500 BAG');
  });
});

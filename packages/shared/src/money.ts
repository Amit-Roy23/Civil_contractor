import Decimal from 'decimal.js';

// Configure default Decimal settings
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export { Decimal };

export const MONEY_DECIMALS = 2;
export const QTY_DECIMALS = 4;
export const RATE_DECIMALS = 4;

/**
 * Normalise any numeric / string input to Decimal
 */
export function toDecimal(val: Decimal.Value | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') {
    return new Decimal(0);
  }
  return new Decimal(val);
}

export function toMoney(val: Decimal.Value | null | undefined): Decimal {
  return toDecimal(val).toDecimalPlaces(MONEY_DECIMALS, Decimal.ROUND_HALF_UP);
}

export function toQty(val: Decimal.Value | null | undefined): Decimal {
  return toDecimal(val).toDecimalPlaces(QTY_DECIMALS, Decimal.ROUND_HALF_UP);
}

export function toRate(val: Decimal.Value | null | undefined): Decimal {
  return toDecimal(val).toDecimalPlaces(RATE_DECIMALS, Decimal.ROUND_HALF_UP);
}

/**
 * Returns string representation safe for database numeric storage
 */
export function formatMoneyDb(val: Decimal.Value | null | undefined): string {
  return toMoney(val).toFixed(MONEY_DECIMALS);
}

export function formatQtyDb(val: Decimal.Value | null | undefined): string {
  return toQty(val).toFixed(QTY_DECIMALS);
}

export function formatRateDb(val: Decimal.Value | null | undefined): string {
  return toRate(val).toFixed(RATE_DECIMALS);
}

/**
 * Indian Rupee (₹) Display Formatter in en-IN lakh/crore grouping
 * e.g., ₹ 12,34,567.00
 */
export function formatINR(val: Decimal.Value | null | undefined): string {
  if (val === null || val === undefined || val === '') {
    return '₹ 0.00';
  }
  const num = typeof val === 'number' ? val : Number(toDecimal(val).toFixed(MONEY_DECIMALS));
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: MONEY_DECIMALS,
    maximumFractionDigits: MONEY_DECIMALS,
  }).format(num);
}

/**
 * Indian Quantity Formatter with unit symbol
 * e.g., 1,500.5000 MT
 */
export function formatQtyDisplay(
  val: Decimal.Value | null | undefined,
  unitCode?: string,
  decimals = QTY_DECIMALS,
): string {
  if (val === null || val === undefined || val === '') {
    return `0${decimals > 0 ? '.' + '0'.repeat(decimals) : ''}${unitCode ? ' ' + unitCode : ''}`;
  }
  const num = typeof val === 'number' ? val : Number(toDecimal(val).toFixed(decimals));
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num);

  return unitCode ? `${formatted} ${unitCode}` : formatted;
}

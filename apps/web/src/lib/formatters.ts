import { format, parseISO } from 'date-fns';

/**
 * Format date in Indian standard DD-MM-YYYY
 */
export function formatIndianDate(dateStr?: string | Date | null): string {
  if (!dateStr) return '—';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(d, 'dd-MM-yyyy');
  } catch {
    return String(dateStr);
  }
}

/**
 * Format INR with en-IN lakh/crore grouping and ₹ symbol
 * e.g. ₹ 12,34,567.00
 */
export function formatINR(val?: number | string | null): string {
  if (val === undefined || val === null || val === '') return '₹ 0.00';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '₹ 0.00';

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format quantity with Indian number grouping and unit
 * e.g. 1,500.0000 BAG
 */
export function formatQuantity(
  qty?: number | string | null,
  unit?: string,
  decimals = 4,
): string {
  if (qty === undefined || qty === null || qty === '') return `0 ${unit || ''}`.trim();
  const num = typeof qty === 'number' ? qty : parseFloat(qty);
  if (isNaN(num)) return `0 ${unit || ''}`.trim();

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num);

  return unit ? `${formatted} ${unit}` : formatted;
}

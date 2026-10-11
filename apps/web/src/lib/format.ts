const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** ₹ 12,34,567 (no paise) or with paise when `paise` is true */
export function inr(v: number | null | undefined, paise = false): string {
  const n = Number(v) || 0;
  return `₹${(paise ? inr2 : inr0).format(n)}`;
}

/** Compact Indian notation: ₹4.86 Cr, ₹12.4 L, ₹8.2 K */
export function inrCompact(v: number | null | undefined): string {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(a >= 1e7 ? 0 : 1)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)} K`;
  return `${s}₹${a.toFixed(0)}`;
}

export function qty(v: number | null | undefined, unit?: string): string {
  const n = Number(v) || 0;
  return unit ? `${qtyFmt.format(n)} ${unit}` : qtyFmt.format(n);
}

export function num(v: number | null | undefined, digits = 0): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(v) || 0);
}

export function pct(v: number | null | undefined, digits = 1): string {
  const n = Number(v) || 0;
  return `${n.toFixed(digits)}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO yyyy-mm-dd -> 11 Oct 2026 */
export function date(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}
export function dateShort(iso?: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}
export function dateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${date(toISO(d))}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function today(): string {
  return toISO(new Date());
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Indian financial year code for a date, e.g. 2026-10-11 -> 2026-27 */
export function fyCode(iso: string = today()): string {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

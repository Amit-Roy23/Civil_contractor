import type { SheetOut } from './xlsx.js';

/**
 * XL-06 / TND-04: read the BOQ that comes with a tender (tripuratenders.gov.in / GePNIC style),
 * looking in every sheet — hidden ones too — for the table with item, description, quantity, unit
 * and rate. Group headings (rows without a quantity) are kept as context for the next items.
 */
export interface DeptBoqItem {
  itemNo: string;
  description: string;
  unit: string;
  qty: number;
  estRate: number;
  amount: number;
  row: number;
}
export interface DeptBoq {
  sheet: string;
  hidden: boolean;
  headerRow: number;
  columns: Record<'itemNo' | 'description' | 'qty' | 'unit' | 'rate' | 'amount', number>;
  items: DeptBoqItem[];
  total: number;
  warnings: string[];
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const MATCH: Record<keyof DeptBoq['columns'], RegExp> = {
  itemNo: /^(sl\.?\s*no|s\.?\s*no|item\s*no|sr\.?\s*no|item\s*code|serial)/,
  description: /(description|item description|particulars|name of item)/,
  qty: /^(quantity|qty|estimated quantity)/,
  unit: /^(unit|units|uom)/,
  rate: /(estimated rate|rate in|^rate|rate \(|unit rate|basic rate)/,
  amount: /(total amount|amount|value)/,
};

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[,₹\s]|rs\.?/gi, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function findHeader(rows: SheetOut['rows']) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] || []).map(norm);
    const col: Partial<DeptBoq['columns']> = {};
    cells.forEach((c, j) => {
      if (!c) return;
      for (const k of Object.keys(MATCH) as Array<keyof DeptBoq['columns']>) if (col[k] === undefined && MATCH[k].test(c)) col[k] = j;
    });
    if (col.description !== undefined && col.qty !== undefined && (col.rate !== undefined || col.amount !== undefined)) return { i, col };
  }
  return null;
}

/** pick the most likely BOQ sheet; returns undefined when none looks like a BOQ */
export function readDeptBoq(sheets: SheetOut[], prefer?: string): DeptBoq | undefined {
  const candidates = sheets
    .filter((s) => !prefer || s.name === prefer)
    .map((s) => ({ s, h: findHeader(s.rows) }))
    .filter((x) => x.h);
  let best: DeptBoq | undefined;
  for (const { s, h } of candidates) {
    const col = h!.col;
    const items: DeptBoqItem[] = [];
    const warnings: string[] = [];
    let heading = '';
    for (let r = h!.i + 1; r < s.rows.length; r++) {
      const row = s.rows[r] || [];
      const desc = String(row[col.description!] ?? '').trim();
      const qty = num(row[col.qty!]);
      const rate = col.rate !== undefined ? num(row[col.rate]) : null;
      const amount = col.amount !== undefined ? num(row[col.amount]) : null;
      if (/^(total|grand total|sub total)/i.test(desc) || /^(total|grand total)/i.test(String(row[col.itemNo ?? -1] ?? ''))) continue;
      if (!qty || qty <= 0) {
        if (desc) heading = desc.slice(0, 300);
        continue;
      }
      const estRate = rate ?? (amount && qty ? amount / qty : 0);
      if (!(estRate > 0)) {
        warnings.push(`Row ${r + 1}: quantity without a rate — left out`);
        continue;
      }
      const itemNo = String(row[col.itemNo ?? -1] ?? '').trim() || String(items.length + 1);
      const full = desc || heading;
      items.push({ itemNo, description: (heading && desc && !desc.startsWith(heading.slice(0, 20)) && desc.length < 120 ? `${heading} — ${desc}` : full).slice(0, 2000), unit: String(row[col.unit ?? -1] ?? '').trim().slice(0, 20), qty, estRate: Math.round(estRate * 100) / 100, amount: Math.round((amount ?? qty * estRate) * 100) / 100, row: r + 1 });
    }
    const total = Math.round(items.reduce((a, b) => a + b.amount, 0) * 100) / 100;
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.itemNo)) warnings.push(`Item no. ${it.itemNo} appears more than once`);
      seen.add(it.itemNo);
      if (Math.abs(it.qty * it.estRate - it.amount) > Math.max(1, it.amount * 0.001)) warnings.push(`Item ${it.itemNo}: quantity × rate (${Math.round(it.qty * it.estRate)}) differs from the amount in the sheet (${Math.round(it.amount)})`);
    }
    const cand: DeptBoq = { sheet: s.name, hidden: s.hidden, headerRow: h!.i + 1, columns: { itemNo: col.itemNo ?? -1, description: col.description!, qty: col.qty!, unit: col.unit ?? -1, rate: col.rate ?? -1, amount: col.amount ?? -1 }, items, total, warnings };
    if (!best || cand.items.length > best.items.length) best = cand;
  }
  return best;
}

/** TND-04: BOQ total against the estimated cost put to tender */
export function checkAgainstEstimate(total: number, estimatedCost?: number) {
  if (!estimatedCost) return { ok: true, diff: 0, pct: 0, message: 'No estimated cost on the work to compare with' };
  const diff = Math.round((total - estimatedCost) * 100) / 100;
  const pct = Math.round((diff / estimatedCost) * 10000) / 100;
  return { ok: Math.abs(diff) <= Math.max(1, estimatedCost * 0.0005), diff, pct, message: Math.abs(diff) <= 1 ? 'BOQ total matches the estimated cost' : `BOQ total differs from the estimated cost by ₹${Math.abs(diff).toLocaleString('en-IN')} (${pct > 0 ? '+' : ''}${pct}%)` };
}

import type { BillDeduction, BoqItem, DB, ID, Measurement, PaLine, PartyEntity, Payment, RaBill, Site, SubContractor, Supplier, TdsSection } from './types.js';
import { contractTaxable, workDeductions } from './works.js';
import { fyCode } from './format.js';
import { round, sum } from './utils.js';

/**
 * Phase 2 (Money) calculations — one place for every rule in the client's documents, used by the
 * server (which decides) and the screens (which preview). All amounts are rounded to whole rupees
 * per line, as divisions do.
 */

const r0 = (x: number) => Math.round(x);

/* ---------------- BOQ (BIL-01) ---------------- */
/** contract rate = estimate rate with the tendered % applied */
export function contractRate(site: Pick<Site, 'quoteType' | 'quotedPct'>, estRate: number): number {
  const q = site.quotedPct || 0;
  if (site.quoteType === 'ABOVE') return round(estRate * (1 + q / 100), 2);
  if (site.quoteType === 'BELOW') return round(estRate * (1 - q / 100), 2);
  return round(estRate, 2);
}

/* ---------------- Measurement book (BIL-02) ---------------- */
/** nos × L × B × D — dimensions left blank (0) are not used, e.g. an area is L × B */
export function measureQty(m: Pick<Measurement, 'nos' | 'length' | 'breadth' | 'depth'>): number | null {
  const dims = [m.nos, m.length, m.breadth, m.depth].filter((x) => x && x > 0);
  if (!dims.length) return null;
  return round(dims.reduce((a, b) => a * b, 1), 3);
}
/** signed quantity: deduction entries count against the item */
export const mQty = (m: Pick<Measurement, 'qty' | 'deduction'>) => (m.deduction ? -m.qty : m.qty);

/** quantity measured up to a date; entries the JE has queried are left out of bills */
export function measuredUpto(db: DB, boqItemId: ID, upto: string, forBill = false): number {
  return round(sum(db.measurements.filter((m) => m.boqItemId === boqItemId && m.date <= upto && (!forBill || m.jeStatus !== 'QUERY')), mQty), 3);
}

/** BIL-04: quantity above the BOQ, as % of the BOQ quantity */
export function deviation(item: Pick<BoqItem, 'qty'>, executed: number) {
  const excess = round(executed - item.qty, 3);
  return { excess: Math.max(0, excess), pct: item.qty > 0 ? round((Math.max(0, excess) / item.qty) * 100, 1) : executed > 0 ? 100 : 0 };
}

/* ---------------- RA bill lines ---------------- */
export function previousBills(db: DB, siteId: ID, beforeId?: ID) {
  return db.raBills.filter((b) => b.siteId === siteId && b.id !== beforeId).sort((a, b) => a.seq - b.seq);
}

export function billLines(db: DB, siteId: ID, upto: string) {
  const last = previousBills(db, siteId).at(-1);
  return db.boq
    .filter((b) => b.siteId === siteId)
    .map((b) => {
      const prevQty = last?.lines.find((l) => l.boqItemId === b.id)?.uptoQty || 0;
      const upQ = measuredUpto(db, b.id, upto, true);
      return { boqItemId: b.id, uptoQty: round(upQ, 3), prevQty: round(prevQty, 3), thisQty: round(upQ - prevQty, 3), rate: b.rate };
    })
    .filter((l) => l.uptoQty !== 0 || l.prevQty !== 0);
}

/* ---------------- Price adjustment (BIL-05) ---------------- */
/**
 * SHARE: value of work this bill × component share % × (current − base) / base
 * QUANTITY: (current − base) × quantity used this bill (e.g. bitumen MT)
 */
export function priceAdjustment(site: Site, gross: number, inputs: Array<{ name: string; currentPrice: number; qty?: number }>): PaLine[] {
  const pa = site.priceAdjustment;
  if (!pa?.applicable) return [];
  return pa.components
    .map((c) => {
      const inp = inputs.find((i) => i.name === c.name);
      if (!inp || !(inp.currentPrice > 0) || !(c.basePrice > 0)) return null;
      const method = c.method || 'SHARE';
      const qty = inp.qty || 0;
      const amount = method === 'QUANTITY' ? r0((inp.currentPrice - c.basePrice) * qty) : r0((gross * c.sharePct * (inp.currentPrice - c.basePrice)) / (100 * c.basePrice));
      return { name: c.name, method, basePrice: c.basePrice, currentPrice: inp.currentPrice, sharePct: c.sharePct, qty, amount };
    })
    .filter((x): x is PaLine => !!x);
}

/* ---------------- Deductions (BIL-03, Query 2) ---------------- */
export interface ManualDeductions {
  /** department material recovered */
  materialRecovery?: number;
  /** time penalty / liquidated damages */
  penalty?: number;
  /** interest on advances, as worked out by the division */
  interest?: number;
  /** amounts for FIXED heads of the profile, by head name */
  fixed?: Record<string, number>;
}

/** what a previous bill deducted under a code (old demo bills carry the fixed structure) */
function deductedBefore(db: DB, siteId: ID, code: string, beforeSeq: number): number {
  return sum(
    db.raBills.filter((b) => b.siteId === siteId && b.seq < beforeSeq),
    (b) => (b.ded ? sum(b.ded.filter((d) => d.code === code), (d) => d.amount) : code === 'SD' ? b.deductions.securityDeposit + b.deductions.retention : code.startsWith('ADV:') ? b.deductions.advanceRecovery : 0),
  );
}

export function computeDeductions(db: DB, site: Site, gross: number, gst: number, seq: number, manual: ManualDeductions = {}): BillDeduction[] {
  const p = workDeductions(db, site);
  const out: BillDeduction[] = [];
  const add = (code: string, head: string, pct: number, base: number, amount: number, note?: string) => {
    if (amount > 0) out.push({ code, head, pct, base: r0(base), amount: r0(amount), note });
  };
  const withGst = gross + gst;

  // security deposit / retention on the gross bill, up to the ceiling
  if (site.retentionPct > 0) {
    let amt = (gross * site.retentionPct) / 100;
    let note: string | undefined;
    if (site.sdCeiling && site.sdCeiling > 0) {
      const left = Math.max(0, site.sdCeiling - deductedBefore(db, site.id, 'SD', seq));
      if (amt > left) (amt = left), (note = `ceiling ₹${site.sdCeiling.toLocaleString('en-IN')} reached`);
    }
    add('SD', 'Security deposit', site.retentionPct, gross, amt, note);
  }
  // GST TDS (s.51) only when the contract's taxable value is above the threshold
  if (p.gstTdsPct > 0) {
    if (contractTaxable(site) > p.gstTdsThreshold) add('GST_TDS', 'GST TDS (CGST + SGST)', p.gstTdsPct, gross, (gross * p.gstTdsPct) / 100);
  }
  if (p.itTdsPct > 0) {
    const base = p.itTdsOnGst ? withGst : gross;
    add('IT_TDS', 'Income-tax TDS', p.itTdsPct, base, (base * p.itTdsPct) / 100);
  }
  if (p.labourCessPct > 0) {
    const base = p.labourCessOnGst ? withGst : gross;
    add('CESS', 'Labour cess', p.labourCessPct, base, (base * p.labourCessPct) / 100);
  }
  if (p.tcsPct > 0) add('TCS', 'TCS', p.tcsPct, withGst, (withGst * p.tcsPct) / 100);
  for (const o of p.others) {
    if (!o.head) continue;
    if (o.basis === 'FIXED') add(`OTH:${o.head}`, o.head, 0, 0, manual.fixed?.[o.head] ?? o.amount ?? 0);
    else {
      const base = o.basis === 'GROSS' ? withGst : gross;
      add(`OTH:${o.head}`, o.head, o.pct, base, (base * o.pct) / 100);
    }
  }
  // advances: recovered at the agreed % of each bill until the advance is cleared
  for (const a of site.advances || []) {
    const code = `ADV:${a.kind}`;
    const left = Math.max(0, a.amount - deductedBefore(db, site.id, code, seq));
    const amt = Math.min(left, (gross * a.recoveryPct) / 100);
    add(code, `${a.kind === 'MOBILISATION' ? 'Mobilisation' : a.kind === 'MACHINERY' ? 'Machinery' : 'Secured'} advance recovery`, a.recoveryPct, gross, amt, `balance after this bill ₹${r0(left - amt).toLocaleString('en-IN')}`);
  }
  add('INT', 'Interest on advance', 0, 0, manual.interest || 0);
  add('MAT', 'Department material recovered', 0, 0, manual.materialRecovery || 0);
  add('LD', 'Time penalty / liquidated damages', 0, 0, manual.penalty || 0);
  return out;
}

/** the fixed structure older screens and reports read */
export function legacyDeductions(ded: BillDeduction[]): RaBill['deductions'] {
  const by = (pred: (d: BillDeduction) => boolean) => sum(ded.filter(pred), (d) => d.amount);
  return {
    securityDeposit: by((d) => d.code === 'SD'),
    retention: 0,
    tds: by((d) => d.code === 'IT_TDS'),
    cess: by((d) => d.code === 'CESS'),
    gstTds: by((d) => d.code === 'GST_TDS'),
    royalty: by((d) => /royalty/i.test(d.head) && d.code.startsWith('OTH:')),
    advanceRecovery: by((d) => d.code.startsWith('ADV:') || d.code === 'INT'),
    materialRecovery: by((d) => d.code === 'MAT'),
    penalty: by((d) => d.code === 'LD' || d.code === 'TCS' || (d.code.startsWith('OTH:') && !/royalty/i.test(d.head))),
  };
}

/* ---------------- Bill totals and tracking (BIL-03, BIL-06) ---------------- */
export function billTotals(b: RaBill) {
  const work = sum(b.lines, (l) => l.thisQty * l.rate);
  const pa = b.priceAdj ? sum(b.priceAdj, (x) => x.amount) : b.escalation || 0;
  const gross = work + pa;
  const gst = (gross * b.gstPct) / 100;
  const expected = b.ded ? sum(b.ded, (d) => d.amount) : sum(Object.values(b.deductions), (x) => x);
  // once the division has passed the bill, its actual deductions decide what is receivable
  const actual = b.actualDed ? sum(b.actualDed, (d) => d.amount) : undefined;
  const deductions = actual ?? expected;
  const passedGross = b.passedGross && b.passedGross > 0 ? b.passedGross : undefined;
  const g2 = passedGross ?? gross;
  const gst2 = passedGross ? (passedGross * b.gstPct) / 100 : gst;
  const net = g2 + gst2 - deductions;
  const received = sum(b.receipts, (x) => x.amount);
  return { work, pa, gross, gst, expected, actual, deductions, net, received, outstanding: Math.max(0, net - received) };
}

/** BIL-06: division's actual deductions against what the work profile expects */
export function deductionDiff(b: RaBill) {
  if (!b.actualDed || !b.ded) return [];
  const codes = [...new Set([...b.ded.map((d) => d.code), ...b.actualDed.map((d) => d.code)])];
  return codes
    .map((code) => {
      const exp = b.ded!.find((d) => d.code === code);
      const act = b.actualDed!.find((d) => d.code === code)?.amount ?? 0;
      return { code, head: exp?.head || code.replace(/^OTH:/, ''), expected: exp?.amount ?? 0, actual: act, diff: act - (exp?.amount ?? 0) };
    })
    .filter((x) => Math.abs(x.diff) >= 1);
}

/* ---------------- GST on the tax invoice (BIL-08) ---------------- */
export function gstSplit(firmGstin: string, clientGstin: string, gst: number) {
  const same = !clientGstin || !firmGstin || clientGstin.slice(0, 2) === firmGstin.slice(0, 2);
  const total = r0(gst);
  if (!same) return { cgst: 0, sgst: 0, igst: total, intra: false };
  const cgst = r0(total / 2);
  return { cgst, sgst: total - cgst, igst: 0, intra: true };
}

/* ---------------- TDS on payments we make (Query 2, PUR-04, SUB-02) ---------------- */
export const DEFAULT_TDS: TdsSection[] = [
  { code: '393-CONTRACT', label: 'Contractors, sub-contractors, transporters — s.393(1) (old 194C)', rateInd: 1, rateOther: 2, rateNoPan: 20, single: 30000, annual: 100000 },
];
export function tdsSections(db: DB): TdsSection[] {
  return db.settings.tds?.sections?.length ? db.settings.tds.sections : DEFAULT_TDS;
}
export function tdsEnabled(db: DB, date: string): boolean {
  const fy = fyCode(date);
  return db.settings.tds?.enabledFy?.[fy] ?? true;
}
/** from the 4th letter of the PAN when the entity type was not entered */
export function entityOf(pan: string, given?: PartyEntity): PartyEntity {
  if (given) return given;
  const c = (pan || '').toUpperCase()[3];
  return c === 'P' ? 'INDIVIDUAL' : c === 'H' ? 'HUF' : c === 'F' ? 'FIRM' : c === 'C' ? 'COMPANY' : c === 'E' ? 'LLP' : 'OTHER';
}
export function partyTdsCode(partyType: Payment['partyType'], party?: Supplier | SubContractor): string {
  if (!party) return '';
  if (party.tdsCode !== undefined) return party.tdsCode;
  if (partyType === 'SUBCON') return '393-CONTRACT';
  if (partyType === 'SUPPLIER' && (party as Supplier).kind === 'VEHICLE_OWNER') return '393-CONTRACT';
  return '';
}

export interface TdsResult {
  code: string;
  rate: number;
  tds: number;
  reason: string;
}
/** TDS on a payment of `amount` (gross: the amount credited to the party, before TDS) on `date` */
export function tdsFor(db: DB, partyType: Payment['partyType'], partyId: ID, amount: number, date: string, exceptPaymentId?: ID): TdsResult {
  const none = (reason: string): TdsResult => ({ code: '', rate: 0, tds: 0, reason });
  if (partyType === 'WORKER') return none('Wages — no TDS here');
  if (!tdsEnabled(db, date)) return none(`TDS switched off for ${fyCode(date)}`);
  const party = partyType === 'SUPPLIER' ? db.suppliers.find((s) => s.id === partyId) : db.subcons.find((s) => s.id === partyId);
  const code = partyTdsCode(partyType, party);
  const sec = tdsSections(db).find((s) => s.code === code);
  if (!party || !sec) return none('No TDS section for this party');
  const pan = (party.pan || '').trim();
  if ((party as Supplier).transporter10 && pan) return { code, rate: 0, tds: 0, reason: 'Transporter with ≤10 goods carriages — declaration and PAN on file' };
  const fy = fyCode(date);
  const ytd = sum(db.payments.filter((p) => p.partyType === partyType && p.partyId === partyId && p.id !== exceptPaymentId && fyCode(p.date) === fy), (p) => p.amount + p.tds);
  if (!(amount > sec.single) && !(ytd + amount > sec.annual)) return none(`Below ₹${sec.single.toLocaleString('en-IN')} single / ₹${sec.annual.toLocaleString('en-IN')} yearly limits`);
  const ent = entityOf(pan, party.entityType);
  const rate = !pan ? sec.rateNoPan : ent === 'INDIVIDUAL' || ent === 'HUF' ? sec.rateInd : sec.rateOther;
  const why = !pan ? 'no PAN on file' : ent === 'INDIVIDUAL' || ent === 'HUF' ? 'individual / HUF' : 'firm / company';
  return { code, rate, tds: r0((amount * rate) / 100), reason: `${sec.label}: ${rate}% (${why})` };
}

/* ---------------- numbering ---------------- */
export function invoiceKey(prefix: string, date: string) {
  return `INV:${prefix}:${fyCode(date)}`;
}
export function invoiceNo(prefix: string, date: string, n: number) {
  return `${prefix}/${fyCode(date)}/${String(n).padStart(4, '0')}`;
}

import type { DB, GuaranteeRec, ID, RaBill } from './types.js';
import { billTotals, deductionDiff, gstSplit } from './billing.js';
import { daysBetween, fyCode, monthOf } from './format.js';
import { round, sum } from './utils.js';

/** Phase 2 (Money) registers, reconciliations and exports. */

const r2 = (x: number) => Math.round(x * 100) / 100;
const firmOfBill = (db: DB, b: RaBill) => db.firms.find((f) => f.id === b.firmId) || db.firms[0];
const clientOf = (db: DB, siteId: ID) => db.clients.find((c) => c.id === db.sites.find((s) => s.id === siteId)?.clientId);

/* ---------------- BIL-07 receivables ageing by work and division ---------------- */
export function receivables(db: DB, today: string) {
  return db.raBills
    .filter((b) => b.status !== 'DRAFT')
    .map((b) => {
      const t = billTotals(b);
      const site = db.sites.find((s) => s.id === b.siteId);
      const client = clientOf(db, b.siteId);
      const office = client?.offices?.find((o) => o.id === site?.officeId);
      const from = b.submittedOn || b.date;
      const age = Math.max(0, daysBetween(from, today));
      return {
        billId: b.id, billNo: b.no, siteId: b.siteId, clientId: client?.id || '', office: office?.division || client?.name || '', date: from, status: b.status,
        net: t.net, outstanding: t.outstanding, age, bucket: age <= 30 ? '0–30' : age <= 60 ? '31–60' : age <= 90 ? '61–90' : '90+', diff: deductionDiff(b).length > 0,
      };
    })
    .filter((x) => x.outstanding > 1);
}

/* ---------------- SEC-01/02 guarantees ---------------- */
export const ALERT_DAYS = [60, 30, 15, 7] as const;
export function guaranteeDue(g: GuaranteeRec, today: string) {
  if (g.status === 'RELEASED' || g.status === 'ENCASHED' || !g.expiryDate) return null;
  const days = daysBetween(today, g.expiryDate);
  const stage = days < 0 ? 'EXPIRED' : ALERT_DAYS.slice().reverse().find((d) => days <= d) ?? null;
  return { days, stage };
}
export function guaranteeAlerts(db: DB, today: string) {
  return db.guarantees
    .map((g) => ({ g, due: guaranteeDue(g, today) }))
    .filter((x) => x.due && x.due.stage !== null)
    .sort((a, b) => a.due!.days - b.due!.days);
}

/** the cash a guarantee keeps blocked: the full amount for FDR / DD / cash / online, the margin for a BG */
export function blockedBy(g: GuaranteeRec) {
  if (g.status === 'RELEASED' || g.status === 'ENCASHED') return 0;
  return g.instrument === 'BG' || g.instrument === 'EBG' ? r2((g.amount * g.marginPct) / 100) : g.amount;
}

/* ---------------- SEC-03 bank limits ---------------- */
export function bankUsage(db: DB) {
  const norm = (x: string) => x.trim().toLowerCase();
  const live = db.guarantees.filter((g) => g.status === 'ACTIVE' || g.status === 'EXTENDED');
  const banks = new Map<string, { bank: string; limit: number; used: number; margin: number; fdrLien: number; count: number }>();
  for (const f of db.bankFacilities.filter((x) => x.active !== false)) banks.set(norm(f.bank), { bank: f.bank, limit: f.bgLimit, used: 0, margin: 0, fdrLien: f.fdrUnderLien, count: 0 });
  for (const g of live) {
    const k = norm(g.bank || 'Unknown bank');
    const x = banks.get(k) || { bank: g.bank || 'Unknown bank', limit: 0, used: 0, margin: 0, fdrLien: 0, count: 0 };
    if (g.instrument === 'BG' || g.instrument === 'EBG') {
      x.used += g.amount;
      x.margin += (g.amount * g.marginPct) / 100;
      x.count++;
    } else if (g.instrument === 'FDR') x.fdrLien += g.amount;
    banks.set(k, x);
  }
  return [...banks.values()].map((x) => ({ ...x, used: r2(x.used), margin: r2(x.margin), available: r2(x.limit - x.used), usedPct: x.limit ? round((x.used / x.limit) * 100, 1) : 0 }));
}

/* ---------------- SEC-04 money blocked per work ---------------- */
export function moneyBlocked(db: DB) {
  return db.sites
    .map((s) => {
      const g = db.guarantees.filter((x) => x.siteId === s.id);
      const by = (k: string) => sum(g.filter((x) => x.kind === k), blockedBy);
      // security deposit cut from bills and not yet released
      const sdHeld = s.sdReleasedOn ? 0 : sum(db.raBills.filter((b) => b.siteId === s.id && b.status !== 'DRAFT'), (b) => (b.actualDed ? sum(b.actualDed.filter((d) => d.code === 'SD'), (d) => d.amount) : b.ded ? sum(b.ded.filter((d) => d.code === 'SD'), (d) => d.amount) : b.deductions.securityDeposit + b.deductions.retention));
      const emd = by('EMD');
      const ps = by('PS') + by('APS');
      const other = by('SD') + by('ADVANCE') + by('OTHER');
      return { siteId: s.id, emd, ps, sdHeld: r2(sdHeld), other, total: r2(emd + ps + sdHeld + other) };
    })
    .filter((x) => x.total > 0);
}

/* ---------------- BIL-09 reconciliation ---------------- */
/** tax deducted on our bills (actual if the division's figures are entered, else expected), by the month the bill was passed */
function deductedOn(b: RaBill, code: string) {
  const list = b.actualDed || b.ded;
  if (list) return sum(list.filter((d) => d.code === code), (d) => d.amount);
  return code === 'GST_TDS' ? b.deductions.gstTds : code === 'IT_TDS' ? b.deductions.tds : code === 'CESS' ? b.deductions.cess : 0;
}
export function taxRecon(db: DB, kind: 'GSTR7A' | 'AS26') {
  const code = kind === 'GSTR7A' ? 'GST_TDS' : 'IT_TDS';
  const months = new Map<string, { month: string; deducted: number; credited: number; bills: string[]; credits: number }>();
  const row = (m: string) => months.get(m) || (months.set(m, { month: m, deducted: 0, credited: 0, bills: [], credits: 0 }), months.get(m)!);
  for (const b of db.raBills.filter((x) => x.status !== 'DRAFT')) {
    const amt = deductedOn(b, code);
    if (!amt) continue;
    const x = row(monthOf(b.passedOn || b.submittedOn || b.date));
    x.deducted += amt;
    x.bills.push(b.no);
  }
  for (const c of db.taxCredits.filter((x) => x.kind === kind)) {
    const x = row(monthOf(c.date));
    x.credited += c.amount;
    x.credits++;
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month)).map((x) => ({ ...x, deducted: r2(x.deducted), credited: r2(x.credited), diff: r2(x.credited - x.deducted) }));
}
/** per bill: deducted vs credits linked to it */
export function billCredits(db: DB, kind: 'GSTR7A' | 'AS26') {
  const code = kind === 'GSTR7A' ? 'GST_TDS' : 'IT_TDS';
  return db.raBills
    .filter((b) => b.status !== 'DRAFT' && deductedOn(b, code) > 0)
    .map((b) => {
      const credited = sum(db.taxCredits.filter((c) => c.kind === kind && c.billId === b.id), (c) => c.amount);
      const deducted = deductedOn(b, code);
      return { billId: b.id, billNo: b.no, siteId: b.siteId, date: b.passedOn || b.submittedOn || b.date, deducted: r2(deducted), credited: r2(credited), diff: r2(credited - deducted) };
    });
}
/** credits not yet linked to a bill: suggest the bill with the same amount (±₹1) */
export function suggestBill(db: DB, creditId: ID) {
  const c = db.taxCredits.find((x) => x.id === creditId);
  if (!c || c.billId) return undefined;
  const code = c.kind === 'GSTR7A' ? 'GST_TDS' : 'IT_TDS';
  const taken = new Set(db.taxCredits.filter((x) => x.kind === c.kind && x.billId).map((x) => x.billId));
  return db.raBills.find((b) => !taken.has(b.id) && b.status !== 'DRAFT' && Math.abs(deductedOn(b, code) - c.amount) <= 1);
}
/** labour cess per work and financial year */
export function cessByWorkYear(db: DB) {
  const out = new Map<string, { siteId: ID; fy: string; cess: number; gstTds: number; itTds: number }>();
  for (const b of db.raBills.filter((x) => x.status !== 'DRAFT')) {
    const fy = fyCode(b.passedOn || b.date);
    const k = `${b.siteId}|${fy}`;
    const x = out.get(k) || { siteId: b.siteId, fy, cess: 0, gstTds: 0, itTds: 0 };
    x.cess += deductedOn(b, 'CESS');
    x.gstTds += deductedOn(b, 'GST_TDS');
    x.itTds += deductedOn(b, 'IT_TDS');
    out.set(k, x);
  }
  return [...out.values()].map((x) => ({ ...x, cess: r2(x.cess), gstTds: r2(x.gstTds), itTds: r2(x.itTds) }));
}

/* ---------------- BIL-08 GSTR-1 (B2B invoices) ---------------- */
export function gstr1Rows(db: DB, from: string, to: string) {
  return db.raBills
    .filter((b) => b.invoiceNo && (b.submittedOn || b.date) >= from && (b.submittedOn || b.date) <= to)
    .map((b) => {
      const t = billTotals(b);
      const firm = firmOfBill(db, b);
      const client = clientOf(db, b.siteId);
      const office = client?.offices?.find((o) => o.id === db.sites.find((s) => s.id === b.siteId)?.officeId);
      const gstin = office?.gstin || client?.gstin || '';
      const sp = gstSplit(firm?.gstin || '', gstin, t.gst);
      return {
        gstin, receiver: client?.name || '', invoiceNo: b.invoiceNo!, date: b.submittedOn || b.date, value: r2(t.gross + t.gst), placeOfSupply: (gstin || firm?.gstin || '16').slice(0, 2),
        reverseCharge: 'N', type: 'Regular B2B', rate: b.gstPct, taxable: r2(t.gross), igst: sp.igst, cgst: sp.cgst, sgst: sp.sgst, sac: '9954',
      };
    })
    .concat(
      // HMP-04 hot mix and sale of goods: GSTR-1 wants one row per invoice and GST rate
      db.salesInvoices
        .filter((i) => i.status !== 'CANCELLED' && i.date >= from && i.date <= to)
        .flatMap((i) => {
          const firm = db.firms.find((f) => f.id === i.firmId) || db.firms[0];
          const buyer = db.clients.find((c) => c.id === i.buyerId);
          const invValue = Math.round(sum(i.lines, (l) => l.qty * l.rate * (1 + l.gstPct / 100)));
          const rates = [...new Set(i.lines.map((l) => l.gstPct))].sort((a, b) => a - b);
          return rates.map((rate) => {
            const ls = i.lines.filter((l) => l.gstPct === rate);
            const taxable = r2(sum(ls, (l) => l.qty * l.rate));
            const sp = gstSplit(firm?.gstin || '', buyer?.gstin || '', r2((taxable * rate) / 100));
            return { gstin: buyer?.gstin || '', receiver: buyer?.name || '', invoiceNo: i.no, date: i.date, value: invValue, placeOfSupply: (buyer?.gstin || firm?.gstin || '16').slice(0, 2), reverseCharge: 'N', type: buyer?.gstin ? 'Regular B2B' : 'B2C', rate, taxable, igst: sp.igst, cgst: sp.cgst, sgst: sp.sgst, sac: [...new Set(ls.map((l) => l.hsn))].join(', ') };
          });
        }),
    )
    .sort((a, b) => a.invoiceNo.localeCompare(b.invoiceNo));
}

/* ---------------- Query 2: TDS return data (Form 140, earlier 26Q) ---------------- */
export function tdsReturnRows(db: DB, from: string, to: string) {
  return db.payments
    .filter((p) => p.tds > 0 && p.date >= from && p.date <= to && p.partyType !== 'WORKER')
    .map((p) => {
      const party: any = p.partyType === 'SUPPLIER' ? db.suppliers.find((s) => s.id === p.partyId) : db.subcons.find((s) => s.id === p.partyId);
      const gross = p.amount + p.tds;
      return { date: p.date, voucher: p.no, party: party?.name || '', pan: party?.pan || 'PANNOTAVBL', section: p.tdsCode || '', rate: p.tdsRate ?? round((p.tds / gross) * 100, 2), amountPaid: gross, tds: p.tds };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- ACC-03 Tally export ---------------- */
export const TALLY_LEDGERS: Record<string, { name: string; group: string }> = {
  income: { name: 'Works Contract Receipts', group: 'Sales Accounts' },
  hotmixSales: { name: 'Sale of Hot Mix', group: 'Sales Accounts' },
  goodsSales: { name: 'Sale of Goods', group: 'Sales Accounts' },
  cgstOut: { name: 'Output CGST', group: 'Duties & Taxes' },
  sgstOut: { name: 'Output SGST', group: 'Duties & Taxes' },
  igstOut: { name: 'Output IGST', group: 'Duties & Taxes' },
  gstTds: { name: 'GST TDS Receivable', group: 'Current Assets' },
  itTds: { name: 'TDS Receivable', group: 'Current Assets' },
  cess: { name: 'Labour Cess Deducted', group: 'Indirect Expenses' },
  sd: { name: 'Security Deposit with Department', group: 'Current Assets' },
  advance: { name: 'Advance from Department', group: 'Current Liabilities' },
  otherDed: { name: 'Other Deductions by Department', group: 'Indirect Expenses' },
  bank: { name: 'Bank Account', group: 'Bank Accounts' },
  purchase: { name: 'Purchases', group: 'Purchase Accounts' },
  cgstIn: { name: 'Input CGST', group: 'Duties & Taxes' },
  sgstIn: { name: 'Input SGST', group: 'Duties & Taxes' },
  igstIn: { name: 'Input IGST', group: 'Duties & Taxes' },
  tdsPayable: { name: 'TDS Payable', group: 'Duties & Taxes' },
};
export const ledgerName = (db: DB, key: string) => db.settings.tally?.ledgers?.[key] || TALLY_LEDGERS[key]?.name || key;

export interface TallyVoucher {
  type: 'Sales' | 'Journal' | 'Receipt' | 'Purchase' | 'Payment';
  date: string;
  no: string;
  party?: string;
  narration: string;
  /** positive = debit, negative = credit */
  lines: Array<{ ledger: string; amount: number }>;
}

const dedLedger = (code: string) => (code === 'SD' ? 'sd' : code === 'GST_TDS' ? 'gstTds' : code === 'IT_TDS' ? 'itTds' : code === 'CESS' ? 'cess' : code.startsWith('ADV:') ? 'advance' : 'otherDed');

export function tallyVouchers(db: DB, from: string, to: string): TallyVoucher[] {
  const out: TallyVoucher[] = [];
  const L = (k: string) => ledgerName(db, k);
  const inRange = (d?: string) => !!d && d >= from && d <= to;
  for (const b of db.raBills.filter((x) => x.status !== 'DRAFT')) {
    const t = billTotals(b);
    const client = clientOf(db, b.siteId)?.name || 'Department';
    const site = db.sites.find((s) => s.id === b.siteId);
    const firm = firmOfBill(db, b);
    const office = clientOf(db, b.siteId)?.offices?.find((o) => o.id === site?.officeId);
    const sp = gstSplit(firm?.gstin || '', office?.gstin || clientOf(db, b.siteId)?.gstin || '', t.gst);
    const on = b.submittedOn || b.date;
    if (inRange(on)) {
      const lines = [{ ledger: client, amount: r2(t.gross) + sp.cgst + sp.sgst + sp.igst }, { ledger: L('income'), amount: -r2(t.gross) }];
      if (sp.cgst) lines.push({ ledger: L('cgstOut'), amount: -sp.cgst }, { ledger: L('sgstOut'), amount: -sp.sgst });
      if (sp.igst) lines.push({ ledger: L('igstOut'), amount: -sp.igst });
      out.push({ type: 'Sales', date: on, no: b.invoiceNo || b.no, party: client, narration: `${b.no} — ${site?.short || ''}`, lines });
    }
    const ded = b.actualDed ? b.actualDed.map((d) => ({ code: d.code, amount: d.amount })) : (b.ded || []).map((d) => ({ code: d.code, amount: d.amount }));
    const dOn = b.passedOn || on;
    if (ded.length && inRange(dOn)) {
      const lines = ded.filter((d) => d.amount > 0).map((d) => ({ ledger: L(dedLedger(d.code)), amount: r2(d.amount) }));
      out.push({ type: 'Journal', date: dOn, no: `${b.no}/DED`, party: client, narration: `Deductions by the department on ${b.no}`, lines: [...lines, { ledger: client, amount: -r2(sum(lines, (l) => l.amount)) }] });
    }
    b.receipts.forEach((rc, i) => {
      if (inRange(rc.date)) out.push({ type: 'Receipt', date: rc.date, no: `${b.no}/R${i + 1}`, party: client, narration: `Received against ${b.no} · UTR ${rc.utr}`, lines: [{ ledger: L('bank'), amount: r2(rc.amount) }, { ledger: client, amount: -r2(rc.amount) }] });
    });
  }
  // HMP-04 sales and their receipts
  for (const inv of db.salesInvoices.filter((x) => x.status !== 'CANCELLED')) {
    const buyer = db.clients.find((c) => c.id === inv.buyerId)?.name || 'Buyer';
    const taxable = r2(sum(inv.lines, (l) => l.qty * l.rate));
    const gst = r2(sum(inv.lines, (l) => (l.qty * l.rate * l.gstPct) / 100));
    const firm = db.firms.find((f) => f.id === inv.firmId) || db.firms[0];
    const sp = gstSplit(firm?.gstin || '', db.clients.find((c) => c.id === inv.buyerId)?.gstin || '', gst);
    if (inRange(inv.date)) {
      const lines = [{ ledger: buyer, amount: r2(taxable + sp.cgst + sp.sgst + sp.igst) }, { ledger: L(inv.kind === 'GOODS' ? 'goodsSales' : 'hotmixSales'), amount: -taxable }];
      if (sp.cgst) lines.push({ ledger: L('cgstOut'), amount: -sp.cgst }, { ledger: L('sgstOut'), amount: -sp.sgst });
      if (sp.igst) lines.push({ ledger: L('igstOut'), amount: -sp.igst });
      out.push({ type: 'Sales', date: inv.date, no: inv.no, party: buyer, narration: inv.lines.map((l) => `${l.description} ${l.qty} ${l.unit}`).join(', '), lines });
    }
    inv.receipts.forEach((rc, i) => {
      if (inRange(rc.date)) out.push({ type: 'Receipt', date: rc.date, no: `${inv.no}/R${i + 1}`, party: buyer, narration: `Received against ${inv.no} · ${rc.utr}`, lines: [{ ledger: L('bank'), amount: r2(rc.amount) }, { ledger: buyer, amount: -r2(rc.amount) }] });
    });
  }
  const firmGstin = db.firms[0]?.gstin || '';
  for (const inv of db.invoices.filter((x) => inRange(x.date))) {
    const sup = db.suppliers.find((s) => s.id === inv.supplierId);
    const taxable = r2(sum(inv.lines, (l) => l.qty * l.rate));
    const gst = r2(sum(inv.lines, (l) => (l.qty * l.rate * l.gstPct) / 100));
    const sp = gstSplit(firmGstin, sup?.gstin || '', gst);
    const lines = [{ ledger: L('purchase'), amount: taxable }];
    if (sp.cgst) lines.push({ ledger: L('cgstIn'), amount: sp.cgst }, { ledger: L('sgstIn'), amount: sp.sgst });
    if (sp.igst) lines.push({ ledger: L('igstIn'), amount: sp.igst });
    lines.push({ ledger: sup?.name || 'Supplier', amount: -r2(sum(lines, (l) => l.amount)) });
    out.push({ type: 'Purchase', date: inv.date, no: inv.supplierInvoiceNo || inv.no, party: sup?.name, narration: `${inv.no}`, lines });
  }
  for (const p of db.payments.filter((x) => inRange(x.date) && x.partyType !== 'WORKER')) {
    const party: any = p.partyType === 'SUPPLIER' ? db.suppliers.find((s) => s.id === p.partyId) : db.subcons.find((s) => s.id === p.partyId);
    // amount = paid from bank; the party is cleared by amount + TDS
    const lines = [{ ledger: party?.name || 'Party', amount: r2(p.amount + p.tds) }, { ledger: L('bank'), amount: -r2(p.amount) }];
    if (p.tds) lines.push({ ledger: L('tdsPayable'), amount: -r2(p.tds) });
    out.push({ type: 'Payment', date: p.date, no: p.no, party: party?.name, narration: `${p.no} ${p.ref || ''}`.trim(), lines });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const amt = (n: number) => n.toFixed(2);

const envelope = (report: string, company: string, body: string) =>
  `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>${report}</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${x(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

/** TallyPrime XML: a ledger-masters file (import first, so no ledger is missing) and a vouchers file */
export function tallyXml(db: DB, from: string, to: string): { masters: string; vouchers: string; count: number; unbalanced: string[] } {
  const vs = tallyVouchers(db, from, to);
  const unbalanced = vs.filter((v) => Math.abs(sum(v.lines, (l) => l.amount)) > 0.01).map((v) => v.no);
  const groups = new Map<string, string>();
  for (const [k, v] of Object.entries(TALLY_LEDGERS)) groups.set(ledgerName(db, k), v.group);
  for (const c of db.clients) groups.set(c.name, 'Sundry Debtors');
  for (const s of db.suppliers) groups.set(s.name, 'Sundry Creditors');
  for (const s of db.subcons) groups.set(s.name, 'Sundry Creditors');
  const used = [...new Set(vs.flatMap((v) => v.lines.map((l) => l.ledger)))];
  const masters = used.map((n) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${x(n)}" ACTION="Create"><NAME.LIST><NAME>${x(n)}</NAME></NAME.LIST><PARENT>${x(groups.get(n) || 'Suspense A/c')}</PARENT></LEDGER></TALLYMESSAGE>`).join('');
  const vouchers = vs
    .map((v) => {
      const entries = v.lines
        .map((l) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${l.amount > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt(-l.amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>`)
        .join('');
      return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${v.type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${v.date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${x(v.no)}</VOUCHERNUMBER>${v.party ? `<PARTYLEDGERNAME>${x(v.party)}</PARTYLEDGERNAME>` : ''}<NARRATION>${x(v.narration)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${entries}</VOUCHER></TALLYMESSAGE>`;
    })
    .join('');
  const company = db.settings.tally?.company || db.firms[0]?.legalName || db.company.name;
  return { masters: envelope('All Masters', company, masters), vouchers: envelope('Vouchers', company, vouchers), count: vs.length, unbalanced };
}

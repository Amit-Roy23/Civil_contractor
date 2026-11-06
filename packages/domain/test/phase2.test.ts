import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCompanyDB } from '../src/setup.js';
import { applyCommand, type Command } from '../src/policy.js';
import { buildSession } from '../src/session.js';
import { billTotals, contractRate, deductionDiff, gstSplit, priceAdjustment, tdsFor } from '../src/billing.js';
import { bankUsage, gstr1Rows, guaranteeAlerts, moneyBlocked, suggestBill, taxRecon, tallyXml } from '../src/money.js';
import { alerts } from '../src/selectors.js';
import type { DB, Site } from '../src/types.js';

const TODAY = '2026-11-01';
const spec = JSON.parse(readFileSync(new URL('../../../apps/api/setup/saurajit-deb.json', import.meta.url), 'utf8'));
let n = 0;
const run = (db: DB, cmd: Command, userId = 'u1') => applyCommand({ db, session: buildSession(db, userId)!, today: TODAY, now: `${TODAY}T10:00:00.000Z`, hour: 10, newId: () => `p2-${++n}` }, cmd);
const ZERO = { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 };

/** a work with two BOQ items and measurements: 1,000 sqm BC @ ₹500 and 200 cum GSB @ ₹1,500 → ₹8,00,000 */
function setup(extra: Partial<Site> = {}) {
  let db = buildCompanyDB(spec, TODAY).db;
  let r = run(db, { kind: 'insert', coll: 'sites', rec: { name: 'Test road', short: 'Test', clientId: 'c-pwd-rb-tr', contractValue: 10000000, status: 'ACTIVE', workType: 'ROAD', retentionPct: 5, budget: ZERO, openingCost: ZERO, quoteType: 'BELOW', quotedPct: 5, ...extra } });
  db = r.db;
  const site = r.record;
  r = run(db, { kind: 'insert', coll: 'boq', rec: { siteId: site.id, itemNo: '1', description: 'BC 30mm', unit: 'sqm', qty: 1000, estRate: 526.32, rate: 0 } });
  db = r.db;
  const bc = r.record;
  r = run(db, { kind: 'insert', coll: 'boq', rec: { siteId: site.id, itemNo: '2', description: 'GSB', unit: 'cum', qty: 150, rate: 1500 } });
  db = r.db;
  const gsb = r.record;
  db = run(db, { kind: 'insert', coll: 'measurements', rec: { date: '2026-10-20', siteId: site.id, boqItemId: bc.id, nos: 1, length: 250, breadth: 4, depth: 0, qty: 0 } }).db;
  db = run(db, { kind: 'insert', coll: 'measurements', rec: { date: '2026-10-21', siteId: site.id, boqItemId: gsb.id, nos: 1, length: 100, breadth: 5, depth: 0.4, qty: 0 } }).db;
  return { db, site: db.sites.find((s) => s.id === site.id)!, bc, gsb };
}

describe('BOQ and measurement book (BIL-01/02/04)', () => {
  it('applies the tendered % to the estimate rate', () => {
    expect(contractRate({ quoteType: 'BELOW', quotedPct: 5 }, 526.32)).toBe(500);
    expect(contractRate({ quoteType: 'ABOVE', quotedPct: 10 }, 100)).toBe(110);
    const { bc } = setup();
    expect(bc.rate).toBe(500);
  });
  it('measures nos × L × B × D, subtracts deductions and keeps queried entries out of the bill', () => {
    let { db, site, bc } = setup();
    expect(db.measurements.map((m) => m.qty)).toEqual([1000, 200]);
    db = run(db, { kind: 'insert', coll: 'measurements', rec: { date: '2026-10-22', siteId: site.id, boqItemId: bc.id, nos: 2, length: 5, breadth: 4, depth: 0, qty: 0, deduction: true } }).db;
    expect(() => run(db, { kind: 'insert', coll: 'measurements', rec: { date: '2026-10-22', siteId: site.id, boqItemId: bc.id, qty: 5000, deduction: true } })).toThrow(/more than the quantity measured/);
    const q = run(db, { kind: 'insert', coll: 'measurements', rec: { date: '2026-10-23', siteId: site.id, boqItemId: bc.id, qty: 100 } });
    db = run(q.db, { kind: 'update', coll: 'measurements', id: q.record.id, patch: { jeStatus: 'QUERY', jeRemark: 'Thickness short' } }).db;
    const bill = run(db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: site.id } }).record;
    expect(bill.lines.find((l: any) => l.boqItemId === bc.id).thisQty).toBe(960); // 1000 − 40, queried 100 left out
  });
});

describe('RA bill (BIL-03/05/06/08/10)', () => {
  it('deducts as per the work profile: SD, GST TDS, IT TDS, labour cess', () => {
    const { db, site } = setup();
    const r = run(db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: site.id } });
    const b = r.record;
    const t = billTotals(b);
    expect(t.gross).toBe(800000);
    expect(Math.round(t.gst)).toBe(144000);
    const d = Object.fromEntries(b.ded.map((x: any) => [x.code, x.amount]));
    expect(d).toEqual({ SD: 40000, GST_TDS: 16000, IT_TDS: 8000, CESS: 8000 });
    expect(Math.round(t.net)).toBe(800000 + 144000 - 72000);
    expect(b.invoiceNo).toBe('SD/INV/2026-27/0001');
    expect(b.status).toBe('SUBMITTED');
  });
  it('GST TDS only above ₹2.5 lakh contract value; IT TDS on value with GST when set', () => {
    const small = setup({ contractValue: 200000 });
    const b = run(small.db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: small.site.id } }).record;
    expect(b.ded.some((x: any) => x.code === 'GST_TDS')).toBe(false);
    const withGst = setup();
    const db = run(withGst.db, { kind: 'update', coll: 'sites', id: withGst.site.id, patch: { deductions: { ...withGst.site.deductions!, itTdsOnGst: true } } }).db;
    const b2 = run(db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: withGst.site.id } }).record;
    expect(b2.ded.find((x: any) => x.code === 'IT_TDS').amount).toBe(9440);
  });
  it('security deposit stops at the ceiling; advances recovered until cleared', () => {
    const { db, site } = setup({ sdCeiling: 30000, advances: [{ kind: 'MOBILISATION', amount: 50000, interestPct: 0, recoveryPct: 10 }] });
    const b = run(db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: site.id } }).record;
    const d = Object.fromEntries(b.ded.map((x: any) => [x.code, x.amount]));
    expect(d.SD).toBe(30000);
    expect(d['ADV:MOBILISATION']).toBe(50000);
  });
  it('price adjustment by share and by quantity', () => {
    const site = { priceAdjustment: { applicable: true, baseDate: '2026-04-01', components: [{ name: 'Bitumen', basePrice: 50000, unit: 'MT', sharePct: 0, method: 'QUANTITY' as const }, { name: 'Fuel', basePrice: 90, unit: 'L', sharePct: 10 }] } } as Site;
    const pa = priceAdjustment(site, 800000, [{ name: 'Bitumen', currentPrice: 54000, qty: 12 }, { name: 'Fuel', currentPrice: 99 }]);
    expect(pa.map((x) => x.amount)).toEqual([48000, 8000]);
  });
  it('a draft gets its invoice no. when submitted; passing with actual deductions drives the net and flags differences', () => {
    const { db, site } = setup();
    let r = run(db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: site.id, status: 'DRAFT' } });
    expect(r.record.invoiceNo).toBeUndefined();
    r = run(r.db, { kind: 'update', coll: 'raBills', id: r.record.id, patch: { status: 'SUBMITTED' } });
    expect(r.record.invoiceNo).toBe('SD/INV/2026-27/0001');
    r = run(r.db, { kind: 'update', coll: 'raBills', id: r.record.id, patch: { status: 'CERTIFIED', passedOn: TODAY, actualDed: [{ code: 'SD', amount: 40000 }, { code: 'GST_TDS', amount: 16000 }, { code: 'IT_TDS', amount: 8000 }, { code: 'CESS', amount: 8000 }, { code: 'OTH:Royalty', amount: 2500 }] } });
    const diff = deductionDiff(r.record);
    expect(diff).toEqual([{ code: 'OTH:Royalty', head: 'Royalty', expected: 0, actual: 2500, diff: 2500 }]);
    expect(Math.round(billTotals(r.record).net)).toBe(944000 - 74500);
    expect(alerts(r.db).some((a) => a.title.includes('deductions differ'))).toBe(true);
    r = run(r.db, { kind: 'update', coll: 'raBills', id: r.record.id, patch: { receipts: [{ date: TODAY, amount: 869500, utr: 'UTR1' }] } });
    expect(r.record.status).toBe('PAID');
  });
  it('final bill moves the work to "final bill submitted", then "final bill paid"', () => {
    const { db, site } = setup();
    let r = run(db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: site.id, kind: 'FINAL' } });
    expect(r.record.no).toMatch(/-FINAL$/);
    expect(r.db.sites.find((s) => s.id === site.id)!.stage).toBe('FINAL_BILL_SUBMITTED');
    expect(() => run(r.db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: site.id } })).toThrow(/final bill/);
    const net = Math.round(billTotals(r.record).net);
    r = run(r.db, { kind: 'update', coll: 'raBills', id: r.record.id, patch: { status: 'CERTIFIED', passedOn: TODAY } });
    r = run(r.db, { kind: 'update', coll: 'raBills', id: r.record.id, patch: { receipts: [{ date: TODAY, amount: net, utr: 'X' }] } });
    expect(r.db.sites.find((s) => s.id === site.id)!.stage).toBe('FINAL_BILL_PAID');
  });
  it('splits GST as CGST + SGST within Tripura, IGST otherwise', () => {
    expect(gstSplit('16BGXPD9663C1Z0', '16AAAGP0001A1ZX', 144001)).toEqual({ cgst: 72001, sgst: 72000, igst: 0, intra: true });
    expect(gstSplit('16BGXPD9663C1Z0', '18AAAGP0001A1ZX', 144000).igst).toBe(144000);
  });
});

describe('TDS on payments we make (Query 2)', () => {
  const withParties = () => {
    let db = buildCompanyDB(spec, TODAY).db;
    db = run(db, { kind: 'insert', coll: 'subcons', rec: { code: 'SC1', name: 'Ratan Das', kind: 'SUB_CONTRACTOR', rateType: 'PER_UNIT', pan: 'ABCPD1234E' } }).db;
    db = run(db, { kind: 'insert', coll: 'subcons', rec: { code: 'SC2', name: 'Northeast Builders', kind: 'SUB_CONTRACTOR', rateType: 'PER_UNIT', pan: 'ABCFN1234E' } }).db;
    db = run(db, { kind: 'insert', coll: 'subcons', rec: { code: 'SC3', name: 'No PAN', kind: 'SUB_CONTRACTOR', rateType: 'PER_UNIT', pan: '' } }).db;
    db = run(db, { kind: 'insert', coll: 'suppliers', rec: { code: 'TR1', name: 'Small transporter', kind: 'VEHICLE_OWNER', pan: 'ABCPT1234E', transporter10: true } }).db;
    return db;
  };
  const id = (db: DB, code: string) => [...db.subcons, ...db.suppliers].find((x) => x.code === code)!.id;
  it('1% individual, 2% firm, 20% without PAN, nil for a small transporter with declaration', () => {
    const db = withParties();
    expect(tdsFor(db, 'SUBCON', id(db, 'SC1'), 50000, TODAY).tds).toBe(500);
    expect(tdsFor(db, 'SUBCON', id(db, 'SC2'), 50000, TODAY).tds).toBe(1000);
    expect(tdsFor(db, 'SUBCON', id(db, 'SC3'), 50000, TODAY).tds).toBe(10000);
    expect(tdsFor(db, 'SUPPLIER', id(db, 'TR1'), 50000, TODAY).tds).toBe(0);
  });
  it('only above ₹30,000 a payment or ₹1 lakh in the year; the server applies it when not entered', () => {
    let db = withParties();
    const sc = id(db, 'SC1');
    expect(tdsFor(db, 'SUBCON', sc, 25000, TODAY).tds).toBe(0);
    for (let i = 0; i < 4; i++) db = run(db, { kind: 'insert', coll: 'payments', rec: { date: TODAY, partyType: 'SUBCON', partyId: sc, amount: 25000, mode: 'BANK', kind: 'PART' } }).db;
    expect(db.payments.map((p) => p.tds)).toEqual([0, 0, 0, 0]);
    const p5 = run(db, { kind: 'insert', coll: 'payments', rec: { date: TODAY, partyType: 'SUBCON', partyId: sc, amount: 25000, mode: 'BANK', kind: 'PART' } }).record;
    expect(p5.tds).toBe(250);
    expect(p5.tdsCode).toBe('393-CONTRACT');
  });
  it('can be switched off for a financial year', () => {
    const db = run(withParties(), { kind: 'settings', patch: { tds: { enabledFy: { '2026-27': false }, sections: [] } } }).db;
    expect(tdsFor(db, 'SUBCON', id(db, 'SC1'), 50000, TODAY).tds).toBe(0);
  });
});

describe('guarantees, bank limits and money blocked (SEC-01…04)', () => {
  it('alerts before expiry, extension moves the date, margin vs FDR', () => {
    let { db, site } = setup();
    db = run(db, { kind: 'insert', coll: 'bankFacilities', rec: { bank: 'SBI Dharmanagar', bgLimit: 5000000, marginPct: 10 } }).db;
    let g = run(db, { kind: 'insert', coll: 'guarantees', rec: { kind: 'PS', instrument: 'BG', number: 'BG/77', bank: 'SBI Dharmanagar', amount: 500000, issueDate: '2026-05-01', expiryDate: '2026-11-25', claimDate: '2027-02-25', siteId: site.id, marginPct: 10 } });
    db = run(g.db, { kind: 'insert', coll: 'guarantees', rec: { kind: 'EMD', instrument: 'FDR', number: 'FDR/9', bank: 'SBI Dharmanagar', amount: 200000, issueDate: '2026-03-01', expiryDate: '2027-03-01', siteId: site.id } }).db;
    expect(guaranteeAlerts(db, TODAY).map((x) => x.due!.stage)).toEqual([30]);
    // alerts read the real clock: pin it to the test date
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
    try {
      expect(alerts(db).some((a) => a.code === 'ALT-08' && a.title.includes('expires in 24 days'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    const blocked = moneyBlocked(db).find((x) => x.siteId === site.id)!;
    expect([blocked.ps, blocked.emd]).toEqual([50000, 200000]);
    const bank = bankUsage(db)[0]!;
    expect([bank.used, bank.available, bank.margin, bank.fdrLien]).toEqual([500000, 4500000, 50000, 200000]);
    g = run(db, { kind: 'update', coll: 'guarantees', id: g.record.id, patch: { extensions: [{ date: TODAY, expiry: '2027-05-25', claim: '2027-08-25', letterNo: 'L/1' }] } });
    expect([g.record.expiryDate, g.record.status]).toEqual(['2027-05-25', 'EXTENDED']);
    expect(guaranteeAlerts(g.db, TODAY)).toHaveLength(0);
  });
});

describe('reconciliation and exports (BIL-08/09, ACC-03)', () => {
  it('GST TDS per month against GSTR-7A, with bill suggestions; GSTR-1 rows; balanced Tally vouchers', () => {
    let { db, site } = setup();
    let r = run(db, { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: site.id } });
    r = run(r.db, { kind: 'update', coll: 'raBills', id: r.record.id, patch: { status: 'CERTIFIED', passedOn: TODAY } });
    db = run(r.db, { kind: 'update', coll: 'raBills', id: r.record.id, patch: { receipts: [{ date: TODAY, amount: 500000, utr: 'U1' }] } }).db;
    const c = run(db, { kind: 'insert', coll: 'taxCredits', rec: { kind: 'GSTR7A', date: TODAY, deductor: 'EE PWD Dharmanagar', deductorId: '16AAAGP0001A1ZX', amount: 16000, base: 800000, certNo: '7A-1' } });
    expect(suggestBill(c.db, c.record.id)!.id).toBe(r.record.id);
    expect(taxRecon(c.db, 'GSTR7A')[0]).toMatchObject({ month: '2026-11', deducted: 16000, credited: 16000, diff: 0 });
    expect(taxRecon(c.db, 'AS26')[0]).toMatchObject({ deducted: 8000, credited: 0, diff: -8000 });
    const g1 = gstr1Rows(c.db, '2026-11-01', '2026-11-30');
    expect(g1[0]).toMatchObject({ invoiceNo: 'SD/INV/2026-27/0001', taxable: 800000, cgst: 72000, sgst: 72000, igst: 0 });
    const tx = tallyXml(c.db, '2026-11-01', '2026-11-30');
    expect(tx.unbalanced).toEqual([]);
    expect(tx.count).toBe(3); // sales, deduction journal, receipt
    expect(tx.vouchers).toContain('<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>');
    expect(tx.masters).toContain('<PARENT>Sundry Debtors</PARENT>');
  });
});

describe('department BOQ Excel (XL-06 / TND-04)', async () => {
  const { writeXlsx, readXlsx } = await import('../src/xlsx.js');
  const { readDeptBoq, checkAgainstEstimate } = await import('../src/deptboq.js');
  it('finds the BOQ in a hidden sheet, skips headings and totals, checks against the estimate', async () => {
    const bytes = writeXlsx([
      { name: 'Instructions', rows: [['Read me']] },
      { name: 'BoQ1', rows: [['Name of work: Test road'], [], ['Sl. No.', 'Item Description', 'Quantity', 'Units', 'Estimated Rate', 'TOTAL AMOUNT Without Taxes'], [null, 'Earthwork'], ['1.01', 'Excavation in soil', 500, 'cum', 120.5, 60250], ['1.02', 'Filling with sand', 100, 'cum', 800, 80000], ['2.01', 'Bituminous concrete 30 mm', 2000, 'sqm', 410, 820000], [null, 'Total', null, null, null, 960250]] },
    ]);
    // mark the BoQ sheet hidden, as tender files do
    const { unzip, zipStore } = await import('../src/xlsx.js');
    const files = await unzip(bytes);
    const wb = new TextDecoder().decode(files.get('xl/workbook.xml')!).replace('name="BoQ1"', 'name="BoQ1" state="hidden"');
    const out = zipStore([...files.entries()].map(([name, data]) => ({ name, data: name === 'xl/workbook.xml' ? wb : data })));
    const sheets = await readXlsx(out);
    const boq = readDeptBoq(sheets)!;
    expect([boq.sheet, boq.hidden, boq.items.length, boq.total]).toEqual(['BoQ1', true, 3, 960250]);
    expect(boq.items[0]).toMatchObject({ itemNo: '1.01', unit: 'cum', qty: 500, estRate: 120.5 });
    expect(boq.items[0]!.description).toContain('Earthwork');
    expect(checkAgainstEstimate(boq.total, 960250).ok).toBe(true);
    expect(checkAgainstEstimate(boq.total, 1000000)).toMatchObject({ ok: false, diff: -39750 });
  });
});

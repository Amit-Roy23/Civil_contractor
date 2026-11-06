import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCompanyDB } from '../src/setup.js';
import { applyCommand, type Command } from '../src/policy.js';
import { buildSession } from '../src/session.js';
import { availability, getLedger } from '../src/ledger.js';
import { gstr1Rows, tallyVouchers } from '../src/money.js';
import { stockRegister } from '../src/selectors.js';
import { salesTotals } from '../src/ops.js';
import { listParties, partyItemLedger, partyItemSummary } from '../src/partyledger.js';
import { snapshotFor } from '../src/visibility.js';
import type { DB } from '../src/types.js';

const TODAY = '2026-11-06';
const spec = JSON.parse(readFileSync(new URL('../../../apps/api/setup/saurajit-deb.json', import.meta.url), 'utf8'));
let n = 0;
const run = (db: DB, cmd: Command, userId = 'u1') => applyCommand({ db, session: buildSession(db, userId)!, today: TODAY, now: `${TODAY}T10:00:00.000Z`, hour: 10, newId: () => `sl-${++n}` }, cmd);
const ins = (db: DB, coll: any, rec: any, userId?: string) => run(db, { kind: 'insert', coll, rec }, userId);
const M = (db: DB, code: string) => db.materials.find((m) => m.code === code)!.id;
const GSTIN = '16AAACJ5678K1Z3';

/** central godown with opening stock; one firm that we both buy from and sell to (same GSTIN) */
function world() {
  let db = buildCompanyDB(spec, TODAY).db;
  const central = db.stores.find((s) => s.type === 'CENTRAL')!.id;
  db = ins(db, 'stockTxns', { type: 'OPENING', date: '2026-10-01', toStoreId: central, lines: [['AGG-20', 200, 1400], ['CEM-OPC53', 40, 7600]].map(([c, q, rt]) => ({ materialId: M(db, c as string), qty: q, rate: rt })) }).db;
  let r = ins(db, 'suppliers', { code: 'SUP-JSC', name: 'Jampui Stone Crushers', gstin: GSTIN, pan: 'AAACJ5678K', entityType: 'FIRM' });
  db = r.db;
  const sup = r.record.id as string;
  r = ins(db, 'clients', { code: 'BUY-JSC', name: 'Jampui Stone Crushers (buyer)', gstin: GSTIN, kind: 'BUYER', tdsPct: 0, retentionPct: 0, cessPct: 0 });
  db = r.db;
  const buyer = r.record.id as string;
  r = ins(db, 'clients', { code: 'BUY-URP', name: 'Ramesh Saha (unregistered)', gstin: '', kind: 'BUYER', tdsPct: 0, retentionPct: 0, cessPct: 0 });
  db = r.db;
  return { db, central, sup, buyer, urp: r.record.id as string };
}

describe('Sale of goods from a store', () => {
  it('issues a GST invoice from the firm series and takes the goods out of stock at average cost', () => {
    let { db, central, buyer } = world();
    const r = ins(db, 'salesInvoices', { kind: 'GOODS', date: TODAY, buyerId: buyer, storeId: central, no: '', lines: [{ materialId: M(db, 'AGG-20'), qty: 50, rate: 1600 }], eway: { vehicleNo: 'TR01X1', distanceKm: 20 } } as any);
    db = r.db;
    const inv = r.record;
    expect(inv.no).toBe('SD/INV/2026-27/0001');
    expect(inv.lines[0]).toMatchObject({ description: 'Aggregate 20 mm', qty: 50, rate: 1600, unit: 'MT', gstPct: 5 });
    expect(inv.lines[0].hsn).toMatch(/^\d{4,8}$/);
    const t = salesTotals(db, inv);
    // within Tripura: 80,000 + CGST 2,000 + SGST 2,000
    expect([t.taxable, t.cgst, t.sgst, t.igst, t.total]).toEqual([80000, 2000, 2000, 0, 84000]);
    expect(availability(db, central, M(db, 'AGG-20'), TODAY).onDate).toBe(150);
    const mv = getLedger(db).movements.find((m) => m.refId === inv.id)!;
    expect([mv.kind, mv.qty, Math.round(mv.value)]).toEqual(['Sale', -50, -70000]);
    // the stock register shows the sale in its own column, and opening + received − out = closing
    const reg = stockRegister(db, central, { from: '2026-11-01', to: TODAY }).find((x) => x.materialId === M(db, 'AGG-20'))!;
    expect([reg.opening, reg.sold, reg.transferred, reg.closing]).toEqual([200, 50, 0, 150]);
  });

  it('refuses more than the stock, a future date, a missing rate and a material without HSN', () => {
    const { db, central, buyer } = world();
    const base = { kind: 'GOODS', date: TODAY, buyerId: buyer, storeId: central, no: '' };
    expect(() => ins(db, 'salesInvoices', { ...base, lines: [{ materialId: M(db, 'AGG-20'), qty: 250, rate: 1600 }] })).toThrow(/Not enough Aggregate 20 mm/);
    expect(() => ins(db, 'salesInvoices', { ...base, date: '2026-11-07', lines: [{ materialId: M(db, 'AGG-20'), qty: 5, rate: 1600 }] })).toThrow(/Future dates/);
    expect(() => ins(db, 'salesInvoices', { ...base, lines: [{ materialId: M(db, 'AGG-20'), qty: 5, rate: 0 }] })).toThrow(/sale rate/);
    expect(() => ins(db, 'salesInvoices', { ...base, lines: [{ materialId: M(db, 'AGG-20'), qty: 5, rate: 10, gstPct: 7 }] })).toThrow(/not a GST slab/);
    const noHsn = run(db, { kind: 'update', coll: 'materials', id: M(db, 'CEM-OPC53'), patch: { hsn: '' } }).db;
    expect(() => ins(noHsn, 'salesInvoices', { ...base, lines: [{ materialId: M(db, 'CEM-OPC53'), qty: 1, rate: 8000 }] })).toThrow(/HSN code/);
    // two lines of the same material are checked together against the stock
    expect(() => ins(db, 'salesInvoices', { ...base, lines: [{ materialId: M(db, 'AGG-20'), qty: 120, rate: 1600 }, { materialId: M(db, 'AGG-20'), qty: 90, rate: 1600 }] })).toThrow(/Not enough/);
  });

  it('a later sale cannot use stock already sold; cancelling puts the goods back', () => {
    let { db, central, buyer } = world();
    const base = { kind: 'GOODS', buyerId: buyer, storeId: central, no: '' };
    const a = ins(db, 'salesInvoices', { ...base, date: '2026-11-05', lines: [{ materialId: M(db, 'AGG-20'), qty: 180, rate: 1600 }] });
    db = a.db;
    // back-dated sale of 30 MT on 4 Nov would leave the 5 Nov sale short
    expect(() => ins(db, 'salesInvoices', { ...base, date: '2026-11-04', lines: [{ materialId: M(db, 'AGG-20'), qty: 30, rate: 1600 }] })).toThrow(/Not enough/);
    db = run(db, { kind: 'update', coll: 'salesInvoices', id: a.record.id, patch: { status: 'CANCELLED' }, reason: 'Wrong buyer' }).db;
    expect(availability(db, central, M(db, 'AGG-20'), TODAY).onDate).toBe(200);
  });

  it('records receipts, marks paid, and refuses receipts above the invoice total', () => {
    let { db, central, buyer } = world();
    const r = ins(db, 'salesInvoices', { kind: 'GOODS', date: TODAY, buyerId: buyer, storeId: central, no: '', lines: [{ materialId: M(db, 'AGG-20'), qty: 50, rate: 1600 }] });
    db = r.db;
    const id = r.record.id;
    expect(() => run(db, { kind: 'update', coll: 'salesInvoices', id, patch: { receipts: [{ date: TODAY, amount: 90000, utr: 'X' }] } })).toThrow(/more than the invoice total/);
    db = run(db, { kind: 'update', coll: 'salesInvoices', id, patch: { receipts: [{ date: TODAY, amount: 40000, utr: 'U1' }] } }).db;
    expect(db.salesInvoices[0]!.status).toBe('PARTLY_PAID');
    db = run(db, { kind: 'update', coll: 'salesInvoices', id, patch: { receipts: [{ date: TODAY, amount: 40000, utr: 'U1' }, { date: TODAY, amount: 44000, utr: 'U2' }] } }).db;
    expect(db.salesInvoices[0]!.status).toBe('PAID');
  });

  it('GSTR-1 has one row per GST rate; Tally books it to Sale of Goods and balances', () => {
    let { db, central, urp } = world();
    db = ins(db, 'salesInvoices', { kind: 'GOODS', date: TODAY, buyerId: urp, storeId: central, no: '', lines: [{ materialId: M(db, 'AGG-20'), qty: 10, rate: 1600 }, { materialId: M(db, 'CEM-OPC53'), qty: 2, rate: 8000 }] }).db;
    const rows = gstr1Rows(db, '2026-11-01', '2026-11-30');
    expect(rows.map((x) => [x.rate, x.taxable, x.type])).toEqual([[5, 16000, 'B2C'], [18, 16000, 'B2C']]);
    expect(rows[0]!.value).toBe(Math.round(16000 * 1.05 + 16000 * 1.18));
    const v = tallyVouchers(db, '2026-11-01', '2026-11-30').find((x) => x.type === 'Sales')!;
    expect(v.lines.find((l) => l.ledger === 'Sale of Goods')!.amount).toBe(-32000);
    expect(Math.abs(v.lines.reduce((a, l) => a + l.amount, 0))).toBeLessThan(0.01);
  });

  it('a store keeper sees goods sales of his own store only, and roles without rates see none', () => {
    let { db, central, buyer } = world();
    db = ins(db, 'salesInvoices', { kind: 'GOODS', date: TODAY, buyerId: buyer, storeId: central, no: '', lines: [{ materialId: M(db, 'AGG-20'), qty: 5, rate: 1600 }] }).db;
    for (const u of db.users) {
      const s = buildSession(db, u.id);
      if (!s) continue;
      const seen = snapshotFor(db, s).salesInvoices.length;
      expect(seen).toBe(s.showRates && s.seesStore(central) ? 1 : 0);
    }
  });
});

describe('Party-wise item-wise ledger', () => {
  /** buy 50 MT 10 mm (bill 40), return 2 MT, sell 50 MT 20 mm to the same firm */
  function trading() {
    let { db, central, sup, buyer } = world();
    const agg10 = M(db, 'AGG-10');
    let r = ins(db, 'pos', { no: '', date: '2026-11-02', supplierId: sup, deliveryStoreId: central, lines: [{ materialId: agg10, qty: 50, rate: 1500, gstPct: 5 }], status: 'OPEN' });
    db = r.db;
    const po = r.record.id;
    r = ins(db, 'stockTxns', { type: 'GRN', date: '2026-11-03', toStoreId: central, supplierId: sup, poId: po, challanNo: 'C1', vehicleNo: 'TR01', lines: [{ materialId: agg10, qty: 50, rate: 1500, orderedQty: 50 }], status: 'POSTED' });
    db = r.db;
    const grn = r.record.id;
    db = ins(db, 'invoices', { no: '', supplierInvoiceNo: 'JSC/112', date: '2026-11-03', supplierId: sup, poId: po, grnIds: [grn], storeId: central, lines: [{ materialId: agg10, qty: 40, rate: 1500, gstPct: 5 }], dueDate: '2026-12-03' }).db;
    db = ins(db, 'debitNotes', { no: '', date: '2026-11-04', supplierId: sup, grnId: grn, materialId: agg10, qty: 2, rate: 1500, reason: 'Oversize stones' }).db;
    db = ins(db, 'salesInvoices', { kind: 'GOODS', date: '2026-11-05', buyerId: buyer, storeId: central, no: '', lines: [{ materialId: M(db, 'AGG-20'), qty: 50, rate: 1600 }] }).db;
    return { db, agg10, sup, buyer };
  }

  it('merges a supplier and a buyer with the same GSTIN into one party', () => {
    const { db, sup, buyer } = trading();
    const p = listParties(db).find((x) => x.gstin === GSTIN)!;
    expect(p.supplierIds).toEqual([sup]);
    expect(p.clientIds).toEqual([buyer]);
    expect(p.roles).toEqual(['Supplier', 'Buyer']);
  });

  it('shows each item with purchases, returns, sales, running quantity, unbilled goods and money balance', () => {
    const { db, agg10 } = trading();
    const key = listParties(db).find((x) => x.gstin === GSTIN)!.key;
    const l = partyItemLedger(db, key, { from: '2026-11-01', to: TODAY })!;
    const a10 = l.items.find((i) => i.materialId === agg10)!;
    expect(a10.rows.map((r) => [r.voucher, r.inQty, r.outQty, r.taxable, r.gst, r.balanceQty])).toEqual([
      ['Purchase', 40, 0, 60000, 3000, 40],
      ['Purchase return', 0, 2, 3000, 150, 38],
    ]);
    expect([a10.purchased.avgRate, a10.netPurchase, a10.closingQty, a10.unbilledQty]).toEqual([1500, 57000, 38, 10]);
    const a20 = l.items.find((i) => i.name === 'Aggregate 20 mm')!;
    expect([a20.sold.qty, a20.sold.taxable, a20.sold.gst, a20.sold.lastRate, a20.closingQty]).toEqual([50, 80000, 4000, 1600, -50]);
    expect(l.totals).toEqual({ purchase: 60000, purchaseGst: 2850, returns: 3000, sales: 80000, salesGst: 4000 });
    // we owe 63,000 − 3,150 = 59,850; they owe 84,000
    expect(l.money).toEqual({ payable: 59850, receivable: 84000, net: 24150 });
  });

  it('carries earlier vouchers into the opening and filters by item', () => {
    const { db, agg10 } = trading();
    const key = listParties(db).find((x) => x.gstin === GSTIN)!.key;
    const l = partyItemLedger(db, key, { from: '2026-11-04', to: TODAY, materialId: agg10 })!;
    expect(l.items).toHaveLength(1);
    expect(l.items[0]!.opening).toEqual({ qty: 40, purchaseValue: 60000, saleValue: 0 });
    expect(l.items[0]!.rows.map((r) => r.balanceQty)).toEqual([38]);
  });

  it('goods received on GRN without a bill show as pending, diesel included', () => {
    let { db, central, sup } = world();
    const hsd = M(db, 'HSD');
    const po = ins(db, 'pos', { no: '', date: '2026-11-02', supplierId: sup, deliveryStoreId: central, lines: [{ materialId: hsd, qty: 1000, rate: 90, gstPct: 0 }], status: 'OPEN' });
    db = ins(po.db, 'stockTxns', { type: 'GRN', date: '2026-11-03', toStoreId: central, supplierId: sup, poId: po.record.id, challanNo: 'C9', vehicleNo: 'T', lines: [{ materialId: hsd, qty: 1000, rate: 90, orderedQty: 1000 }], status: 'POSTED' }).db;
    const key = listParties(db).find((x) => x.gstin === GSTIN)!.key;
    const it = partyItemLedger(db, key, { from: '2026-11-01', to: TODAY })!.items.find((i) => i.materialId === hsd)!;
    expect([it.rows.length, it.unbilledQty]).toEqual([0, 1000]);
  });

  it('summary lists every party and item for the period, by side', () => {
    const { db } = trading();
    const all = partyItemSummary(db, { from: '2026-11-01', to: TODAY });
    expect(all.map((x) => [x.item, x.purchasedQty, x.returnedQty, x.soldQty, x.unbilledQty])).toEqual([
      ['Aggregate 10 mm', 40, 2, 0, 10],
      ['Aggregate 20 mm', 0, 0, 50, 0],
    ]);
    expect(partyItemSummary(db, { from: '2026-11-01', to: TODAY, side: 'SALE' }).map((x) => x.item)).toEqual(['Aggregate 20 mm']);
  });
});

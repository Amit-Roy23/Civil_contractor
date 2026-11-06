import type { DB, ID } from './types.js';
import { buyerLedger, salesTotals } from './ops.js';
import { supplierBalance } from './selectors.js';
import { isEffective } from './ledger.js';
import { round, sum } from './utils.js';

/**
 * Party-wise, item-wise ledger.
 *
 * A party is a supplier, a buyer (client), or both: a supplier and a client with the same GSTIN
 * are one party, so goods bought from and sold to the same firm show together.
 *
 * Vouchers counted, by item:
 *  - Purchase          purchase bills booked (goods in)        — and diesel bought from a pump (no GST)
 *  - Purchase return   debit notes for rejected / returned goods (goods out, value reduces purchases)
 *  - Sale              sales tax invoices: hot mix from the plant and goods from any store (goods out)
 * Shown alongside, not posted: goods received on GRN but not yet billed, and plant loads delivered
 * to the buyer but not yet invoiced. Payments and receipts are not split by item; the party's money
 * balance comes from its supplier ledger and buyer ledger.
 */

export interface PartyRef {
  key: string;
  name: string;
  gstin: string;
  supplierIds: ID[];
  clientIds: ID[];
  roles: Array<'Supplier' | 'Buyer' | 'Client'>;
}

export type PartyVoucher = 'Purchase' | 'Purchase return' | 'Sale';

export interface PartyItemRow {
  date: string;
  ref: string;
  refId: ID;
  voucher: PartyVoucher;
  materialId: ID;
  inQty: number;
  outQty: number;
  rate: number;
  taxable: number;
  gstPct: number;
  gst: number;
  total: number;
  /** running goods balance with the party: in − out */
  balanceQty: number;
  storeId?: ID;
}

export interface PartyItem {
  materialId: ID;
  name: string;
  unit: string;
  opening: { qty: number; purchaseValue: number; saleValue: number };
  rows: PartyItemRow[];
  purchased: { qty: number; taxable: number; gst: number; total: number; avgRate: number; lastRate: number };
  returned: { qty: number; taxable: number; gst: number; total: number };
  sold: { qty: number; taxable: number; gst: number; total: number; avgRate: number; lastRate: number };
  /** net purchase value of the period: purchases − returns (before GST) */
  netPurchase: number;
  closingQty: number;
  /** goods accepted on GRN up to the end date that no bill covers yet */
  unbilledQty: number;
  /** plant loads delivered to the buyer up to the end date and not yet invoiced */
  notInvoicedQty: number;
}

export interface PartyLedger {
  party: PartyRef;
  from: string;
  to: string;
  items: PartyItem[];
  totals: { purchase: number; purchaseGst: number; returns: number; sales: number; salesGst: number };
  /** money, all dates up to today: what we owe the party (+) and what the party owes us (+) */
  money: { payable: number; receivable: number; net: number };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => round(x, 3);
const norm = (g?: string) => (g || '').trim().toUpperCase();

/** every party, with a supplier and a client of the same GSTIN merged into one */
export function listParties(db: DB): PartyRef[] {
  const byGstin = new Map<string, PartyRef>();
  const out: PartyRef[] = [];
  const add = (kind: 'S' | 'C', id: ID, name: string, gstin: string, role: 'Supplier' | 'Buyer' | 'Client') => {
    const g = norm(gstin);
    const hit = g ? byGstin.get(g) : undefined;
    if (hit) {
      (kind === 'S' ? hit.supplierIds : hit.clientIds).push(id);
      if (!hit.roles.includes(role)) hit.roles.push(role);
      return;
    }
    const p: PartyRef = { key: g ? `G:${g}` : `${kind}:${id}`, name, gstin: g, supplierIds: kind === 'S' ? [id] : [], clientIds: kind === 'C' ? [id] : [], roles: [role] };
    if (g) byGstin.set(g, p);
    out.push(p);
  };
  for (const s of db.suppliers) add('S', s.id, s.name, s.gstin, 'Supplier');
  for (const c of db.clients) add('C', c.id, c.name, c.gstin, c.kind === 'BUYER' || db.salesInvoices.some((i) => i.buyerId === c.id) ? 'Buyer' : 'Client');
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function findParty(db: DB, key: string): PartyRef | undefined {
  return listParties(db).find((p) => p.key === key);
}

/** diesel bought from a pump has no material line; it is booked against the diesel material when there is one */
function fuelMaterial(db: DB) {
  const m = db.materials.find((x) => x.category === 'Fuel & Lubricants' && /hsd|diesel/i.test(x.name));
  return m ? { id: m.id, name: m.name, unit: m.unit } : { id: 'fuel-hsd', name: 'Diesel (HSD)', unit: 'LTR' };
}

/** all vouchers with the party, every date (the caller cuts by period) */
function vouchers(db: DB, p: PartyRef) {
  const sup = new Set(p.supplierIds);
  const cli = new Set(p.clientIds);
  const rows: Array<Omit<PartyItemRow, 'balanceQty'>> = [];
  const gstOf = (materialId: ID) => db.materials.find((m) => m.id === materialId)?.gstPct ?? 18;
  for (const inv of db.invoices.filter((i) => sup.has(i.supplierId))) {
    for (const l of inv.lines) {
      const taxable = r2(l.qty * l.rate);
      const gst = r2((taxable * l.gstPct) / 100);
      rows.push({ date: inv.date, ref: inv.supplierInvoiceNo ? `${inv.no} (${inv.supplierInvoiceNo})` : inv.no, refId: inv.id, voucher: 'Purchase', materialId: l.materialId, inQty: l.qty, outQty: 0, rate: l.rate, taxable, gstPct: l.gstPct, gst, total: r2(taxable + gst), storeId: inv.storeId });
    }
  }
  const fm = fuelMaterial(db);
  for (const f of db.fuelPurchases.filter((x) => sup.has(x.supplierId) && x.litres > 0)) {
    const taxable = r2(f.litres * f.rate);
    rows.push({ date: f.date, ref: f.invoiceNo ? `${f.no} (${f.invoiceNo})` : f.no, refId: f.id, voucher: 'Purchase', materialId: fm.id, inQty: f.litres, outQty: 0, rate: f.rate, taxable, gstPct: 0, gst: 0, total: taxable });
  }
  for (const d of db.debitNotes.filter((x) => sup.has(x.supplierId))) {
    // GST on the return follows the purchase order line of its GRN, else the material
    const grn = d.grnId ? db.stockTxns.find((t) => t.id === d.grnId) : undefined;
    const po = grn?.poId ? db.pos.find((x) => x.id === grn.poId) : undefined;
    const gstPct = po?.lines.find((l) => l.materialId === d.materialId)?.gstPct ?? gstOf(d.materialId);
    const taxable = r2(d.qty * d.rate);
    const gst = r2((taxable * gstPct) / 100);
    rows.push({ date: d.date, ref: d.no, refId: d.id, voucher: 'Purchase return', materialId: d.materialId, inQty: 0, outQty: d.qty, rate: d.rate, taxable, gstPct, gst, total: r2(taxable + gst) });
  }
  for (const inv of db.salesInvoices.filter((i) => cli.has(i.buyerId) && i.status !== 'CANCELLED')) {
    for (const l of inv.lines) {
      const taxable = r2(l.qty * l.rate);
      const gst = r2((taxable * l.gstPct) / 100);
      rows.push({ date: inv.date, ref: inv.no, refId: inv.id, voucher: 'Sale', materialId: l.productId, inQty: 0, outQty: l.qty, rate: l.rate, taxable, gstPct: l.gstPct, gst, total: r2(taxable + gst), storeId: inv.storeId });
    }
  }
  // same date: purchases first, then returns, then sales; then by voucher number
  const order: Record<PartyVoucher, number> = { Purchase: 0, 'Purchase return': 1, Sale: 2 };
  return rows.sort((a, b) => a.date.localeCompare(b.date) || order[a.voucher] - order[b.voucher] || a.ref.localeCompare(b.ref));
}

export function partyItemLedger(db: DB, key: string, opts: { from: string; to: string; materialId?: ID }): PartyLedger | null {
  const party = findParty(db, key);
  if (!party) return null;
  const { from, to } = opts;
  const all = vouchers(db, party).filter((r) => r.date <= to && (!opts.materialId || r.materialId === opts.materialId));
  const sup = new Set(party.supplierIds);
  const cli = new Set(party.clientIds);
  const fm = fuelMaterial(db);
  const mat = (id: ID) => (id === fm.id ? { name: fm.name, unit: fm.unit } : db.materials.find((m) => m.id === id) || { name: id, unit: '' });

  // goods received on GRN (accepted) and plant loads delivered, up to the end date
  const grnQty = new Map<ID, number>();
  for (const t of db.stockTxns.filter((x) => x.type === 'GRN' && isEffective(x) && x.supplierId && sup.has(x.supplierId) && x.date <= to)) for (const l of t.lines) grnQty.set(l.materialId, (grnQty.get(l.materialId) || 0) + l.qty);
  const clientNames = new Set(db.clients.filter((c) => cli.has(c.id)).map((c) => c.name.toLowerCase()));
  const notInv = new Map<ID, number>();
  for (const d of db.dispatches.filter((x) => !x.siteId && !x.toPlantId && !x.salesInvoiceId && x.status === 'RECEIVED' && x.date <= to && (x.buyerId ? cli.has(x.buyerId) : clientNames.has((x.customer || '').toLowerCase())))) {
    notInv.set(d.productId, (notInv.get(d.productId) || 0) + (d.receivedQty ?? d.qty));
  }

  const ids = new Set<ID>([...all.map((r) => r.materialId), ...[...grnQty.keys()].filter((m) => !opts.materialId || m === opts.materialId), ...[...notInv.keys()].filter((m) => !opts.materialId || m === opts.materialId)]);
  const items: PartyItem[] = [...ids].map((materialId) => {
    const mine = all.filter((r) => r.materialId === materialId);
    const before = mine.filter((r) => r.date < from);
    const inside = mine.filter((r) => r.date >= from);
    const opening = {
      qty: r3(sum(before, (r) => r.inQty - r.outQty)),
      purchaseValue: r2(sum(before.filter((r) => r.voucher === 'Purchase'), (r) => r.taxable) - sum(before.filter((r) => r.voucher === 'Purchase return'), (r) => r.taxable)),
      saleValue: r2(sum(before.filter((r) => r.voucher === 'Sale'), (r) => r.taxable)),
    };
    let bal = opening.qty;
    const rows = inside.map((r) => ((bal = r3(bal + r.inQty - r.outQty)), { ...r, balanceQty: bal }));
    const pick = (v: PartyVoucher) => inside.filter((r) => r.voucher === v);
    const agg = (rs: typeof inside, q: 'inQty' | 'outQty') => {
      const qty = r3(sum(rs, (r) => r[q]));
      const taxable = r2(sum(rs, (r) => r.taxable));
      return { qty, taxable, gst: r2(sum(rs, (r) => r.gst)), total: r2(sum(rs, (r) => r.total)), avgRate: qty ? r2(taxable / qty) : 0, lastRate: rs.at(-1)?.rate ?? 0 };
    };
    const purchased = agg(pick('Purchase'), 'inQty');
    const { avgRate: _a, lastRate: _l, ...returned } = agg(pick('Purchase return'), 'outQty');
    const sold = agg(pick('Sale'), 'outQty');
    // bills up to the end date against goods accepted up to the end date
    const billedAll = sum(mine.filter((r) => r.voucher === 'Purchase'), (r) => r.inQty);
    const m = mat(materialId);
    return {
      materialId, name: m.name, unit: m.unit, opening, rows, purchased, returned, sold,
      netPurchase: r2(purchased.taxable - returned.taxable),
      closingQty: bal,
      // a pump fill is billed without a GRN, so only goods that came in on a GRN can be unbilled
      unbilledQty: r3(Math.max(0, (grnQty.get(materialId) || 0) - billedAll)),
      notInvoicedQty: r3(notInv.get(materialId) || 0),
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));

  const payable = r2(sum(party.supplierIds, (id) => supplierBalance(db, id)));
  const receivable = r2(sum(party.clientIds, (id) => buyerLedger(db, id).at(-1)?.balance ?? 0));
  return {
    party, from, to, items,
    totals: {
      purchase: r2(sum(items, (i) => i.purchased.taxable)),
      purchaseGst: r2(sum(items, (i) => i.purchased.gst - i.returned.gst)),
      returns: r2(sum(items, (i) => i.returned.taxable)),
      sales: r2(sum(items, (i) => i.sold.taxable)),
      salesGst: r2(sum(items, (i) => i.sold.gst)),
    },
    money: { payable, receivable, net: r2(receivable - payable) },
  };
}

/** every party × item for a period: the summary to scan before opening one party's ledger */
export function partyItemSummary(db: DB, opts: { from: string; to: string; side?: 'ALL' | 'PURCHASE' | 'SALE'; materialId?: ID }) {
  const out: Array<{ partyKey: string; party: string; gstin: string; roles: string; materialId: ID; item: string; unit: string; purchasedQty: number; returnedQty: number; purchaseValue: number; purchaseAvgRate: number; soldQty: number; saleValue: number; saleAvgRate: number; unbilledQty: number; notInvoicedQty: number }> = [];
  for (const p of listParties(db)) {
    const l = partyItemLedger(db, p.key, opts);
    if (!l) continue;
    for (const i of l.items) {
      const bought = i.purchased.qty || i.returned.qty || i.unbilledQty;
      const sold = i.sold.qty || i.notInvoicedQty;
      if (opts.side === 'PURCHASE' && !bought) continue;
      if (opts.side === 'SALE' && !sold) continue;
      if (!bought && !sold) continue;
      out.push({
        partyKey: p.key, party: p.name, gstin: p.gstin, roles: p.roles.join(' & '), materialId: i.materialId, item: i.name, unit: i.unit,
        purchasedQty: i.purchased.qty, returnedQty: i.returned.qty, purchaseValue: i.netPurchase, purchaseAvgRate: i.purchased.avgRate,
        soldQty: i.sold.qty, saleValue: i.sold.taxable, saleAvgRate: i.sold.avgRate, unbilledQty: i.unbilledQty, notInvoicedQty: i.notInvoicedQty,
      });
    }
  }
  return out;
}

/** sales register line totals for one invoice (re-exported for the goods sales screens) */
export { salesTotals };

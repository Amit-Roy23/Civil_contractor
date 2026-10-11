import type { CostHead, DB, Dispatch, FuelIssue, ID, LogEntry, PurchaseInvoice, RaBill, StockTxn, SubconBill, Vehicle } from './types';
import { bkey, getLedger, isEffective, productionUse, type Movement } from './ledger';
import { addDays, daysBetween, monthOf, today } from '../lib/format';
import { groupBy, round, sum } from '../lib/utils';

/* ---------- memo helper: results cached per DB snapshot ---------- */
const memoStore = new WeakMap<DB, Map<string, unknown>>();
export function memo<T>(db: DB, key: string, fn: () => T): T {
  let m = memoStore.get(db);
  if (!m) memoStore.set(db, (m = new Map()));
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

export const lookup = (db: DB) =>
  memo(db, 'lookup', () => ({
    site: Object.fromEntries(db.sites.map((x) => [x.id, x])),
    store: Object.fromEntries(db.stores.map((x) => [x.id, x])),
    plant: Object.fromEntries(db.plants.map((x) => [x.id, x])),
    material: Object.fromEntries(db.materials.map((x) => [x.id, x])),
    supplier: Object.fromEntries(db.suppliers.map((x) => [x.id, x])),
    client: Object.fromEntries(db.clients.map((x) => [x.id, x])),
    subcon: Object.fromEntries(db.subcons.map((x) => [x.id, x])),
    worker: Object.fromEntries(db.workers.map((x) => [x.id, x])),
    vehicle: Object.fromEntries(db.vehicles.map((x) => [x.id, x])),
    fuelSource: Object.fromEntries(db.fuelSources.map((x) => [x.id, x])),
    head: Object.fromEntries(db.expenseHeads.map((x) => [x.id, x])),
    boq: Object.fromEntries(db.boq.map((x) => [x.id, x])),
    recipe: Object.fromEntries(db.recipes.map((x) => [x.id, x])),
    user: Object.fromEntries(db.users.map((x) => [x.id, x])),
    po: Object.fromEntries(db.pos.map((x) => [x.id, x])),
    workOrder: Object.fromEntries(db.workOrders.map((x) => [x.id, x])),
    siteStore: Object.fromEntries(db.stores.filter((s) => s.siteId).map((s) => [s.siteId!, s.id])),
  }));

export interface Range {
  from: string;
  to: string;
}
export const inRange = (d: string, r?: Range) => !r || (d >= r.from && d <= r.to);

/* ================= Inventory (§4) ================= */

export interface RegisterRow {
  materialId: ID;
  opening: number;
  received: number;
  consumed: number;
  transferred: number;
  returned: number;
  wasted: number;
  adjusted: number;
  closing: number;
  openingValue: number;
  closingValue: number;
  consumedValue: number;
  receivedValue: number;
}

/** Site / store stock register for a date range (4.4) */
export function stockRegister(db: DB, storeId: ID, r: Range): RegisterRow[] {
  return memo(db, `reg|${storeId}|${r.from}|${r.to}`, () => {
    const L = getLedger(db);
    const rows = new Map<string, RegisterRow>();
    const row = (m: string) => {
      let x = rows.get(m);
      if (!x) rows.set(m, (x = { materialId: m, opening: 0, received: 0, consumed: 0, transferred: 0, returned: 0, wasted: 0, adjusted: 0, closing: 0, openingValue: 0, closingValue: 0, consumedValue: 0, receivedValue: 0 }));
      return x;
    };
    for (const mv of L.movements) {
      if (mv.storeId !== storeId || mv.date > r.to) continue;
      const x = row(mv.materialId);
      if (mv.date < r.from) {
        x.opening += mv.qty;
        x.openingValue += mv.value;
        continue;
      }
      if (mv.kind === 'Opening') {
        x.opening += mv.qty;
        x.openingValue += mv.value;
      } else if (mv.qty > 0 && mv.kind !== 'Adjustment' && mv.kind !== 'Return in') {
        x.received += mv.qty;
        x.receivedValue += mv.value;
      } else if (mv.kind === 'Return in') {
        x.received += mv.qty;
        x.receivedValue += mv.value;
      } else if (mv.kind === 'Consumption' || mv.kind === 'Production use') {
        x.consumed -= mv.qty;
        x.consumedValue -= mv.value;
      } else if (mv.kind === 'Transfer out' || mv.kind === 'Issue' || mv.kind === 'Dispatch' || mv.kind === 'Spares to vehicle') x.transferred -= mv.qty;
      else if (mv.kind === 'Return out') x.returned -= mv.qty;
      else if (mv.kind === 'Wastage') x.wasted -= mv.qty;
      else if (mv.kind === 'Adjustment') x.adjusted += mv.qty;
    }
    // closing values from running ledger
    const closing = new Map<string, { q: number; v: number }>();
    for (const mv of L.movements) {
      if (mv.storeId !== storeId || mv.date > r.to) continue;
      const c = closing.get(mv.materialId) || { q: 0, v: 0 };
      c.q += mv.qty;
      c.v += mv.value;
      closing.set(mv.materialId, c);
    }
    for (const x of rows.values()) {
      const c = closing.get(x.materialId)!;
      x.closing = round(c.q, 3);
      x.closingValue = Math.abs(c.q) < 1e-6 ? 0 : c.v;
    }
    return [...rows.values()].filter((x) => Math.abs(x.opening) + x.received + x.consumed + x.transferred + Math.abs(x.closing) > 1e-6);
  });
}

export function itemLedger(db: DB, storeId: ID, materialId: ID, r?: Range): Array<Movement & { balance: number; balanceValue: number }> {
  const L = getLedger(db);
  let q = 0;
  let v = 0;
  const out: Array<Movement & { balance: number; balanceValue: number }> = [];
  for (const mv of L.movements) {
    if (mv.storeId !== storeId || mv.materialId !== materialId) continue;
    q += mv.qty;
    v += mv.value;
    if (inRange(mv.date, r)) out.push({ ...mv, balance: round(q, 4), balanceValue: Math.abs(q) < 1e-6 ? 0 : v });
  }
  return out;
}

export function storeValue(db: DB, storeId: ID): number {
  return memo(db, `sv|${storeId}`, () => {
    let v = 0;
    for (const [k, b] of getLedger(db).balances) if (k.startsWith(storeId + '|') && b.qty > 0) v += b.value;
    return v;
  });
}

export function stockOf(db: DB, storeId: ID, materialId: ID) {
  return getLedger(db).balances.get(bkey(storeId, materialId)) || { qty: 0, value: 0 };
}

export interface TransitRow {
  id: ID;
  kind: 'Store issue' | 'Site transfer' | 'Plant dispatch';
  no: string;
  date: string;
  fromName: string;
  toName: string;
  toStoreId?: ID;
  toSiteId?: ID;
  material: string;
  qty: number;
  unit: string;
  vehicle: string;
  ageDays: number;
}
export function materialsInTransit(db: DB): TransitRow[] {
  return memo(db, 'transit', () => {
    const lk = lookup(db);
    const rows: TransitRow[] = [];
    for (const t of db.stockTxns.filter((x) => x.status === 'IN_TRANSIT')) {
      for (const l of t.lines)
        rows.push({ id: t.id, kind: t.type === 'ISSUE' ? 'Store issue' : 'Site transfer', no: t.no, date: t.date, fromName: lk.store[t.fromStoreId!]?.name || '', toName: lk.store[t.toStoreId!]?.name || '', toStoreId: t.toStoreId, toSiteId: lk.store[t.toStoreId!]?.siteId, material: lk.material[l.materialId]?.name || '', qty: l.qty, unit: lk.material[l.materialId]?.unit || '', vehicle: t.vehicleNo || '', ageDays: daysBetween(t.date, today()) });
    }
    for (const d of db.dispatches.filter((x) => x.status === 'DISPATCHED')) {
      rows.push({ id: d.id, kind: 'Plant dispatch', no: d.no, date: d.date, fromName: lk.plant[d.plantId]?.name || '', toName: d.siteId ? lk.site[d.siteId]?.short || '' : d.toPlantId ? lk.plant[d.toPlantId]?.code || '' : d.customer || '', toSiteId: d.siteId, material: lk.material[d.productId]?.name || '', qty: d.qty, unit: lk.material[d.productId]?.unit || '', vehicle: lk.vehicle[d.vehicleId]?.regNo || '', ageDays: daysBetween(d.date, today()) });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  });
}

export interface TvaRow {
  siteId: ID;
  materialId: ID;
  theoretical: number;
  actual: number;
  diff: number;
  diffPct: number;
  diffValue: number;
  tolerance: number;
  breach: boolean;
}
export function toleranceFor(db: DB, materialId: ID): number {
  const m = lookup(db).material[materialId];
  if (!m) return db.settings.tolerance.default;
  if (m.category === 'Cement') return db.settings.tolerance.cement;
  if (m.category === 'Steel') return db.settings.tolerance.steel;
  if (m.category === 'Bitumen') return db.settings.tolerance.bitumen;
  if (m.category === 'Plant Output') return db.settings.tolerance.plant;
  return m.tolerancePct ?? db.settings.tolerance.default;
}
/** Theoretical vs actual consumption (MAT-16/17/18) */
export function theoreticalVsActual(db: DB, r: Range, siteId?: ID): TvaRow[] {
  return memo(db, `tva|${r.from}|${r.to}|${siteId}`, () => {
    const lk = lookup(db);
    const map = new Map<string, TvaRow>();
    const row = (s: string, m: string) => {
      const k = `${s}|${m}`;
      let x = map.get(k);
      if (!x) map.set(k, (x = { siteId: s, materialId: m, theoretical: 0, actual: 0, diff: 0, diffPct: 0, diffValue: 0, tolerance: toleranceFor(db, m), breach: false }));
      return x;
    };
    for (const ms of db.measurements) {
      if (!inRange(ms.date, r) || (siteId && ms.siteId !== siteId)) continue;
      const b = lk.boq[ms.boqItemId];
      if (!b?.recipeId) continue;
      const rec = lk.recipe[b.recipeId];
      rec?.lines.forEach((l) => (row(ms.siteId, l.materialId).theoretical += l.qty * ms.qty));
    }
    for (const t of db.stockTxns) {
      if (t.type !== 'CONSUMPTION' || !isEffective(t) || !inRange(t.date, r) || !t.boqItemId) continue;
      const s = lk.store[t.fromStoreId!]?.siteId;
      if (!s || (siteId && s !== siteId)) continue;
      t.lines.forEach((l) => (row(s, l.materialId).actual += l.qty));
    }
    const L = getLedger(db);
    for (const x of map.values()) {
      x.diff = round(x.actual - x.theoretical, 3);
      x.diffPct = x.theoretical > 0 ? (x.diff / x.theoretical) * 100 : 0;
      const st = lk.siteStore[x.siteId]!;
      const b = L.balances.get(bkey(st, x.materialId));
      const rate = b && b.qty > 0 ? b.value / b.qty : lk.material[x.materialId]?.stdRate || 0;
      x.diffValue = x.diff * rate;
      x.breach = x.theoretical > 0 && x.diffPct > x.tolerance;
    }
    return [...map.values()].filter((x) => x.theoretical > 0 || x.actual > 0).sort((a, b) => b.diffPct - a.diffPct);
  });
}

/** Tools & tackles balance per site (MAT-15) */
export function toolsBalance(db: DB) {
  return memo(db, 'tools', () => {
    const lk = lookup(db);
    const tools = db.materials.filter((m) => m.returnable);
    const rows: Array<{ siteId: ID; materialId: ID; issued: number; returned: number; lost: number; balance: number }> = [];
    for (const s of db.sites) {
      const st = lk.siteStore[s.id];
      for (const m of tools) {
        let issued = 0;
        let returned = 0;
        let lost = 0;
        for (const t of db.stockTxns) {
          if (!isEffective(t)) continue;
          for (const l of t.lines) {
            if (l.materialId !== m.id) continue;
            if (t.toStoreId === st && (t.type === 'ISSUE' || t.type === 'TRANSFER')) issued += l.qty;
            if (t.fromStoreId === st && (t.type === 'RETURN' || t.type === 'TRANSFER')) returned += l.qty;
            if (t.fromStoreId === st && t.type === 'WASTAGE') lost += l.qty;
          }
        }
        if (issued) rows.push({ siteId: s.id, materialId: m.id, issued, returned, lost, balance: issued - returned - lost });
      }
    }
    return rows;
  });
}

/** reorder & minimum level (STR-02 / ALT-01) */
export function lowStock(db: DB) {
  return memo(db, 'low', () => {
    const lk = lookup(db);
    const out: Array<{ storeId: ID; materialId: ID; qty: number; min: number; reorder: number }> = [];
    for (const [k, b] of getLedger(db).balances) {
      const [storeId, materialId] = k.split('|') as [string, string];
      const m = lk.material[materialId];
      const st = lk.store[storeId];
      if (!m || !st || m.returnable || m.kind === 'OUTPUT' || !m.minStock) continue;
      if (st.siteId && lk.site[st.siteId]?.status !== 'ACTIVE') continue;
      if (st.type === 'SITE' && m.kind === 'BOTH') continue; // own-crusher products are supplied on demand
      const min = st.type === 'CENTRAL' ? m.minStock : round(m.minStock * 0.25, 2);
      if (b.qty < min) out.push({ storeId, materialId, qty: b.qty, min, reorder: m.reorderQty });
    }
    return out;
  });
}

/** stock ageing — items not moved in 90/180/365 days (STR-03) */
export function stockAgeing(db: DB, storeId: ID) {
  const L = getLedger(db);
  const last = new Map<string, string>();
  for (const mv of L.movements) if (mv.storeId === storeId && mv.qty < 0) last.set(mv.materialId, mv.date);
  const out: Array<{ materialId: ID; qty: number; value: number; lastIssue?: string; days: number; bucket: string }> = [];
  for (const [k, b] of L.balances) {
    if (!k.startsWith(storeId + '|') || b.qty <= 0) continue;
    const m = k.split('|')[1]!;
    const li = last.get(m);
    const days = li ? daysBetween(li, today()) : 400;
    out.push({ materialId: m, qty: b.qty, value: b.value, lastIssue: li, days, bucket: days > 365 ? '> 365 days' : days > 180 ? '181–365 days' : days > 90 ? '91–180 days' : '≤ 90 days' });
  }
  return out.sort((a, b) => b.days - a.days);
}

/* ================= Purchase (§5) ================= */

export const poValue = (lines: Array<{ qty: number; rate: number; gstPct: number }>) => sum(lines, (l) => l.qty * l.rate * (1 + l.gstPct / 100));
export const poTaxable = (lines: Array<{ qty: number; rate: number }>) => sum(lines, (l) => l.qty * l.rate);

export function poReceived(db: DB, poId: ID): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const t of db.stockTxns) if (t.type === 'GRN' && t.poId === poId && isEffective(t)) for (const l of t.lines) out[l.materialId] = (out[l.materialId] || 0) + l.qty + (l.rejectedQty || 0);
  return out;
}

export function poStatus(db: DB, poId: ID) {
  const po = lookup(db).po[poId]!;
  const rec = poReceived(db, poId);
  const lines = po.lines.map((l) => ({ ...l, received: round(rec[l.materialId] || 0, 3), pending: round(Math.max(0, l.qty - (rec[l.materialId] || 0)), 3) }));
  const pendingQty = sum(lines, (l) => l.pending);
  return { lines, pendingQty, fullyReceived: pendingQty <= 0.001 };
}

/** 3-way match (PUR-05) */
export function threeWayMatch(db: DB, inv: PurchaseInvoice) {
  const lk = lookup(db);
  const po = inv.poId ? lk.po[inv.poId] : undefined;
  const grnQty: Record<ID, number> = {};
  for (const g of db.stockTxns.filter((t) => inv.grnIds.includes(t.id))) for (const l of g.lines) grnQty[l.materialId] = (grnQty[l.materialId] || 0) + l.qty;
  const issues: string[] = [];
  for (const l of inv.lines) {
    const pl = po?.lines.find((x) => x.materialId === l.materialId);
    const m = lk.material[l.materialId];
    if (pl && Math.abs(pl.rate - l.rate) > 0.01) issues.push(`${m?.name}: rate ₹${l.rate} vs PO ₹${pl.rate}`);
    if (Math.abs((grnQty[l.materialId] || 0) - l.qty) > 0.01) issues.push(`${m?.name}: billed ${l.qty} vs accepted ${round(grnQty[l.materialId] || 0, 2)}`);
  }
  return { ok: issues.length === 0, issues };
}

export interface LedgerLine {
  date: string;
  type: string;
  ref: string;
  debit: number;
  credit: number;
  balance: number;
  remark?: string;
}

/** Supplier ledger (SUP-01) — credit = we owe more */
export function supplierLedger(db: DB, supplierId: ID): LedgerLine[] {
  return memo(db, `sl|${supplierId}`, () => {
    const s = lookup(db).supplier[supplierId]!;
    const items: Array<Omit<LedgerLine, 'balance'>> = [];
    for (const i of db.invoices.filter((x) => x.supplierId === supplierId)) items.push({ date: i.date, type: 'Invoice', ref: `${i.no} (${i.supplierInvoiceNo})`, debit: 0, credit: Math.round(poValue(i.lines)) });
    for (const p of db.payments.filter((x) => x.partyType === 'SUPPLIER' && x.partyId === supplierId)) items.push({ date: p.date, type: p.kind === 'ADVANCE' ? 'Advance' : 'Payment', ref: `${p.no} · ${p.mode}`, debit: p.amount + p.tds, credit: 0, remark: p.remark });
    for (const d of db.debitNotes.filter((x) => x.supplierId === supplierId)) {
      const gst = lookup(db).material[d.materialId]?.gstPct || 0;
      items.push({ date: d.date, type: 'Debit note', ref: d.no, debit: Math.round(d.qty * d.rate * (1 + gst / 100)), credit: 0, remark: d.reason });
    }
    // hire bills for vehicle owners (HIRE-02) & fuel pump credit fills (FUEL-05)
    for (const hb of hireBills(db).filter((h) => h.supplierId === supplierId)) items.push({ date: hb.billDate, type: 'Hire bill', ref: `${hb.vehicleCode} · ${hb.month}`, debit: 0, credit: Math.round(hb.net) });
    const pumpSources = db.fuelSources.filter((f) => f.supplierId === supplierId).map((f) => f.id);
    if (pumpSources.length) {
      const byMonth = groupBy(db.fuelIssues.filter((f) => pumpSources.includes(f.sourceId) && f.status !== 'REJECTED'), (f) => monthOf(f.date));
      for (const [mo, rows] of Object.entries(byMonth)) items.push({ date: `${mo}-28` > today() ? today() : `${mo}-28`, type: 'Fuel credit', ref: `${rows.length} fills · ${round(sum(rows, (r) => r.litres))} L`, debit: 0, credit: Math.round(sum(rows, (r) => r.litres * r.rate)) });
    }
    for (const fp of db.fuelPurchases.filter((x) => x.supplierId === supplierId && x.litres > 0)) items.push({ date: fp.date, type: 'Fuel purchase', ref: `${fp.no} · ${fp.invoiceNo}`, debit: 0, credit: Math.round(fp.litres * fp.rate) });
    items.sort((a, b) => a.date.localeCompare(b.date));
    let bal = s.openingBalance;
    const out: LedgerLine[] = [{ date: db.sites.reduce((m, x) => (x.openingAsOf && x.openingAsOf < m ? x.openingAsOf : m), today()), type: 'Opening', ref: 'Opening balance', debit: 0, credit: s.openingBalance, balance: bal }];
    for (const it of items) {
      bal += it.credit - it.debit;
      out.push({ ...it, balance: bal });
    }
    return out;
  });
}

export function supplierBalance(db: DB, supplierId: ID): number {
  const l = supplierLedger(db, supplierId);
  return l[l.length - 1]?.balance || 0;
}

/** Outstanding payables with ageing (SUP-02) — FIFO allocation of payments against bills */
export function payablesAgeing(db: DB) {
  return memo(db, 'payAge', () => {
    const rows: Array<{ supplierId: ID; total: number; b0: number; b30: number; b60: number; b90: number; overdue: number; dueSoon: number }> = [];
    for (const s of db.suppliers) {
      const ledger = supplierLedger(db, s.id);
      const bills = ledger.filter((l) => l.credit > 0).map((l) => ({ date: l.date, left: l.credit, due: addDays(l.date, s.creditDays) }));
      let paid = sum(ledger, (l) => l.debit);
      for (const b of bills) {
        const use = Math.min(paid, b.left);
        b.left -= use;
        paid -= use;
      }
      const r = { supplierId: s.id, total: 0, b0: 0, b30: 0, b60: 0, b90: 0, overdue: 0, dueSoon: 0 };
      for (const b of bills) {
        if (b.left <= 1) continue;
        const age = daysBetween(b.date, today());
        r.total += b.left;
        if (age <= 30) r.b0 += b.left;
        else if (age <= 60) r.b30 += b.left;
        else if (age <= 90) r.b60 += b.left;
        else r.b90 += b.left;
        const od = daysBetween(b.due, today());
        if (od > 0) r.overdue += b.left;
        else if (od > -7) r.dueSoon += b.left;
      }
      r.total -= Math.max(0, paid); // unadjusted advances
      if (Math.abs(r.total) > 1) rows.push(r);
    }
    return rows.sort((a, b) => b.total - a.total);
  });
}

/* ================= Labour (§6) ================= */

export function contractorRate(db: DB, contractorId: ID, trade: string) {
  return lookup(db).subcon[contractorId]?.tradeRates[trade] || 600;
}

export interface LabourCostRow {
  date: string;
  siteId: ID;
  trade: string;
  source: 'OWN' | 'CONTRACTOR';
  contractorId?: ID;
  headcount: number;
  cost: number;
}
/** Daily labour cost (LAB-01..06) */
export function labourCostRows(db: DB): LabourCostRow[] {
  return memo(db, 'labRows', () => {
    const lk = lookup(db);
    const out: LabourCostRow[] = [];
    for (const a of db.attendance) {
      if (a.workerId) {
        const w = lk.worker[a.workerId];
        if (!w || a.status === 'A' || !a.status) continue;
        const d = a.status === 'H' ? 0.5 : 1;
        out.push({ date: a.date, siteId: a.siteId, trade: w.trade, source: 'OWN', headcount: d, cost: d * w.wageRate + a.otHours * w.otRate });
      } else if (a.contractorId && a.headcount) {
        const rate = contractorRate(db, a.contractorId, a.trade || 'Helper');
        out.push({ date: a.date, siteId: a.siteId, trade: a.trade || 'Helper', source: 'CONTRACTOR', contractorId: a.contractorId, headcount: a.headcount, cost: a.headcount * rate + a.otHours * (rate / 8) * 1.5 });
      }
    }
    return out;
  });
}

export function wageFor(db: DB, workerId: ID, from: string, to: string) {
  const w = lookup(db).worker[workerId]!;
  const rows = db.attendance.filter((a) => a.workerId === workerId && a.date >= from && a.date <= to);
  const days = sum(rows, (a) => (a.status === 'P' ? 1 : a.status === 'H' ? 0.5 : 0));
  const ot = sum(rows, (a) => a.otHours);
  const gross = days * w.wageRate + ot * w.otRate;
  const advance = sum(db.advances.filter((a) => a.workerId === workerId && a.date >= from && a.date <= to), (a) => a.amount);
  const deduction = Math.round(gross * 0.0075);
  return { workerId, days, otHours: ot, gross: Math.round(gross), advance, deduction, net: Math.round(gross - advance - deduction) };
}

/** Labour contractor ledger (LAB-09) */
export function contractorLedger(db: DB, contractorId: ID): LedgerLine[] {
  const c = lookup(db).subcon[contractorId]!;
  const items: Array<Omit<LedgerLine, 'balance'>> = [];
  if (c.kind === 'LABOUR_CONTRACTOR') {
    const rows = labourCostRows(db).filter((r) => r.contractorId === contractorId);
    for (const [wk, list] of Object.entries(groupBy(rows, (r) => weekStart(r.date)))) items.push({ date: addDays(wk, 6) > today() ? today() : addDays(wk, 6), type: 'Attendance bill', ref: `Week of ${wk} · ${sum(list, (r) => r.headcount)} man-days`, debit: 0, credit: Math.round(sum(list, (r) => r.cost)) });
  } else {
    for (const b of db.subconBills.filter((x) => lookup(db).workOrder[x.workOrderId]?.subContractorId === contractorId && (x.status === 'APPROVED' || x.status === 'PAID'))) {
      const calc = subconBillCalc(db, b);
      items.push({ date: b.date, type: 'Measurement bill', ref: b.no, debit: 0, credit: Math.round(calc.net + calc.tds) });
    }
  }
  for (const a of db.advances.filter((x) => x.contractorId === contractorId)) items.push({ date: a.date, type: 'Advance', ref: a.remark, debit: a.amount, credit: 0 });
  for (const p of db.payments.filter((x) => x.partyType === 'SUBCON' && x.partyId === contractorId)) items.push({ date: p.date, type: 'Payment', ref: `${p.no} · ${p.mode}`, debit: p.amount + p.tds, credit: 0 });
  items.sort((a, b) => a.date.localeCompare(b.date));
  let bal = c.openingBalance;
  const out: LedgerLine[] = [{ date: '', type: 'Opening', ref: 'Opening balance', debit: 0, credit: c.openingBalance, balance: bal }];
  for (const it of items) {
    bal += it.credit - it.debit;
    out.push({ ...it, balance: bal });
  }
  return out;
}
export function weekStart(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function subconBillCalc(db: DB, b: SubconBill) {
  const wo = lookup(db).workOrder[b.workOrderId]!;
  const gross = sum(b.lines, (l) => l.qty * l.rate);
  const retention = (gross * wo.retentionPct) / 100;
  const tds = (gross * wo.tdsPct) / 100;
  const net = gross - retention - tds - b.materialRecovery - b.advanceRecovery - b.penalty;
  return { gross, retention, tds, net };
}

/* ================= Expenses (§7) ================= */

export function pettyCash(db: DB, siteId: ID) {
  const lines: Array<{ date: string; type: string; ref: string; inAmt: number; outAmt: number; balance: number; remark: string }> = [];
  const lk = lookup(db);
  const items: Array<Omit<(typeof lines)[number], 'balance'>> = [];
  for (const i of db.imprests.filter((x) => x.siteId === siteId && x.status === 'APPROVED')) items.push({ date: i.date, type: i.kind === 'IMPREST' ? 'Imprest' : 'Top-up', ref: i.no, inAmt: i.amount, outAmt: 0, remark: i.remark });
  for (const e of db.expenses.filter((x) => x.siteId === siteId && x.status === 'APPROVED' && (x.mode === 'CASH' || x.mode === 'UPI'))) items.push({ date: e.date, type: 'Expense', ref: e.no, inAmt: 0, outAmt: e.amount, remark: `${lk.head[e.headId]?.subHead} — ${e.paidTo}` });
  for (const f of db.fuelIssues.filter((x) => x.siteId === siteId && lk.fuelSource[x.sourceId]?.type === 'OUTSIDE_PUMP' && !lk.fuelSource[x.sourceId]?.supplierId)) items.push({ date: f.date, type: 'Fuel (cash)', ref: f.no, inAmt: 0, outAmt: f.litres * f.rate, remark: '' });
  items.sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  for (const it of items) {
    bal += it.inAmt - it.outAmt;
    lines.push({ ...it, balance: bal });
  }
  return lines;
}

/** Head-office overhead allocation to sites (EXP-05) */
export function overheadAllocation(db: DB) {
  return memo(db, 'ohAlloc', () => {
    const out: Array<{ month: string; siteId: ID; amount: number }> = [];
    for (const [mo, rows] of Object.entries(groupBy(db.overheads, (o) => o.month))) {
      const total = sum(rows, (r) => r.amount);
      const basis = rows[0]?.basis || db.settings.overheadBasis;
      const active = db.sites.filter((s) => s.status === 'ACTIVE' || db.raBills.some((b) => b.siteId === s.id && monthOf(b.date) === mo));
      let weights: Record<ID, number> = {};
      if (basis === 'EQUAL') active.forEach((s) => (weights[s.id] = 1));
      else if (basis === 'CONTRACT') active.forEach((s) => (weights[s.id] = s.contractValue));
      else if (basis === 'BILLING') {
        db.raBills.filter((b) => monthOf(b.date) === mo).forEach((b) => (weights[b.siteId] = (weights[b.siteId] || 0) + raCalc(b).gross));
        if (!Object.keys(weights).length) active.forEach((s) => (weights[s.id] = s.contractValue));
      } else weights = rows[0]?.manual || {};
      const wsum = sum(Object.values(weights), (x) => x);
      for (const [s, w] of Object.entries(weights)) out.push({ month: mo, siteId: s, amount: wsum ? (total * w) / wsum : 0 });
    }
    return out;
  });
}

/* ================= Fleet (§8) ================= */

export function vehicleMeter(db: DB, vehicleId: ID): number {
  return memo(db, `meter|${vehicleId}`, () => {
    let m = 0;
    for (const l of db.logs) if (l.vehicleId === vehicleId) m = Math.max(m, l.closeKm ?? l.closeHr ?? 0);
    for (const f of db.fuelIssues) if (f.vehicleId === vehicleId) m = Math.max(m, f.odometer ?? f.hourMeter ?? 0);
    return m;
  });
}

export const meterOf = (f: FuelIssue) => f.odometer ?? f.hourMeter ?? 0;

/** FUEL-06: reading must increase; flags unusual jumps */
export function validateMeter(db: DB, vehicleId: ID, reading: number, date: string): string | null {
  const v = lookup(db).vehicle[vehicleId];
  const prev = db.fuelIssues.filter((f) => f.vehicleId === vehicleId && f.date <= date).sort((a, b) => meterOf(b) - meterOf(a))[0];
  const last = Math.max(prev ? meterOf(prev) : 0, ...db.logs.filter((l) => l.vehicleId === vehicleId && l.date < date).map((l) => l.closeKm ?? l.closeHr ?? 0));
  if (!last) return null;
  if (reading < last) return `Reading ${reading} is lower than last recorded ${last}`;
  const days = Math.max(1, prev ? daysBetween(prev.date, date) : 1);
  const perDay = (reading - last) / days;
  if (v?.meterType === 'HOURS' ? perDay > 20 : perDay > 600) return `Unusually high jump: ${round(reading - last)} ${v?.meterType === 'HOURS' ? 'hrs' : 'km'} since last reading`;
  return null;
}

export interface EfficiencyRow {
  vehicleId: ID;
  from: string;
  to: string;
  run: number;
  litres: number;
  actual: number; // kmpl or lph
  standard: number;
  expected: number;
  variance: number;
  variancePct: number;
  varianceValue: number;
  unit: 'KMPL' | 'LPH';
}
/** Fuel efficiency between consecutive full-tank fills (FUEL-07) */
export function fuelEfficiency(db: DB): EfficiencyRow[] {
  return memo(db, 'eff', () => {
    const out: EfficiencyRow[] = [];
    const byV = groupBy(db.fuelIssues.filter((f) => f.status !== 'REJECTED' && !f.flag), (f) => f.vehicleId);
    const lk = lookup(db);
    for (const [vid, rows] of Object.entries(byV)) {
      const v = lk.vehicle[vid];
      if (!v) continue;
      rows.sort((a, b) => meterOf(a) - meterOf(b));
      let prevFull: FuelIssue | undefined;
      let litresSince = 0;
      for (const f of rows) {
        if (prevFull) litresSince += f.litres;
        if (f.fullTank) {
          if (prevFull && litresSince > 0) {
            const run = meterOf(f) - meterOf(prevFull);
            if (run > 0) {
              const isKm = v.meterType !== 'HOURS';
              const std = isKm ? v.stdKmpl || 1 : v.stdLph || 1;
              const expected = isKm ? run / std : run * std;
              const variance = litresSince - expected;
              out.push({ vehicleId: vid, from: prevFull.date, to: f.date, run: round(run, 1), litres: round(litresSince, 1), actual: round(isKm ? run / litresSince : litresSince / run, 2), standard: std, expected: round(expected, 1), variance: round(variance, 1), variancePct: expected ? (variance / expected) * 100 : 0, varianceValue: variance * f.rate, unit: isKm ? 'KMPL' : 'LPH' });
            }
          }
          prevFull = f;
          litresSince = 0;
        }
      }
    }
    return out;
  });
}

export function vehicleEfficiencySummary(db: DB, r?: Range) {
  return memo(db, `effsum|${r?.from}|${r?.to}`, () => {
    const rows = fuelEfficiency(db).filter((e) => inRange(e.to, r));
    return Object.entries(groupBy(rows, (e) => e.vehicleId)).map(([vehicleId, list]) => {
      const litres = sum(list, (x) => x.litres);
      const expected = sum(list, (x) => x.expected);
      const run = sum(list, (x) => x.run);
      const variance = litres - expected;
      return { vehicleId, run, litres, expected, variance, variancePct: expected ? (variance / expected) * 100 : 0, varianceValue: sum(list, (x) => x.varianceValue), actual: list[0]!.unit === 'KMPL' ? run / litres : litres / run, standard: list[0]!.standard, unit: list[0]!.unit, fills: list.length };
    });
  });
}

/** site shares for a vehicle-day (VEH-02) */
export const logShares = (l: LogEntry) => l.split?.length ? l.split : [{ siteId: l.siteId, share: 1 }];
export const logUsage = (l: LogEntry) => (l.closeKm ?? 0) - (l.openKm ?? 0) || (l.closeHr ?? 0) - (l.openHr ?? 0);

/** Fuel cost charged to sites (FUEL-09) — each fill is spread over the sites the machine worked at until the next fill */
export function fuelCostBySite(db: DB) {
  return memo(db, 'fuelSite', () => {
    const out: Array<{ date: string; siteId: ID; vehicleId: ID; litres: number; amount: number }> = [];
    const logsByV = groupBy(db.logs, (l) => l.vehicleId);
    for (const [vid, fills] of Object.entries(groupBy(db.fuelIssues.filter((f) => f.status !== 'REJECTED'), (f) => f.vehicleId))) {
      fills.sort((a, b) => a.date.localeCompare(b.date));
      const logs = (logsByV[vid] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      fills.forEach((f, i) => {
        const end = fills[i + 1]?.date || '9999';
        const window = logs.filter((l) => l.date >= f.date && l.date < end);
        const use: Record<ID, number> = {};
        for (const l of window) for (const s of logShares(l)) use[s.siteId] = (use[s.siteId] || 0) + Math.max(0.0001, logUsage(l)) * s.share;
        const total = sum(Object.values(use), (x) => x);
        if (!total) out.push({ date: f.date, siteId: f.siteId, vehicleId: vid, litres: f.litres, amount: f.litres * f.rate });
        else for (const [s, u] of Object.entries(use)) out.push({ date: f.date, siteId: s, vehicleId: vid, litres: (f.litres * u) / total, amount: (f.litres * f.rate * u) / total });
      });
    }
    return out;
  });
}

export interface HireBill {
  vehicleId: ID;
  vehicleCode: string;
  supplierId?: ID;
  month: string;
  billDate: string;
  basis: string;
  units: number;
  billedUnits: number;
  rate: number;
  gross: number;
  fuelDeduction: number;
  advance: number;
  net: number;
  bySite: Record<ID, number>;
}
/** Hire bills from logbook (HIRE-01/02) */
export function hireBills(db: DB): HireBill[] {
  return memo(db, 'hire', () => {
    const out: HireBill[] = [];
    const lk = lookup(db);
    for (const v of db.vehicles.filter((x) => x.ownership === 'HIRED')) {
      const logs = db.logs.filter((l) => l.vehicleId === v.id);
      for (const [mo, rows] of Object.entries(groupBy(logs, (l) => monthOf(l.date)))) {
        const work = rows.filter((l) => logUsage(l) > 0);
        let units = 0;
        if (v.hireBasis === 'PER_HOUR') units = sum(work, logUsage);
        else if (v.hireBasis === 'PER_DAY') units = work.length;
        else if (v.hireBasis === 'PER_TRIP') units = sum(work, (l) => l.trips);
        else if (v.hireBasis === 'PER_KM') units = sum(work, logUsage);
        else units = 1;
        const lastDay = new Date(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)), 0).getDate();
        const daysCovered = rows.length ? daysBetween(rows.reduce((m, l) => (l.date < m ? l.date : m), rows[0]!.date), rows.reduce((m, l) => (l.date > m ? l.date : m), rows[0]!.date)) + 1 : 0;
        let billed = units;
        if (v.hireBasis === 'PER_HOUR' && v.minGuaranteedHours) billed = Math.max(units, (v.minGuaranteedHours * daysCovered) / lastDay);
        if (v.hireBasis === 'PER_MONTH') billed = daysCovered / lastDay;
        const gross = billed * (v.hireRate || 0);
        const fuel = sum(db.fuelIssues.filter((f) => f.vehicleId === v.id && monthOf(f.date) === mo), (f) => f.litres * f.rate);
        const fuelDeduction = v.hireWithFuel ? fuel : 0;
        const net = gross - fuelDeduction;
        const bySite: Record<ID, number> = {};
        const tot = sum(work, (l) => Math.max(1, logUsage(l)));
        for (const l of work) for (const s of logShares(l)) bySite[s.siteId] = (bySite[s.siteId] || 0) + (gross * Math.max(1, logUsage(l)) * s.share) / (tot || 1);
        if (!work.length && v.siteId) bySite[v.siteId] = gross;
        const bd = `${mo}-${String(lastDay).padStart(2, '0')}` > today() ? today() : `${mo}-${String(lastDay).padStart(2, '0')}`;
        out.push({ vehicleId: v.id, vehicleCode: v.code, supplierId: v.ownerSupplierId, month: mo, billDate: bd, basis: v.hireBasis || '', units: round(units, 1), billedUnits: round(billed, 2), rate: v.hireRate || 0, gross, fuelDeduction, advance: 0, net, bySite });
        void lk;
      }
    }
    return out;
  });
}

/** owned machine internal hire (VEH-05) charged to sites */
export function internalHireBySite(db: DB) {
  return memo(db, 'internal', () => {
    const out: Array<{ date: string; siteId: ID; vehicleId: ID; amount: number }> = [];
    const lk = lookup(db);
    for (const l of db.logs) {
      const v = lk.vehicle[l.vehicleId];
      if (!v || v.ownership !== 'OWNED') continue;
      const u = logUsage(l);
      if (u <= 0) continue;
      for (const s of logShares(l)) out.push({ date: l.date, siteId: s.siteId, vehicleId: v.id, amount: u * v.internalRate * s.share * (v.meterType === 'HOURS' ? 1 : 1) });
    }
    return out;
  });
}

export function maintenanceCostByVehicle(db: DB) {
  return memo(db, 'mnt', () => {
    const L = getLedger(db);
    const out: Array<{ date: string; vehicleId: ID; amount: number; kind: string }> = [];
    for (const j of db.jobCards) out.push({ date: j.date, vehicleId: j.vehicleId, amount: j.sparesCost + j.labourCost, kind: 'Job card' });
    for (const mv of L.movements) if (mv.kind === 'Spares to vehicle' && mv.vehicleId) out.push({ date: mv.date, vehicleId: mv.vehicleId, amount: -mv.value, kind: 'Store spares' });
    for (const t of db.tyres) out.push({ date: t.fitDate, vehicleId: t.vehicleId, amount: t.cost, kind: t.kind === 'TYRE' ? 'Tyre' : 'Battery' });
    return out;
  });
}

/** VEH-03/04 vehicle cost sheet */
export function vehicleCost(db: DB, r: Range) {
  return memo(db, `vc|${r.from}|${r.to}`, () => {
    const months = Math.max(1, daysBetween(r.from, r.to) / 30);
    return db.vehicles.map((v) => {
      const fuel = sum(db.fuelIssues.filter((f) => f.vehicleId === v.id && inRange(f.date, r)), (f) => f.litres * f.rate);
      const mnt = maintenanceCostByVehicle(db).filter((m) => m.vehicleId === v.id && inRange(m.date, r));
      const maintenance = sum(mnt.filter((m) => m.kind === 'Job card'), (m) => m.amount);
      const spares = sum(mnt.filter((m) => m.kind === 'Store spares'), (m) => m.amount);
      const tyres = sum(mnt.filter((m) => m.kind === 'Tyre' || m.kind === 'Battery'), (m) => m.amount);
      const insurance = v.ownership === 'OWNED' ? (insuranceAnnual(v) / 12) * months : 0;
      const hire = sum(hireBills(db).filter((h) => h.vehicleId === v.id && h.month >= monthOf(r.from) && h.month <= monthOf(r.to)), (h) => h.net);
      const emi = v.emi * months;
      const driver = v.driverSalary * months;
      const total = fuel + maintenance + spares + tyres + insurance + hire + emi + driver;
      const logs = db.logs.filter((l) => l.vehicleId === v.id && inRange(l.date, r));
      const usage = sum(logs, logUsage);
      const trips = sum(logs, (l) => l.trips);
      const carried = sum(logs, (l) => l.materialQty || 0);
      const workDays = logs.filter((l) => logUsage(l) > 0).length;
      const breakdownHrs = sum(db.jobCards.filter((j) => j.vehicleId === v.id && inRange(j.date, r)), (j) => j.downtimeHours) + sum(logs.filter((l) => l.idleReason === 'Breakdown'), (l) => l.idleHours);
      const totalHrs = Math.max(1, daysBetween(r.from, r.to) + 1) * 10;
      return { vehicleId: v.id, fuel, maintenance, spares, tyres, insurance, hire, emi, driver, total, usage, trips, carried, workDays, perUnit: usage ? total / usage : 0, perTrip: trips ? total / trips : 0, perMT: carried ? total / carried : 0, availability: Math.max(0, 100 - (breakdownHrs / totalHrs) * 100) };
    });
  });
}
const insuranceAnnual = (v: Vehicle) => ({ Tipper: 85000, 'Transit Mixer': 92000, JCB: 48000, Excavator: 120000, Roller: 60000, Paver: 140000, Grader: 110000, Tanker: 45000, Car: 38000, Generator: 18000, Loader: 70000 })[v.type] || 50000;

export function serviceDue(db: DB) {
  return memo(db, 'svc', () =>
    db.vehicles.map((v) => {
      const meter = vehicleMeter(db, v.id);
      const since = meter - v.lastServiceAt;
      const left = v.serviceEvery - since;
      return { vehicleId: v.id, meter, since: round(since, 1), left: round(left, 1), status: left <= 0 ? 'OVERDUE' : left <= v.serviceEvery * 0.1 ? 'DUE SOON' : 'OK' };
    }),
  );
}

export function docExpiries(db: DB) {
  return memo(db, 'docs', () => {
    const out: Array<{ vehicleId: ID; type: string; number: string; expiry: string; days: number }> = [];
    for (const v of db.vehicles) for (const d of v.docs) out.push({ vehicleId: v.id, type: d.type, number: d.number, expiry: d.expiry, days: daysBetween(today(), d.expiry) });
    return out.sort((a, b) => a.days - b.days);
  });
}

/** fuel tank / bowser stock (FUEL-02) */
export function fuelTankLedger(db: DB, sourceId: ID) {
  return memo(db, `ftl|${sourceId}`, () => {
    const items: Array<{ date: string; type: string; ref: string; inL: number; outL: number; balance: number; dip?: number; variance?: number }> = [];
    const ev: Array<{ date: string; type: string; ref: string; inL: number; outL: number; order: number }> = [];
    for (const p of db.fuelPurchases.filter((x) => x.sourceId === sourceId)) ev.push({ date: p.date, type: p.invoiceNo === 'OPENING' ? 'Opening' : 'Purchase', ref: p.no, inL: p.litres || (p.invoiceNo === 'OPENING' ? p.dipAfter : 0), outL: 0, order: 0 });
    for (const f of db.fuelIssues.filter((x) => x.sourceId === sourceId && x.status !== 'REJECTED')) ev.push({ date: f.date, type: 'Issue', ref: `${f.no} · ${lookup(db).vehicle[f.vehicleId]?.code}`, inL: 0, outL: f.litres, order: 1 });
    ev.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));
    const src = lookup(db).fuelSource[sourceId];
    let bal = src?.type === 'OWN_TANK' ? 0 : sourceId === 'fs2' ? 3100 : sourceId === 'fs3' ? 2200 : 0;
    if (src?.type === 'BOWSER') ev.unshift({ date: ev[0]?.date || today(), type: 'Opening', ref: 'Opening stock', inL: bal, outL: 0, order: -1 }), (bal = 0);
    const dipsBy = Object.fromEntries(db.dips.filter((d) => d.sourceId === sourceId).map((d) => [d.date, d.litres]));
    let lastDate = '';
    for (const e of ev) {
      bal += e.inL - e.outL;
      items.push({ date: e.date, type: e.type, ref: e.ref, inL: e.inL, outL: e.outL, balance: round(bal, 1) });
      lastDate = e.date;
    }
    // attach dip to last row of each day
    const byDate = groupBy(items, (i) => i.date);
    for (const [d, rows] of Object.entries(byDate)) {
      const last = rows[rows.length - 1]!;
      if (dipsBy[d] !== undefined) {
        last.dip = dipsBy[d];
        last.variance = round(dipsBy[d]! - last.balance, 1);
      }
    }
    void lastDate;
    return items;
  });
}

/* ================= Plant (§9) ================= */

export function recipeForDispatch(db: DB, d: Dispatch) {
  const lk = lookup(db);
  const site = d.siteId;
  return db.recipes.find((r) => r.productId === d.productId && r.siteId === site) || db.recipes.find((r) => r.productId === d.productId && !r.siteId && !r.split);
  void lk;
}

/** PLT-13 — raw material allocated to receiving sites through dispatches */
export function siteRawAllocation(db: DB, r?: Range) {
  return memo(db, `alloc|${r?.from}|${r?.to}`, () => {
    const out = new Map<string, { siteId: ID; productId: ID; plantId: ID; productQty: number; materialId: ID; qty: number }>();
    for (const d of db.dispatches) {
      if (d.status !== 'RECEIVED' || !d.siteId || !inRange(d.date, r)) continue;
      const rec = recipeForDispatch(db, d);
      if (!rec || rec.split) continue;
      for (const l of rec.lines) {
        const k = `${d.siteId}|${d.productId}|${l.materialId}`;
        const e = out.get(k) || { siteId: d.siteId, productId: d.productId, plantId: d.plantId, productQty: 0, materialId: l.materialId, qty: 0 };
        e.qty += l.qty * (d.receivedQty || d.qty);
        out.set(k, e);
      }
      for (const e of out.values()) if (e.siteId === d.siteId && e.productId === d.productId) e.productQty = 0;
    }
    // product totals
    const prodTot = new Map<string, number>();
    for (const d of db.dispatches) if (d.status === 'RECEIVED' && d.siteId && inRange(d.date, r)) prodTot.set(`${d.siteId}|${d.productId}`, (prodTot.get(`${d.siteId}|${d.productId}`) || 0) + (d.receivedQty || d.qty));
    for (const e of out.values()) e.productQty = prodTot.get(`${e.siteId}|${e.productId}`) || 0;
    return [...out.values()];
  });
}

/** PLT-16 reconciliation: opening + received − theoretical − closing physical = unexplained loss */
export function plantReconciliation(db: DB, plantId: ID, month: string) {
  const lk = lookup(db);
  const plant = lk.plant[plantId]!;
  const from = `${month}-01`;
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  const reg = stockRegister(db, plant.storeId, { from, to: to > today() ? today() : to });
  const theo = new Map<string, number>();
  for (const p of db.production.filter((x) => x.plantId === plantId && monthOf(x.date) === month)) for (const u of productionUse(db, p)) theo.set(u.materialId, (theo.get(u.materialId) || 0) + u.theoretical);
  return reg
    .filter((r) => lk.material[r.materialId]?.kind !== 'OUTPUT' && !(plant.type === 'CRUSHER' && r.materialId !== 'm10'))
    .map((r) => {
      const t = theo.get(r.materialId) || 0;
      const sp = db.stockpiles.filter((s) => s.plantId === plantId && s.materialId === r.materialId && s.date <= to).sort((a, b) => b.date.localeCompare(a.date))[0];
      const physical = sp && monthOf(sp.date) === month ? sp.physicalQty : r.closing;
      const book = r.opening + r.received - t;
      const loss = book - physical - r.transferred - r.wasted + r.adjusted;
      return { materialId: r.materialId, opening: r.opening, received: r.received, theoretical: t, actualUsed: r.consumed, closingBook: r.closing, physical, physicalFromStockpile: !!(sp && monthOf(sp.date) === month), loss, lossPct: r.opening + r.received ? (loss / (r.opening + r.received)) * 100 : 0 };
    });
}

/* ================= Contract & billing (§10) ================= */

export function raCalc(b: RaBill) {
  const gross = sum(b.lines, (l) => l.thisQty * l.rate) + (b.escalation || 0);
  const gst = (gross * b.gstPct) / 100;
  const deductions = sum(Object.values(b.deductions), (x) => x);
  const net = gross + gst - deductions;
  const received = sum(b.receipts, (x) => x.amount);
  return { gross, gst, deductions, net, received, outstanding: Math.max(0, net - received) };
}

export function boqProgress(db: DB, siteId: ID) {
  return memo(db, `boqp|${siteId}`, () =>
    db.boq
      .filter((b) => b.siteId === siteId)
      .map((b) => {
        const executed = sum(db.measurements.filter((m) => m.boqItemId === b.id), (m) => m.qty);
        const billed = Math.max(0, ...db.raBills.filter((r) => r.siteId === siteId).map((r) => r.lines.find((l) => l.boqItemId === b.id)?.uptoQty || 0));
        return { item: b, executed, pct: b.qty ? (executed / b.qty) * 100 : 0, balance: b.qty - executed, amount: b.qty * b.rate, doneValue: executed * b.rate, billed };
      }),
  );
}

export function receivablesAgeing(db: DB) {
  return memo(db, 'recAge', () => {
    const lk = lookup(db);
    const out: Array<{ clientId: ID; siteId: ID; billNo: string; date: string; net: number; outstanding: number; age: number; bucket: string; status: string }> = [];
    for (const b of db.raBills) {
      const c = raCalc(b);
      if (c.outstanding <= 1 || b.status === 'DRAFT') continue;
      const age = daysBetween(b.date, today());
      out.push({ clientId: lk.site[b.siteId]!.clientId, siteId: b.siteId, billNo: b.no, date: b.date, net: c.net, outstanding: c.outstanding, age, bucket: age <= 30 ? '0–30' : age <= 60 ? '31–60' : age <= 90 ? '61–90' : '90+', status: b.status });
    }
    return out;
  });
}

/* ================= Site costing (§10.3) ================= */

export const COST_HEADS: CostHead[] = ['MATERIAL', 'LABOUR', 'SUBCONTRACT', 'VEHICLE', 'MISC', 'OVERHEAD'];
export const COST_HEAD_LABEL: Record<CostHead, string> = { MATERIAL: 'Material', LABOUR: 'Labour', SUBCONTRACT: 'Sub-contract', VEHICLE: 'Vehicles & machines', MISC: 'Miscellaneous', OVERHEAD: 'Overheads' };

export interface CostEntry {
  date: string;
  siteId: ID;
  head: CostHead;
  amount: number;
  source: string;
  boqItemId?: ID;
}

/** Every cost charged to a site, from its source module (CST-01 table) */
export function costEntries(db: DB): CostEntry[] {
  return memo(db, 'costEntries', () => {
    const out: CostEntry[] = [];
    const L = getLedger(db);
    for (const mv of L.movements) {
      if (!mv.siteId || mv.qty >= 0) continue;
      if (mv.kind === 'Consumption' || mv.kind === 'Wastage') out.push({ date: mv.date, siteId: mv.siteId, head: 'MATERIAL', amount: -mv.value, source: mv.kind === 'Consumption' ? 'Site consumption (MAT-04)' : 'Wastage (MAT-07)', boqItemId: mv.boqItemId });
    }
    for (const r of labourCostRows(db)) out.push({ date: r.date, siteId: r.siteId, head: 'LABOUR', amount: r.cost, source: r.source === 'OWN' ? 'Own labour wages (LAB-06)' : 'Labour contractor (LAB-09)' });
    const excludePending = db.settings.excludePendingFromCost;
    for (const b of db.subconBills) {
      if (excludePending && b.status === 'PENDING') continue;
      if (b.status === 'REJECTED' || b.status === 'CANCELLED') continue;
      const wo = lookup(db).workOrder[b.workOrderId];
      if (!wo) continue;
      for (const l of b.lines) out.push({ date: b.date, siteId: wo.siteId, head: 'SUBCONTRACT', amount: l.qty * l.rate, source: 'Sub-contractor bills (LAB-11)', boqItemId: l.boqItemId });
    }
    for (const f of fuelCostBySite(db)) out.push({ date: f.date, siteId: f.siteId, head: 'VEHICLE', amount: f.amount, source: 'Fuel (FUEL-09)' });
    for (const h of hireBills(db)) for (const [s, amt] of Object.entries(h.bySite)) out.push({ date: h.billDate, siteId: s, head: 'VEHICLE', amount: amt * (h.net / (h.gross || 1)), source: 'Hire bills (HIRE-02)' });
    for (const i of internalHireBySite(db)) out.push({ date: i.date, siteId: i.siteId, head: 'VEHICLE', amount: i.amount, source: 'Internal hire rate (VEH-05)' });
    for (const m of maintenanceCostByVehicle(db)) {
      const v = lookup(db).vehicle[m.vehicleId];
      if (v?.siteId) out.push({ date: m.date, siteId: v.siteId, head: 'VEHICLE', amount: m.amount, source: 'Maintenance & spares' });
    }
    for (const e of db.expenses) {
      if (e.status === 'REJECTED' || e.status === 'CANCELLED') continue;
      if (excludePending && e.status !== 'APPROVED') continue;
      out.push({ date: e.date, siteId: e.siteId, head: 'MISC', amount: e.amount, source: 'Expenses (EXP-02)' });
    }
    for (const o of overheadAllocation(db)) out.push({ date: `${o.month}-15` > today() ? today() : `${o.month}-15`, siteId: o.siteId, head: 'OVERHEAD', amount: o.amount, source: 'HO overhead allocation (EXP-05)' });
    return out;
  });
}

export function siteCostSheet(db: DB, siteId: ID, r?: Range) {
  return memo(db, `csheet|${siteId}|${r?.from}|${r?.to}`, () => {
    const site = lookup(db).site[siteId]!;
    const heads = Object.fromEntries(COST_HEADS.map((h) => [h, 0])) as Record<CostHead, number>;
    const sources: Record<string, number> = {};
    for (const c of costEntries(db)) {
      if (c.siteId !== siteId || !inRange(c.date, r)) continue;
      heads[c.head] += c.amount;
      sources[c.source] = (sources[c.source] || 0) + c.amount;
    }
    if (!r) for (const h of COST_HEADS) heads[h] += site.openingCost[h] || 0;
    const cost = sum(COST_HEADS, (h) => heads[h]);
    const workDone = sum(db.measurements.filter((m) => m.siteId === siteId && inRange(m.date, r)), (m) => m.qty * (lookup(db).boq[m.boqItemId]?.rate || 0));
    const bills = db.raBills.filter((b) => b.siteId === siteId && inRange(b.date, r));
    const billed = sum(bills, (b) => raCalc(b).gross);
    const received = sum(db.raBills.filter((b) => b.siteId === siteId), (b) => sum(b.receipts.filter((x) => inRange(x.date, r)), (x) => x.amount));
    const profit = workDone - cost;
    return { siteId, heads, sources, cost, workDone, billed, received, profit, margin: workDone ? (profit / workDone) * 100 : 0, budget: site.budget, budgetTotal: sum(COST_HEADS, (h) => site.budget[h]) };
  });
}

/* ================= Approvals (§2.4) ================= */

export interface ApprovalItem {
  id: ID;
  collection: 'stockTxns' | 'requisitions' | 'pos' | 'expenses' | 'fuelIssues' | 'imprests' | 'subconBills';
  module: string;
  title: string;
  detail: string;
  amount?: number;
  siteId?: ID;
  date: string;
  createdAt: string;
  createdBy: ID;
  link: string;
}
export function pendingApprovals(db: DB): ApprovalItem[] {
  return memo(db, 'approvals', () => {
    const lk = lookup(db);
    const out: ApprovalItem[] = [];
    const L = getLedger(db);
    const txnLabel: Record<string, string> = { ISSUE: 'Material issue', WASTAGE: 'Wastage / damage', ADJUSTMENT: 'Stock adjustment', CONSUMPTION: 'Consumption (back-dated)', TRANSFER: 'Site transfer', RETURN: 'Return to store', GRN: 'GRN' };
    for (const t of db.stockTxns.filter((x) => x.status === 'PENDING')) {
      const store = lk.store[t.fromStoreId || t.toStoreId!];
      const amt = sum(t.lines, (l) => Math.abs(l.qty) * (L.balances.get(bkey(t.fromStoreId || t.toStoreId!, l.materialId))?.value || 0) / Math.max(1e-9, L.balances.get(bkey(t.fromStoreId || t.toStoreId!, l.materialId))?.qty || 1));
      out.push({ id: t.id, collection: 'stockTxns', module: 'Inventory', title: `${txnLabel[t.type] || t.type} ${t.no}`, detail: `${t.lines.map((l) => `${lk.material[l.materialId]?.name} ${round(l.qty, 2)} ${lk.material[l.materialId]?.unit}`).join(', ')} · ${store?.name || ''}${t.reason ? ` · ${t.reason}` : ''}`, amount: amt, siteId: store?.siteId, date: t.date, createdAt: t.createdAt, createdBy: t.createdBy, link: '/inventory/transactions' });
    }
    for (const r of db.requisitions.filter((x) => x.status === 'PENDING')) out.push({ id: r.id, collection: 'requisitions', module: 'Purchase', title: `Requisition ${r.no}`, detail: `${r.lines.map((l) => `${lk.material[l.materialId]?.name} ${l.qty} ${lk.material[l.materialId]?.unit}`).join(', ')} · ${lk.store[r.storeId]?.name} · ${r.purpose}`, siteId: lk.store[r.storeId]?.siteId, date: r.date, createdAt: r.createdAt, createdBy: r.createdBy, link: '/purchase/requisitions' });
    for (const p of db.pos.filter((x) => x.status === 'PENDING')) out.push({ id: p.id, collection: 'pos', module: 'Purchase', title: `Purchase order ${p.no}`, detail: `${lk.supplier[p.supplierId]?.name} · ${p.lines.map((l) => `${lk.material[l.materialId]?.name} ${l.qty}`).join(', ')}`, amount: poValue(p.lines), siteId: lk.store[p.deliveryStoreId]?.siteId, date: p.date, createdAt: p.createdAt, createdBy: p.createdBy, link: '/purchase/orders' });
    for (const e of db.expenses.filter((x) => x.status === 'PENDING')) out.push({ id: e.id, collection: 'expenses', module: 'Expenses', title: `Expense ${e.no}`, detail: `${lk.head[e.headId]?.head} › ${lk.head[e.headId]?.subHead} · paid to ${e.paidTo}`, amount: e.amount, siteId: e.siteId, date: e.date, createdAt: e.createdAt, createdBy: e.createdBy, link: '/expenses/entries' });
    for (const f of db.fuelIssues.filter((x) => x.status === 'PENDING')) out.push({ id: f.id, collection: 'fuelIssues', module: 'Fleet', title: `Fuel issue ${f.no}`, detail: `${lk.vehicle[f.vehicleId]?.code} · ${f.litres} L${f.flag ? ` · ⚠ ${f.flag}` : ''}`, amount: f.litres * f.rate, siteId: f.siteId, date: f.date, createdAt: f.createdAt, createdBy: f.createdBy, link: '/fleet/fuel' });
    for (const i of db.imprests.filter((x) => x.status === 'PENDING')) out.push({ id: i.id, collection: 'imprests', module: 'Expenses', title: `Cash top-up ${i.no}`, detail: `${lk.site[i.siteId]?.short} · ${i.remark}`, amount: i.amount, siteId: i.siteId, date: i.date, createdAt: i.createdAt, createdBy: i.createdBy, link: '/expenses/petty-cash' });
    for (const b of db.subconBills.filter((x) => x.status === 'PENDING')) {
      const wo = lk.workOrder[b.workOrderId];
      out.push({ id: b.id, collection: 'subconBills', module: 'Labour', title: `Sub-contractor bill ${b.no}`, detail: `${lk.subcon[wo?.subContractorId || '']?.name} · ${b.lines.length} items`, amount: subconBillCalc(db, b).net, siteId: wo?.siteId, date: b.date, createdAt: b.createdAt, createdBy: b.createdBy, link: '/labour/subcontract' });
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

/* ================= Alerts (§11.3) ================= */

export interface Alert {
  id: string;
  code: 'ALT-01' | 'ALT-02' | 'ALT-03' | 'ALT-04' | 'ALT-05' | 'ALT-06' | 'ALT-07';
  severity: 'critical' | 'serious' | 'warning';
  title: string;
  detail: string;
  siteId?: ID;
  link: string;
}
export function alerts(db: DB): Alert[] {
  return memo(db, 'alerts', () => {
    const lk = lookup(db);
    const out: Alert[] = [];
    // ALT-01
    for (const l of lowStock(db)) {
      const m = lk.material[l.materialId]!;
      const st = lk.store[l.storeId]!;
      out.push({ id: `a1-${l.storeId}-${l.materialId}`, code: 'ALT-01', severity: l.qty <= 0 ? 'critical' : 'warning', title: `${m.name} below minimum at ${st.name}`, detail: `In stock ${round(l.qty, 2)} ${m.unit} · minimum ${l.min} ${m.unit} · reorder ${l.reorder} ${m.unit}`, siteId: st.siteId, link: '/inventory/stock' });
    }
    // ALT-02 material variance (last 30 days)
    const r30 = { from: addDays(today(), -30), to: today() };
    for (const t of theoreticalVsActual(db, r30).filter((x) => x.breach)) {
      const m = lk.material[t.materialId]!;
      out.push({ id: `a2-${t.siteId}-${t.materialId}`, code: 'ALT-02', severity: t.diffPct > t.tolerance * 2 ? 'serious' : 'warning', title: `${m.name} over-consumed at ${lk.site[t.siteId]?.short}`, detail: `+${t.diffPct.toFixed(1)}% vs recipe (tolerance ±${t.tolerance}%) · excess ${round(t.diff, 2)} ${m.unit} in last 30 days`, siteId: t.siteId, link: '/inventory/variance' });
    }
    // ALT-02 fuel variance
    for (const e of vehicleEfficiencySummary(db, r30).filter((x) => x.variancePct > db.settings.tolerance.fuel)) {
      const v = lk.vehicle[e.vehicleId]!;
      out.push({ id: `a2f-${e.vehicleId}`, code: 'ALT-02', severity: e.variancePct > db.settings.tolerance.fuel * 1.6 ? 'serious' : 'warning', title: `Fuel variance ${v.code} (${v.type})`, detail: `${e.actual.toFixed(2)} ${e.unit} vs standard ${e.standard} · ${e.variancePct.toFixed(1)}% over · ${round(e.variance)} L extra`, siteId: v.siteId, link: '/fleet/efficiency' });
    }
    // ALT-02 plant raw-material variance
    for (const p of db.plants) {
      const rec = plantReconciliation(db, p.id, monthOf(today())).filter((x) => x.physicalFromStockpile && x.lossPct > db.settings.tolerance.plant);
      for (const x of rec) out.push({ id: `a2p-${p.id}-${x.materialId}`, code: 'ALT-02', severity: 'warning', title: `Unexplained loss of ${lk.material[x.materialId]?.name} at ${p.code}`, detail: `${round(x.loss, 2)} ${lk.material[x.materialId]?.unit} (${x.lossPct.toFixed(1)}%) this month vs stockpile measurement`, link: '/plant/reconciliation' });
    }
    // ALT-03 documents / licences / service
    for (const d of docExpiries(db).filter((x) => x.days <= 30)) {
      const v = lk.vehicle[d.vehicleId]!;
      out.push({ id: `a3-${d.vehicleId}-${d.type}`, code: 'ALT-03', severity: d.days < 0 ? 'critical' : d.days <= 7 ? 'serious' : 'warning', title: `${d.type} ${d.days < 0 ? 'expired' : 'expiring'} — ${v.code} ${v.regNo}`, detail: d.days < 0 ? `Expired ${-d.days} days ago` : `Expires in ${d.days} days`, siteId: v.siteId, link: '/fleet/documents' });
    }
    for (const s of serviceDue(db).filter((x) => x.status !== 'OK')) {
      const v = lk.vehicle[s.vehicleId]!;
      out.push({ id: `a3s-${s.vehicleId}`, code: 'ALT-03', severity: s.status === 'OVERDUE' ? 'serious' : 'warning', title: `Service ${s.status === 'OVERDUE' ? 'overdue' : 'due'} — ${v.code}`, detail: `${s.since} ${v.meterType === 'HOURS' ? 'hrs' : 'km'} since last service (interval ${v.serviceEvery})`, siteId: v.siteId, link: '/fleet/maintenance' });
    }
    for (const c of db.subcons.filter((x) => x.licenceExpiry)) {
      const d = daysBetween(today(), c.licenceExpiry!);
      if (d <= 30) out.push({ id: `a3l-${c.id}`, code: 'ALT-03', severity: d < 0 ? 'critical' : 'warning', title: `Labour licence ${d < 0 ? 'expired' : 'expiring'} — ${c.name}`, detail: `${c.licenceNo} · ${d < 0 ? `expired ${-d} days ago` : `expires in ${d} days`}`, link: '/labour/compliance' });
    }
    // ALT-04 pending approvals > 24h
    const old = pendingApprovals(db).filter((a) => Date.now() - new Date(a.createdAt).getTime() > 86400000);
    if (old.length) out.push({ id: 'a4', code: 'ALT-04', severity: 'serious', title: `${old.length} approvals pending for more than 24 hours`, detail: old.slice(0, 3).map((a) => a.title).join(' · '), link: '/approvals' });
    // ALT-05 missing daily entries today
    const t = today();
    const now = new Date();
    for (const s of db.sites.filter((x) => x.status === 'ACTIVE')) {
      if (!db.attendance.some((a) => a.siteId === s.id && a.date === t) && now.getHours() >= db.settings.attendanceLockHour - 1)
        out.push({ id: `a5a-${s.id}`, code: 'ALT-05', severity: 'warning', title: `No attendance entered today — ${s.short}`, detail: `Expected by ${db.settings.attendanceLockHour}:00. Site engineer: ${lk.user[s.engineerId || '']?.name || '—'}`, siteId: s.id, link: '/labour/attendance' });
      const y = addDays(t, -1);
      const veh = db.vehicles.filter((v) => v.siteId === s.id && v.status === 'WORKING');
      const missing = veh.filter((v) => !db.logs.some((l) => l.vehicleId === v.id && l.date === y));
      if (missing.length >= 2) out.push({ id: `a5l-${s.id}`, code: 'ALT-05', severity: 'warning', title: `Logbook missing for ${missing.length} machines yesterday — ${s.short}`, detail: missing.map((v) => v.code).join(', '), siteId: s.id, link: '/fleet/logbook' });
    }
    // ALT-06 cost vs budget / work done
    for (const s of db.sites) {
      const cs = siteCostSheet(db, s.id);
      if (cs.cost > cs.workDone) out.push({ id: `a6-${s.id}`, code: 'ALT-06', severity: 'critical', title: `Cost exceeds value of work done — ${s.short}`, detail: `Cost to date ${(cs.cost / 1e7).toFixed(2)} Cr vs work done ${(cs.workDone / 1e7).toFixed(2)} Cr`, siteId: s.id, link: '/contract/costing' });
      for (const h of COST_HEADS) {
        const pctOfBudget = cs.budget[h] ? (cs.heads[h] / cs.budget[h]) * 100 : 0;
        const progress = (cs.workDone / s.contractValue) * 100;
        if (cs.budget[h] && pctOfBudget > progress + 15 && cs.heads[h] > 500000) out.push({ id: `a6b-${s.id}-${h}`, code: 'ALT-06', severity: 'warning', title: `${COST_HEAD_LABEL[h]} cost running ahead of budget — ${s.short}`, detail: `${pctOfBudget.toFixed(0)}% of budget used at ${progress.toFixed(0)}% physical progress`, siteId: s.id, link: '/contract/budget' });
      }
    }
    // ALT-07 payables / receivables
    const pay = payablesAgeing(db).filter((p) => p.overdue > 0);
    if (pay.length) out.push({ id: 'a7p', code: 'ALT-07', severity: 'serious', title: `${pay.length} suppliers have overdue payments`, detail: pay.slice(0, 3).map((p) => `${lk.supplier[p.supplierId]?.code} ₹${Math.round(p.overdue).toLocaleString('en-IN')}`).join(' · '), link: '/purchase/payables' });
    const rec = receivablesAgeing(db).filter((x) => x.age > 45);
    if (rec.length) out.push({ id: 'a7r', code: 'ALT-07', severity: 'warning', title: `${rec.length} RA bills overdue from clients (> 45 days)`, detail: rec.slice(0, 3).map((x) => `${x.billNo}`).join(' · '), link: '/contract/receivables' });
    const order = { critical: 0, serious: 1, warning: 2 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  });
}

/* ================= Dashboard (§11.1) ================= */

export function siteCards(db: DB) {
  return memo(db, 'siteCards', () =>
    db.sites.map((s) => {
      const cs = siteCostSheet(db, s.id);
      const lk = lookup(db);
      const st = lk.siteStore[s.id]!;
      return { site: s, client: lk.client[s.clientId], workDonePct: (cs.workDone / s.contractValue) * 100, ...cs, stockValue: storeValue(db, st) };
    }),
  );
}

export function todaySummary(db: DB, date = today()) {
  return memo(db, `todaySum|${date}`, () => {
    const lab = labourCostRows(db).filter((r) => r.date === date);
    const L = getLedger(db);
    const recv = L.movements.filter((m) => m.date === date && m.qty > 0 && m.siteId && m.kind !== 'Opening');
    const cons = L.movements.filter((m) => m.date === date && m.kind === 'Consumption');
    const fuel = db.fuelIssues.filter((f) => f.date === date);
    const exp = db.expenses.filter((e) => e.date === date);
    const prod = db.production.filter((p) => p.date === date);
    const disp = db.dispatches.filter((d) => d.date === date);
    return {
      headcount: sum(lab, (r) => r.headcount),
      labourCost: sum(lab, (r) => r.cost),
      receivedValue: sum(recv, (m) => m.value),
      consumedValue: -sum(cons, (m) => m.value),
      fuelLitres: sum(fuel, (f) => f.litres),
      fuelValue: sum(fuel, (f) => f.litres * f.rate),
      expenses: sum(exp, (e) => e.amount),
      production: prod,
      dispatches: disp,
    };
  });
}

/** Months covered by data, oldest first */
export function dataMonths(db: DB) {
  return memo(db, 'months', () => {
    const s = new Set<string>();
    for (const t of db.stockTxns) s.add(monthOf(t.date));
    return [...s].sort();
  });
}

export const effectiveTxn = isEffective;
export type { StockTxn };

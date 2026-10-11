import type { DB, ID, Production, StockTxn } from './types';
import { monthOf } from '../lib/format';
import { round } from '../lib/utils';

/**
 * Stock ledger engine (§4, §5, §9).
 * Every stock-moving document is expanded into movements; movements are processed day by day
 * (receipts before issues within a day) and valued by weighted average (default) or FIFO (MAT-11).
 */

export type MvKind =
  | 'Opening'
  | 'GRN'
  | 'Receipt from store'
  | 'Issue'
  | 'Transfer in'
  | 'Transfer out'
  | 'Return in'
  | 'Return out'
  | 'Consumption'
  | 'Wastage'
  | 'Adjustment'
  | 'Plant receipt'
  | 'Production in'
  | 'Production use'
  | 'Dispatch'
  | 'Spares to vehicle';

export interface Movement {
  date: string;
  storeId: ID;
  materialId: ID;
  qty: number; // +in / -out
  rate: number;
  value: number; // signed
  kind: MvKind;
  ref: string;
  refId: ID;
  counterStoreId?: ID;
  siteId?: ID;
  boqItemId?: ID;
  vehicleId?: ID;
  plantId?: ID;
  productionId?: ID;
  phase: 0 | 1 | 2; // 0 external inbound, 1 internal inbound, 2 outbound
  pairOut?: { storeId: ID; qty: number }; // internal transfer: the sender leg processed atomically
}

export interface Balance {
  qty: number;
  value: number;
}

export interface PlantUnitCost {
  plantId: ID;
  month: string;
  productId: ID;
  qty: number;
  rmValue: number;
  runningShare: number;
  unitCost: number;
}

export interface LedgerResult {
  movements: Movement[];
  balances: Map<string, Balance>;
  plantCosts: PlantUnitCost[];
  unitCost: (plantId: ID, productId: ID, month: string) => number;
  storeSite: Record<ID, ID | undefined>;
}

export const bkey = (storeId: ID, materialId: ID) => `${storeId}|${materialId}`;

export const isEffective = (t: StockTxn) => t.status === 'POSTED' || t.status === 'APPROVED';

export const FUEL_RATE = { HSD: 92, FO: 58 };
export const POWER_RATE = 9.5; // ₹ per DG unit

/** raw-material lines actually consumed by a production entry (PLT-06: actual overrides theoretical) */
export function productionUse(db: DB, p: Production): Array<{ materialId: ID; qty: number; theoretical: number }> {
  const rec = db.recipes.find((r) => r.id === p.recipeId);
  const plant = db.plants.find((x) => x.id === p.plantId);
  if (!rec) return [];
  if (plant?.type === 'CRUSHER') return [{ materialId: rec.productId, qty: p.qty, theoretical: p.qty }];
  return rec.lines.map((l) => {
    const theoretical = round(l.qty * p.qty, 3);
    const act = p.actual?.find((a) => a.materialId === l.materialId);
    return { materialId: l.materialId, qty: act ? act.qty : theoretical, theoretical };
  });
}

/** product output(s) of a production entry */
export function productionOutput(db: DB, p: Production): Array<{ materialId: ID; qty: number }> {
  const plant = db.plants.find((x) => x.id === p.plantId);
  if (plant?.type === 'CRUSHER') {
    if (p.actual?.length) return p.actual;
    const rec = db.recipes.find((r) => r.id === p.recipeId);
    return (rec?.split || []).map((s) => ({ materialId: s.materialId, qty: round((p.qty * s.pct) / 100, 2) }));
  }
  return [{ materialId: p.productId, qty: round(p.qty - (p.rejectedQty || 0), 2) }];
}

function buildMovements(db: DB, unitCost: (plantId: ID, productId: ID, month: string) => number): Movement[] {
  const out: Movement[] = [];
  const storeSite: Record<string, string | undefined> = {};
  db.stores.forEach((s) => (storeSite[s.id] = s.siteId));
  const mk = (m: Omit<Movement, 'value' | 'rate'> & { rate?: number }): Movement => ({ rate: 0, value: 0, ...m, siteId: m.siteId ?? storeSite[m.storeId] });

  for (const t of db.stockTxns) {
    if (!isEffective(t)) continue;
    const recvDate = t.receivedAt ? t.receivedAt.slice(0, 10) : t.date;
    for (const l of t.lines) {
      const base = { materialId: l.materialId, ref: t.no, refId: t.id };
      switch (t.type) {
        case 'OPENING':
          out.push(mk({ ...base, date: t.date, storeId: t.toStoreId!, qty: l.qty, rate: l.rate, kind: 'Opening', phase: 0 }));
          break;
        case 'GRN':
          out.push(mk({ ...base, date: t.date, storeId: t.toStoreId!, qty: l.qty, rate: l.rate, kind: 'GRN', phase: 0 }));
          break;
        case 'ISSUE':
        case 'TRANSFER':
        case 'RETURN': {
          const outKind = t.type === 'ISSUE' ? (t.issueToVehicleId ? 'Spares to vehicle' : 'Issue') : t.type === 'TRANSFER' ? 'Transfer out' : 'Return out';
          const inKind = t.type === 'ISSUE' ? 'Receipt from store' : t.type === 'TRANSFER' ? 'Transfer in' : 'Return in';
          if (t.toStoreId) {
            out.push(mk({ ...base, date: recvDate, storeId: t.toStoreId, qty: l.qty, kind: inKind, counterStoreId: t.fromStoreId, phase: 1, pairOut: { storeId: t.fromStoreId!, qty: l.qty } }));
            // the sender leg is materialised by the engine when the pair is processed
            out.push(mk({ ...base, date: recvDate, storeId: t.fromStoreId!, qty: -l.qty, kind: outKind, counterStoreId: t.toStoreId, phase: 1 }));
          } else {
            out.push(mk({ ...base, date: t.date, storeId: t.fromStoreId!, qty: -l.qty, kind: outKind, vehicleId: t.issueToVehicleId, phase: 2 }));
          }
          break;
        }
        case 'CONSUMPTION':
          out.push(mk({ ...base, date: t.date, storeId: t.fromStoreId!, qty: -l.qty, kind: 'Consumption', boqItemId: t.boqItemId, phase: 2 }));
          break;
        case 'WASTAGE':
          out.push(mk({ ...base, date: t.date, storeId: t.fromStoreId!, qty: -l.qty, kind: 'Wastage', phase: 2 }));
          break;
        case 'ADJUSTMENT':
          out.push(mk({ ...base, date: t.date, storeId: t.fromStoreId || t.toStoreId!, qty: l.qty, kind: 'Adjustment', phase: l.qty >= 0 ? 0 : 2 }));
          break;
        case 'PLANT_RECEIPT':
          out.push(mk({ ...base, date: t.date, storeId: t.toStoreId!, qty: l.qty, rate: l.rate, kind: 'Plant receipt', phase: 0 }));
          break;
      }
    }
  }

  const plantStore: Record<string, string> = {};
  db.plants.forEach((p) => (plantStore[p.id] = p.storeId));

  for (const p of db.production) {
    const store = plantStore[p.plantId]!;
    for (const u of productionUse(db, p)) {
      out.push(mk({ date: p.date, storeId: store, materialId: u.materialId, qty: -u.qty, kind: 'Production use', ref: p.no, refId: p.id, plantId: p.plantId, productionId: p.id, phase: 2 }));
    }
    const mo = monthOf(p.date);
    for (const o of productionOutput(db, p)) {
      out.push(mk({ date: p.date, storeId: store, materialId: o.materialId, qty: o.qty, rate: unitCost(p.plantId, o.materialId, mo), kind: 'Production in', ref: p.no, refId: p.id, plantId: p.plantId, productionId: p.id, phase: 0 }));
    }
  }

  for (const d of db.dispatches) {
    const from = plantStore[d.plantId]!;
    const mo = monthOf(d.date);
    const rate = unitCost(d.plantId, d.productId, mo);
    out.push(mk({ date: d.date, storeId: from, materialId: d.productId, qty: -d.qty, rate, kind: 'Dispatch', ref: d.no, refId: d.id, plantId: d.plantId, siteId: d.siteId, phase: 2 }));
    if (d.status === 'RECEIVED' && d.receivedQty) {
      const toStore = d.siteId ? db.stores.find((s) => s.siteId === d.siteId)?.id : d.toPlantId ? plantStore[d.toPlantId] : undefined;
      if (toStore) {
        out.push(mk({ date: (d.receivedAt || d.date).slice(0, 10), storeId: toStore, materialId: d.productId, qty: d.receivedQty, rate, kind: 'Plant receipt', ref: d.no, refId: d.id, plantId: d.plantId, counterStoreId: from, phase: 0 }));
      }
    }
  }

  out.sort((a, b) => (a.date === b.date ? a.phase - b.phase : a.date < b.date ? -1 : 1));
  return out;
}

function value(db: DB, movs: Movement[]): Map<string, Balance> {
  const fifo = db.settings.valuation === 'FIFO';
  const bal = new Map<string, Balance>();
  const lots = new Map<string, Array<{ qty: number; rate: number }>>();
  const get = (k: string) => {
    let b = bal.get(k);
    if (!b) bal.set(k, (b = { qty: 0, value: 0 }));
    return b;
  };
  const take = (k: string, q: number): number => {
    // returns value taken
    const b = get(k);
    if (!fifo) {
      const avg = b.qty > 0 ? b.value / b.qty : 0;
      const v = q * avg;
      b.qty = round(b.qty - q, 6);
      b.value = b.qty <= 1e-9 ? 0 : b.value - v;
      return v;
    }
    const ls = lots.get(k) || [];
    let left = q;
    let v = 0;
    while (left > 1e-9 && ls.length) {
      const lot = ls[0]!;
      const use = Math.min(lot.qty, left);
      v += use * lot.rate;
      lot.qty -= use;
      left -= use;
      if (lot.qty <= 1e-9) ls.shift();
    }
    if (left > 1e-9) v += left * (b.qty > 0 ? b.value / b.qty : 0);
    b.qty = round(b.qty - q, 6);
    b.value = b.qty <= 1e-9 ? 0 : b.value - v;
    lots.set(k, ls);
    return v;
  };
  const put = (k: string, q: number, rate: number) => {
    const b = get(k);
    b.qty = round(b.qty + q, 6);
    b.value += q * rate;
    if (fifo) {
      const ls = lots.get(k) || [];
      ls.push({ qty: q, rate });
      lots.set(k, ls);
    }
  };

  const paired = new Set<Movement>();
  for (let i = 0; i < movs.length; i++) {
    const m = movs[i]!;
    const k = bkey(m.storeId, m.materialId);
    if (m.phase === 1 && m.qty < 0) {
      // sender leg — handled with its pair
      if (!paired.has(m)) {
        const v = take(k, -m.qty);
        m.value = -v;
        m.rate = -m.qty > 0 ? v / -m.qty : 0;
      }
      continue;
    }
    if (m.pairOut) {
      const sk = bkey(m.pairOut.storeId, m.materialId);
      const v = take(sk, m.pairOut.qty);
      const rate = m.pairOut.qty > 0 ? v / m.pairOut.qty : 0;
      // find and mark the sender leg
      for (let j = i + 1; j < Math.min(movs.length, i + 3); j++) {
        const s = movs[j]!;
        if (s.refId === m.refId && s.materialId === m.materialId && s.qty < 0 && s.storeId === m.pairOut.storeId) {
          s.value = -v;
          s.rate = rate;
          paired.add(s);
          break;
        }
      }
      m.rate = rate;
      m.value = v;
      put(k, m.qty, rate);
      continue;
    }
    if (m.qty >= 0) {
      let rate = m.rate;
      if (m.kind === 'Adjustment') {
        const b = get(k);
        rate = b.qty > 0 ? b.value / b.qty : (db.materials.find((x) => x.id === m.materialId)?.stdRate ?? 0);
      }
      m.rate = rate;
      m.value = m.qty * rate;
      put(k, m.qty, rate);
    } else {
      const v = take(k, -m.qty);
      m.value = -v;
      m.rate = v / -m.qty;
    }
  }
  return bal;
}

function plantUnitCosts(db: DB, movs: Movement[]): PlantUnitCost[] {
  // raw-material value consumed per production entry
  const rmByProd = new Map<string, number>();
  for (const m of movs) if (m.kind === 'Production use' && m.productionId) rmByProd.set(m.productionId, (rmByProd.get(m.productionId) || 0) - m.value);
  const out: PlantUnitCost[] = [];
  const groups = new Map<string, Production[]>();
  for (const p of db.production) {
    const k = `${p.plantId}|${monthOf(p.date)}`;
    (groups.get(k) || groups.set(k, []).get(k)!).push(p);
  }
  for (const [k, prods] of groups) {
    const [plantId, month] = k.split('|') as [string, string];
    const plant = db.plants.find((x) => x.id === plantId)!;
    const pc = db.plantCosts.find((c) => c.plantId === plantId && c.month === month);
    const fuelRate = plant.type === 'HOT_MIX' ? FUEL_RATE.FO : FUEL_RATE.HSD;
    const running =
      prods.reduce((s, p) => s + p.fuelUsed * fuelRate + p.dgUnits * POWER_RATE, 0) +
      (pc ? pc.labour + pc.power + pc.machinery + pc.maintenance + pc.overhead : 0);
    const byProduct = new Map<string, { qty: number; rm: number }>();
    let totalQty = 0;
    for (const p of prods) {
      const outs = productionOutput(db, p);
      const outQty = outs.reduce((s, o) => s + o.qty, 0);
      const rm = rmByProd.get(p.id) || 0;
      for (const o of outs) {
        const e = byProduct.get(o.materialId) || { qty: 0, rm: 0 };
        e.qty += o.qty;
        e.rm += outQty > 0 ? (rm * o.qty) / outQty : 0;
        byProduct.set(o.materialId, e);
        totalQty += o.qty;
      }
    }
    for (const [productId, e] of byProduct) {
      const runningShare = totalQty > 0 ? (running * e.qty) / totalQty : 0;
      out.push({ plantId, month, productId, qty: round(e.qty, 2), rmValue: e.rm, runningShare, unitCost: e.qty > 0 ? (e.rm + runningShare) / e.qty : 0 });
    }
  }
  return out;
}

const cache = new WeakMap<DB, LedgerResult>();

export function getLedger(db: DB): LedgerResult {
  const hit = cache.get(db);
  if (hit) return hit;
  const std: Record<string, number> = {};
  db.materials.forEach((m) => (std[m.id] = m.stdRate));
  let costs: PlantUnitCost[] = [];
  let lookup = (_p: ID, productId: ID, _m: string) => std[productId] || 0;
  let movs: Movement[] = [];
  let balances = new Map<string, Balance>();
  // three passes: crusher → hot-mix / batching → sites
  for (let pass = 0; pass < 3; pass++) {
    movs = buildMovements(db, lookup);
    balances = value(db, movs);
    costs = plantUnitCosts(db, movs);
    const idx = new Map(costs.map((c) => [`${c.plantId}|${c.productId}|${c.month}`, c.unitCost]));
    const byProduct = new Map<string, number>();
    costs.forEach((c) => byProduct.set(`${c.plantId}|${c.productId}`, c.unitCost));
    lookup = (plantId, productId, month) => {
      const plant = db.plants.find((p) => p.id === plantId);
      if (plant?.costMode === 'FIXED' && plant.fixedRate[productId]) return plant.fixedRate[productId]!;
      return idx.get(`${plantId}|${productId}|${month}`) ?? byProduct.get(`${plantId}|${productId}`) ?? std[productId] ?? 0;
    };
  }
  const storeSite: Record<ID, ID | undefined> = {};
  db.stores.forEach((s) => (storeSite[s.id] = s.siteId));
  const res: LedgerResult = { movements: movs, balances, plantCosts: costs, unitCost: lookup, storeSite };
  cache.set(db, res);
  return res;
}

/** Quantity available at `storeId` for `materialId` at the end of `date`, and the lowest closing
 * balance from that date onward (back-dated entries must not push any later day negative — MAT-10). */
export function availability(db: DB, storeId: ID, materialId: ID, date: string): { onDate: number; minAfter: number; current: number } {
  const L = getLedger(db);
  let run = 0;
  let onDate = 0;
  let minAfter = Infinity;
  let lastDate = '';
  const close = () => {
    if (lastDate >= date) minAfter = Math.min(minAfter, run);
  };
  for (const m of L.movements) {
    if (m.storeId !== storeId || m.materialId !== materialId) continue;
    if (m.date !== lastDate) {
      if (lastDate) close();
      lastDate = m.date;
    }
    run += m.qty;
    if (m.date <= date) onDate = run;
  }
  if (lastDate) close();
  if (minAfter === Infinity) minAfter = run;
  return { onDate: round(onDate, 4), minAfter: round(Math.min(minAfter, onDate), 4), current: round(run, 4) };
}

export function avgRate(db: DB, storeId: ID, materialId: ID): number {
  const b = getLedger(db).balances.get(bkey(storeId, materialId));
  if (b && b.qty > 0) return b.value / b.qty;
  return db.materials.find((m) => m.id === materialId)?.stdRate ?? 0;
}

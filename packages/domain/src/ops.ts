import type { DB, ID, Loan, Production, SalesInvoice, Site } from './types.js';
import { availability, getLedger, productionUse } from './ledger.js';
import { gstSplit } from './billing.js';
import { addDays, daysBetween, monthOf, today } from './format.js';
import { plantStaffCost } from './staffpay.js';
import { round, sum } from './utils.js';
import { addMonths, currentCompletion } from './works.js';

/** Phase 3 (Operations): plant, stores, fleet and site-progress calculations. */

const r2 = (x: number) => Math.round(x * 100) / 100;
const mat = (db: DB, id?: ID) => db.materials.find((m) => m.id === id);
const isBitumen = (db: DB, id: ID) => mat(db, id)?.category === 'Bitumen' && !/emulsion/i.test(mat(db, id)?.name || '');

/* ---------------- Query 3 rule 2 / test 1: tank dips against book stock ---------------- */
export function dipRows(db: DB, opts: { storeId?: ID; from?: string; to?: string } = {}) {
  return db.tankDips
    .filter((d) => (!opts.storeId || d.storeId === opts.storeId) && (!opts.from || d.date >= opts.from) && (!opts.to || d.date <= opts.to))
    .map((d) => {
      const book = round(availability(db, d.storeId, d.materialId, d.date).onDate, 3);
      const diff = round(d.qty - book, 3);
      const m = mat(db, d.materialId);
      const tol = m?.category === 'Bitumen' ? db.settings.tolerance.bitumen : m?.category === 'Fuel & Lubricants' ? db.settings.tolerance.fuel : db.settings.tolerance.default;
      const pct = book ? round((diff / book) * 100, 2) : 0;
      return { dip: d, book, diff, pct, tolerance: tol, ok: Math.abs(pct) <= tol || Math.abs(diff) < 0.001 };
    })
    .sort((a, b) => b.dip.date.localeCompare(a.dip.date));
}

/** one day of a plant store: opening + received − used in production − other out = closing book, against the dip */
export function plantDay(db: DB, plantId: ID, date: string) {
  const plant = db.plants.find((p) => p.id === plantId);
  if (!plant) return [];
  const storeId = plant.storeId;
  const L = getLedger(db);
  const mv = L.movements.filter((m) => m.storeId === storeId && m.date === date);
  const mats = new Set<ID>([...mv.map((m) => m.materialId), ...db.tankDips.filter((d) => d.storeId === storeId && d.date === date).map((d) => d.materialId)]);
  for (const loc of db.stores.find((s) => s.id === storeId)?.locations || []) mats.add(loc.materialId);
  return [...mats]
    .map((materialId) => {
      const m = mv.filter((x) => x.materialId === materialId);
      const opening = round(availability(db, storeId, materialId, addDays(date, -1)).onDate, 3);
      const closing = round(availability(db, storeId, materialId, date).onDate, 3);
      const received = round(sum(m.filter((x) => x.qty > 0 && x.kind !== 'Production in'), (x) => x.qty), 3);
      const produced = round(sum(m.filter((x) => x.kind === 'Production in'), (x) => x.qty), 3);
      const used = round(-sum(m.filter((x) => x.kind === 'Production use'), (x) => x.qty), 3);
      const dispatched = round(-sum(m.filter((x) => x.kind === 'Dispatch'), (x) => x.qty), 3);
      const otherOut = round(opening + received + produced - used - dispatched - closing, 3);
      const dips = db.tankDips.filter((d) => d.storeId === storeId && d.materialId === materialId && d.date === date);
      const dip = dips.length ? round(sum(dips, (d) => d.qty), 3) : undefined;
      return { materialId, unit: mat(db, materialId)?.unit || '', opening, received, produced, used, dispatched, otherOut, closing, dip, diff: dip === undefined ? undefined : round(dip - closing, 3) };
    })
    .filter((x) => x.opening || x.received || x.used || x.produced || x.dispatched || x.closing || x.dip !== undefined);
}

/* ---------------- HMP-02 ratios ---------------- */
export function productionRatios(db: DB, p: Production) {
  const plant = db.plants.find((x) => x.id === p.plantId);
  const rec = db.recipes.find((r) => r.id === p.recipeId);
  const use = productionUse(db, p);
  const qty = p.qty || 0;
  const bitumen = sum(use.filter((u) => isBitumen(db, u.materialId)), (u) => u.qty);
  const jmf = rec ? sum(rec.lines.filter((l) => isBitumen(db, l.materialId)), (l) => l.qty) * 100 : 0;
  const ldo = plant?.burnerFuelId ? sum(use.filter((u) => u.materialId === plant.burnerFuelId), (u) => u.qty) : 0;
  const diesel = plant?.dgFuelId ? sum(use.filter((u) => u.materialId === plant.dgFuelId), (u) => u.qty) : 0;
  const bitPct = qty ? round((bitumen / qty) * 100, 2) : 0;
  const tol = db.settings.tolerance.bitumen || 2;
  const flags: string[] = [];
  // bitumen content against the job-mix formula: allowed ± tolerance % of the JMF value
  if (jmf && Math.abs(bitPct - jmf) > (jmf * tol) / 100) flags.push(`Bitumen ${bitPct}% against JMF ${round(jmf, 2)}%`);
  const ldoPerMt = qty ? round(ldo / qty, 2) : 0;
  const dieselPerMt = qty ? round(diesel / qty, 2) : 0;
  if (plant?.ldoPerMtNorm && ldoPerMt > plant.ldoPerMtNorm * (1 + db.settings.tolerance.fuel / 100)) flags.push(`LDO ${ldoPerMt} L/MT against norm ${plant.ldoPerMtNorm}`);
  if (plant?.dieselPerMtNorm && dieselPerMt > plant.dieselPerMtNorm * (1 + db.settings.tolerance.fuel / 100)) flags.push(`Diesel ${dieselPerMt} L/MT against norm ${plant.dieselPerMtNorm}`);
  return { qty, bitumen: round(bitumen, 3), bitPct, jmfPct: round(jmf, 2), ldo, ldoPerMt, diesel, dieselPerMt, flags };
}

/* ---------------- HMP-04 sales ---------------- */
export function salesTotals(db: DB, inv: SalesInvoice) {
  const taxable = r2(sum(inv.lines, (l) => l.qty * l.rate));
  const gst = r2(sum(inv.lines, (l) => (l.qty * l.rate * l.gstPct) / 100));
  const firm = db.firms.find((f) => f.id === inv.firmId) || db.firms[0];
  const buyer = db.clients.find((c) => c.id === inv.buyerId);
  const split = gstSplit(firm?.gstin || '', buyer?.gstin || '', gst);
  const total = Math.round(taxable + gst);
  const received = sum(inv.receipts, (r) => r.amount);
  return { taxable, gst, ...split, total, received, outstanding: Math.max(0, total - received) };
}
export function buyerLedger(db: DB, buyerId: ID) {
  const rows: Array<{ date: string; ref: string; debit: number; credit: number }> = [];
  for (const inv of db.salesInvoices.filter((x) => x.buyerId === buyerId && x.status !== 'CANCELLED')) {
    rows.push({ date: inv.date, ref: inv.no, debit: salesTotals(db, inv).total, credit: 0 });
    for (const r of inv.receipts) rows.push({ date: r.date, ref: `${inv.no} · ${r.utr}`, debit: 0, credit: r.amount });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  return rows.map((r) => ((bal += r.debit - r.credit), { ...r, balance: r2(bal) }));
}
/** HMP-04: e-way bill data for the portal's bulk sheet */
export function ewayRow(db: DB, inv: SalesInvoice) {
  const t = salesTotals(db, inv);
  const firm = db.firms.find((f) => f.id === inv.firmId) || db.firms[0];
  const buyer = db.clients.find((c) => c.id === inv.buyerId);
  const plant = db.plants.find((p) => p.id === inv.plantId);
  const store = db.stores.find((s) => s.id === inv.storeId);
  return {
    docNo: inv.no, docDate: inv.date, supplierGstin: firm?.gstin || '', dispatchFrom: plant?.location || store?.address || store?.name || '', recipientGstin: buyer?.gstin || 'URP', recipient: buyer?.name || '', shipTo: buyer?.address || '',
    hsn: inv.lines.map((l) => l.hsn).join(', '), product: inv.lines.map((l) => l.description).join(', '), qty: sum(inv.lines, (l) => l.qty), unit: inv.lines[0]?.unit || 'MT',
    taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: t.total, vehicleNo: inv.eway.vehicleNo, distanceKm: inv.eway.distanceKm, transporter: inv.eway.transporter, transporterId: inv.eway.transporterId,
  };
}

/* ---------------- HMP-05 cost per MT by mix ---------------- */
export function costPerMt(db: DB, plantId: ID, month: string) {
  const L = getLedger(db);
  const prods = db.production.filter((p) => p.plantId === plantId && monthOf(p.date) === month);
  const totalQty = sum(prods, (p) => p.qty);
  const pc = db.plantCosts.find((c) => c.plantId === plantId && c.month === month);
  const staffPay = plantStaffCost(db, plantId, month, today());
  const fixed = pc ? { labour: pc.labour + staffPay, power: pc.power, repairs: pc.maintenance + pc.machinery, depreciation: pc.depreciation || 0, interest: pc.interest || 0, overhead: pc.overhead } : { labour: staffPay, power: 0, repairs: 0, depreciation: 0, interest: 0, overhead: 0 };
  const plant = db.plants.find((p) => p.id === plantId);
  const fuelIds = new Set([plant?.burnerFuelId, plant?.dgFuelId].filter(Boolean));
  const byProduct = new Map<ID, { qty: number; material: number; fuel: number }>();
  for (const p of prods) {
    const x = byProduct.get(p.productId) || { qty: 0, material: 0, fuel: 0 };
    x.qty += p.qty;
    for (const m of L.movements.filter((mv) => mv.productionId === p.id && mv.kind === 'Production use')) {
      if (fuelIds.has(m.materialId)) x.fuel += -m.value;
      else x.material += -m.value;
    }
    byProduct.set(p.productId, x);
  }
  const fixedTotal = sum(Object.values(fixed), (v) => v);
  return [...byProduct.entries()].map(([productId, x]) => {
    const share = totalQty ? x.qty / totalQty : 0;
    const parts = { material: x.material, fuel: x.fuel, ...Object.fromEntries(Object.entries(fixed).map(([k, v]) => [k, v * share])) } as Record<string, number>;
    const total = sum(Object.values(parts), (v) => v);
    return { productId, qty: round(x.qty, 3), perMt: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, x.qty ? r2(v / x.qty) : 0])), costPerMt: x.qty ? r2(total / x.qty) : 0, total: r2(total), fixedShare: r2(fixedTotal * share) };
  });
}

/* ---------------- HMP-08 TIIPIS: SGST on outside sales; loan interest ---------------- */
export function sgstOnSales(db: DB, month: string) {
  return r2(sum(db.salesInvoices.filter((i) => i.status !== 'CANCELLED' && monthOf(i.date) === month), (i) => salesTotals(db, i).sgst));
}
export function loanSchedule(l: Loan) {
  const rows: Array<{ no: number; date: string; opening: number; emi: number; interest: number; principal: number; closing: number }> = [];
  const r = l.ratePct / 1200;
  let bal = l.amount;
  const repayMonths = Math.max(1, l.tenureMonths - l.moratoriumMonths);
  const emi = r ? (bal * r * Math.pow(1 + r, repayMonths)) / (Math.pow(1 + r, repayMonths) - 1) : bal / repayMonths;
  for (let i = 0; i < l.tenureMonths; i++) {
    const interest = bal * r;
    const moratorium = i < l.moratoriumMonths;
    const pay = moratorium ? interest : Math.min(emi, bal + interest);
    const principal = moratorium ? 0 : pay - interest;
    rows.push({ no: i + 1, date: addMonths(l.startDate, i), opening: r2(bal), emi: r2(pay), interest: r2(interest), principal: r2(principal), closing: r2(Math.max(0, bal - principal)) });
    bal = Math.max(0, bal - principal);
  }
  return rows;
}
export function loanInterestIn(l: Loan, month: string) {
  return r2(sum(loanSchedule(l).filter((x) => monthOf(x.date) === month), (x) => x.interest));
}

/* ---------------- SUB-03 sub-contractor quantities vs department billing ---------------- */
export function subconVsBilled(db: DB, siteId: ID) {
  const last = db.raBills.filter((b) => b.siteId === siteId && b.status !== 'DRAFT').sort((a, b) => a.seq - b.seq).at(-1);
  const wos = db.workOrders.filter((w) => w.siteId === siteId);
  const items = db.boq.filter((b) => b.siteId === siteId);
  return items
    .map((it) => {
      const billed = last?.lines.find((l) => l.boqItemId === it.id)?.uptoQty || 0;
      const sub = sum(
        db.subconBills.filter((sb) => wos.some((w) => w.id === sb.workOrderId) && ['APPROVED', 'PAID', 'PENDING'].includes(sb.status)),
        (sb) => sum(sb.lines.filter((l) => l.boqItemId === it.id), (l) => l.qty),
      );
      return { boqItemId: it.id, itemNo: it.itemNo, description: it.description, unit: it.unit, billedToDept: round(billed, 3), subconBilled: round(sub, 3), diff: round(sub - billed, 3) };
    })
    .filter((x) => x.billedToDept || x.subconBilled);
}

/* ---------------- DPR-01 daily progress report draft ---------------- */
export function dprDraft(db: DB, siteId: ID, date: string) {
  const att = db.attendance.filter((a) => a.siteId === siteId && a.date === date);
  const own = att.filter((a) => a.workerId && (a.status === 'P' || a.status === 'H')).length;
  const gang = sum(att.filter((a) => a.contractorId), (a) => a.headcount || 0);
  const logs = db.logs.filter((l) => l.date === date && (l.siteId === siteId || (l.split || []).some((x) => x.siteId === siteId) || (l.tripRows || []).some((t) => t.siteId === siteId)));
  const machines = logs
    .map((l) => {
      const v = db.vehicles.find((x) => x.id === l.vehicleId);
      const hrs = l.closeHr !== undefined && l.openHr !== undefined ? `${round(l.closeHr - l.openHr, 1)} h` : '';
      const trips = l.tripRows?.filter((t) => t.siteId === siteId).length || l.trips;
      return `${v?.regNo || v?.model || v?.type || ''}${hrs ? ` ${hrs}` : ''}${trips ? ` ${trips} trips` : ''}`.trim();
    })
    .join(', ');
  const store = db.stores.find((s) => s.siteId === siteId && s.type === 'SITE');
  const used = db.stockTxns.filter((t) => t.date === date && t.fromStoreId === store?.id && t.type === 'CONSUMPTION' && t.status !== 'CANCELLED');
  const recd = db.stockTxns.filter((t) => t.date === date && t.toStoreId === store?.id && t.status !== 'CANCELLED');
  const hm = db.dispatches.filter((d) => d.siteId === siteId && d.date === date);
  const fmt = (lines: Array<{ materialId: ID; qty: number }>) => lines.map((l) => `${mat(db, l.materialId)?.name} ${round(l.qty, 2)} ${mat(db, l.materialId)?.unit}`).join(', ');
  const materials = [used.length ? `Used: ${fmt(used.flatMap((t) => t.lines))}` : '', recd.length ? `Received: ${fmt(recd.flatMap((t) => t.lines))}` : '', hm.length ? `Hot mix: ${round(sum(hm, (d) => d.receivedQty ?? d.qty), 2)} MT in ${hm.length} loads` : ''].filter(Boolean).join(' · ');
  const work = db.measurements
    .filter((m) => m.siteId === siteId && m.date === date)
    .map((m) => {
      const it = db.boq.find((b) => b.id === m.boqItemId);
      return { boqItemId: m.boqItemId, description: `${it?.itemNo || ''} ${it?.description.slice(0, 80) || ''}`.trim(), qty: m.deduction ? -m.qty : m.qty, unit: it?.unit || '', chainage: m.chainage };
    });
  const hindrance = db.siteRegisters.filter((r) => r.siteId === siteId && r.kind === 'HINDRANCE' && r.fromDate && r.fromDate <= date && (!r.toDate || r.toDate >= date)).map((r) => `${r.no}: ${r.description.slice(0, 100)}`).join('; ');
  return { manpower: own + gang, manpowerNote: `Own ${own}, contractors' ${gang}`, machines, materials, work, hindrance };
}

/* ---------------- DPR-02 hindrance days (for extension of time) ---------------- */
export function hindranceDays(db: DB, siteId: ID, upto: string) {
  const days = new Set<string>();
  for (const r of db.siteRegisters.filter((x) => x.siteId === siteId && x.kind === 'HINDRANCE' && x.fromDate)) {
    const end = r.toDate && r.toDate < upto ? r.toDate : upto;
    for (let d = r.fromDate!; d <= end; d = addDays(d, 1)) days.add(d);
  }
  return days.size;
}

/* ---------------- DPR-04 programme vs actual, time-penalty risk ---------------- */
export function programme(db: DB, site: Site, today: string, actualPct: number) {
  const end = currentCompletion(site);
  if (!site.startDate || !end) return null;
  const pts = [{ date: site.startDate, pct: 0 }, ...(site.milestones || []).filter((m) => m.date > site.startDate && m.date < end).sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ date: m.date, pct: m.targetPct })), { date: end, pct: 100 }];
  const plannedAt = (d: string) => {
    if (d <= pts[0]!.date) return 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (d <= b.date) return round(a.pct + ((b.pct - a.pct) * daysBetween(a.date, d)) / Math.max(1, daysBetween(a.date, b.date)), 1);
    }
    return 100;
  };
  const planned = plannedAt(today);
  const elapsed = Math.max(1, daysBetween(site.startDate, today));
  const rate = actualPct / elapsed; // % per day so far
  const projected = rate > 0 ? addDays(site.startDate, Math.ceil(100 / rate)) : '';
  const delayDays = projected && projected > end ? daysBetween(end, projected) : 0;
  let ldRisk = 0;
  if (site.ld && delayDays > 0) {
    const per = site.ld.per === 'DAY' ? 1 : site.ld.per === 'WEEK' ? 7 : 30;
    ldRisk = Math.min((site.ld.ratePct / 100) * Math.ceil(delayDays / per) * site.contractValue, (site.ld.maxPct / 100) * site.contractValue);
  }
  const nextMilestone = (site.milestones || []).filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return { points: pts, planned, actual: round(actualPct, 1), behind: round(planned - actualPct, 1), projected, completion: end, delayDays, ldRisk: Math.round(ldRisk), nextMilestone, hindranceDays: hindranceDays(db, site.id, today), risk: planned - actualPct > 10 || delayDays > 0 ? 'HIGH' : planned - actualPct > 3 ? 'MEDIUM' : 'LOW' };
}

/* ---------------- DPR-03 cube tests due at 7 and 28 days ---------------- */
export function cubesDue(db: DB, today: string) {
  const out: Array<{ testId: ID; siteId?: ID; age: 7 | 28; due: string; overdue: number; grade: string }> = [];
  for (const t of db.labTests.filter((x) => x.kind === 'CUBE' && x.cube)) {
    const c = t.cube!;
    for (const age of [7, 28] as const) {
      const due = addDays(c.castDate, age);
      const done = age === 7 ? c.d7 !== undefined : c.d28 !== undefined;
      if (!done && due <= addDays(today, 1)) out.push({ testId: t.id, siteId: t.siteId, age, due, overdue: Math.max(0, daysBetween(due, today)), grade: c.grade });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

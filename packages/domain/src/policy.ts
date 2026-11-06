import { schemas, settingsSchema, companySchema, zodMessage } from './schemas.js';
import type { AuditEntry, CollectionKey, DB, ID, ModuleKey, Perm, StockLine, StockTxn } from './types.js';
import { approvalVisible, type Session } from './session.js';
import { recordInScope } from './visibility.js';
import { availability, avgRate, productionUse } from './ledger.js';
import { poStatus, validateMeter, wageFor } from './selectors.js';
import { daysBetween, fyCode } from './format.js';
import { round, sum } from './utils.js';
import { clientDeductions, stageStatus, timeAllowedMonths } from './works.js';
import { templateById, type ImportOp } from './imports.js';
import { billLines, billTotals, computeDeductions, contractRate, invoiceKey, invoiceNo, legacyDeductions, measureQty, measuredUpto, priceAdjustment, tdsFor } from './billing.js';

/**
 * Server-authoritative business rules. Every change from the web app arrives as a Command;
 * `applyCommand` checks permission, scope, data shape and business rules, decides statuses and
 * voucher numbers itself, and returns the new state plus the records that changed.
 */

export type Command =
  | { kind: 'insert'; coll: CollectionKey; rec: Record<string, unknown> }
  | { kind: 'update'; coll: CollectionKey; id: ID; patch: Record<string, unknown>; reason?: string }
  | { kind: 'decide'; coll: CollectionKey; id: ID; decision: 'APPROVED' | 'REJECTED' | 'SENT_BACK'; remark?: string }
  | { kind: 'settings'; patch: Record<string, unknown>; reason?: string }
  | { kind: 'company'; patch: Record<string, unknown> }
  | { kind: 'markRead' }
  | { kind: 'import'; template: string; ops: ImportOp[] };

export type Change =
  | { coll: CollectionKey; id: ID; rec: any }
  | { single: 'settings' | 'company' | 'seq'; value: any };

export type AuditDraft = Omit<AuditEntry, 'id' | 'at' | 'userId'>;

export interface Ctx {
  db: DB;
  session: Session;
  /** business date in the company's time zone, YYYY-MM-DD */
  today: string;
  /** ISO timestamp */
  now: string;
  /** current hour (0–23) in the company's time zone — attendance lock */
  hour: number;
  newId: () => string;
}

export interface Result {
  db: DB;
  changes: Change[];
  audit: AuditDraft[];
  /** the main record the command produced (for the client) */
  record?: any;
}

export class RuleError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}
const fail = (msg: string, status: 400 | 403 | 404 | 409 = 400): never => {
  throw new RuleError(msg, status);
};

/* ---------------- collection metadata ---------------- */

const MASTER: CollectionKey[] = ['firms', 'sites', 'stores', 'plants', 'materials', 'suppliers', 'clients', 'subcons', 'workers', 'vehicles', 'fuelSources', 'expenseHeads', 'units', 'recipes'];

const MODULE: Record<CollectionKey, ModuleKey> = {
  firms: 'masters', sites: 'masters', stores: 'masters', plants: 'masters', materials: 'masters', suppliers: 'masters', clients: 'masters', subcons: 'masters', workers: 'masters',
  vehicles: 'masters', fuelSources: 'masters', expenseHeads: 'masters', units: 'masters', recipes: 'masters', boq: 'contract',
  stockTxns: 'inventory', requisitions: 'purchase', quotations: 'purchase', pos: 'purchase', invoices: 'purchase', payments: 'purchase', debitNotes: 'purchase',
  attendance: 'labour', advances: 'labour', wageRuns: 'labour', workOrders: 'labour', subconBills: 'labour',
  imprests: 'expenses', expenses: 'expenses', overheads: 'expenses',
  fuelPurchases: 'fleet', fuelIssues: 'fleet', dips: 'fleet', logs: 'fleet', jobCards: 'fleet', tyres: 'fleet',
  production: 'plant', dispatches: 'plant', plantCosts: 'plant', stockpiles: 'plant',
  measurements: 'contract', raBills: 'contract', guarantees: 'contract', bankFacilities: 'contract', taxCredits: 'contract',
  tankDips: 'inventory', salesInvoices: 'plant', labTests: 'contract', safety: 'labour', siteRegisters: 'contract', dprs: 'contract', hireOuts: 'fleet', loans: 'expenses', subsidyClaims: 'expenses',
  roles: 'admin', users: 'admin', audit: 'admin', notifications: 'dashboard',
};

/** entries that carry money only — need rate visibility (ROLE-03) */
const MONEY: CollectionKey[] = ['pos', 'quotations', 'invoices', 'payments', 'debitNotes', 'overheads', 'plantCosts', 'raBills', 'workOrders', 'fuelPurchases', 'guarantees', 'bankFacilities', 'taxCredits', 'salesInvoices', 'hireOuts', 'loans', 'subsidyClaims'];

const STOCK_PREFIX: Record<string, string> = { OPENING: 'OPN', ISSUE: 'MIN', GRN: 'GRN', PLANT_RECEIPT: 'PRC', CONSUMPTION: 'CON', TRANSFER: 'TRF', RETURN: 'RTN', WASTAGE: 'WST', ADJUSTMENT: 'ADJ' };
const SIMPLE_PREFIX: Partial<Record<CollectionKey, string>> = { requisitions: 'REQ', quotations: 'QTN', pos: 'PO', invoices: 'PINV', payments: 'PAY', debitNotes: 'DN', wageRuns: 'WAGE', workOrders: 'WO', subconBills: 'SCB', imprests: 'IMP', expenses: 'EXP', fuelPurchases: 'FPR', fuelIssues: 'FIS', jobCards: 'JC' };
const PLANT_PROD: Record<string, string> = { HOT_MIX: 'HMP', BATCHING: 'RMC', CRUSHER: 'CRS', WMM: 'WMM' };
const PLANT_DSP: Record<string, string> = { HOT_MIX: 'DSP-H', BATCHING: 'DSP-R', CRUSHER: 'DSP-C', WMM: 'DSP-W' };

/* ---------------- helpers ---------------- */

const find = <K extends CollectionKey>(db: DB, coll: K, id?: ID) => (id ? (db[coll] as any[]).find((x) => x.id === id) : undefined);
const need = (ok: unknown, msg: string, status: 400 | 403 | 404 | 409 = 400) => {
  if (!ok) fail(msg, status);
};
function requirePerm(s: Session, m: ModuleKey, p: Perm) {
  need(s.can(m, p), `Your role cannot ${p} in ${m}`, 403);
}

function put(db: DB, coll: CollectionKey, rec: any): DB {
  const arr = db[coll] as any[];
  const i = arr.findIndex((x) => x.id === rec.id);
  const next = i < 0 ? [...arr, rec] : arr.map((x, j) => (j === i ? rec : x));
  return { ...db, [coll]: next };
}

/** allocate the next voucher number for a prefix (server-side, gapless per prefix) */
function allocate(ctx: Ctx, out: Result, prefix: string, date: string): string {
  const n = (out.db.seq[prefix] || 0) + 1;
  out.db = { ...out.db, seq: { ...out.db.seq, [prefix]: n } };
  out.changes.push({ single: 'seq', value: out.db.seq });
  return `${prefix}/${fyCode(date).slice(2)}/${String(n).padStart(4, '0')}`;
}

/** MAT-14 — returns true when the entry must go for approval; throws for future dates */
function backdated(ctx: Ctx, d: string): boolean {
  need(d <= ctx.today, 'Future dates are not allowed');
  return daysBetween(d, ctx.today) > ctx.db.settings.backdateDays && !ctx.session.isAdmin;
}

/** MAT-10 — stock never negative, now or on any later day */
function checkStock(ctx: Ctx, db: DB, store: ID, lines: Array<{ materialId: ID; qty: number }>, d: string) {
  if (ctx.session.isAdmin && ctx.db.settings.allowNegativeOverride) return;
  const byMat = new Map<string, number>();
  for (const l of lines) if (l.qty > 0) byMat.set(l.materialId, (byMat.get(l.materialId) || 0) + l.qty);
  for (const [m, q] of byMat) {
    const av = availability(db, store, m, d);
    if (q > av.onDate + 1e-6 || q > av.minAfter + 1e-6) {
      const mat = find(db, 'materials', m);
      fail(`Not enough ${mat?.name || m} in ${find(db, 'stores', store)?.name || store}: available ${round(Math.min(av.onDate, av.minAfter), 3)} ${mat?.unit || ''}, needed ${round(q, 3)}`, 409);
    }
  }
}

/** after a change, no store/material may go negative on any day (used for cancellations / approvals) */
function checkNoNegative(ctx: Ctx, db: DB, keys: Array<{ store: ID; materialId: ID; date: string }>) {
  if (ctx.session.isAdmin && ctx.db.settings.allowNegativeOverride) return;
  for (const k of keys) {
    const av = availability(db, k.store, k.materialId, k.date);
    if (av.minAfter < -1e-6 || av.onDate < -1e-6) fail(`This would make ${find(db, 'materials', k.materialId)?.name} at ${find(db, 'stores', k.store)?.name} negative — the material has already been used`, 409);
  }
}

function txnValue(db: DB, t: { fromStoreId?: ID; toStoreId?: ID; lines: Array<{ materialId: ID; qty: number }> }) {
  const store = t.fromStoreId || t.toStoreId!;
  return sum(t.lines, (l) => Math.abs(l.qty) * avgRate(db, store, l.materialId));
}

const isLocked = (ctx: Ctx, d: string) => {
  const age = daysBetween(d, ctx.today);
  return age > 1 || (age === 1 && ctx.hour >= ctx.db.settings.attendanceLockHour);
};

/** placeholders for fields the server always decides itself, so a client may leave them out */
const INITIAL_STATUS: Partial<Record<CollectionKey, string>> = { stockTxns: 'PENDING', requisitions: 'PENDING', pos: 'PENDING', subconBills: 'PENDING', imprests: 'PENDING', expenses: 'PENDING', fuelIssues: 'PENDING', wageRuns: 'DRAFT', workOrders: 'ACTIVE', dispatches: 'DISPATCHED', raBills: 'SUBMITTED' };
function serverOwned(coll: CollectionKey, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { no: 'NEW' };
  if (INITIAL_STATUS[coll]) out.status = INITIAL_STATUS[coll];
  if (coll === 'wageRuns') out.lines = [];
  if (coll === 'raBills') Object.assign(out, { seq: 1, receipts: [], gstPct: 0, lines: [], deductions: { securityDeposit: 0, retention: 0, tds: 0, cess: 0, gstTds: 0, royalty: 0, advanceRecovery: 0, materialRecovery: 0, penalty: 0 } });
  if (coll === 'production') Object.assign(out, { productId: 'pending', runHours: 0 });
  if (coll === 'salesInvoices') Object.assign(out, { lines: [], status: 'ISSUED' });
  if (coll === 'hireOuts') out.status = 'BILLED';
  if (coll === 'siteRegisters') out.no = 'NEW';
  return out;
}

function parse(coll: CollectionKey, raw: unknown) {
  const r = schemas[coll].safeParse(raw);
  if (!r.success) fail(zodMessage(r.error));
  return r.data as any;
}

const salesTotal = (inv: any) => sum(inv.lines, (l: any) => l.qty * l.rate * (1 + l.gstPct / 100));
const label = (coll: CollectionKey, r: any) => `${coll}: ${r.no || r.code || r.name || r.head || r.id}`;

/* ================= INSERT ================= */

function insert(ctx: Ctx, coll: CollectionKey, raw: Record<string, unknown>): Result {
  const s = ctx.session;
  const db = ctx.db;
  need(coll !== 'audit' && coll !== 'notifications', 'This record type is written by the system', 403);
  const isMaster = MASTER.includes(coll);
  if (coll === 'boq') need(s.can('contract', 'add') || s.can('masters', 'add'), 'Your role cannot add BOQ items', 403);
  // plant staff record their own lab results (HMP-06); site QC is a contracts entry (DPR-03)
  else requirePerm(s, coll === 'labTests' && raw.plantId ? 'plant' : coll === 'salesInvoices' && raw.kind === 'GOODS' ? 'purchase' : MODULE[coll], 'add');
  if (MONEY.includes(coll)) need(s.showRates, 'Your role cannot see rates and amounts', 403);

  // sales invoice lines are always built by the server (from the loads or the goods entered)
  const r = parse(coll, { ...serverOwned(coll, raw), ...raw, ...(coll === 'salesInvoices' ? { lines: [] } : {}), id: raw.id || ctx.newId() });
  need(!find(db, coll, r.id), 'Duplicate record id', 409);
  r.createdAt = ctx.now;
  r.createdBy = s.user.id;
  if (isMaster || coll === 'boq') r.active = r.active ?? true;
  const out: Result = { db, changes: [], audit: [] };
  if (coll === 'sites') prepareWork(ctx, out, r);
  checkRefs(db, coll, r);

  if (isMaster) {
    if ('code' in r) need(!(db[coll] as any[]).some((x) => x.code?.toLowerCase() === String(r.code).toLowerCase()), `Code ${r.code} already exists`, 409);
    if (coll === 'stores') need(r.type !== 'CENTRAL' || !db.stores.some((x) => x.type === 'CENTRAL'), 'There is already a central store');
    if (coll === 'stores' && r.type === 'SITE') {
      need(!!find(db, 'sites', r.siteId), 'A site store must be linked to a work');
      need(!db.stores.some((x) => x.type === 'SITE' && x.siteId === r.siteId), 'This work already has a site store — it was created with the work', 409);
    }
  }

  switch (coll) {
    case 'roles':
    case 'users':
      requirePerm(s, 'admin', 'add');
      if (coll === 'users') {
        need(!db.users.some((u) => u.username.toLowerCase() === r.username.toLowerCase()), 'Username already taken', 409);
        need(!!find(db, 'roles', r.roleId), 'Unknown role');
      }
      break;
    case 'boq': {
      const site = find(db, 'sites', r.siteId);
      need(site && s.seesSite(r.siteId), 'Site not in your access');
      need(!db.boq.some((b) => b.siteId === r.siteId && b.itemNo.trim().toLowerCase() === String(r.itemNo).trim().toLowerCase()), `Item ${r.itemNo} already exists in this work's BOQ`, 409);
      // BIL-01: contract rate = estimate rate with the tendered % applied
      if (r.estRate > 0 && !(r.rate > 0)) r.rate = contractRate(site, r.estRate);
      break;
    }
    case 'stockTxns':
      insertStockTxn(ctx, out, r);
      break;
    case 'requisitions':
      need(!!find(db, 'stores', r.storeId) && s.seesStore(r.storeId), 'Store not in your access', 403);
      backdated(ctx, r.date);
      r.status = 'PENDING';
      r.no = allocate(ctx, out, 'REQ', r.date);
      break;
    case 'quotations':
      need(!r.selectedSupplierId || r.quotes.some((q: any) => q.supplierId === r.selectedSupplierId), 'Selected supplier has no quote');
      r.no = allocate(ctx, out, 'QTN', r.date);
      break;
    case 'pos': {
      need(!!find(db, 'suppliers', r.supplierId), 'Unknown supplier');
      need(!!find(db, 'stores', r.deliveryStoreId), 'Unknown delivery store');
      r.lines.forEach((l: any) => need(l.qty > 0 && l.rate > 0 && !!find(db, 'materials', l.materialId), 'Every PO line needs a material, quantity and rate'));
      backdated(ctx, r.date);
      const value = sum(r.lines, (l: any) => l.qty * l.rate * (1 + l.gstPct / 100));
      r.status = value > db.settings.approvalLimits.po && !s.isAdmin ? 'PENDING' : 'OPEN';
      r.no = allocate(ctx, out, 'PO', r.date);
      if (r.requisitionId) {
        const req = find(db, 'requisitions', r.requisitionId);
        need(req && (req.status === 'APPROVED' || req.status === 'ORDERED'), 'Requisition must be approved first');
        const upd = { ...req, status: 'ORDERED' };
        out.db = put(out.db, 'requisitions', upd);
        out.changes.push({ coll: 'requisitions', id: upd.id, rec: upd });
      }
      break;
    }
    case 'invoices': {
      need(!!find(db, 'suppliers', r.supplierId), 'Unknown supplier');
      const invoiced = new Set(db.invoices.flatMap((i) => i.grnIds));
      for (const g of r.grnIds) {
        const grn = find(db, 'stockTxns', g);
        need(grn && grn.type === 'GRN' && grn.supplierId === r.supplierId, 'GRN does not belong to this supplier');
        need(!invoiced.has(g), `${grn.no} is already invoiced`, 409);
      }
      r.no = allocate(ctx, out, 'PINV', r.date);
      break;
    }
    case 'payments':
      need(r.partyType === 'SUPPLIER' ? !!find(db, 'suppliers', r.partyId) : r.partyType === 'SUBCON' ? !!find(db, 'subcons', r.partyId) : !!find(db, 'workers', r.partyId), 'Unknown party');
      need(r.amount > 0, 'Amount must be more than zero');
      backdated(ctx, r.date);
      {
        // Query 2: TDS on payments to contractors and transporters, unless entered by hand
        // `amount` is what is paid; TDS is on top. When TDS is not entered, `amount` is taken as the gross due.
        if (raw.tds === undefined || raw.tds === null) {
          const rule = tdsFor(db, r.partyType, r.partyId, r.amount, r.date);
          r.tds = rule.tds;
          r.amount = round(r.amount - rule.tds, 2);
          r.tdsCode = r.tdsCode || rule.code || undefined;
          r.tdsRate = r.tdsRate ?? (rule.code ? rule.rate : undefined);
        }
        need(r.amount > 0, 'Amount after TDS must be more than zero');

      }
      r.no = allocate(ctx, out, 'PAY', r.date);
      break;
    case 'debitNotes':
      need(!!find(db, 'suppliers', r.supplierId) && !!find(db, 'materials', r.materialId), 'Unknown supplier or material');
      r.no = allocate(ctx, out, 'DN', r.date);
      break;
    case 'attendance': {
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(r.date <= ctx.today, 'Future dates are not allowed');
      need(!isLocked(ctx, r.date) || s.isAdmin, `Attendance for ${r.date} is locked (LAB-05) — only Admin can change it`, 403);
      if (r.workerId) {
        need(!!find(db, 'workers', r.workerId) && r.status, 'Worker and status are required');
        need(!db.attendance.some((a) => a.workerId === r.workerId && a.date === r.date), 'Attendance for this worker on this date already exists', 409);
      } else {
        need(r.contractorId && r.trade && (r.headcount ?? 0) > 0, 'Contractor, trade and headcount are required');
        need(!db.attendance.some((a) => a.contractorId === r.contractorId && a.trade === r.trade && a.siteId === r.siteId && a.date === r.date), 'This trade is already entered for the contractor today', 409);
      }
      r.locked = false;
      break;
    }
    case 'advances':
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(r.workerId || r.contractorId, 'Choose a worker or contractor');
      need(r.amount > 0, 'Amount must be more than zero');
      backdated(ctx, r.date);
      break;
    case 'wageRuns':
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(r.from <= r.to && r.to <= ctx.today, 'Wage period is not valid');
      r.lines = db.workers.filter((w) => w.siteId === r.siteId && w.active !== false).map((w) => wageFor(db, w.id, r.from, r.to));
      r.status = 'DRAFT';
      r.no = allocate(ctx, out, 'WAGE', r.to);
      break;
    case 'workOrders':
      need(s.seesSite(r.siteId) && !!find(db, 'subcons', r.subContractorId), 'Site or sub-contractor not valid');
      r.lines.forEach((l: any) => need(find(db, 'boq', l.boqItemId)?.siteId === r.siteId, 'BOQ item does not belong to this site'));
      r.status = 'ACTIVE';
      r.no = allocate(ctx, out, 'WO', r.date);
      break;
    case 'subconBills': {
      const wo = find(db, 'workOrders', r.workOrderId);
      need(wo && s.seesSite(wo.siteId), 'Work order not in your access', 403);
      // rates always come from the work order
      r.lines = r.lines.map((l: any) => {
        const wl = wo.lines.find((x: any) => x.boqItemId === l.boqItemId);
        need(wl, 'Item is not in the work order');
        return { ...l, rate: wl.rate };
      }).filter((l: any) => l.qty > 0);
      need(r.lines.length, 'Enter measured quantity');
      if (!s.showRates) {
        r.materialRecovery = 0;
        r.advanceRecovery = 0;
        r.penalty = 0;
      }
      backdated(ctx, r.date);
      r.status = 'PENDING';
      r.no = allocate(ctx, out, 'SCB', r.date);
      break;
    }
    case 'imprests':
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(r.amount > 0, 'Amount must be more than zero');
      if (r.kind === 'IMPREST') {
        need(s.can('expenses', 'approve') && s.showRates, 'Only the owner / accounts can give imprest', 403);
        r.status = 'APPROVED';
      } else r.status = 'PENDING';
      r.no = allocate(ctx, out, 'IMP', r.date);
      break;
    case 'expenses': {
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(!!find(db, 'expenseHeads', r.headId), 'Unknown expense head');
      need(r.amount > 0, 'Amount must be more than zero');
      const late = backdated(ctx, r.date);
      const limit = Math.min(db.settings.approvalLimits.expense, s.role.approvalLimit);
      r.status = late || (r.amount > limit && !s.isAdmin) ? 'PENDING' : 'APPROVED';
      r.no = allocate(ctx, out, 'EXP', r.date);
      break;
    }
    case 'overheads':
      break;
    case 'fuelPurchases': {
      const src = find(db, 'fuelSources', r.sourceId);
      need(src && src.type !== 'OUTSIDE_PUMP', 'Choose an own tank or bowser');
      need(r.litres > 0, 'Litres must be more than zero');
      backdated(ctx, r.date);
      r.no = allocate(ctx, out, 'FPR', r.date);
      break;
    }
    case 'fuelIssues': {
      const v = find(db, 'vehicles', r.vehicleId);
      need(v, 'Unknown vehicle');
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(!!find(db, 'fuelSources', r.sourceId), 'Unknown fuel source');
      need(r.litres > 0 && r.litres <= v.tankCapacity * 1.05 + 1, `Litres must be between 0 and the tank capacity (${v.tankCapacity} L)`);
      const reading = v.meterType === 'HOURS' ? r.hourMeter : r.odometer;
      need(reading !== undefined, v.meterType === 'HOURS' ? 'Hour meter reading is required' : 'Odometer reading is required');
      const late = backdated(ctx, r.date);
      const flag = validateMeter(db, v.id, reading, r.date);
      r.flag = flag || undefined;
      r.driver = r.driver || v.driver;
      if (!s.showRates) r.rate = db.fuelIssues.filter((f) => f.sourceId === r.sourceId).slice(-1)[0]?.rate ?? 0;
      r.status = flag || late || (r.litres * r.rate > db.settings.approvalLimits.fuel && !s.isAdmin) ? 'PENDING' : 'APPROVED';
      r.no = allocate(ctx, out, 'FIS', r.date);
      break;
    }
    case 'dips':
      need(!!find(db, 'fuelSources', r.sourceId), 'Unknown fuel source');
      backdated(ctx, r.date);
      break;
    case 'logs': {
      need(!!find(db, 'vehicles', r.vehicleId), 'Unknown vehicle');
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(r.date <= ctx.today, 'Future dates are not allowed');
      need((r.closeKm ?? 0) >= (r.openKm ?? 0) && (r.closeHr ?? 0) >= (r.openHr ?? 0), 'Closing reading cannot be less than opening');
      // FLT-03: each trip names its work; the day's machine cost is shared by trips
      if (r.tripRows?.length) {
        for (const tr of r.tripRows) need(s.seesSite(tr.siteId) && !!find(db, 'sites', tr.siteId), 'A trip is charged to a work not in your access', 403);
        r.trips = r.tripRows.length;
        const by: Record<string, number> = {};
        for (const tr of r.tripRows) by[tr.siteId] = (by[tr.siteId] || 0) + 1;
        r.split = Object.entries(by).map(([siteId, n]) => ({ siteId, share: round(n / r.tripRows.length, 4) }));
        const fix = 1 - sum(r.split, (x: any) => x.share);
        r.split[0].share = round(r.split[0].share + fix, 4);
        r.materialQty = round(sum(r.tripRows, (x: any) => x.qty), 3);
        r.material = r.material || r.tripRows[0].material;
      }
      if (r.hiredOut) r.split = undefined;
      if (r.split) need(Math.abs(sum(r.split, (x: any) => x.share) - 1) < 0.01, 'Site shares must add up to 100%');
      break;
    }
    case 'jobCards':
      // a vehicle / machine, or plant equipment (HMP-07)
      if (r.plantId) need(s.allSites || s.plantIds.includes(r.plantId), 'Plant not in your access', 403);
      else need(!!find(db, 'vehicles', r.vehicleId), 'Unknown vehicle');
      if (r.plantId && !s.can('fleet', 'add')) need(s.can('plant', 'add'), 'Your role cannot record plant maintenance', 403);
      if (!s.showRates) {
        r.sparesCost = 0;
        r.labourCost = 0;
      }
      r.no = allocate(ctx, out, 'JC', r.date);
      break;
    case 'tyres':
      need(!!find(db, 'vehicles', r.vehicleId), 'Unknown vehicle');
      break;
    case 'production': {
      const p = find(db, 'plants', r.plantId);
      need(p && (s.allSites || s.plantIds.includes(p.id)), 'Plant not in your access', 403);
      const rec = find(db, 'recipes', r.recipeId);
      need(rec, 'Unknown recipe');
      need(p.type === 'CRUSHER' ? !!rec.split : !rec.split, 'Recipe does not match the plant type');
      need(r.qty > 0, 'Quantity must be more than zero');
      need(r.stopMeter >= r.startMeter, 'Stop meter cannot be less than start meter');
      backdated(ctx, r.date);
      r.productId = rec.productId;
      r.runHours = round(r.stopMeter - r.startMeter, 1);
      need(r.runHours <= 24, 'Run hours cannot be more than 24 in a day');
      checkStock(ctx, db, p.storeId, productionUse(db, r), r.date);
      r.no = allocate(ctx, out, PLANT_PROD[p.type] || 'PRD', r.date);
      break;
    }
    case 'dispatches': {
      const p = find(db, 'plants', r.plantId);
      need(p && (s.allSites || s.plantIds.includes(p.id)), 'Plant not in your access', 403);
      // HMP-03: net weight from the weighbridge when gross and tare are given
      if (r.gross > 0 && r.tare >= 0 && r.gross > r.tare) r.qty = round(r.gross - r.tare, 3);
      need(r.qty > 0, 'Quantity must be more than zero');
      if (r.buyerId) {
        const buyer = find(db, 'clients', r.buyerId);
        need(buyer, 'Unknown buyer');
        r.customer = buyer.name;
        r.siteId = undefined;
        r.toPlantId = undefined;
      }
      need(r.siteId || r.toPlantId || r.customer, 'Every dispatch must name the work or the buyer');
      r.salesInvoiceId = undefined;
      if (r.siteId) need(find(db, 'sites', r.siteId)?.status === 'ACTIVE', 'Receiving site is not active');
      need(!!find(db, 'vehicles', r.vehicleId), 'Unknown vehicle');
      backdated(ctx, r.date);
      checkStock(ctx, db, p.storeId, [{ materialId: r.productId, qty: r.qty }], r.date);
      r.driver = r.driver || find(db, 'vehicles', r.vehicleId).driver;
      if (r.customer && !r.siteId && !r.toPlantId) {
        r.status = 'RECEIVED';
        r.receivedQty = r.qty;
        r.receivedAt = ctx.now;
      } else {
        r.status = 'DISPATCHED';
        r.receivedQty = undefined;
        r.receivedAt = undefined;
      }
      r.no = allocate(ctx, out, PLANT_DSP[p.type] || 'DSP', r.date);
      break;
    }
    case 'plantCosts':
    case 'stockpiles':
      need(s.allSites || s.plantIds.includes(r.plantId), 'Plant not in your access', 403);
      break;
    case 'measurements': {
      need(s.seesSite(r.siteId), 'Site not in your access', 403);
      need(find(db, 'boq', r.boqItemId)?.siteId === r.siteId, 'BOQ item does not belong to this site');
      // BIL-02: quantity is nos × L × B × D when dimensions are given
      const q = measureQty(r);
      if (q !== null) r.qty = q;
      need(r.qty > 0, 'Quantity must be more than zero');
      need(r.date <= ctx.today, 'Future dates are not allowed');
      if (r.deduction) need(measuredUpto(db, r.boqItemId, '9999-12-31') - r.qty >= -1e-6, 'This deduction is more than the quantity measured for the item');
      r.jeStatus = 'PENDING';
      break;
    }
    case 'raBills': {
      const site = find(db, 'sites', r.siteId);
      need(site && s.seesSite(site.id), 'Site not in your access', 403);
      const prev = db.raBills.filter((b) => b.siteId === r.siteId).sort((a, b) => a.seq - b.seq);
      const last = prev.at(-1);
      need(!last || last.date <= r.date, 'Bill date is before the previous bill');
      need(r.date <= ctx.today, 'Future dates are not allowed');
      need(!prev.some((b) => b.kind === 'FINAL'), 'The final bill of this work has already been made');
      r.kind = raw.kind === 'FINAL' ? 'FINAL' : 'RA';
      // BIL-01/03: the abstract is always rebuilt from the measurement book (queried entries left out)
      r.lines = billLines(db, r.siteId, r.date);
      const work = sum(r.lines, (l: any) => l.thisQty * l.rate);
      need(work > 0 || r.kind === 'FINAL', 'No new measured work since the last bill');
      r.seq = prev.length + 1;
      r.no = `${site.code}/RA-${String(r.seq).padStart(2, '0')}${r.kind === 'FINAL' ? '-FINAL' : ''}`;
      r.gstPct = site.gstPct;
      // BIL-05 price adjustment from this bill's current prices
      const paIn = Array.isArray(raw.paInputs) ? (raw.paInputs as any[]).map((x) => ({ name: String(x?.name || ''), currentPrice: Number(x?.currentPrice) || 0, qty: Number(x?.qty) || 0 })) : [];
      r.priceAdj = priceAdjustment(site, work, paIn);
      r.escalation = sum(r.priceAdj, (x: any) => x.amount) || undefined;
      const gross = work + (r.escalation || 0);
      const gst = (gross * r.gstPct) / 100;
      const m = (raw.manual || {}) as any;
      const n = (x: unknown) => Math.max(0, Number(x) || 0);
      r.ded = computeDeductions(db, site, gross, gst, r.seq, { materialRecovery: n(m.materialRecovery), penalty: n(m.penalty), interest: n(m.interest), fixed: Object.fromEntries(Object.entries(m.fixed || {}).map(([k, v]) => [k, n(v)])) });
      r.deductions = legacyDeductions(r.ded);
      r.firmId = site.firmId || db.firms[0]?.id;
      r.receipts = [];
      r.actualDed = undefined;
      r.passedOn = undefined;
      r.passedGross = undefined;
      if (raw.status === 'DRAFT') r.status = 'DRAFT';
      else submitBill(ctx, out, r);
      if (r.kind === 'FINAL') stageTo(ctx, out, site, 'FINAL_BILL_SUBMITTED');
      break;
    }
    case 'tankDips': {
      const st = find(db, 'stores', r.storeId);
      need(st && s.seesStore(st.id), 'Store not in your access', 403);
      need(!!find(db, 'materials', r.materialId), 'Unknown material');
      need(r.date <= ctx.today, 'Future dates are not allowed');
      need(!db.tankDips.some((x) => x.storeId === r.storeId && x.materialId === r.materialId && x.location === r.location && x.date === r.date), 'A dip for this tank and date is already entered — edit it instead', 409);
      break;
    }
    case 'salesInvoices':
      insertSalesInvoice(ctx, out, r, raw);
      break;
    case 'labTests':
      need(r.plantId || r.siteId, 'Choose the plant or the work');
      if (r.plantId) need(s.allSites || s.plantIds.includes(r.plantId), 'Plant not in your access', 403);
      if (r.siteId) need(s.seesSite(r.siteId), 'Work not in your access', 403);
      if (r.kind === 'CUBE') need(r.cube?.castDate, 'Cube tests need the casting date');
      need(r.date <= ctx.today, 'Future dates are not allowed');
      break;
    case 'safety':
      need(s.seesSite(r.siteId), 'Work not in your access', 403);
      if (r.kind === 'ACCIDENT') need(r.person && r.injury && r.severity, 'Name, injury and severity are required for an accident');
      if (r.kind === 'TOOLBOX') need(r.topic, 'Topic is required');
      if (r.kind === 'PPE') need(r.item && r.qty > 0, 'Item and quantity are required');
      need(r.date <= ctx.today, 'Future dates are not allowed');
      break;
    case 'siteRegisters': {
      need(s.seesSite(r.siteId), 'Work not in your access', 403);
      need(String(r.description).trim(), 'Description is required');
      if (r.kind === 'HINDRANCE') need(r.fromDate, 'Hindrance start date is required');
      if (r.fromDate && r.toDate) need(r.toDate >= r.fromDate, 'Hindrance end is before its start');
      const n = db.siteRegisters.filter((x) => x.siteId === r.siteId && x.kind === r.kind).length + 1;
      r.no = `${r.kind === 'HINDRANCE' ? 'HR' : 'SO'}-${String(n).padStart(2, '0')}`;
      break;
    }
    case 'dprs':
      need(s.seesSite(r.siteId), 'Work not in your access', 403);
      need(r.date <= ctx.today, 'Future dates are not allowed');
      need(!db.dprs.some((x) => x.siteId === r.siteId && x.date === r.date), 'The DPR for this work and date already exists — open it to edit', 409);
      break;
    case 'hireOuts':
      need(!!find(db, 'vehicles', r.vehicleId), 'Unknown machine');
      need(r.from <= r.to && r.to <= ctx.today, 'Hire period is not valid');
      need(r.units > 0 && r.rate > 0, 'Units and rate are required');
      r.receipts = [];
      r.status = 'BILLED';
      r.no = allocate(ctx, out, 'HIRE', r.date);
      break;
    case 'loans':
      need(r.amount > 0 && r.tenureMonths > 0, 'Amount and tenure are required');
      break;
    case 'subsidyClaims':
      if (r.loanId) need(!!find(db, 'loans', r.loanId), 'Unknown loan');
      break;
    case 'guarantees':
      need(r.amount > 0, 'Amount must be more than zero');
      if (r.siteId) need(s.seesSite(r.siteId), 'Work not in your access', 403);
      need(!r.expiryDate || !r.issueDate || r.expiryDate >= r.issueDate, 'Expiry date is before the issue date');
      r.status = 'ACTIVE';
      r.extensions = [];
      break;
    case 'bankFacilities':
      need(String(r.bank).trim(), 'Bank name is required');
      break;
    case 'taxCredits':
      need(r.amount > 0, 'Amount must be more than zero');
      if (r.billId) need(!!find(db, 'raBills', r.billId), 'Unknown bill');
      break;
  }

  out.db = put(out.db, coll, r);
  out.changes.push({ coll, id: r.id, rec: r });
  out.audit.push({ action: 'CREATE', entity: coll, entityId: r.id, label: `${label(coll, r)} created`, after: r });
  // Query 3: every work gets its own site store automatically
  if (coll === 'sites' && !out.db.stores.some((x) => x.type === 'SITE' && x.siteId === r.id)) {
    let n = out.db.stores.length + 1;
    while (out.db.stores.some((x) => x.code === `SS-${String(n).padStart(3, '0')}`)) n++;
    const store = { id: ctx.newId(), createdAt: ctx.now, createdBy: s.user.id, active: true, code: `SS-${String(n).padStart(3, '0')}`, name: `Site Store — ${r.short}`, type: 'SITE', siteId: r.id };
    out.db = put(out.db, 'stores', store);
    out.changes.push({ coll: 'stores', id: store.id, rec: store });
    out.audit.push({ action: 'CREATE', entity: 'stores', entityId: store.id, label: `${store.name} created with the work`, after: store });
  }
  out.record = r;
  return out;
}

/** links between masters must point at records that exist */
const REFS: Partial<Record<CollectionKey, Array<[string, CollectionKey]>>> = {
  workers: [['siteId', 'sites'], ['contractorId', 'subcons']],
  vehicles: [['siteId', 'sites'], ['ownerSupplierId', 'suppliers']],
  fuelSources: [['siteId', 'sites'], ['supplierId', 'suppliers']],
  stores: [['siteId', 'sites'], ['plantId', 'plants']],
  plants: [['storeId', 'stores'], ['firmId', 'firms']],
  sites: [['engineerId', 'users'], ['plantId', 'plants']],
  boq: [['siteId', 'sites'], ['recipeId', 'recipes']],
  materials: [['unit', 'units']],
};
function checkRefs(db: DB, coll: CollectionKey, r: any) {
  for (const [k, target] of REFS[coll] || []) if (r[k]) need((db[target] as any[]).some((x) => x.id === r[k]), `${k.replace(/Id$/, '')}: not found in ${target}`);
}

/** Excel import (XL-04 / PF-06): every row is applied with the normal rules, all or nothing */
function importRows(ctx: Ctx, templateId: string, ops: ImportOp[]): Result {
  const t = templateById(templateId);
  need(t, 'Unknown import template');
  need(Array.isArray(ops) && ops.length > 0, 'Nothing to import');
  need(ops.length <= 5000, 'At most 5,000 rows in one import — split the file');
  if (t!.adminOnly) need(ctx.session.isAdmin, `Only Admin can import ${t!.title.toLowerCase()}`, 403);
  let db = ctx.db;
  const changes: Change[] = [];
  const audit: AuditDraft[] = [];
  for (const op of ops) {
    need(op.coll === t!.coll || (t!.id === 'party-balances' && (op.coll === 'suppliers' || op.coll === 'subcons')), 'Row does not match the template');
    try {
      const r = op.kind === 'insert' ? insert({ ...ctx, db }, op.coll, op.rec || {}) : update({ ...ctx, db }, op.coll, String(op.id), op.patch || {}, `Excel import: ${t!.title}`);
      db = r.db;
      changes.push(...r.changes);
      audit.push(...r.audit);
    } catch (e) {
      if (e instanceof RuleError) throw new RuleError(`Row ${op.row}: ${e.message} — nothing was imported`, e.status);
      throw e;
    }
  }
  audit.push({ action: 'CREATE', entity: 'Import', entityId: templateId, label: `Excel import: ${ops.length} ${t!.title.toLowerCase()} rows` });
  return { db, changes, audit, record: { imported: ops.length } };
}

/** HMP-04: invoice outside sales from received dispatches of one buyer */
function insertSalesInvoice(ctx: Ctx, out: Result, r: any, raw: Record<string, unknown>) {
  if (r.kind === 'GOODS') return insertGoodsSale(ctx, out, r, raw);
  r.kind = 'PLANT';
  const s = ctx.session;
  const db = ctx.db;
  const plant = find(db, 'plants', r.plantId);
  need(plant && (s.allSites || s.plantIds.includes(plant.id)), 'Plant not in your access', 403);
  const buyer = find(db, 'clients', r.buyerId);
  need(buyer, 'Unknown buyer');
  need(r.dispatchIds.length > 0, 'Choose the loads to invoice');
  need(r.date <= ctx.today, 'Future dates are not allowed');
  const ds = r.dispatchIds.map((id: ID) => find(db, 'dispatches', id));
  for (const d of ds) {
    need(d && d.plantId === r.plantId, 'A load is not from this plant');
    need(!d.siteId && !d.toPlantId && (d.buyerId === r.buyerId || (!d.buyerId && d.customer === buyer.name)), `${d?.no || 'A load'} is not a sale to ${buyer.name}`);
    need(d.status === 'RECEIVED', `${d.no} is not delivered yet`);
    need(!d.salesInvoiceId, `${d.no} is already invoiced`, 409);
  }
  // one line per product; rate per unit entered for the invoice, else the dispatch sale rate
  const rates = (raw.rates || {}) as Record<string, number>;
  const byProduct = new Map<string, number>();
  for (const d of ds) byProduct.set(d.productId, (byProduct.get(d.productId) || 0) + (d.receivedQty ?? d.qty));
  r.lines = [...byProduct.entries()].map(([pid, q]) => {
    const m = find(db, 'materials', pid);
    const rate = Number(rates[pid]) || ds.find((d: any) => d.productId === pid && d.saleRate)?.saleRate || 0;
    need(rate > 0, `Enter the rate for ${m?.name || 'the product'}`);
    return { productId: pid, description: m?.name || pid, hsn: m?.hsn || '2715', qty: round(q, 3), unit: m?.unit || 'MT', rate: round(rate, 2), gstPct: m?.gstPct ?? 18 };
  });
  r.firmId = plant.firmId || db.firms[0]?.id;
  issueSalesNo(out, r);
  for (const d of ds) {
    const upd = { ...d, salesInvoiceId: r.id };
    out.db = put(out.db, 'dispatches', upd);
    out.changes.push({ coll: 'dispatches', id: upd.id, rec: upd });
  }
}

/** one GST invoice series per firm, shared by RA bills, hot mix and goods sales */
function issueSalesNo(out: Result, r: any) {
  const firm = find(out.db, 'firms', r.firmId);
  const prefix = firm?.invoicePrefix || (firm ? `${firm.code}/INV` : 'INV');
  const key = invoiceKey(prefix, r.date);
  const n = (out.db.seq[key] || 0) + 1;
  out.db = { ...out.db, seq: { ...out.db.seq, [key]: n } };
  out.changes.push({ single: 'seq', value: out.db.seq });
  r.no = invoiceNo(prefix, r.date, n);
  r.status = 'ISSUED';
  r.receipts = [];
}

/** sale of goods from a store: stock must be there on the date and on every later day */
function insertGoodsSale(ctx: Ctx, out: Result, r: any, raw: Record<string, unknown>) {
  const s = ctx.session;
  const db = ctx.db;
  const store = find(db, 'stores', r.storeId);
  need(store && s.seesStore(store.id), 'Store not in your access', 403);
  const buyer = find(db, 'clients', r.buyerId);
  need(buyer, 'Unknown buyer');
  need(r.date <= ctx.today, 'Future dates are not allowed');
  const rawLines = Array.isArray(raw.lines) ? (raw.lines as any[]) : [];
  need(rawLines.length > 0 && rawLines.length <= 20, 'Add the goods sold (1 to 20 lines)');
  r.lines = rawLines.map((l, i) => {
    const m = find(db, 'materials', String(l?.materialId ?? l?.productId ?? ''));
    need(m, `Line ${i + 1}: unknown material`);
    const qty = round(Number(l.qty), 3);
    const rate = round(Number(l.rate), 2);
    need(qty > 0, `Line ${i + 1}: quantity must be more than zero`);
    need(rate > 0, `Line ${i + 1}: enter the sale rate for ${m.name}`);
    const gstPct = l.gstPct === undefined || l.gstPct === '' ? m.gstPct ?? 18 : Number(l.gstPct);
    need([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 12, 18, 28, 40].includes(gstPct), `Line ${i + 1}: GST rate ${gstPct}% is not a GST slab`);
    const hsn = String(l.hsn || m.hsn || '').trim();
    need(/^\d{4,8}$/.test(hsn), `Line ${i + 1}: HSN code (4 to 8 digits) is required for ${m.name} — set it on the material`);
    return { productId: m.id, description: String(l.description || m.name).slice(0, 200), hsn, qty, unit: m.unit, rate, gstPct };
  });
  checkStock(ctx, db, store.id, r.lines.map((l: any) => ({ materialId: l.productId, qty: l.qty })), r.date);
  const site = store.siteId ? find(db, 'sites', store.siteId) : undefined;
  const plant = store.plantId ? find(db, 'plants', store.plantId) : undefined;
  if (raw.firmId) need(!!find(db, 'firms', String(raw.firmId)), 'Unknown firm');
  r.firmId = (raw.firmId as string) || site?.firmId || plant?.firmId || db.firms[0]?.id;
  r.plantId = undefined;
  r.dispatchIds = [];
  issueSalesNo(out, r);
}

/** BIL-08: a submitted bill gets the next tax invoice number of its firm's series */
function submitBill(ctx: Ctx, out: Result, r: any, on?: string) {
  r.status = 'SUBMITTED';
  r.submittedOn = on || r.submittedOn || r.date;
  if (r.invoiceNo) return;
  const firm = find(out.db, 'firms', r.firmId);
  const prefix = firm?.invoicePrefix || (firm ? `${firm.code}/INV` : 'INV');
  const key = invoiceKey(prefix, r.date);
  const n = (out.db.seq[key] || 0) + 1;
  out.db = { ...out.db, seq: { ...out.db.seq, [key]: n } };
  out.changes.push({ single: 'seq', value: out.db.seq });
  r.invoiceNo = invoiceNo(prefix, r.date, n);
  void ctx;
}

/** move a work forward to a stage (never backwards) */
const STAGE_ORDER = ['BID_SUBMITTED', 'LOA_RECEIVED', 'AGREEMENT_SIGNED', 'IN_PROGRESS', 'STOPPED', 'PHYSICALLY_COMPLETE', 'FINAL_BILL_SUBMITTED', 'FINAL_BILL_PAID', 'DLP', 'SECURITY_RELEASED', 'CLOSED'];
function stageTo(ctx: Ctx, out: Result, site: any, stage: string) {
  const cur = out.db.sites.find((x) => x.id === site.id) || site;
  if (STAGE_ORDER.indexOf(cur.stage || 'IN_PROGRESS') >= STAGE_ORDER.indexOf(stage)) return;
  const after = { ...cur, stage, status: stageStatus(stage as any) };
  out.db = put(out.db, 'sites', after);
  out.changes.push({ coll: 'sites', id: after.id, rec: after });
  out.audit.push({ action: 'UPDATE', entity: 'sites', entityId: after.id, label: `${cur.short}: status → ${stage.replace(/_/g, ' ').toLowerCase()}`, before: { stage: cur.stage }, after: { stage } });
  void ctx;
}

/** works master (Query 1): firm, work code, deductions profile and status from stage */
function prepareWork(ctx: Ctx, out: Result, r: any) {
  const db = ctx.db;
  const client = find(db, 'clients', r.clientId);
  need(client, 'Choose the client / department');
  if (r.officeId) need((client.offices || []).some((o: any) => o.id === r.officeId), 'Office does not belong to this client');
  if (db.firms.length) {
    r.firmId = r.firmId || db.firms[0]!.id;
    need(!!find(db, 'firms', r.firmId), 'Choose the firm that holds the contract');
  }
  if (r.plantId) need(!!find(db, 'plants', r.plantId), 'Unknown plant');
  r.short = (r.short || '').trim() || String(r.name).slice(0, 40);
  if (!String(r.code || '').trim()) {
    const firm = find(db, 'firms', r.firmId);
    const prefix = firm?.code || 'W';
    const fy = fyCode(r.workOrderDate || r.agreementDate || r.startDate || ctx.today);
    const key = `WORK:${prefix}:${fy}`;
    let n = (out.db.seq[key] || 0) + 1;
    while (db.sites.some((x) => x.code === `${prefix}/${fy}/${String(n).padStart(3, '0')}`)) n++;
    out.db = { ...out.db, seq: { ...out.db.seq, [key]: n } };
    out.changes.push({ single: 'seq', value: out.db.seq });
    r.code = `${prefix}/${fy}/${String(n).padStart(3, '0')}`;
  }
  // deductions differ per work: start from the client's defaults, editable afterwards
  r.deductions ||= clientDeductions(client);
  r.retentionPct ??= client.retentionPct;
  syncStage(r);
  if (!r.timeAllowedMonths) r.timeAllowedMonths = timeAllowedMonths(r) || undefined;
}

function syncStage(r: any, before?: any) {
  if (r.stage && (!before || r.stage !== before.stage)) r.status = stageStatus(r.stage);
  else if (before && r.status !== before.status) r.stage = r.status === 'ACTIVE' ? 'IN_PROGRESS' : r.status === 'ON_HOLD' ? 'STOPPED' : 'PHYSICALLY_COMPLETE';
  else if (!r.stage) r.stage = r.status === 'ACTIVE' ? 'IN_PROGRESS' : r.status === 'ON_HOLD' ? 'STOPPED' : 'PHYSICALLY_COMPLETE';
}

/** Query 3 rule 5: a site store's balance goes back to the godown (or is written off) before the work closes */
function storeBalances(db: DB, storeId: ID, onDate: string) {
  return db.materials
    .map((m) => ({ m, q: availability(db, storeId, m.id, onDate).onDate }))
    .filter((x) => Math.abs(x.q) > 1e-6);
}

function insertStockTxn(ctx: Ctx, out: Result, r: StockTxn) {
  const s = ctx.session;
  const db = ctx.db;
  const store = (id?: ID) => find(db, 'stores', id);
  r.lines.forEach((l: StockLine) => need(!!find(db, 'materials', l.materialId), 'Unknown material'));
  if (r.type !== 'ADJUSTMENT') r.lines.forEach((l) => need(l.qty > 0, 'Quantity must be more than zero'));
  const late = backdated(ctx, r.date);
  const from = store(r.fromStoreId);
  const to = store(r.toStoreId);
  r.receivedAt = undefined;
  r.receivedBy = undefined;

  switch (r.type) {
    case 'OPENING':
      need(s.isAdmin, 'Only Admin can enter opening stock', 403);
      need(to, 'Choose the store');
      r.fromStoreId = undefined;
      r.status = 'POSTED';
      break;
    case 'GRN': {
      const po = find(db, 'pos', r.poId);
      need(po && (po.status === 'OPEN' || po.status === 'PARTIAL'), 'GRN needs an open purchase order');
      need(s.seesStore(po.deliveryStoreId), 'Delivery store not in your access', 403);
      r.toStoreId = po.deliveryStoreId;
      r.fromStoreId = undefined;
      r.supplierId = po.supplierId;
      const st = poStatus(db, po.id);
      r.lines = r.lines.map((l) => {
        const pl = st.lines.find((x) => x.materialId === l.materialId);
        need(pl, 'Material is not on the purchase order');
        need(l.qty + (l.rejectedQty || 0) <= pl!.pending * 1.1 + 1e-6, `Received more than pending on the PO (pending ${pl!.pending})`);
        if (l.rejectedQty) need(l.rejectReason, 'Give a reason for rejected quantity');
        return { ...l, rate: pl!.rate, orderedQty: pl!.qty };
      });
      r.status = late ? 'PENDING' : 'POSTED';
      r.receivedBy = s.user.name;
      // PUR-04: PO pending balance
      const received = new Map(st.lines.map((l) => [l.materialId, l.received]));
      for (const l of r.lines) received.set(l.materialId, (received.get(l.materialId) || 0) + l.qty + (l.rejectedQty || 0));
      const pending = sum(po.lines, (l: any) => Math.max(0, l.qty - (received.get(l.materialId) || 0)));
      const upd = { ...po, status: pending > 0.001 ? 'PARTIAL' : 'CLOSED' };
      out.db = put(out.db, 'pos', upd);
      out.changes.push({ coll: 'pos', id: upd.id, rec: upd });
      break;
    }
    case 'ISSUE': {
      need(from?.type === 'CENTRAL', 'Issues are made from the central store');
      need(s.seesStore(from!.id), 'Central store not in your access', 403);
      need(r.issueToVehicleId ? !!find(db, 'vehicles', r.issueToVehicleId) : to && to.type !== 'CENTRAL', 'Choose a site / plant store or a vehicle');
      if (r.issueToVehicleId) r.toStoreId = undefined;
      checkStock(ctx, db, from!.id, r.lines, r.date);
      const value = txnValue(db, r);
      r.status = late || (value > db.settings.approvalLimits.issue && !s.isAdmin) ? 'PENDING' : r.issueToVehicleId ? 'POSTED' : 'IN_TRANSIT';
      if (r.status === 'POSTED') r.receivedAt = r.date;
      break;
    }
    case 'CONSUMPTION': {
      need(from?.type === 'SITE' && s.seesStore(from.id), 'Choose your site store', 403);
      if (r.boqItemId) need(find(db, 'boq', r.boqItemId)?.siteId === from!.siteId, 'BOQ item does not belong to this site');
      r.toStoreId = undefined;
      checkStock(ctx, db, from!.id, r.lines, r.date);
      const value = txnValue(db, r);
      r.status = late || (value > db.settings.approvalLimits.issue && !s.isAdmin) ? 'PENDING' : 'POSTED';
      break;
    }
    case 'TRANSFER':
      need(from?.type === 'SITE' && s.seesStore(from.id), 'Choose your site store', 403);
      need(to?.type === 'SITE' && to.id !== from!.id, 'Choose another site');
      checkStock(ctx, db, from!.id, r.lines, r.date);
      r.status = late ? 'PENDING' : 'IN_TRANSIT';
      break;
    case 'RETURN':
      need(from && from.type !== 'CENTRAL' && s.seesStore(from.id), 'Choose your store', 403);
      need(to?.type === 'CENTRAL', 'Returns go to the central store');
      checkStock(ctx, db, from!.id, r.lines, r.date);
      r.status = late ? 'PENDING' : 'IN_TRANSIT';
      break;
    case 'WASTAGE':
      need(from && s.seesStore(from.id), 'Store not in your access', 403);
      need(r.reason, 'Reason is required');
      r.toStoreId = undefined;
      checkStock(ctx, db, from!.id, r.lines, r.date);
      r.status = 'PENDING';
      break;
    case 'ADJUSTMENT':
      need(from && s.seesStore(from.id), 'Store not in your access', 403);
      need(r.reason, 'Reason is required');
      r.toStoreId = undefined;
      r.lines = r.lines.map((l) => {
        need(Math.abs(l.qty) > 1e-9, 'No difference to adjust');
        const sys = round(availability(db, from!.id, l.materialId, r.date).onDate, 4);
        return { ...l, systemQty: sys, physicalQty: round(sys + l.qty, 4) };
      });
      r.status = 'PENDING';
      break;
    default:
      fail('This stock entry type is created by the system', 403);
  }
  if (r.type !== 'OPENING' && r.type !== 'GRN') r.lines = r.lines.map((l) => ({ ...l, rate: 0 }));
  if (r.type === 'OPENING' && !s.showRates) fail('Opening stock needs rate visibility', 403);
  if (late) r.remark = `Back-dated by ${daysBetween(r.date, ctx.today)} days — needs approval`;
  r.no = allocate(ctx, out, STOCK_PREFIX[r.type]!, r.date);
}

/* ================= UPDATE ================= */

/** fields a master record may never change */
const FROZEN = ['id', 'createdAt', 'createdBy'];

function update(ctx: Ctx, coll: CollectionKey, id: ID, patch: Record<string, unknown>, reason?: string): Result {
  const s = ctx.session;
  const db = ctx.db;
  const before = find(db, coll, id);
  need(before, 'Record not found', 404);
  need(recordInScope(db, s, coll, before), 'Record not in your access', 403);
  const keys = Object.keys(patch).filter((k) => !FROZEN.includes(k));
  const out: Result = { db, changes: [], audit: [] };
  let after: any = { ...before };
  let action: AuditEntry['action'] = 'UPDATE';
  const only = (allowed: string[]) => need(keys.every((k) => allowed.includes(k)), `These fields cannot be changed here: ${keys.filter((k) => !allowed.includes(k)).join(', ')}`, 403);

  if (MASTER.includes(coll) || coll === 'boq' || coll === 'roles' || coll === 'users') {
    // masters (MST): edit / deactivate; never delete once used
    if (coll === 'vehicles' && !s.can('masters', 'edit')) {
      requirePerm(s, 'fleet', 'edit');
      only(['status', 'docs', 'lastServiceAt']);
    } else if (coll === 'plants' && keys.every((k) => k === 'costMode' || k === 'fixedRate')) {
      need(s.isAdmin, 'Only Admin can change how sites are charged', 403);
    } else if (coll === 'roles' || coll === 'users') {
      requirePerm(s, 'admin', 'edit');
      if (coll === 'roles') need(before.id !== 'owner', 'The Owner / Admin role cannot be changed', 403);
      if (coll === 'users' && 'username' in patch) need(!db.users.some((u) => u.id !== id && u.username.toLowerCase() === String(patch.username).toLowerCase()), 'Username already taken', 409);
      if (coll === 'users' && id === s.user.id) need(patch.active !== false && (patch.roleId === undefined || patch.roleId === before.roleId), 'You cannot disable yourself or change your own role', 403);
    } else if (coll === 'boq') {
      need(s.can('contract', 'edit') || s.can('masters', 'edit'), 'Your role cannot edit BOQ items', 403);
    } else {
      requirePerm(s, 'masters', 'edit');
    }
    if ('active' in patch && patch.active !== before.active) {
      need(s.can('masters', 'delete') || s.can('admin', 'edit'), 'Your role cannot deactivate records', 403);
      action = 'DEACTIVATE';
    }
    if ('code' in patch && patch.code !== before.code) need(!(db[coll] as any[]).some((x) => x.id !== id && x.code?.toLowerCase() === String(patch.code).toLowerCase()), `Code ${patch.code} already exists`, 409);
    after = parse(coll, { ...before, ...Object.fromEntries(keys.map((k) => [k, patch[k]])) });
    after.createdAt = before.createdAt;
    after.createdBy = before.createdBy;
    checkRefs(db, coll, after);
    // BIL-01: a changed estimate rate gives a new contract rate unless a rate was entered
    if (coll === 'boq' && 'estRate' in patch && !('rate' in patch) && after.estRate > 0) after.rate = contractRate(find(db, 'sites', after.siteId), after.estRate);
    if (coll === 'sites') {
      syncStage(after, before);
      if (after.firmId) need(!!find(db, 'firms', after.firmId), 'Unknown firm');
      const store = db.stores.find((x) => x.type === 'SITE' && x.siteId === id);
      if (after.stage === 'CLOSED' && before.stage !== 'CLOSED' && store) {
        const left = storeBalances(db, store.id, ctx.today);
        need(!left.length, `Before closing, transfer the site store balance back to the central godown or write it off: ${left.slice(0, 4).map((x) => `${x.m.name} ${round(x.q, 3)} ${x.m.unit}`).join(', ')}${left.length > 4 ? ` and ${left.length - 4} more` : ''}`, 409);
        need(!db.stockTxns.some((t) => t.status === 'IN_TRANSIT' && (t.toStoreId === store.id || t.fromStoreId === store.id)), 'A transfer to or from this site store is still in transit', 409);
        need(!db.stockTxns.some((t) => t.status === 'PENDING' && t.fromStoreId === store.id), 'A wastage / adjustment of this site store is waiting for approval', 409);
      }
      if (store && (after.stage === 'CLOSED') !== (store.active === false)) {
        const st = { ...store, active: after.stage !== 'CLOSED' };
        out.db = put(out.db, 'stores', st);
        out.changes.push({ coll: 'stores', id: st.id, rec: st });
      }
    }
    // a role that sees masked (zeroed) money fields must not write them back
    if (!s.showRates && !keys.every((k) => ['status', 'docs', 'lastServiceAt', 'active'].includes(k))) fail('Your role cannot edit records that carry rates', 403);
  } else {
    switch (coll) {
      case 'stockTxns': {
        if (patch.status === 'POSTED' && before.status === 'IN_TRANSIT') {
          // MAT-01 / MAT-05 / MAT-06 receipt confirmation
          only(['status', 'receivedAt', 'receivedBy']);
          need(s.seesStore(before.toStoreId) && s.can('inventory', 'add'), 'Only the receiving store can confirm', 403);
          after = { ...before, status: 'POSTED', receivedAt: ctx.today, receivedBy: s.user.name };
          checkStock(ctx, db, before.fromStoreId, [], ctx.today);
          const trial = put(db, coll, after);
          checkNoNegative(ctx, trial, before.lines.map((l: StockLine) => ({ store: before.fromStoreId, materialId: l.materialId, date: ctx.today })));
        } else if (patch.status === 'CANCELLED') {
          // SEC-03: cancel with reason, never delete
          only(['status']);
          need(s.isAdmin, 'Only Admin can cancel a posted voucher', 403);
          need(reason && reason.trim(), 'Reason is required to cancel');
          need(['POSTED', 'APPROVED', 'IN_TRANSIT', 'PENDING'].includes(before.status), 'This voucher cannot be cancelled');
          after = { ...before, status: 'CANCELLED' };
          const trial = put(db, coll, after);
          const keysToCheck = before.lines.flatMap((l: StockLine) => [before.toStoreId, before.fromStoreId].filter(Boolean).map((st: ID) => ({ store: st, materialId: l.materialId, date: before.date })));
          checkNoNegative(ctx, trial, keysToCheck);
          action = 'CANCEL';
        } else fail('Stock vouchers can only be received, approved or cancelled', 403);
        break;
      }
      case 'dispatches': {
        only(['status', 'receivedQty', 'receivedAt', 'arrivalTime', 'arrivalTemp', 'boqItemId', 'chainage']);
        need(before.status === 'DISPATCHED' && patch.status === 'RECEIVED', 'Only a dispatched load can be received');
        if (patch.boqItemId) need(find(db, 'boq', String(patch.boqItemId))?.siteId === before.siteId, 'BOQ item is not of this work');
        need(s.seesSite(before.siteId) || (s.allSites || s.plantIds.includes(before.toPlantId)), 'Only the receiving site can confirm', 403);
        need(s.can('inventory', 'add') || s.can('plant', 'add'), 'Your role cannot confirm receipts', 403);
        const q = Number(patch.receivedQty ?? before.qty);
        need(q >= 0 && q <= before.qty * 1.05, 'Received quantity is not valid');
        after = {
          ...before, status: 'RECEIVED', receivedQty: round(q, 3), receivedAt: ctx.now,
          arrivalTime: patch.arrivalTime ? String(patch.arrivalTime).slice(0, 5) : before.arrivalTime,
          arrivalTemp: patch.arrivalTemp !== undefined && patch.arrivalTemp !== '' ? Number(patch.arrivalTemp) : before.arrivalTemp,
          boqItemId: (patch.boqItemId as string) || before.boqItemId, chainage: patch.chainage !== undefined ? String(patch.chainage).slice(0, 200) : before.chainage,
        };
        break;
      }
      case 'salesInvoices': {
        requirePerm(s, before.kind === 'GOODS' ? 'purchase' : 'plant', 'edit');
        need(s.showRates, 'Your role cannot see sales', 403);
        if (patch.status === 'CANCELLED') {
          only(['status']);
          need(s.isAdmin, 'Only Admin can cancel an invoice', 403);
          need(reason && reason.trim(), 'Reason is required to cancel');
          need(!before.receipts.length, 'Payment is recorded against this invoice');
          after = { ...before, status: 'CANCELLED' };
          for (const did of before.dispatchIds) {
            const d = find(out.db, 'dispatches', did);
            if (d) {
              const upd = { ...d, salesInvoiceId: undefined };
              out.db = put(out.db, 'dispatches', upd);
              out.changes.push({ coll: 'dispatches', id: upd.id, rec: upd });
            }
          }
          action = 'CANCEL';
        } else {
          only(['receipts', 'eway', 'remarks']);
          need(before.status !== 'CANCELLED', 'Invoice is cancelled');
          const p2 = schemas.salesInvoices.parse({ ...before, ...patch });
          need(p2.receipts.length >= before.receipts.length, 'Earlier receipts cannot be changed');
          const total = salesTotal(p2);
          const got = sum(p2.receipts, (x: any) => x.amount);
          need(got <= Math.round(total) + 1, `Receipts (${round(got, 2)}) are more than the invoice total (${Math.round(total)})`);
          after = { ...before, ...p2, createdAt: before.createdAt, createdBy: before.createdBy, status: p2.receipts.length ? (got >= total - 1 ? 'PAID' : 'PARTLY_PAID') : 'ISSUED' };
        }
        break;
      }
      case 'hireOuts': {
        requirePerm(s, 'fleet', 'edit');
        need(s.showRates, 'Your role cannot see hire bills', 403);
        only(['receipts', 'remarks']);
        const p2 = schemas.hireOuts.parse({ ...before, ...patch });
        need(p2.receipts.length >= before.receipts.length, 'Earlier receipts cannot be changed');
        const total = before.units * before.rate * (1 + before.gstPct / 100);
        const got = sum(p2.receipts, (x: any) => x.amount);
        after = { ...before, receipts: p2.receipts, remarks: p2.remarks, status: p2.receipts.length ? (got >= total - 1 ? 'PAID' : 'PARTLY_PAID') : 'BILLED' };
        break;
      }
      case 'invoices':
        // PUR-03: GST input credit eligible / blocked
        only(['itc', 'itcReason']);
        requirePerm(s, 'purchase', 'edit');
        after = { ...before, itc: patch.itc === 'BLOCKED' ? 'BLOCKED' : 'ELIGIBLE', itcReason: String(patch.itcReason || '').slice(0, 200) || undefined };
        break;
      case 'tankDips':
      case 'labTests':
      case 'safety':
      case 'siteRegisters':
      case 'dprs':
      case 'loans':
      case 'subsidyClaims': {
        const mod = coll === 'labTests' && before.plantId ? 'plant' : MODULE[coll];
        need(s.can(mod, 'edit') || (coll === 'dprs' && before.createdBy === s.user.id && before.date === ctx.today), 'Your role cannot edit this', 403);
        if (coll === 'loans' || coll === 'subsidyClaims') need(s.showRates, 'Your role cannot see loans', 403);
        after = parse(coll, { ...before, ...patch });
        after.createdAt = before.createdAt;
        after.createdBy = before.createdBy;
        need(['siteId', 'storeId', 'plantId', 'date', 'kind', 'no'].every((k) => !(k in patch) || patch[k] === before[k] || coll === 'loans' || coll === 'subsidyClaims'), 'Work, store, date and type cannot be changed — enter a new record');
        if (coll === 'siteRegisters' && after.fromDate && after.toDate) need(after.toDate >= after.fromDate, 'Hindrance end is before its start');
        break;
      }
      case 'pos':
        only(['status']);
        need(s.can('purchase', 'edit') || s.can('purchase', 'add'), 'Your role cannot change purchase orders', 403);
        need(patch.status === 'CANCELLED' ? s.isAdmin || s.can('purchase', 'approve') : ['PARTIAL', 'CLOSED'].includes(String(patch.status)), 'Status change not allowed');
        if (patch.status !== 'CANCELLED') {
          // derived from GRNs
          const st = poStatus(db, id);
          after = { ...before, status: st.fullyReceived ? 'CLOSED' : st.lines.some((l) => l.received > 0) ? 'PARTIAL' : before.status };
        } else after = { ...before, status: 'CANCELLED' };
        break;
      case 'requisitions':
        only(['status']);
        requirePerm(s, 'purchase', 'add');
        need(patch.status === 'ORDERED' && (before.status === 'APPROVED' || before.status === 'ORDERED'), 'Only an approved requisition can be marked ordered');
        after = { ...before, status: 'ORDERED' };
        break;
      case 'quotations':
        only(['selectedSupplierId']);
        requirePerm(s, 'purchase', 'add');
        need(!before.selectedSupplierId, 'Supplier already selected');
        need(before.quotes.some((q: any) => q.supplierId === patch.selectedSupplierId), 'Supplier has no quote');
        after = { ...before, selectedSupplierId: patch.selectedSupplierId };
        break;
      case 'wageRuns':
        only(['status', 'paidMode']);
        requirePerm(s, 'labour', 'approve');
        if (patch.status === 'APPROVED') need(before.status === 'DRAFT', 'Only a draft can be approved');
        else if (patch.status === 'PAID') need(before.status === 'APPROVED' && ['CASH', 'BANK', 'UPI', 'CHEQUE'].includes(String(patch.paidMode)), 'Approve first and choose the payment mode');
        else fail('Status change not allowed');
        after = { ...before, status: patch.status, paidMode: patch.paidMode ?? before.paidMode };
        if (patch.status === 'APPROVED') action = 'APPROVE';
        break;
      case 'attendance':
        only(['status', 'otHours', 'headcount', 'photo', 'gps']);
        requirePerm(s, 'labour', 'edit');
        need(!isLocked(ctx, before.date) || s.isAdmin, `Attendance for ${before.date} is locked`, 403);
        if (isLocked(ctx, before.date)) need(reason, 'Reason is required to change locked attendance');
        after = parse(coll, { ...before, ...patch });
        after.createdAt = before.createdAt;
        after.createdBy = before.createdBy;
        break;
      case 'raBills': {
        only(['status', 'receipts', 'passedOn', 'passedGross', 'actualDed', 'remarks', 'submittedOn']);
        requirePerm(s, 'contract', 'edit');
        need(s.showRates, 'Your role cannot see bill amounts', 403);
        after = { ...before };
        if ('remarks' in patch) after.remarks = String(patch.remarks || '').slice(0, 1000);
        if (patch.status === 'SUBMITTED') {
          need(before.status === 'DRAFT', 'Only a draft can be submitted');
          const on = String(patch.submittedOn || ctx.today);
          need(on <= ctx.today && on >= before.date, 'Submission date must be between the bill date and today');
          submitBill(ctx, out, after, on);
        } else if (patch.status === 'CERTIFIED' || 'passedOn' in patch || 'actualDed' in patch || 'passedGross' in patch) {
          // BIL-06: the division passes the bill — record its date, passed value and actual deductions
          if (patch.status === 'CERTIFIED') need(before.status === 'SUBMITTED', 'Only a submitted bill can be marked passed');
          else need(['CERTIFIED', 'PARTLY_PAID', 'PAID'].includes(before.status), 'Record the passing details when the bill is passed');
          const p2 = schemas.raBills.parse({ ...before, passedOn: patch.passedOn ?? before.passedOn, passedGross: patch.passedGross ?? before.passedGross, actualDed: patch.actualDed ?? before.actualDed });
          need(p2.passedOn, 'Passed date is required');
          need(p2.passedOn <= ctx.today && p2.passedOn >= (before.submittedOn || before.date), 'Passed date must be between submission and today');
          after = { ...after, passedOn: p2.passedOn, passedGross: p2.passedGross || undefined, actualDed: p2.actualDed, status: patch.status === 'CERTIFIED' ? 'CERTIFIED' : before.status };
          if (before.receipts.length) {
            const t2 = billTotals(after);
            after.status = t2.received >= t2.net - 1 ? 'PAID' : 'PARTLY_PAID';
          }
        } else if ('receipts' in patch) {
          need(['CERTIFIED', 'PARTLY_PAID'].includes(before.status), 'Receipts can be recorded on passed bills');
          const receipts = schemas.raBills.parse({ ...before, receipts: patch.receipts }).receipts;
          need(receipts.length >= before.receipts.length && receipts.slice(0, before.receipts.length).every((r: any, i: number) => r.amount === before.receipts[i].amount && r.utr === before.receipts[i].utr), 'Earlier receipts cannot be changed');
          need(receipts.every((r: any) => r.date <= ctx.today), 'Receipt date cannot be in the future');
          after = { ...after, receipts };
          const t2 = billTotals(after);
          after.status = t2.received >= t2.net - 1 ? 'PAID' : 'PARTLY_PAID';
        } else if (!('remarks' in patch)) fail('Status change not allowed');
        if (after.kind === 'FINAL' && after.status === 'PAID') stageTo(ctx, out, find(db, 'sites', before.siteId), 'FINAL_BILL_PAID');
        break;
      }
      case 'measurements':
        // the JE's check of a measurement (BIL-02)
        only(['jeStatus', 'jeRemark']);
        need(s.can('contract', 'edit') || s.can('contract', 'approve'), 'Your role cannot record the JE check', 403);
        need(['PENDING', 'CHECKED', 'QUERY'].includes(String(patch.jeStatus ?? before.jeStatus ?? 'PENDING')), 'Unknown check status');
        if (patch.jeStatus === 'QUERY') need(String(patch.jeRemark || '').trim(), 'Write the JE\'s query');
        after = { ...before, jeStatus: patch.jeStatus ?? before.jeStatus, jeRemark: String(patch.jeRemark ?? before.jeRemark ?? '').slice(0, 500) || undefined, jeAt: ctx.now };
        break;
      case 'guarantees':
      case 'bankFacilities':
      case 'taxCredits': {
        requirePerm(s, 'contract', 'edit');
        need(s.showRates, 'Your role cannot see guarantees and tax credits', 403);
        after = parse(coll, { ...before, ...patch });
        after.createdAt = before.createdAt;
        after.createdBy = before.createdBy;
        if (coll === 'guarantees') {
          need(after.extensions.length >= before.extensions.length, 'Earlier extensions cannot be removed');
          const ext = after.extensions.at(-1);
          if (after.extensions.length > before.extensions.length && ext) {
            need(ext.expiry > (before.expiryDate || ''), 'The extended validity must be after the current expiry');
            after.expiryDate = ext.expiry;
            if (ext.claim) after.claimDate = ext.claim;
            after.status = 'EXTENDED';
          }
          if (after.status === 'RELEASED' || after.status === 'ENCASHED') need(after.releasedOn, 'Date of release / encashment is required');
          if (after.siteId) need(s.seesSite(after.siteId), 'Work not in your access', 403);
        }
        break;
      }
      case 'overheads':
        only(['basis', 'manual']);
        requirePerm(s, 'expenses', 'edit');
        need(s.showRates, 'Your role cannot see overheads', 403);
        after = parse(coll, { ...before, ...patch });
        after.createdAt = before.createdAt;
        after.createdBy = before.createdBy;
        break;
      case 'notifications':
        only(['read']);
        need(!before.userId || before.userId === s.user.id, 'Not your notification', 403);
        after = { ...before, read: !!patch.read };
        out.db = put(db, coll, after);
        out.changes.push({ coll, id, rec: after });
        return out; // no audit for read receipts
      default:
        fail('This record cannot be edited — approve, reject or cancel it instead', 403);
    }
  }

  out.db = put(out.db, coll, after);
  out.changes.push({ coll, id, rec: after });
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const k of Object.keys(after)) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) (changedBefore[k] = before[k]), (changedAfter[k] = after[k]);
  out.audit.push({ action, entity: coll, entityId: id, label: `${label(coll, after)} ${action === 'CANCEL' ? 'cancelled' : action === 'DEACTIVATE' ? (after.active === false ? 'deactivated' : 'reactivated') : 'updated'}`, before: changedBefore, after: changedAfter, reason });
  out.record = after;
  return out;
}


/* ================= DECIDE (APR-01/02) ================= */

const DECIDABLE: CollectionKey[] = ['stockTxns', 'requisitions', 'pos', 'expenses', 'fuelIssues', 'imprests', 'subconBills'];
const DECIDE_MODULE: Partial<Record<CollectionKey, string>> = { stockTxns: 'Inventory', requisitions: 'Purchase', pos: 'Purchase', expenses: 'Expenses', fuelIssues: 'Fleet', imprests: 'Expenses', subconBills: 'Labour' };

function approvalAmount(db: DB, coll: CollectionKey, r: any): number {
  switch (coll) {
    case 'stockTxns':
      return txnValue(db, r);
    case 'pos':
      return sum(r.lines, (l: any) => l.qty * l.rate * (1 + l.gstPct / 100));
    case 'expenses':
    case 'imprests':
      return r.amount;
    case 'fuelIssues':
      return r.litres * r.rate;
    case 'subconBills':
      return sum(r.lines, (l: any) => l.qty * l.rate);
    default:
      return 0;
  }
}
function approvalSite(db: DB, coll: CollectionKey, r: any): ID | undefined {
  if (coll === 'stockTxns') return find(db, 'stores', r.fromStoreId || r.toStoreId)?.siteId;
  if (coll === 'requisitions') return find(db, 'stores', r.storeId)?.siteId;
  if (coll === 'pos') return find(db, 'stores', r.deliveryStoreId)?.siteId;
  if (coll === 'subconBills') return find(db, 'workOrders', r.workOrderId)?.siteId;
  return r.siteId;
}

function decide(ctx: Ctx, coll: CollectionKey, id: ID, decision: 'APPROVED' | 'REJECTED' | 'SENT_BACK', remark = ''): Result {
  const s = ctx.session;
  const db = ctx.db;
  need(DECIDABLE.includes(coll), 'Nothing to approve here');
  const before = find(db, coll, id);
  need(before, 'Record not found', 404);
  need(before.status === 'PENDING', 'This entry is not waiting for approval', 409);
  requirePerm(s, 'approvals', 'approve');
  need(approvalVisible(s, { module: DECIDE_MODULE[coll]!, siteId: approvalSite(db, coll, before) }), 'This approval is not for your role', 403);
  if (decision !== 'APPROVED') need(remark.trim(), 'A remark is required to reject or send back');
  need(before.createdBy !== s.user.id || s.isAdmin, 'You cannot approve your own entry', 403);
  const amount = approvalAmount(db, coll, before);
  if (decision === 'APPROVED') need(amount <= s.role.approvalLimit, `Amount is above your approval limit`, 403);

  let status: string = decision;
  let extra: Record<string, unknown> = {};
  if (decision === 'APPROVED') {
    if (coll === 'stockTxns') {
      const t = before as StockTxn;
      if (t.type === 'ISSUE') status = t.issueToVehicleId ? 'POSTED' : 'IN_TRANSIT';
      else if (t.type === 'TRANSFER' || t.type === 'RETURN') status = 'IN_TRANSIT';
      else if (t.type === 'CONSUMPTION' || t.type === 'GRN' || t.type === 'OPENING') status = 'POSTED';
      else status = 'APPROVED';
      if (status === 'POSTED' && t.type === 'ISSUE') extra = { receivedAt: t.date };
      // stock must still be there when it is approved
      const outgoing = t.type === 'ADJUSTMENT' ? t.lines.filter((l) => l.qty < 0).map((l) => ({ ...l, qty: -l.qty })) : t.type === 'GRN' || t.type === 'OPENING' ? [] : t.lines;
      if (t.fromStoreId && outgoing.length && status !== 'IN_TRANSIT') checkStock(ctx, db, t.fromStoreId, outgoing, t.date);
      if (t.fromStoreId && status === 'IN_TRANSIT') checkStock(ctx, db, t.fromStoreId, outgoing, t.date);
    }
    if (coll === 'pos') status = 'OPEN';
  }
  const after = { ...before, status, approvalNote: remark || 'Approved', ...extra };
  const out: Result = { db: put(db, coll, after), changes: [], audit: [] };
  out.changes.push({ coll, id, rec: after });
  out.audit.push({ action: decision === 'APPROVED' ? 'APPROVE' : decision === 'REJECTED' ? 'REJECT' : 'SEND_BACK', entity: coll, entityId: id, label: `${label(coll, after)} ${decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'sent back'}`, reason: remark });
  if (before.createdBy && before.createdBy !== s.user.id) {
    const n = { id: ctx.newId(), at: ctx.now, title: `${before.no || 'Entry'} ${decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'sent back'}`, body: remark || '—', link: '/approvals', read: false, tone: decision === 'APPROVED' ? 'good' : decision === 'REJECTED' ? 'bad' : 'warn', userId: before.createdBy };
    out.db = put(out.db, 'notifications', n);
    out.changes.push({ coll: 'notifications', id: n.id, rec: n });
  }
  out.record = after;
  return out;
}

/* ================= entry point ================= */

export function applyCommand(ctx: Ctx, cmd: Command): Result {
  switch (cmd.kind) {
    case 'insert':
      need(cmd.coll in schemas, 'Unknown record type');
      return insert(ctx, cmd.coll, cmd.rec || {});
    case 'update':
      need(cmd.coll in schemas, 'Unknown record type');
      return update(ctx, cmd.coll, cmd.id, cmd.patch || {}, cmd.reason);
    case 'decide':
      return decide(ctx, cmd.coll, cmd.id, cmd.decision, cmd.remark);
    case 'settings': {
      need(ctx.session.isAdmin, 'Only Admin can change settings', 403);
      const r = settingsSchema.safeParse(cmd.patch);
      if (!r.success) fail(zodMessage(r.error));
      const p = r.data as any;
      const cur = ctx.db.settings;
      const next = {
        ...cur,
        ...p,
        approvalLimits: { ...cur.approvalLimits, ...(p.approvalLimits || {}) },
        tolerance: { ...cur.tolerance, ...(p.tolerance || {}) },
        notify: { ...cur.notify, ...(p.notify || {}) },
      };
      return { db: { ...ctx.db, settings: next }, changes: [{ single: 'settings', value: next }], audit: [{ action: 'UPDATE', entity: 'Settings', entityId: 'settings', label: cmd.reason || 'Settings updated', before: cur, after: p }], record: next };
    }
    case 'company': {
      need(ctx.session.isAdmin, 'Only Admin can change the company profile', 403);
      const r = companySchema.safeParse(cmd.patch);
      if (!r.success) fail(zodMessage(r.error));
      const next = { ...ctx.db.company, ...r.data };
      return { db: { ...ctx.db, company: next }, changes: [{ single: 'company', value: next }], audit: [{ action: 'UPDATE', entity: 'Company', entityId: 'company', label: 'Company profile updated', after: r.data }], record: next };
    }
    case 'markRead': {
      let db = ctx.db;
      const changes: Change[] = [];
      for (const n of db.notifications.filter((x) => !x.read && (!x.userId || x.userId === ctx.session.user.id))) {
        const after = { ...n, read: true };
        db = put(db, 'notifications', after);
        changes.push({ coll: 'notifications', id: n.id, rec: after });
      }
      return { db, changes, audit: [] };
    }
    case 'import':
      return importRows(ctx, cmd.template, cmd.ops);
    default:
      return fail('Unknown command');
  }
}

/** collections whose ids the client may create */
export const CLIENT_COLLECTIONS = Object.keys(schemas).filter((k) => k !== 'audit' && k !== 'notifications') as CollectionKey[];
export { SIMPLE_PREFIX };

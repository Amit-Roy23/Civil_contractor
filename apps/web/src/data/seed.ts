import type {
  Attendance,
  AuditEntry,
  DB,
  DebitNote,
  DipReading,
  Dispatch,
  Expense,
  FuelIssue,
  FuelPurchase,
  Imprest,
  JobCard,
  LabourAdvance,
  LogEntry,
  Measurement,
  Overhead,
  Payment,
  PlantCost,
  POLine,
  Production,
  PurchaseInvoice,
  PurchaseOrder,
  Quotation,
  RaBill,
  Requisition,
  StockLine,
  StockpileReading,
  StockTxn,
  StockTxnType,
  SubconBill,
  TyreRecord,
  WageRun,
  WorkOrder,
} from './types';
import { buildMasters, COMPANY, makeRng } from './seed-masters';
import { addDays, daysBetween, fyCode, monthOf } from '../lib/format';
import { round } from '../lib/utils';

export const SEED_VERSION = 3;
export const WINDOW_DAYS = 75;

export function buildSeed(T: string): DB {
  const M = buildMasters(T);
  const rng = makeRng(2026);
  const { r, ri, pick, chance } = rng;
  const D = (n: number) => addDays(T, -n);
  const start = D(WINDOW_DAYS - 1);
  const days: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) days.push(D(i));

  const seq: Record<string, number> = {};
  const no = (prefix: string, date: string) => {
    seq[prefix] = (seq[prefix] || 0) + 1;
    return `${prefix}/${fyCode(date).slice(2)}/${String(seq[prefix]).padStart(4, '0')}`;
  };
  let idn = 0;
  const nid = (p: string) => `${p}${(++idn).toString(36)}`;
  const at = (date: string, h = 10, m = 0) => `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

  const mat = Object.fromEntries(M.materials.map((x) => [x.id, x]));
  const siteStore = (siteId: string) => `st-${siteId}`;
  const plantStore = (plantId: string) => `py-${plantId}`;
  const engineerOf = (siteId: string) => M.sites.find((s) => s.id === siteId)!.engineerId || 'u1';

  /* ---------- collections ---------- */
  const stockTxns: StockTxn[] = [];
  const requisitions: Requisition[] = [];
  const quotations: Quotation[] = [];
  const pos: PurchaseOrder[] = [];
  const invoices: PurchaseInvoice[] = [];
  const payments: Payment[] = [];
  const debitNotes: DebitNote[] = [];
  const attendance: Attendance[] = [];
  const advances: LabourAdvance[] = [];
  const wageRuns: WageRun[] = [];
  const workOrders: WorkOrder[] = [];
  const subconBills: SubconBill[] = [];
  const imprests: Imprest[] = [];
  const expenses: Expense[] = [];
  const overheads: Overhead[] = [];
  const fuelPurchases: FuelPurchase[] = [];
  const fuelIssues: FuelIssue[] = [];
  const dips: DipReading[] = [];
  const logs: LogEntry[] = [];
  const jobCards: JobCard[] = [];
  const tyres: TyreRecord[] = [];
  const production: Production[] = [];
  const dispatches: Dispatch[] = [];
  const plantCosts: PlantCost[] = [];
  const stockpiles: StockpileReading[] = [];
  const measurements: Measurement[] = [];
  const raBills: RaBill[] = [];
  const audit: AuditEntry[] = [];

  /* ---------- running balances (to keep stock non-negative) ---------- */
  const bal = new Map<string, number>();
  const k = (s: string, m: string) => `${s}|${m}`;
  const getBal = (s: string, m: string) => bal.get(k(s, m)) || 0;
  const addBal = (s: string, m: string, q: number) => bal.set(k(s, m), round(getBal(s, m) + q, 4));
  const rateOf = (m: string) => round(mat[m]!.stdRate * r(0.96, 1.05), 2);

  function txn(type: StockTxnType, date: string, p: Partial<StockTxn> & { lines: StockLine[] }, by = 'u3'): StockTxn {
    const prefix = { OPENING: 'OPN', ISSUE: 'MIN', GRN: 'GRN', PLANT_RECEIPT: 'PRC', CONSUMPTION: 'CON', TRANSFER: 'TRF', RETURN: 'RTN', WASTAGE: 'WST', ADJUSTMENT: 'ADJ' }[type];
    const t: StockTxn = { id: nid('t'), createdAt: type === 'OPENING' ? at(date, 0, 0) : at(date, ri(8, 18), ri(0, 59)), createdBy: by, no: no(prefix, date), type, date, status: 'POSTED', ...p };
    stockTxns.push(t);
    const posted = t.status === 'POSTED' || t.status === 'APPROVED';
    if (posted) {
      for (const l of t.lines) {
        if (type === 'ADJUSTMENT') addBal(t.fromStoreId || t.toStoreId!, l.materialId, l.qty);
        else {
          if (t.fromStoreId) addBal(t.fromStoreId, l.materialId, -l.qty);
          if (t.toStoreId) addBal(t.toStoreId, l.materialId, l.qty);
        }
      }
    }
    return t;
  }

  /* ---------- supplier routing ---------- */
  const supplierFor: Record<string, string[]> = {
    m01: ['sp01', 'sp01', 'sp02'], m02: ['sp02', 'sp01'], m03: ['sp03', 'sp04'], m04: ['sp03', 'sp04'], m05: ['sp03'], m22: ['sp03'],
    m06: ['sp06'], m07: ['sp06'], m08: ['sp06'], m09: ['sp06'], m10: ['sp06'], m11: ['sp07'], m12: ['sp05'], m13: ['sp05'], m14: ['sp11'],
    m15: ['sp10'], m16: ['sp11'], m19: ['sp17'], m20: ['sp08'], m21: ['sp09'], m23: ['sp03'], m24: ['sp03'], m25: ['sp03'], m26: ['sp18'], m27: ['sp17'], m28: ['sp17'],
  };
  const centralRouted = new Set(['m01', 'm02', 'm03', 'm04', 'm05', 'm22', 'm21', 'm16', 'm19', 'm26', 'm27', 'm28', 'm23', 'm24', 'm25']);

  /** PO + GRN (purchase cycle PUR-01..04) */
  function purchase(storeId: string, materialId: string, q: number, date: string, opts: { reqBy?: string; partial?: boolean } = {}) {
    const supplierId = pick(supplierFor[materialId] || ['sp06']);
    const rate = rateOf(materialId);
    const m = mat[materialId]!;
    const reqDate = addDays(date, -ri(5, 9));
    const poDate = addDays(date, -ri(2, 4));
    const req: Requisition = {
      id: nid('rq'), createdAt: at(reqDate, 11), createdBy: opts.reqBy || 'u3', no: no('REQ', reqDate), date: reqDate, storeId, requiredBy: date,
      purpose: storeId === 'cs' ? 'Central store replenishment (reorder level)' : 'Site requirement for ongoing work', lines: [{ materialId, qty: q }], status: 'ORDERED',
    };
    requisitions.push(req);
    if (['Cement', 'Steel', 'Bitumen'].includes(m.category) && chance(0.6)) {
      const others = Array.from(new Set([supplierId, ...(supplierFor[materialId] || []), pick(['sp04', 'sp02', 'sp06'])])).slice(0, 3);
      quotations.push({
        id: nid('qt'), createdAt: at(reqDate, 15), createdBy: 'u2', no: no('QTN', reqDate), date: reqDate, requisitionId: req.id, materialId, qty: q,
        quotes: others.map((sid, i) => ({ supplierId: sid, rate: sid === supplierId ? rate : round(rate * r(1.01, 1.06), 2), deliveryDays: ri(2, 7), terms: i === 0 ? '30 days credit, FOR site' : pick(['21 days credit', 'Advance 20%', '15 days credit, ex-depot']) })),
        selectedSupplierId: supplierId,
      });
    }
    const poQty = opts.partial ? round(q * r(1.4, 1.8), 1) : q;
    const po: PurchaseOrder = {
      id: nid('po'), createdAt: at(poDate, 12), createdBy: 'u2', no: no('PO', poDate), date: poDate, supplierId, deliveryStoreId: storeId, requisitionId: req.id,
      lines: [{ materialId, qty: poQty, rate, gstPct: m.gstPct }], deliveryTerms: 'FOR destination, unloading by supplier', paymentTerms: `${M.suppliers.find((s) => s.id === supplierId)!.creditDays} days credit`,
      status: opts.partial ? 'PARTIAL' : 'CLOSED',
    };
    pos.push(po);
    const rejected = chance(0.07) ? round(q * r(0.01, 0.04), 2) : 0;
    const accepted = round(q - rejected, 4);
    const g = txn('GRN', date, {
      toStoreId: storeId, supplierId, poId: po.id, challanNo: `CH-${ri(10000, 99999)}`, vehicleNo: `AS${pick(['01', '02', '25', '12'])}-${pick(['AC', 'BC', 'EC', 'FC'])}-${ri(1000, 9999)}`,
      weighbridgeSlip: ['MT', 'CUM'].includes(m.unit) ? `WB-${ri(100000, 999999)}` : undefined, receivedBy: storeId === 'cs' ? 'Bikash Kalita' : 'Site store',
      lines: [{ materialId, qty: accepted, rate, orderedQty: poQty, rejectedQty: rejected || undefined, rejectReason: rejected ? pick(['Bags torn / set cement', 'Wrong diameter in lot', 'Wet material', 'Short weight at weighbridge']) : undefined, batchNo: m.batchTracked ? `${m.code.slice(0, 3)}-${ri(10, 52)}W-${ri(100, 999)}` : undefined }],
      photos: ri(1, 3),
    }, storeId === 'cs' ? 'u3' : storeId.startsWith('py') ? 'u8' : engineerOf(storeId.replace('st-', '')));
    if (rejected) {
      debitNotes.push({ id: nid('dn'), createdAt: at(addDays(date, 1), 12), createdBy: 'u2', no: no('DN', addDays(date, 1)), date: addDays(date, 1), supplierId, grnId: g.id, materialId, qty: rejected, rate, reason: g.lines[0]!.rejectReason! });
    }
    return g;
  }

  /** make sure `store` holds at least `need` of `materialId` on `date` */
  function ensure(store: string, materialId: string, need: number, date: string) {
    const m = mat[materialId]!;
    const have = getBal(store, materialId);
    const buffer = store === 'cs' ? m.minStock : m.minStock * 0.25;
    if (have >= need + buffer * 0.5) return;
    const qty = Math.max(need * 2.5, m.reorderQty * (store === 'cs' ? 1 : 0.4));
    const q = roundQty(materialId, qty);
    if (store === 'cs') {
      purchase('cs', materialId, q, date, { partial: chance(0.08) });
    } else if (centralRouted.has(materialId)) {
      ensure('cs', materialId, q, date);
      const siteId = store.startsWith('st-') ? store.slice(3) : undefined;
      txn('ISSUE', date, { fromStoreId: 'cs', toStoreId: store, lines: [{ materialId, qty: q, rate: 0 }], vehicleNo: `AS01-${pick(['EC', 'FC'])}-${ri(1000, 9999)}`, receivedBy: siteId ? M.users.find((u) => u.id === engineerOf(siteId))?.name : 'Plant store', receivedAt: date, status: 'POSTED' });
    } else {
      purchase(store, materialId, q, date, { reqBy: store.startsWith('py') ? 'u8' : engineerOf(store.slice(3)) });
    }
  }
  function roundQty(materialId: string, q: number) {
    const u = mat[materialId]!.unit;
    if (u === 'NOS') return Math.ceil(q / 500) * 500 || 500;
    if (u === 'LTR' || u === 'KG') return Math.ceil(q / 100) * 100;
    return Math.ceil(q / 5) * 5;
  }

  /* ---------- opening stock (MAT-09) ---------- */
  const openLines = (store: string, list: Array<[string, number]>) =>
    txn('OPENING', start, { toStoreId: store, lines: list.map(([m, q]) => ({ materialId: m, qty: q, rate: round(mat[m]!.stdRate * 0.98, 2) })), remark: 'Opening stock at go-live (physical verification)' }, 'u1');
  openLines('cs', [['m01', 180], ['m02', 90], ['m03', 45], ['m04', 60], ['m05', 40], ['m22', 1600], ['m21', 90], ['m16', 14], ['m19', 520], ['m26', 900], ['m27', 14], ['m28', 10], ['m23', 1400], ['m24', 1500], ['m25', 700], ['m15', 1200]]);
  openLines('st-s1', [['m01', 18], ['m04', 22], ['m22', 300], ['m21', 40], ['m06', 220], ['m09', 260], ['m07', 180], ['m08', 120], ['m10', 120]]);
  openLines('st-s2', [['m01', 24], ['m05', 30], ['m04', 18], ['m22', 260], ['m11', 40], ['m07', 80]]);
  openLines('st-s3', [['m01', 10], ['m21', 30], ['m11', 25], ['m07', 60], ['m06', 140], ['m09', 140], ['m08', 60]]);
  openLines('st-s4', [['m01', 22], ['m02', 16], ['m03', 18], ['m22', 260], ['m11', 70], ['m07', 70], ['m20', 26000]]);
  openLines('st-s5', [['m01', 8], ['m04', 9], ['m22', 120], ['m10', 260]]);
  openLines('py-p1', [['m07', 500], ['m08', 450], ['m09', 520], ['m12', 32], ['m16', 6]]);
  openLines('py-p2', [['m01', 60], ['m11', 120], ['m07', 260], ['m08', 160], ['m15', 2200], ['m14', 18]]);
  openLines('py-p3', [['m10', 2600], ['m06', 900], ['m07', 700], ['m08', 500], ['m09', 600]]);

  /* ---------- tools & tackles issued to sites (MAT-15) ---------- */
  const toolPlan: Array<[string, string, number]> = [['s2', 'm23', 420], ['s2', 'm24', 520], ['s2', 'm25', 160], ['s4', 'm23', 300], ['s4', 'm24', 450], ['s4', 'm25', 220], ['s1', 'm23', 140], ['s5', 'm23', 80], ['s5', 'm24', 60]];
  for (const [s, m, q] of toolPlan) txn('ISSUE', addDays(start, ri(0, 6)), { fromStoreId: 'cs', toStoreId: siteStore(s), lines: [{ materialId: m, qty: q, rate: 0 }], remark: 'Returnable — tools & tackles', receivedAt: addDays(start, 7), status: 'POSTED' });

  /* ---------- other inventory transactions (scheduled into the day loop) ---------- */
  function scheduleSideEvents() {
  // inter-site transfers (MAT-05)
  const tr = (from: string, to: string, m: string, q: number, d: string, inTransit = false) => {
    if (getBal(siteStore(from), m) < q) return;
    txn('TRANSFER', d, { fromStoreId: siteStore(from), toStoreId: siteStore(to), lines: [{ materialId: m, qty: q, rate: 0 }], vehicleNo: `AS01-EC-${ri(1000, 9999)}`, status: inTransit ? 'IN_TRANSIT' : 'POSTED', receivedAt: inTransit ? undefined : d, remark: 'Surplus at sender site' }, engineerOf(from));
  };
  on(D(50), () => tr('s1', 's3', 'm01', 6, D(50)));
  on(D(66), () => tr('s2', 's5', 'm04', 3.2, D(66)));
  on(D(28), () => tr('s4', 's2', 'm22', 120, D(28)));
  on(D(1), () => tr('s1', 's3', 'm21', 8, D(1), true));
  on(D(0), () => tr('s2', 's4', 'm01', 4, D(0), true));
  // central store issue in transit (MAT-01 pending receipt)
  on(D(0), () => { ensure('cs', 'm03', 6, D(0)); txn('ISSUE', D(0), { fromStoreId: 'cs', toStoreId: 'st-s4', lines: [{ materialId: 'm03', qty: 6, rate: 0 }], vehicleNo: 'AS01-FC-1188', status: 'IN_TRANSIT', remark: 'For Block A 4th floor slab' }); });
  on(D(1), () => txn('ISSUE', D(1), { fromStoreId: 'cs', toStoreId: 'st-s2', lines: [{ materialId: 'm05', qty: 12, rate: 0 }], vehicleNo: 'AS01-EC-4522', status: 'PENDING', remark: 'Above issue limit — awaiting owner approval' }));
  // returns to central (MAT-06) from on-hold site
  on(D(30), () => getBal('st-s5', 'm22') > 40 && txn('RETURN', D(30), { fromStoreId: 'st-s5', toStoreId: 'cs', lines: [{ materialId: 'm22', qty: 40, rate: 0 }], condition: 'Good', remark: 'Work on hold — surplus returned', receivedAt: D(30) }, 'u5'));
  on(D(29), () => txn('RETURN', D(29), { fromStoreId: 'st-s5', toStoreId: 'cs', lines: [{ materialId: 'm23', qty: 76, rate: 0 }, { materialId: 'm24', qty: 58, rate: 0 }], condition: 'Good — 4 plates bent', remark: 'Tools returned, site on hold', receivedAt: D(29) }, 'u5'));
  on(D(12), () => txn('RETURN', D(12), { fromStoreId: 'st-s1', toStoreId: 'cs', lines: [{ materialId: 'm23', qty: 60, rate: 0 }], condition: 'Good', receivedAt: D(12) }, 'u4'));
  // tools lost/damaged (MAT-15)
  on(D(28), () => txn('WASTAGE', D(28), { fromStoreId: 'st-s5', lines: [{ materialId: 'm23', qty: 4, rate: 0 }, { materialId: 'm24', qty: 2, rate: 0 }], reason: 'Damaged — tools & tackles written off', photos: 2, status: 'APPROVED', approvalNote: 'Approved by owner' }, 'u5'));
  // wastage (MAT-07)
  const wst = (s: string, m: string, q: number, d: string, reason: string, status: StockTxn['status'] = 'APPROVED') => on(d, () => {
    if (getBal(siteStore(s), m) < q) return;
    txn('WASTAGE', d, { fromStoreId: siteStore(s), lines: [{ materialId: m, qty: q, rate: 0 }], reason, photos: ri(1, 3), status }, engineerOf(s));
  });
  wst('s4', 'm01', 1.25, D(61), 'Cement bags set due to roof leak in store (25 bags)');
  wst('s1', 'm21', 2, D(44), 'Pipe cracked during unloading');
  wst('s2', 'm05', 0.35, D(37), 'Cut-length wastage beyond norm');
  wst('s3', 'm01', 0.6, D(19), 'Rain damage — 12 bags');
  wst('s4', 'm20', 850, D(9), 'Broken bricks during handling');
  wst('s1', 'm01', 0.9, D(1), 'Hardened cement found during stock check (18 bags)', 'PENDING');
  // adjustments (MAT-08)
  const adj = (store: string, m: string, delta: number, d: string, status: StockTxn['status'] = 'APPROVED') => on(d, () => {
    const sys = round(getBal(store, m), 2);
    txn('ADJUSTMENT', d, { fromStoreId: store, lines: [{ materialId: m, qty: delta, rate: 0, systemQty: sys, physicalQty: round(sys + delta, 2) }], reason: 'Physical verification — monthly stock count', status }, store === 'cs' ? 'u3' : engineerOf(store.slice(3)));
  });
  adj('cs', 'm22', -35, D(45));
  adj('st-s3', 'm11', -3.5, D(31));
  adj('st-s4', 'm11', 2.2, D(31));
  adj('cs', 'm19', -18, D(14));
  adj('st-s2', 'm22', -22, D(2), 'PENDING');
  // spares issued to vehicles (STR-05)
  const spareIssues: Array<[string, string, number, number]> = [['v07', 'm19', 28, 60], ['v07', 'm27', 2, 60], ['v13', 'm19', 35, 48], ['v08', 'm27', 2, 40], ['v01', 'm28', 2, 34], ['v12', 'm27', 1, 21], ['v11', 'm19', 24, 18], ['v14', 'm19', 26, 9], ['v03', 'm28', 1, 6], ['v10', 'm19', 12, 3]];
  for (const [v, m, q, ago] of spareIssues) {
    on(D(ago), () => {
      ensure('cs', m, q, D(ago));
      txn('ISSUE', D(ago), { fromStoreId: 'cs', issueToVehicleId: v, lines: [{ materialId: m, qty: q, rate: 0 }], remark: 'Issued against job card', status: 'POSTED' });
    });
  }
  for (const ago of [56, 42, 28, 14, 1]) {
    on(D(ago), () => {
      for (const [p, m, f] of [['p1', 'm12', r(0.975, 0.99)], ['p1', 'm07', r(0.96, 1.01)], ['p1', 'm09', r(0.95, 1.0)], ['p3', 'm07', r(0.97, 1.01)]] as Array<[string, string, number]>) {
        stockpiles.push({ id: nid('sk'), createdAt: at(D(ago), 17), createdBy: 'u8', date: D(ago), plantId: p, materialId: m, physicalQty: round(Math.max(0, getBal(plantStore(p), m)) * f, 2) });
      }
    });
  }
  }


  /* events that must run on their own date inside the simulation (balances must be "as of" that day) */
  const events: Record<string, Array<() => void>> = {};
  const on = (date: string, fn: () => void) => (events[date] ||= []).push(fn);
  scheduleSideEvents();

  /* ---------- day-by-day simulation ---------- */
  const rainDays = new Set(days.filter(() => chance(0.12)));
  const tripVehiclesHMP = ['v01', 'v02', 'v03', 'v22'];
  const tripVehiclesCRS = ['v04', 'v19', 'v03'];
  const tmVehicles = ['v05', 'v06'];
  const boqOf = (siteId: string, itemNo: string) => M.boq.find((b) => b.siteId === siteId && b.itemNo === itemNo)!;
  const recipe = (id: string) => M.recipes.find((x) => x.id === id)!;
  const varianceFactor = (siteId: string, materialId: string) => {
    if (siteId === 's4' && (materialId === 'm01' || materialId === 'm02')) return r(1.055, 1.085); // cement over-use at Dibrugarh (ALT-02 demo)
    if (siteId === 's2' && materialId === 'm05') return r(1.035, 1.05);
    if (mat[materialId]!.category === 'Plant Output') return r(0.995, 1.015);
    return r(0.985, 1.03);
  };

  /** consume a BOQ work item at a site: measurement + consumption voucher */
  function doWork(siteId: string, itemNo: string, date: string, measuredQty: number, opts: { chainage?: string; limitByStock?: boolean } = {}) {
    const b = boqOf(siteId, itemNo);
    const store = siteStore(siteId);
    let q = round(measuredQty, 2);
    const rec = b.recipeId ? recipe(b.recipeId) : undefined;
    const lines: StockLine[] = [];
    if (rec) {
      const factors = rec.lines.map((l) => varianceFactor(siteId, l.materialId));
      if (opts.limitByStock) {
        for (let i = 0; i < rec.lines.length; i++) {
          const l = rec.lines[i]!;
          const avail = getBal(store, l.materialId);
          const maxQ = avail / (l.qty * factors[i]!);
          if (maxQ < q) q = Math.floor(maxQ * 100) / 100;
        }
        if (q <= 0.5) return;
      } else {
        rec.lines.forEach((l, i) => ensure(store, l.materialId, l.qty * q * factors[i]!, date));
      }
      rec.lines.forEach((l, i) => lines.push({ materialId: l.materialId, qty: round(l.qty * q * factors[i]!, 3), rate: 0 }));
    }
    const ch = opts.chainage || chainageFor(siteId);
    measurements.push({
      id: nid('ms'), createdAt: at(date, 18, ri(0, 50)), createdBy: engineerOf(siteId), date, siteId, boqItemId: b.id, chainage: ch,
      length: 0, breadth: 0, depth: 0, nos: 0, qty: q, mbNo: `MB-${siteId.toUpperCase()}-${String(Math.floor(daysBetween(M.sites.find((s) => s.id === siteId)!.startDate, date) / 30) + 1).padStart(2, '0')}`,
    });
    if (lines.length) {
      txn('CONSUMPTION', date, { fromStoreId: store, lines, boqItemId: b.id, workDone: `${b.description} — ${ch}`, location: ch, status: 'POSTED' }, engineerOf(siteId));
    }
  }
  const chain: Record<string, number> = { s1: 12.4, s3: 3.1 };
  function chainageFor(siteId: string) {
    if (siteId === 's1' || siteId === 's3') {
      const c = (chain[siteId] = (chain[siteId] || 0) + r(0.03, 0.12));
      const a = Math.floor(c);
      const b2 = Math.round((c - a) * 1000);
      return `Ch ${a}+${String(b2).padStart(3, '0')} to ${a}+${String(Math.min(999, b2 + ri(150, 300))).padStart(3, '0')}`;
    }
    if (siteId === 's2') return pick(['Pier P7', 'Pier P8', 'Pier P9', 'Span P6–P7 deck', 'Span P7–P8 deck', 'Abutment A2']);
    if (siteId === 's4') return pick(['Block A, 3rd floor slab', 'Block A, columns L4', 'Block B, footing F12', 'Block B, 2nd floor', 'Staircase core']);
    return pick(['Panel RW-14', 'Panel RW-15', 'Panel RW-16']);
  }

  /* plant production + dispatch helpers */
  const plantOfProduct: Record<string, string> = { m30: 'p1', m31: 'p1', m32: 'p2', m33: 'p2', m34: 'p2' };
  const drivers: Record<string, string> = Object.fromEntries(M.vehicles.map((v) => [v.id, v.driver]));
  let tempWarnGiven = false;

  function produceAndDispatch(date: string, productId: string, siteId: string, qtyNeeded: number, isToday: boolean) {
    const plantId = plantOfProduct[productId]!;
    const pStore = plantStore(plantId);
    const recId = productId === 'm31' && siteId === 's3' ? 'r-bc-s3' : productId === 'm33' && siteId === 's2' ? 'r-m25-s2' : { m30: 'r-dbm', m31: 'r-bc', m32: 'r-m20', m33: 'r-m25', m34: 'r-m30' }[productId]!;
    const rec = recipe(recId);
    const rejected = chance(0.15) ? round(qtyNeeded * r(0.003, 0.012), 2) : 0;
    const produced = round(qtyNeeded + rejected, 2);
    // raw materials into plant
    rec.lines.forEach((l) => ensurePlantRaw(pStore, l.materialId, l.qty * produced * 1.03, date));
    const hasActual = chance(0.55);
    const actual = hasActual ? rec.lines.map((l) => ({ materialId: l.materialId, qty: round(l.qty * produced * r(0.99, 1.035), 3) })) : undefined;
    const used = actual || rec.lines.map((l) => ({ materialId: l.materialId, qty: round(l.qty * produced, 3) }));
    used.forEach((u) => addBal(pStore, u.materialId, -u.qty));
    const isHmp = plantId === 'p1';
    const runHours = round(produced / (isHmp ? r(95, 112) : r(22, 27)), 1);
    const meter0 = (plantMeters[plantId] = plantMeters[plantId] || (isHmp ? 8420 : 5310));
    plantMeters[plantId] = round(meter0 + runHours, 1);
    production.push({
      id: nid('pr'), createdAt: at(date, 19, ri(0, 40)), createdBy: 'u8', no: no(isHmp ? 'HMP' : 'RMC', date), date, shift: 'DAY', plantId, productId, recipeId: recId, qty: produced,
      runHours, startMeter: meter0, stopMeter: plantMeters[plantId]!, dgUnits: Math.round(runHours * (isHmp ? r(78, 92) : r(28, 36))),
      fuelUsed: Math.round(produced * (isHmp ? r(6.8, 7.6) : r(0.35, 0.45))), operator: isHmp ? 'Montu Deka' : 'Babul Boro', actual, rejectedQty: rejected,
      rejectReason: rejected ? pick(['Under-temperature batch discarded', 'Segregated mix rejected', 'Excess bitumen — wasted', 'Slump failure']) : undefined,
    });
    addBal(pStore, productId, qtyNeeded);
    // trips
    const tripSize = isHmp ? 24 : 6.5;
    let left = qtyNeeded;
    let h = 7;
    let tIdx = 0;
    const vehs = isHmp ? tripVehiclesHMP : tmVehicles;
    while (left > 0.1) {
      const q = round(Math.min(left, tripSize * r(0.92, 1.06)), 2);
      left = round(left - q, 2);
      const vId = vehs[tIdx++ % vehs.length]!;
      const late = isToday && h >= 13;
      const diff = chance(0.03) ? round(q * r(0.02, 0.035), 2) : chance(0.3) ? round(q * r(0, 0.008), 2) : 0;
      const temp = isHmp ? ri(138, 162) : undefined;
      const returned = isHmp && !tempWarnGiven && chance(0.004);
      if (returned) tempWarnGiven = true;
      const d: Dispatch = {
        id: nid('dp'), createdAt: at(date, h, ri(0, 59)), createdBy: 'u8', no: no(isHmp ? 'DSP-H' : 'DSP-R', date), date, time: `${String(h).padStart(2, '0')}:${String(ri(0, 59)).padStart(2, '0')}`,
        plantId, productId, qty: q, vehicleId: vId, driver: drivers[vId]!, siteId, boqItemId: M.boq.find((b) => b.siteId === siteId && b.recipeId && recipe(b.recipeId).lines[0]!.materialId === productId)?.id,
        chainage: chainageFor(siteId), temperature: returned ? 118 : temp, weighbridgeSlip: `WB-${ri(100000, 999999)}`,
        status: returned ? 'RETURNED' : late ? 'DISPATCHED' : 'RECEIVED', receivedQty: returned || late ? undefined : round(q - diff, 2), receivedAt: returned || late ? undefined : at(date, h + 1, ri(0, 59)),
        returnReason: returned ? 'Mix temperature 118°C below spec at site — load rejected' : undefined,
      };
      dispatches.push(d);
      addBal(pStore, productId, -q);
      if (d.status === 'RECEIVED') addBal(siteStore(siteId), productId, d.receivedQty!);
      h = Math.min(20, h + (isHmp ? 1 : 1));
      if (h >= 20) h = 8;
    }
  }
  const plantMeters: Record<string, number> = {};
  function ensurePlantRaw(pStore: string, materialId: string, need: number, date: string) {
    if (getBal(pStore, materialId) >= need) return;
    const crusherOut = ['m06', 'm07', 'm08', 'm09'].includes(materialId);
    const q = roundQty(materialId, Math.max(need * 3, mat[materialId]!.reorderQty * 0.5));
    if (crusherOut && getBal('py-p3', materialId) >= q) {
      crusherDispatch(date, materialId, q, { toPlantId: pStore.slice(3) });
    } else if (centralRouted.has(materialId)) {
      ensure(pStore, materialId, need, date);
    } else {
      purchase(pStore, materialId, q, date, { reqBy: 'u8' });
    }
  }
  function crusherDispatch(date: string, materialId: string, q: number, to: { siteId?: string; toPlantId?: string }) {
    let left = q;
    let h = 7;
    let i = 0;
    while (left > 0.1) {
      const tq = round(Math.min(left, r(19, 23) * (to.toPlantId ? 3 : 1)), 2);
      left = round(left - tq, 2);
      const vId = tripVehiclesCRS[i++ % tripVehiclesCRS.length]!;
      dispatches.push({
        id: nid('dp'), createdAt: at(date, h, ri(0, 59)), createdBy: 'u8', no: no('DSP-C', date), date, time: `${String(h).padStart(2, '0')}:${String(ri(0, 59)).padStart(2, '0')}`,
        plantId: 'p3', productId: materialId, qty: tq, vehicleId: vId, driver: drivers[vId]!, siteId: to.siteId, toPlantId: to.toPlantId, chainage: to.siteId ? chainageFor(to.siteId) : '—',
        weighbridgeSlip: `WB-${ri(100000, 999999)}`, status: 'RECEIVED', receivedQty: tq, receivedAt: at(date, h + 2, ri(0, 59)),
      });
      addBal('py-p3', materialId, -tq);
      addBal(to.siteId ? siteStore(to.siteId) : plantStore(to.toPlantId!), materialId, tq);
      h = Math.min(19, h + 1);
    }
  }
  function supplyCrusherProduct(date: string, siteId: string, materialId: string, need: number) {
    const store = siteStore(siteId);
    const have = getBal(store, materialId);
    if (have >= need) return;
    const q = Math.ceil((need - have) * 1.15);
    if (getBal('py-p3', materialId) >= q) crusherDispatch(date, materialId, q, { siteId });
    else purchase(store, materialId, roundQty(materialId, q), date);
  }

  const siteActiveOn = (siteId: string, date: string) => (siteId === 's5' ? daysBetween(start, date) < 32 : true);

  for (const date of days) {
    const isToday = date === T;
    const dow = new Date(date + 'T00:00:00').getDay();
    const rain = rainDays.has(date);
    const workFactor = rain ? 0.35 : dow === 0 ? 0.5 : 1;
    (events[date] || []).forEach((fn) => fn());

    /* --- Crusher production (PLT-08) --- */
    if (!rain && dow !== 0 && !isToday) {
      const input = Math.round(r(1150, 1700));
      ensurePlantRaw('py-p3', 'm10', input, date);
      addBal('py-p3', 'm10', -input);
      const rec = recipe('r-crs');
      const outs = rec.split!.map((s) => ({ materialId: s.materialId, qty: round((input * s.pct * r(0.97, 1.02)) / 100, 2) }));
      outs.forEach((o) => addBal('py-p3', o.materialId, o.qty));
      const runHours = round(input / r(135, 150), 1);
      const m0 = (plantMeters.p3 = plantMeters.p3 || 11240);
      plantMeters.p3 = round(m0 + runHours, 1);
      production.push({
        id: nid('pr'), createdAt: at(date, 19), createdBy: 'u8', no: no('CRS', date), date, shift: 'DAY', plantId: 'p3', productId: 'm10', recipeId: 'r-crs', qty: input,
        runHours, startMeter: m0, stopMeter: plantMeters.p3, dgUnits: Math.round(runHours * r(150, 175)), fuelUsed: Math.round(input * r(0.42, 0.5)), operator: 'Prakash Rabha',
        actual: outs, rejectedQty: 0,
      });
    }

    /* --- Plant products demanded by sites --- */
    if (!rain) {
      if (chance(0.5 * workFactor)) produceAndDispatch(date, 'm30', 's1', round(r(280, 480), 1), isToday);
      else if (chance(0.3 * workFactor)) produceAndDispatch(date, 'm31', 's1', round(r(180, 320), 1), isToday);
      if (chance(0.28 * workFactor)) produceAndDispatch(date, 'm31', 's3', round(r(110, 210), 1), isToday);
    }
    if (chance(0.38 * workFactor)) produceAndDispatch(date, 'm33', 's1', round(r(24, 55), 1), isToday);
    if (chance(0.45 * workFactor)) produceAndDispatch(date, 'm34', 's2', round(r(30, 68), 1), isToday);
    if (chance(0.3 * workFactor)) produceAndDispatch(date, 'm33', 's2', round(r(40, 85), 1), isToday);
    if (chance(0.4 * workFactor)) produceAndDispatch(date, 'm33', 's4', round(r(18, 48), 1), isToday);
    if (siteActiveOn('s5', date) && chance(0.3)) produceAndDispatch(date, 'm33', 's5', round(r(20, 45), 1), isToday);

    /* --- Site work (MAT-04 + BOQ-02) --- */
    const plantItems: Array<[string, string, string]> = [['s1', '4.01', 'm30'], ['s1', '4.02', 'm31'], ['s3', '4.01', 'm31'], ['s1', '5.01', 'm33'], ['s2', '3.01', 'm34'], ['s2', '3.02', 'm33'], ['s4', '3.01', 'm33'], ['s5', '2.01', 'm33']];
    for (const [s, item, prod] of plantItems) {
      const avail = getBal(siteStore(s), prod);
      if (avail > 1) {
        const rq = recipe(boqOf(s, item).recipeId!).lines[0]!.qty;
        doWork(s, item, date, (avail * r(0.96, 0.995)) / (rq * 1.005), { limitByStock: true });
      }
    }
    if (rain) continue;
    // crusher-fed granular layers
    for (const [s, item, p, lo, hi] of [['s1', '2.01', 0.38, 140, 280], ['s1', '3.01', 0.32, 110, 230], ['s3', '2.01', 0.3, 70, 150], ['s3', '3.01', 0.25, 60, 130]] as Array<[string, string, number, number, number]>) {
      if (!chance(p * workFactor)) continue;
      const q = round(r(lo, hi), 1);
      recipe(boqOf(s, item).recipeId!).lines.forEach((l) => supplyCrusherProduct(date, s, l.materialId, l.qty * q * 1.04));
      doWork(s, item, date, q, { limitByStock: true });
    }
    const workPlan: Array<[string, string, number, number, number]> = [
      ['s1', '1.01', 0.85, 450, 1100], ['s1', '5.02', 0.3, 3.5, 8.5], ['s1', '6.01', 0.14, 6, 18], ['s1', 'X-01', 0.18, 25, 60],
      ['s2', '1.01', 0.5, 60, 180], ['s2', '2.01', 0.15, 6, 18], ['s2', '4.01', 0.4, 4, 10], ['s2', '4.02', 0.25, 2.5, 6], ['s2', '5.01', 0.04, 2, 4], ['s2', '6.01', 0.1, 10, 24],
      ['s3', '1.01', 0.75, 250, 600], ['s3', '5.01', 0.14, 8, 20], ['s3', '6.01', 0.2, 4, 11],
      ['s4', '2.01', 0.1, 3, 9], ['s4', '4.01', 0.42, 2.5, 6.5], ['s4', '5.01', 0.45, 7, 17], ['s4', '6.01', 0.35, 140, 340], ['s4', '7.01', 0.12, 60, 160], ['s4', '8.01', 0.08, 8, 24],
      ['s5', '1.01', 0.4, 40, 120], ['s5', '3.01', 0.3, 1.5, 4.5], ['s5', '4.01', 0.3, 35, 85],
    ];
    for (const [s, item, p, lo, hi] of workPlan) {
      if (!siteActiveOn(s, date)) continue;
      if (isToday && chance(0.6)) continue;
      if (chance(p * workFactor)) doWork(s, item, date, round(r(lo, hi), 2));
    }
  }

  /* ---------- pending purchase workflow items ---------- */
  const reqPending: Array<[string, string, number, number, string]> = [['st-s4', 'm03', 18, 1, 'u7'], ['st-s2', 'm05', 25, 0, 'u5'], ['py-p1', 'm12', 40, 2, 'u8'], ['st-s1', 'm21', 30, 3, 'u4']];
  reqPending.forEach(([store, m, q, ago, by], i) =>
    requisitions.push({ id: nid('rq'), createdAt: at(D(ago), 10 + i), createdBy: by, no: no('REQ', D(ago)), date: D(ago), storeId: store, requiredBy: addDays(T, ri(5, 12)), purpose: pick(['Next pour', 'Slab casting schedule', 'Running low — plant continuity', 'Culvert at Ch 18+200']), lines: [{ materialId: m, qty: q }], status: i === 3 ? 'APPROVED' : 'PENDING' }),
  );
  quotations.push({ id: nid('qt'), createdAt: at(D(1), 16), createdBy: 'u2', no: no('QTN', D(1)), date: D(1), requisitionId: requisitions[requisitions.length - 2]!.id, materialId: 'm12', qty: 40, quotes: [{ supplierId: 'sp05', rate: 51800, deliveryDays: 3, terms: '15 days credit' }, { supplierId: 'sp06', rate: 53400, deliveryDays: 5, terms: 'Advance 25%' }, { supplierId: 'sp04', rate: 52650, deliveryDays: 4, terms: '21 days credit' }] });
  const openPo = (sup: string, store: string, m: string, q: number, ago: number, status: PurchaseOrder['status']) => {
    const d = D(ago);
    pos.push({ id: nid('po'), createdAt: at(d, 13), createdBy: 'u2', no: no('PO', d), date: d, supplierId: sup, deliveryStoreId: store, lines: [{ materialId: m, qty: q, rate: rateOf(m), gstPct: mat[m]!.gstPct }], deliveryTerms: 'FOR destination', paymentTerms: '30 days credit', status });
  };
  openPo('sp01', 'cs', 'm01', 120, 2, 'OPEN');
  openPo('sp03', 'cs', 'm04', 40, 1, 'PENDING');
  openPo('sp05', 'py-p1', 'm12', 48, 0, 'PENDING');
  openPo('sp09', 'st-s3', 'm21', 36, 3, 'OPEN');
  openPo('sp08', 'st-s4', 'm20', 30000, 4, 'OPEN');

  /* ---------- invoices & payments (PUR-05/06, SUP-01/02) ---------- */
  const grns = stockTxns.filter((t) => t.type === 'GRN');
  for (const g of grns) {
    if (daysBetween(g.date, T) < 3) continue;
    const po = pos.find((p) => p.id === g.poId)!;
    const sup = M.suppliers.find((s) => s.id === g.supplierId)!;
    const mismatch = chance(0.05);
    const lines: POLine[] = g.lines.map((l) => ({ materialId: l.materialId, qty: mismatch && chance(0.5) ? round(l.qty + (l.rejectedQty || 0) + 0.5, 2) : l.qty, rate: mismatch ? round(l.rate * 1.015, 2) : l.rate, gstPct: po.lines[0]!.gstPct }));
    const d = addDays(g.date, ri(0, 3));
    invoices.push({ id: nid('in'), createdAt: at(d, 15), createdBy: 'u2', no: no('PINV', d), supplierInvoiceNo: `${sup.code.slice(0, 4)}/${ri(1000, 9999)}`, date: d, supplierId: sup.id, poId: po.id, grnIds: [g.id], storeId: g.toStoreId!, lines, dueDate: addDays(d, sup.creditDays) });
  }
  const invAmount = (i: PurchaseInvoice) => i.lines.reduce((s, l) => s + l.qty * l.rate * (1 + l.gstPct / 100), 0);
  for (const inv of invoices) {
    const overdueBy = daysBetween(inv.dueDate, T);
    if (overdueBy > ri(-8, 4)) {
      const amt = round(invAmount(inv), 0);
      const part = chance(0.15);
      const d = addDays(inv.dueDate, ri(-3, 4));
      if (d > T) continue;
      payments.push({ id: nid('py'), createdAt: at(d, 16), createdBy: 'u2', no: no('PAY', d), date: d, partyType: 'SUPPLIER', partyId: inv.supplierId, amount: part ? round(amt * 0.6, 0) : amt, tds: round(amt * 0.001, 0), mode: pick(['BANK', 'BANK', 'BANK', 'CHEQUE', 'UPI']), ref: `UTR${ri(100000000, 999999999)}`, kind: part ? 'PART' : 'FULL', remark: `Against ${inv.no}` });
    }
  }
  // clear old opening balances
  for (const s of M.suppliers.filter((x) => x.openingBalance > 0)) {
    const d = D(ri(40, 70));
    payments.push({ id: nid('py'), createdAt: at(d, 16), createdBy: 'u2', no: no('PAY', d), date: d, partyType: 'SUPPLIER', partyId: s.id, amount: round(s.openingBalance * r(0.6, 1), 0), tds: 0, mode: 'BANK', ref: `UTR${ri(100000000, 999999999)}`, kind: 'PART', remark: 'Against opening balance' });
  }
  payments.push({ id: nid('py'), createdAt: at(D(3), 12), createdBy: 'u2', no: no('PAY', D(3)), date: D(3), partyType: 'SUPPLIER', partyId: 'sp05', amount: 500000, tds: 0, mode: 'BANK', ref: 'UTR558120334', kind: 'ADVANCE', remark: 'Advance for bitumen allotment' });

  /* ---------- fuel & fleet (§8) ---------- */
  const fuelBal: Record<string, number> = { fs1: 9200, fs2: 3100, fs3: 2200 };
  const fuelRate = () => round(r(90.8, 93.2), 2);
  const fuelPurchase = (sourceId: string, date: string, litres: number) => {
    const before = fuelBal[sourceId]!;
    fuelBal[sourceId] = before + litres;
    fuelPurchases.push({ id: nid('fp'), createdAt: at(date, 9), createdBy: 'u9', no: no('FPR', date), date, sourceId, supplierId: 'sp14', litres, rate: fuelRate(), invoiceNo: `IOC/${ri(10000, 99999)}`, dipBefore: Math.round(before * r(0.99, 1.01)), dipAfter: Math.round((before + litres) * r(0.99, 1.005)) });
  };
  fuelPurchases.push({ id: nid('fp'), createdAt: at(start, 8), createdBy: 'u9', no: no('FPR', start), date: start, sourceId: 'fs1', supplierId: 'sp14', litres: 0, rate: 91.4, invoiceNo: 'OPENING', dipBefore: 9200, dipAfter: 9200 });
  const meter: Record<string, number> = {};
  const tank: Record<string, number> = {};
  const lastFill: Record<string, number> = {};
  const eff: Record<string, number> = {};
  M.vehicles.forEach((v, i) => {
    meter[v.id] = v.meterType === 'KM' ? ri(42000, 168000) : ri(2100, 9800);
    tank[v.id] = v.tankCapacity * r(0.5, 0.9);
    eff[v.id] = v.id === 'v03' || v.id === 'v13' ? r(0.8, 0.84) : v.id === 'v20' ? r(0.86, 0.88) : r(0.95, 1.04);
    v.lastServiceAt = meter[v.id]! - (v.meterType === 'KM' ? ri(1500, 9200) : ri(30, 235)) + (i === 6 ? -40 : 0);
  });
  // a vehicle in breakdown and one idle for the dashboard
  const breakdownFrom: Record<string, string> = { v12: D(3) };
  const idleFrom: Record<string, string> = { v18: D(5), v16: D(0) };
  for (const date of days) {
    const rain = rainDays.has(date);
    const isToday = date === T;
    for (const v of M.vehicles) {
      if (v.id === 'v18' && date >= idleFrom.v18!) continue;
      if (breakdownFrom[v.id] && date >= breakdownFrom[v.id]!) continue;
      if (idleFrom[v.id] && date >= idleFrom[v.id]!) continue;
      const siteId = v.siteId || 's3';
      if (siteId === 's5') continue;
      if (!siteActiveOn(siteId, date)) continue;
      if (chance(rain ? 0.55 : 0.1)) {
        if (!isToday) logs.push({ id: nid('lg'), createdAt: at(date, 19), createdBy: 'u9', date, vehicleId: v.id, siteId, driver: v.driver, openKm: v.meterType !== 'HOURS' ? meter[v.id] : undefined, closeKm: v.meterType !== 'HOURS' ? meter[v.id] : undefined, openHr: v.meterType === 'HOURS' ? meter[v.id] : undefined, closeHr: v.meterType === 'HOURS' ? meter[v.id] : undefined, trips: 0, route: '—', idleHours: 8, idleReason: rain ? 'Rain' : pick(['No work', 'No operator']) });
        continue;
      }
      // fuel load at start of day if tank low (FUEL-04)
      if (tank[v.id]! < v.tankCapacity * 0.45) {
        const litres = Math.round(v.tankCapacity - tank[v.id]! - (chance(0.12) ? v.tankCapacity * 0.2 : 0));
        const full = litres >= v.tankCapacity - tank[v.id]! - 1;
        const source = v.siteId === 's1' ? 'fs2' : v.siteId === 's3' ? 'fs3' : v.siteId === 's4' ? 'fs5' : v.siteId === 's2' ? (chance(0.5) ? 'fs3' : 'fs1') : 'fs1';
        if (fuelBal[source] !== undefined && fuelBal[source]! < litres + 300) fuelPurchase(source, date, source === 'fs1' ? 12000 : source === 'fs2' ? 4500 : 3000);
        if (fuelBal[source] !== undefined) fuelBal[source]! -= litres;
        let reading = Math.round(meter[v.id]! * 10) / 10;
        let flag: string | undefined;
        let status: FuelIssue['status'] = 'APPROVED';
        if (v.id === 'v04' && date === D(6)) {
          reading = reading - 120;
          flag = 'Odometer lower than last reading';
          status = 'PENDING';
        }
        fuelIssues.push({
          id: nid('fi'), createdAt: at(date, 7, ri(0, 50)), createdBy: v.siteId === 's1' ? 'u4' : 'u9', no: no('FIS', date), date, time: `07:${String(ri(0, 59)).padStart(2, '0')}`, vehicleId: v.id, driver: v.driver, siteId,
          sourceId: source, litres, rate: fuelRate(), odometer: v.meterType !== 'HOURS' ? reading : undefined, hourMeter: v.meterType === 'HOURS' ? reading : undefined, fullTank: full, slipPhoto: true, meterPhoto: chance(0.85), status, flag,
        });
        tank[v.id] = tank[v.id]! + litres;
        lastFill[v.id] = meter[v.id]!;
      }
      if (isToday) continue;
      // day's work (VEH-01)
      let used: number;
      const log: LogEntry = { id: nid('lg'), createdAt: at(date, 19, ri(0, 50)), createdBy: 'u9', date, vehicleId: v.id, siteId, driver: v.driver, trips: 0, route: '', idleHours: 0 };
      if (v.meterType === 'HOURS') {
        const hrs = round(r(5.5, 9.5), 1);
        log.openHr = round(meter[v.id]!, 1);
        meter[v.id] = round(meter[v.id]! + hrs, 1);
        log.closeHr = meter[v.id];
        log.idleHours = round(Math.max(0, 10 - hrs - r(0, 1)), 1);
        if (log.idleHours > 2) log.idleReason = pick(['No work', 'No operator', 'Rain']);
        log.route = 'Within site';
        used = (hrs * v.stdLph!) / eff[v.id]!;
        if (v.id === 'v07' && chance(0.15)) log.split = [{ siteId: 's1', share: 0.6 }, { siteId: 's3', share: 0.4 }];
      } else {
        const km = Math.round(v.type === 'Car' ? r(60, 160) : r(70, 175));
        log.openKm = Math.round(meter[v.id]!);
        meter[v.id] = meter[v.id]! + km;
        log.closeKm = Math.round(meter[v.id]!);
        log.trips = v.type === 'Car' ? 0 : Math.max(1, Math.round(km / r(22, 34)));
        log.route = v.type === 'Tipper' ? pick(['HMP Sonapur → NH-27 site', 'Crusher Boko → Kamrup site', 'Borrow area → embankment', 'Central yard → site']) : v.type === 'Transit Mixer' ? 'RMC Changsari → site' : v.type === 'Tanker' ? 'Water point → site' : 'Site visits';
        if (log.trips) {
          log.material = v.type === 'Transit Mixer' ? 'RMC' : v.type === 'Tanker' ? 'Water' : pick(['DBM', 'BC', 'GSB', 'Earth', 'Aggregate 20mm']);
          log.materialQty = round(log.trips * (v.type === 'Transit Mixer' ? 6.5 : v.type === 'Tanker' ? 10 : 22), 1);
        }
        used = km / (v.stdKmpl! * eff[v.id]!);
        if (v.id === 'v03' && chance(0.2)) log.split = [{ siteId: 's1', share: 0.7 }, { siteId: 's3', share: 0.3 }];
      }
      tank[v.id] = Math.max(5, tank[v.id]! - used);
      logs.push(log);
    }
    // daily dip readings (FUEL-02)
    if (!isToday) for (const sid of ['fs1', 'fs2', 'fs3']) dips.push({ id: nid('dp'), createdAt: at(date, 18), createdBy: 'u9', date, sourceId: sid, litres: Math.round(fuelBal[sid]! * (sid === 'fs2' && date >= D(4) ? r(0.955, 0.965) : r(0.993, 1.004))) });
  }
  // service status relative to the current meter (MNT-01): most OK, a few due / overdue
  M.vehicles.forEach((v, i) => {
    const f = v.id === 'v07' || v.id === 'v04' ? r(1.02, 1.12) : v.id === 'v13' || v.id === 'v05' || v.id === 'v11' ? r(0.92, 0.97) : r(0.15, 0.8);
    v.lastServiceAt = Math.round(meter[v.id]! - v.serviceEvery * f);
    void i;
  });
  // vehicle statuses at "now"
  M.vehicles.forEach((v) => {
    v.status = breakdownFrom[v.id] ? 'BREAKDOWN' : idleFrom[v.id] || v.siteId === 's5' ? 'IDLE' : 'WORKING';
  });
  // fuel suppliers & vehicle owners paid on their credit cycle (FUEL-05 / HIRE-02)
  for (const fp of fuelPurchases.filter((x) => x.litres > 0 && daysBetween(x.date, T) > 9)) {
    const d = addDays(fp.date, ri(8, 10));
    payments.push({ id: nid('py'), createdAt: at(d, 15), createdBy: 'u2', no: no('PAY', d), date: d, partyType: 'SUPPLIER', partyId: fp.supplierId, amount: Math.round(fp.litres * fp.rate), tds: 0, mode: 'BANK', ref: `UTR${ri(100000000, 999999999)}`, kind: 'FULL', remark: `Against ${fp.no}` });
  }
  for (const [sup, src] of [['sp12', 'fs4'], ['sp13', 'fs5']] as const) {
    for (const mo of Array.from(new Set(days.map(monthOf))).slice(0, -1)) {
      const amt = fuelIssues.filter((f) => f.sourceId === src && monthOf(f.date) === mo).reduce((a, f) => a + f.litres * f.rate, 0);
      const d = addDays(`${mo}-28`, ri(8, 12));
      if (amt > 0 && d <= T) payments.push({ id: nid('py'), createdAt: at(d, 15), createdBy: 'u2', no: no('PAY', d), date: d, partyType: 'SUPPLIER', partyId: sup, amount: Math.round(amt), tds: 0, mode: 'BANK', ref: `UTR${ri(100000000, 999999999)}`, kind: 'FULL', remark: `Fuel credit ${mo}` });
    }
  }
  for (const [sup, amt] of [['sp15', 265000], ['sp16', 410000]] as const) {
    for (const ago of [40, 10]) payments.push({ id: nid('py'), createdAt: at(D(ago), 15), createdBy: 'u2', no: no('PAY', D(ago)), date: D(ago), partyType: 'SUPPLIER', partyId: sup, amount: amt, tds: Math.round(amt * 0.02), mode: 'BANK', ref: `UTR${ri(100000000, 999999999)}`, kind: 'PART', remark: 'Hire charges' });
  }

  // job cards & tyres (MNT-01..04)
  const jc = (vId: string, ago: number, type: JobCard['type'], complaint: string, work: string, spares: number, labour: number, down: number, closed = true) => {
    const d = D(ago);
    jobCards.push({ id: nid('jc'), createdAt: at(d, 11), createdBy: 'u9', no: no('JC', d), date: d, vehicleId: vId, type, complaint, workDone: work, sparesCost: spares, labourCost: labour, downtimeHours: down, meterAt: Math.round(meter[vId]! - ago * 7), closed });
  };
  jc('v07', 60, 'SERVICE', '250 hr periodic service due', 'Engine oil, oil filter, fuel filter, hydraulic return filter replaced', 21400, 3500, 6);
  jc('v13', 48, 'SERVICE', '250 hr service', 'Oil & filters, screed heater check', 18800, 4200, 8);
  jc('v08', 40, 'REPAIR', 'Hydraulic hose leakage on boom', 'Hose replaced, hydraulic top-up', 9600, 2500, 12);
  jc('v01', 34, 'REPAIR', 'Rear tyre burst', 'Two rear tyres replaced', 43000, 1200, 5);
  jc('v14', 9, 'SERVICE', '250 hr service', 'Engine oil, filters, blade cutting edge', 16200, 3000, 6);
  jc('v12', 3, 'BREAKDOWN', 'Vibration motor not working; drum not vibrating', 'Under repair — motor sent to Guwahati workshop', 0, 0, 72, false);
  jc('v03', 6, 'REPAIR', 'High fuel consumption reported by fleet in-charge', 'Injector cleaning, air filter changed', 7800, 2200, 4);
  const tyreRows: Array<[string, string, string, number, number, string?]> = [['v01', 'TYRE', 'RL', 210, 34, 'Burst'], ['v01', 'TYRE', 'RR', 210, 34, 'Burst'], ['v01', 'TYRE', 'RL', 0, 34], ['v01', 'TYRE', 'RR', 0, 34], ['v02', 'TYRE', 'FL', 0, 260], ['v03', 'TYRE', 'RR1', 0, 6], ['v05', 'BATTERY', 'Main', 0, 410], ['v07', 'BATTERY', 'Main', 0, 300], ['v15', 'TYRE', 'FR', 0, 520]];
  tyreRows.forEach(([v, kind, pos, removedAgo, fitAgo, reason], i) => {
    tyres.push({ id: nid('ty'), createdAt: at(D(fitAgo), 12), createdBy: 'u9', vehicleId: v, kind: kind as TyreRecord['kind'], serial: `${kind === 'TYRE' ? 'MRF' : 'EXIDE'}-${ri(100000, 999999)}`, position: pos, fitDate: D(fitAgo + (removedAgo ? 400 : 0)), meterAtFit: Math.round(meter[v]! - (fitAgo + (removedAgo ? 400 : 0)) * 90), removedDate: removedAgo ? D(removedAgo) : undefined, removedMeter: removedAgo ? Math.round(meter[v]! - removedAgo * 90) : undefined, reason, cost: kind === 'TYRE' ? 21500 : 14800 });
    void i;
  });

  /* ---------- labour (§6) ---------- */
  const LAB_DAYS = 45;
  const labDays = days.slice(-LAB_DAYS);
  const activeSites = M.sites.filter((s) => s.status === 'ACTIVE').map((s) => s.id);
  for (const date of labDays) {
    const dow = new Date(date + 'T00:00:00').getDay();
    const isToday = date === T;
    for (const w of M.workers) {
      if (isToday && w.siteId === 's3') continue; // ALT-05: Kamrup attendance not yet entered
      const shifted = chance(0.025) ? pick(activeSites.filter((x) => x !== w.siteId)) : w.siteId;
      const st = dow === 0 ? (chance(0.45) ? 'P' : 'A') : chance(0.88) ? 'P' : chance(0.4) ? 'H' : 'A';
      attendance.push({ id: nid('at'), createdAt: at(date, 9, ri(0, 40)), createdBy: engineerOf(shifted), date, siteId: shifted, workerId: w.id, status: st, otHours: st === 'P' && chance(0.28) ? ri(1, 3) : 0, locked: daysBetween(date, T) > 1 });
    }
    const crews: Array<[string, string, Attendance['trade'], number, number]> = [
      ['s1', 'sc1', 'Mason', 6, 9], ['s1', 'sc1', 'Helper', 12, 18], ['s1', 'sc1', 'Bar Bender', 3, 5],
      ['s2', 'sc2', 'Bar Bender', 8, 12], ['s2', 'sc2', 'Carpenter', 6, 10], ['s2', 'sc2', 'Helper', 10, 14],
      ['s3', 'sc1', 'Helper', 6, 10], ['s3', 'sc1', 'Mason', 2, 4],
      ['s4', 'sc3', 'Mason', 5, 8], ['s4', 'sc3', 'Helper', 10, 14], ['s4', 'sc3', 'Bar Bender', 3, 5],
    ];
    for (const [s, c, trade, lo, hi] of crews) {
      if (isToday && s === 's3') continue;
      const hc = dow === 0 ? Math.round(ri(lo, hi) * 0.4) : ri(lo, hi);
      if (!hc) continue;
      attendance.push({ id: nid('at'), createdAt: at(date, 9, ri(0, 40)), createdBy: engineerOf(s), date, siteId: s, contractorId: c, trade, headcount: hc, otHours: chance(0.2) ? ri(1, 2) * hc : 0, photo: chance(0.7), gps: chance(0.7) ? M.sites.find((x) => x.id === s)!.gps : undefined, locked: daysBetween(date, T) > 1 });
    }
  }
  // advances (LAB-07)
  for (let i = 0; i < 14; i++) {
    const w = pick(M.workers);
    const d = pick(labDays.slice(0, -3));
    advances.push({ id: nid('ad'), createdAt: at(d, 12), createdBy: engineerOf(w.siteId), date: d, siteId: w.siteId, workerId: w.id, amount: ri(2, 8) * 500, mode: pick(['CASH', 'UPI']), remark: pick(['Medical', 'Festival advance', 'Family emergency', 'Travel home']) });
  }
  advances.push({ id: nid('ad'), createdAt: at(D(20), 12), createdBy: 'u2', date: D(20), siteId: 's1', contractorId: 'sc1', amount: 100000, mode: 'BANK', remark: 'Advance for Bihu' });
  advances.push({ id: nid('ad'), createdAt: at(D(11), 12), createdBy: 'u2', date: D(11), siteId: 's2', contractorId: 'sc2', amount: 75000, mode: 'BANK', remark: 'Mobilisation advance' });
  // wage runs (LAB-06) — closed months paid, current month draft
  const firstLab = labDays[0]!;
  const monthsInLab = Array.from(new Set(labDays.map(monthOf)));
  for (const s of activeSites) {
    for (const mo of monthsInLab) {
      const from = mo + '-01' < firstLab ? firstLab : mo + '-01';
      const lastDay = new Date(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)), 0).getDate();
      const to = `${mo}-${lastDay}` > T ? D(1) : `${mo}-${lastDay}`;
      const isCurrent = monthOf(T) === mo;
      const lines = M.workers.filter((w) => w.siteId === s).map((w) => {
        const rows = attendance.filter((a) => a.workerId === w.id && a.date >= from && a.date <= to);
        const daysW = rows.reduce((acc, a) => acc + (a.status === 'P' ? 1 : a.status === 'H' ? 0.5 : 0), 0);
        const ot = rows.reduce((acc, a) => acc + a.otHours, 0);
        const gross = daysW * w.wageRate + ot * w.otRate;
        const adv = advances.filter((a) => a.workerId === w.id && a.date >= from && a.date <= to).reduce((x, a) => x + a.amount, 0);
        const ded = Math.round(gross * 0.0075);
        return { workerId: w.id, days: daysW, otHours: ot, gross: Math.round(gross), advance: adv, deduction: ded, net: Math.round(gross - adv - ded) };
      });
      wageRuns.push({ id: nid('wr'), createdAt: at(addDays(to, 1), 11), createdBy: 'u2', no: no('WAGE', to), siteId: s, frequency: 'MONTHLY', from, to, lines, status: isCurrent ? 'DRAFT' : 'PAID', paidMode: isCurrent ? undefined : 'BANK' });
    }
  }
  // labour contractor payments (LAB-09)
  for (const c of ['sc1', 'sc2', 'sc3']) {
    for (const ago of [38, 8]) {
      const d = D(ago);
      payments.push({ id: nid('py'), createdAt: at(d, 15), createdBy: 'u2', no: no('PAY', d), date: d, partyType: 'SUBCON', partyId: c, amount: ri(28, 46) * 10000, tds: 0, mode: 'BANK', ref: `UTR${ri(100000000, 999999999)}`, kind: 'PART', remark: 'Labour bill payment' });
    }
  }
  // sub-contract work orders & bills (LAB-10/11)
  const wo = (sc: string, site: string, items: Array<[string, number, number]>, ago: number, ret: number, tds: number) => {
    const d = D(ago);
    const w: WorkOrder = { id: nid('wo'), createdAt: at(d, 11), createdBy: 'u1', no: no('WO', d), date: d, subContractorId: sc, siteId: site, lines: items.map(([item, q, rate]) => ({ boqItemId: boqOf(site, item).id, qty: q, rate })), start: d, end: addDays(d, 240), retentionPct: ret, tdsPct: tds, status: 'ACTIVE' };
    workOrders.push(w);
    return w;
  };
  const wo1 = wo('sc4', 's4', [['5.01', 1400, 2100], ['6.01', 26000, 128]], 140, 5, 2);
  const wo2 = wo('sc5', 's1', [['6.01', 520, 1850]], 160, 5, 2);
  const wo3 = wo('sc6', 's1', [['1.01', 120000, 92]], 300, 5, 1);
  const wo4 = wo('sc5', 's3', [['5.01', 300, 1800]], 120, 5, 2);
  for (const w of [wo1, wo2, wo3, wo4]) {
    const months = Array.from(new Set(days.map(monthOf)));
    months.forEach((mo, i) => {
      const lines = w.lines.map((l) => {
        const q = measurements.filter((m) => m.boqItemId === l.boqItemId && monthOf(m.date) === mo).reduce((s, m) => s + m.qty, 0);
        return { boqItemId: l.boqItemId, qty: round(q, 2), rate: l.rate };
      }).filter((l) => l.qty > 0);
      if (!lines.length) return;
      const lastDay = new Date(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)), 0).getDate();
      let d = `${mo}-${String(Math.min(lastDay, 28)).padStart(2, '0')}`;
      if (d > T) d = T;
      const gross = lines.reduce((s, l) => s + l.qty * l.rate, 0);
      const current = i === months.length - 1;
      subconBills.push({ id: nid('sb'), createdAt: at(d, 15), createdBy: engineerOf(w.siteId), no: no('SCB', d), date: d, workOrderId: w.id, lines, materialRecovery: w.subContractorId === 'sc4' ? Math.round(gross * r(0.01, 0.025)) : 0, advanceRecovery: i === 0 ? 0 : Math.round(gross * 0.05), penalty: chance(0.15) ? 5000 : 0, status: current ? 'PENDING' : i === months.length - 2 ? 'APPROVED' : 'PAID' });
    });
  }
  for (const b of subconBills.filter((x) => x.status === 'PAID')) {
    const w = workOrders.find((x) => x.id === b.workOrderId)!;
    const gross = b.lines.reduce((s, l) => s + l.qty * l.rate, 0);
    const net = gross * (1 - (w.retentionPct + w.tdsPct) / 100) - b.materialRecovery - b.advanceRecovery - b.penalty;
    const d = addDays(b.date, ri(6, 12));
    if (d <= T) payments.push({ id: nid('py'), createdAt: at(d, 15), createdBy: 'u2', no: no('PAY', d), date: d, partyType: 'SUBCON', partyId: w.subContractorId, amount: Math.round(net), tds: Math.round((gross * w.tdsPct) / 100), mode: 'BANK', ref: `UTR${ri(100000000, 999999999)}`, kind: 'FULL', siteId: w.siteId, remark: `Against ${b.no}` });
  }

  /* ---------- expenses & petty cash (§7) ---------- */
  const heads = M.expenseHeads;
  const headPlan: Array<[number, number, number, number]> = [
    [0, 0.03, 18000, 35000], [1, 0.03, 6000, 22000], [2, 0.02, 1500, 4500], [3, 0.35, 200, 2500], [4, 0.45, 300, 2800], [5, 0.12, 800, 9500], [6, 0.03, 8000, 45000], [7, 0.06, 2500, 14000], [8, 0.05, 1500, 9000], [9, 0.05, 4000, 18000], [10, 0.08, 150, 1600], [11, 0.04, 300, 3000], [12, 0.02, 9000, 15000], [13, 0.1, 150, 2000],
  ];
  const payees = ['Local hardware store', 'Hotel Brahmaputra', 'Sharma Tea Stall', 'Govt. treasury challan', 'NABL lab, Guwahati', 'APDCL bill', 'Site landlord', 'Auto / taxi', 'Medicos pharmacy', 'Xerox & stationery', 'Security agency', 'Local JCB owner'];
  for (const date of days) {
    for (const s of M.sites.map((x) => x.id)) {
      if (!siteActiveOn(s, date)) continue;
      for (const [hi, p, lo, hi2] of headPlan) {
        if (!chance(p)) continue;
        const amt = Math.round(r(lo, hi2) / 10) * 10;
        const recent = daysBetween(date, T) <= 2;
        const status: Expense['status'] = amt > M.settings.approvalLimits.expense ? (recent ? 'PENDING' : 'APPROVED') : 'APPROVED';
        expenses.push({ id: nid('ex'), createdAt: at(date, ri(10, 19), ri(0, 59)), createdBy: engineerOf(s), no: no('EXP', date), date, siteId: s, headId: heads[hi]!.id, amount: amt, paidTo: hi === 1 ? 'APDCL bill' : hi === 6 ? 'Govt. treasury challan' : hi === 7 ? 'NABL lab, Guwahati' : pick(payees), mode: amt > 5000 ? pick(['BANK', 'UPI']) : pick(['CASH', 'CASH', 'UPI']), billNo: `B-${ri(1000, 99999)}`, remark: '', photo: chance(0.9), status });
      }
    }
  }
  for (const s of M.sites.map((x) => x.id)) {
    for (const ago of [72, 50, 28, 6]) {
      if (s === 's5' && ago < 40) continue;
      const d = D(ago);
      imprests.push({ id: nid('im'), createdAt: at(d, 11), createdBy: 'u2', no: no('IMP', d), date: d, siteId: s, amount: s === 's1' ? 150000 : 80000, kind: 'IMPREST', mode: 'BANK', remark: 'Monthly imprest', status: 'APPROVED' });
    }
  }
  imprests.push({ id: nid('im'), createdAt: at(D(1), 18), createdBy: 'u7', no: no('IMP', D(1)), date: D(1), siteId: 's4', amount: 40000, kind: 'TOPUP_REQUEST', mode: 'BANK', remark: 'Cash running low — labour advances & testing', status: 'PENDING' });
  imprests.push({ id: nid('im'), createdAt: at(D(0), 9), createdBy: 'u4', no: no('IMP', D(0)), date: D(0), siteId: 's1', amount: 60000, kind: 'TOPUP_REQUEST', mode: 'BANK', remark: 'Royalty payment for borrow earth', status: 'PENDING' });
  imprests.push({ id: nid('im'), createdAt: at(D(18), 9), createdBy: 'u6', no: no('IMP', D(18)), date: D(18), siteId: 's3', amount: 30000, kind: 'TOPUP_REQUEST', mode: 'UPI', remark: 'Local hire of tractor', status: 'APPROVED' });
  // head-office overheads (EXP-05)
  for (const mo of Array.from(new Set(days.map(monthOf)))) {
    const full = mo !== monthOf(T);
    const f = full ? 1 : Number(T.slice(8, 10)) / 30;
    for (const [head, amt] of [['Head office rent', 120000], ['HO staff salaries', 780000], ['Interest on working capital', 340000], ['Insurance (CAR policy)', 60000], ['Audit & legal', 45000]] as Array<[string, number]>) {
      overheads.push({ id: nid('oh'), createdAt: at(`${mo}-05`, 11), createdBy: 'u2', month: mo, head, amount: Math.round(amt * f), basis: 'CONTRACT' });
    }
  }

  /* ---------- plant running costs & stockpile (PLT-04/14) ---------- */
  for (const mo of Array.from(new Set(days.map(monthOf)))) {
    const f = mo === monthOf(T) ? Number(T.slice(8, 10)) / 30 : mo === monthOf(start) ? (30 - Number(start.slice(8, 10)) + 1) / 30 : 1;
    plantCosts.push({ id: nid('pc'), createdAt: at(`${mo}-01`, 10), createdBy: 'u8', plantId: 'p1', month: mo, labour: Math.round(420000 * f), power: Math.round(260000 * f), machinery: Math.round(380000 * f), maintenance: Math.round(150000 * f), overhead: Math.round(120000 * f) });
    plantCosts.push({ id: nid('pc'), createdAt: at(`${mo}-01`, 10), createdBy: 'u8', plantId: 'p2', month: mo, labour: Math.round(210000 * f), power: Math.round(95000 * f), machinery: Math.round(160000 * f), maintenance: Math.round(60000 * f), overhead: Math.round(70000 * f) });
    plantCosts.push({ id: nid('pc'), createdAt: at(`${mo}-01`, 10), createdBy: 'u8', plantId: 'p3', month: mo, labour: Math.round(260000 * f), power: Math.round(310000 * f), machinery: Math.round(240000 * f), maintenance: Math.round(130000 * f), overhead: Math.round(60000 * f) });
  }

  /* ---------- prior-period measurements + RA bills (§10) ---------- */
  const targets: Record<string, number> = { s1: 0.62, s2: 0.45, s3: 0.78, s4: 0.35, s5: 0.22 };
  for (const s of M.sites) {
    const items = M.boq.filter((b) => b.siteId === s.id && !b.isExtra);
    const priorMonths: string[] = [];
    for (let d = s.startDate; monthOf(d) < monthOf(start); d = addDays(d, 30)) priorMonths.push(monthOf(d));
    items.forEach((b, idx) => {
      const winQty = measurements.filter((m) => m.boqItemId === b.id).reduce((x, m) => x + m.qty, 0);
      const tgt = Math.min(0.97, targets[s.id]! * (1.3 - idx * (0.6 / items.length)));
      const prior = Math.max(0, b.qty * tgt - winQty);
      if (!prior || !priorMonths.length) return;
      const weights = priorMonths.map((_, i) => 0.6 + i / priorMonths.length + r(0, 0.4));
      const wsum = weights.reduce((a, c) => a + c, 0);
      priorMonths.forEach((mo, i) => {
        const q = round((prior * weights[i]!) / wsum, 2);
        if (q <= 0) return;
        const d = `${mo}-20`;
        measurements.push({ id: nid('ms'), createdAt: at(d, 18), createdBy: s.engineerId || 'u1', date: d, siteId: s.id, boqItemId: b.id, chainage: 'Monthly abstract (pre go-live)', length: 0, breadth: 0, depth: 0, nos: 0, qty: q, mbNo: `MB-${s.id.toUpperCase()}-OLD` });
      });
    });
    s.openingAsOf = start;
    // RA bills monthly on the 25th
    const billDates: string[] = [];
    for (let d = `${monthOf(s.startDate)}-25`; d < T; ) {
      if (d > s.startDate && daysBetween(d, T) > 3) billDates.push(d);
      const [y, mth] = d.split('-').map(Number);
      const nm = mth === 12 ? `${y! + 1}-01` : `${y}-${String(mth! + 1).padStart(2, '0')}`;
      d = `${nm}-25`;
    }
    const usable = s.status === 'ON_HOLD' ? billDates.filter((d) => d <= addDays(start, 35)) : billDates;
    let prevDate = '0000-00-00';
    const cum: Record<string, number> = {};
    usable.forEach((bd, i) => {
      const lines = M.boq.filter((b) => b.siteId === s.id).map((b) => {
        const thisQty = round(measurements.filter((m) => m.boqItemId === b.id && m.date > prevDate && m.date <= bd).reduce((x, m) => x + m.qty, 0), 2);
        const prevQty = round(cum[b.id] || 0, 2);
        cum[b.id] = prevQty + thisQty;
        return { boqItemId: b.id, uptoQty: round(prevQty + thisQty, 2), prevQty, thisQty, rate: b.rate };
      }).filter((l) => l.uptoQty > 0);
      prevDate = bd;
      const gross = lines.reduce((x, l) => x + l.thisQty * l.rate, 0);
      if (gross <= 0) return;
      const isLast = i === usable.length - 1;
      const isPrev = i === usable.length - 2;
      const status: RaBill['status'] = isLast ? (s.status === 'ON_HOLD' ? 'CERTIFIED' : 'SUBMITTED') : isPrev ? (s.id === 's2' || s.id === 's4' ? 'PARTLY_PAID' : 'CERTIFIED') : 'PAID';
      const ded = {
        securityDeposit: Math.round(gross * 0.025), retention: Math.round((gross * s.retentionPct) / 100), tds: Math.round(gross * 0.02), cess: Math.round(gross * 0.01), gstTds: Math.round(gross * 0.02),
        royalty: s.workType === 'ROAD' ? Math.round(gross * 0.006) : 0, advanceRecovery: s.id === 's1' && i < 10 ? Math.round(gross * 0.1) : 0, materialRecovery: 0, penalty: s.id === 's3' && i === 3 ? 50000 : 0,
      };
      const gst = (gross * s.gstPct) / 100;
      const net = gross + gst - Object.values(ded).reduce((a, c) => a + c, 0);
      const receipts: RaBill['receipts'] = [];
      if (status === 'PAID') receipts.push({ date: addDays(bd, ri(28, 45)) > T ? addDays(T, -2) : addDays(bd, ri(28, 45)), amount: Math.round(net), utr: `UTR${ri(100000000, 999999999)}` });
      if (status === 'PARTLY_PAID') receipts.push({ date: addDays(bd, ri(18, 30)) > T ? D(1) : addDays(bd, ri(18, 30)), amount: Math.round(net * 0.5), utr: `UTR${ri(100000000, 999999999)}` });
      raBills.push({ id: nid('ra'), createdAt: at(bd, 16), createdBy: 'u2', no: `${s.code}/RA-${String(i + 1).padStart(2, '0')}`, seq: i + 1, date: bd, siteId: s.id, lines, gstPct: s.gstPct, deductions: ded, status, receipts, escalation: s.id === 's1' && i === usable.length - 3 ? 1840000 : undefined });
    });
  }

  /* ---------- audit trail seed (ROLE-05) ---------- */
  const auditFrom = (entity: string, items: Array<{ id: string; createdAt: string; createdBy: string; no?: string }>, label: (x: any) => string) =>
    items.slice(-25).forEach((x) => audit.push({ id: nid('au'), at: x.createdAt, userId: x.createdBy, action: 'CREATE', entity, entityId: x.id, label: label(x) }));
  auditFrom('Stock voucher', stockTxns, (x) => `${x.no} created`);
  auditFrom('Fuel issue', fuelIssues, (x) => `${x.no} — ${x.litres} L`);
  auditFrom('Expense', expenses, (x) => `${x.no} — ₹${x.amount}`);
  auditFrom('Purchase order', pos, (x) => `${x.no} raised`);
  audit.push({ id: nid('au'), at: at(D(4), 17, 12), userId: 'u1', action: 'UPDATE', entity: 'Consumption', entityId: 'x', label: 'CON entry edited after lock period', before: { qty: 4.2 }, after: { qty: 3.8 }, reason: 'Wrong BOQ item tagged; corrected after joint check' });
  audit.push({ id: nid('au'), at: at(D(2), 11, 40), userId: 'u1', action: 'APPROVE', entity: 'Expense', entityId: 'x', label: 'Testing charges ₹12,400 approved', reason: 'NABL cube test — approved' });
  audit.push({ id: nid('au'), at: at(D(1), 16, 5), userId: 'u2', action: 'SEND_BACK', entity: 'Purchase invoice', entityId: 'x', label: 'Invoice rate differs from PO by 1.5%', reason: 'Ask supplier for credit note' });
  audit.sort((a, b) => b.at.localeCompare(a.at));

  // make sure the ordering is chronological for ledgers
  stockTxns.sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));

  return {
    version: SEED_VERSION,
    seededOn: T,
    company: { ...COMPANY, fy: fyCode(T) },
    ...M,
    stockTxns, requisitions, quotations, pos, invoices, payments, debitNotes, attendance, advances, wageRuns, workOrders, subconBills, imprests, expenses, overheads,
    fuelPurchases, fuelIssues, dips, logs, jobCards, tyres, production, dispatches, plantCosts, stockpiles, measurements, raBills,
    audit, notifications: [], seq,
  };
}

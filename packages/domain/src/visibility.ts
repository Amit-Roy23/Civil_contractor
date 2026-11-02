import type { CollectionKey, DB } from './types.js';
import type { Session } from './session.js';

/**
 * What a signed-in user may see (ROLE-02 site/plant scope, ROLE-03 rate masking).
 * Used by the API to build each user's snapshot and to check that writes target records in scope.
 */

/** collections every role receives in full (shared masters) */
const SHARED: CollectionKey[] = ['firms', 'sites', 'stores', 'plants', 'materials', 'suppliers', 'clients', 'subcons', 'vehicles', 'fuelSources', 'expenseHeads', 'units', 'recipes', 'roles', 'users'];

export function recordInScope(db: DB, s: Session, coll: CollectionKey, r: any): boolean {
  if (SHARED.includes(coll)) return true;
  const site = (id?: string) => !!id && s.seesSite(id);
  const store = (id?: string) => !!id && s.seesStore(id);
  const plant = (id?: string) => !!id && (s.allSites || s.plantIds.includes(id));
  switch (coll) {
    case 'workers':
    case 'boq':
    case 'attendance':
    case 'advances':
    case 'wageRuns':
    case 'expenses':
    case 'imprests':
    case 'measurements':
    case 'raBills':
    case 'workOrders':
    case 'fuelIssues':
      return site(r.siteId);
    case 'logs':
      return site(r.siteId) || (r.split || []).some((x: any) => site(x.siteId));
    case 'stockTxns':
      return store(r.fromStoreId) || store(r.toStoreId) || (!!r.issueToVehicleId && s.allSites);
    case 'requisitions':
      return store(r.storeId);
    case 'pos':
      return store(r.deliveryStoreId);
    case 'invoices':
      return store(r.storeId) && s.showRates;
    case 'quotations': {
      const req = r.requisitionId ? db.requisitions.find((x) => x.id === r.requisitionId) : undefined;
      return s.allSites || (!!req && store(req.storeId));
    }
    case 'subconBills': {
      const wo = db.workOrders.find((w) => w.id === r.workOrderId);
      return site(wo?.siteId);
    }
    case 'fuelPurchases':
    case 'dips': {
      const src = db.fuelSources.find((f) => f.id === r.sourceId);
      return s.allSites || site(src?.siteId);
    }
    case 'jobCards':
    case 'tyres': {
      const v = db.vehicles.find((x) => x.id === r.vehicleId);
      return s.allSites || site(v?.siteId);
    }
    case 'production':
    case 'plantCosts':
    case 'stockpiles':
      return plant(r.plantId);
    case 'dispatches':
      return site(r.siteId) || plant(r.plantId);
    case 'payments':
    case 'debitNotes':
    case 'overheads':
    case 'bankFacilities':
    case 'taxCredits':
      return s.allSites && s.showRates;
    case 'guarantees':
      return s.showRates && (r.siteId ? site(r.siteId) : s.allSites);
    case 'tankDips':
      return store(r.storeId);
    case 'salesInvoices':
      return s.showRates && plant(r.plantId);
    case 'labTests':
      return r.plantId ? plant(r.plantId) : site(r.siteId);
    case 'safety':
    case 'siteRegisters':
    case 'dprs':
      return site(r.siteId);
    case 'hireOuts':
    case 'loans':
    case 'subsidyClaims':
      return s.allSites && s.showRates;
    case 'notifications':
      return !r.userId || r.userId === s.user.id;
    case 'audit':
      return s.can('admin');
    default:
      return false;
  }
}

/* ---------- rate / amount masking (ROLE-03) ---------- */
const Z = { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 };
const zeroLines = (lines: any[] | undefined, keys: string[]) => (lines || []).map((l) => ({ ...l, ...Object.fromEntries(keys.map((k) => [k, 0])) }));

const MASK: Partial<Record<CollectionKey, (r: any) => any>> = {
  sites: (r) => {
    const g = (x: any) => (x ? { ...x, amount: 0 } : x);
    return {
      ...r, contractValue: 0, securityDeposit: 0, budget: Z, openingCost: Z, estimatedCost: r.estimatedCost === undefined ? undefined : 0, sdCeiling: r.sdCeiling === undefined ? undefined : 0,
      emd: g(r.emd), perfSecurity: g(r.perfSecurity), addlPerfSecurity: g(r.addlPerfSecurity), advances: r.advances?.map((a: any) => ({ ...a, amount: 0 })),
      priceAdjustment: r.priceAdjustment && { ...r.priceAdjustment, components: r.priceAdjustment.components.map((c: any) => ({ ...c, basePrice: 0 })) },
      openingWorkDone: undefined, openingBilled: undefined, openingReceived: undefined,
    };
  },
  firms: (r) => ({ ...r, banks: [] }),
  plants: (r) => ({ ...r, fixedRate: {} }),
  materials: (r) => ({ ...r, stdRate: 0 }),
  suppliers: (r) => ({ ...r, openingBalance: 0 }),
  subcons: (r) => ({ ...r, tradeRates: {}, openingBalance: 0 }),
  workers: (r) => ({ ...r, wageRate: 0, otRate: 0 }),
  vehicles: (r) => ({ ...r, hireRate: r.hireRate === undefined ? undefined : 0, internalRate: 0, emi: 0, driverSalary: 0 }),
  boq: (r) => ({ ...r, rate: 0 }),
  stockTxns: (r) => ({ ...r, lines: zeroLines(r.lines, ['rate']) }),
  pos: (r) => ({ ...r, lines: zeroLines(r.lines, ['rate']) }),
  quotations: (r) => ({ ...r, quotes: zeroLines(r.quotes, ['rate']) }),
  fuelIssues: (r) => ({ ...r, rate: 0 }),
  fuelPurchases: (r) => ({ ...r, rate: 0 }),
  jobCards: (r) => ({ ...r, sparesCost: 0, labourCost: 0 }),
  tyres: (r) => ({ ...r, cost: 0 }),
  workOrders: (r) => ({ ...r, lines: zeroLines(r.lines, ['rate']) }),
  subconBills: (r) => ({ ...r, lines: zeroLines(r.lines, ['rate']), materialRecovery: 0, advanceRecovery: 0, penalty: 0 }),
  raBills: (r) => ({ ...r, lines: zeroLines(r.lines, ['rate']), deductions: Object.fromEntries(Object.keys(r.deductions).map((k) => [k, 0])), receipts: zeroLines(r.receipts, ['amount']), escalation: undefined }),
  wageRuns: (r) => ({ ...r, lines: zeroLines(r.lines, ['gross', 'advance', 'deduction', 'net']) }),
  plantCosts: (r) => ({ ...r, labour: 0, power: 0, machinery: 0, maintenance: 0, overhead: 0, depreciation: 0, interest: 0 }),
};

/** how one record looks to this user — undefined when it is out of their scope */
export function viewRecord(db: DB, s: Session, coll: CollectionKey, r: any): any {
  if (!recordInScope(db, s, coll, r)) return undefined;
  let v = r;
  // ROLE-02: a work outside the user's access is only a name (needed e.g. to pick a transfer destination)
  if (coll === 'sites' && !s.seesSite(r.id)) return { id: r.id, code: r.code, name: r.name, short: r.short, status: r.status, stage: r.stage, active: r.active, firmId: r.firmId, clientId: '', contractValue: 0, budget: Z, openingCost: Z, outOfScope: true };
  if (!s.showRates && MASK[coll]) v = MASK[coll]!(v);
  if (coll === 'users' && !s.can('admin')) v = { id: v.id, name: v.name, username: v.id === s.user.id ? v.username : '', phone: '', email: '', roleId: v.roleId, siteIds: v.siteIds, plantIds: v.plantIds, active: v.active };
  return v;
}

/** the subset of the company data a user is allowed to receive */
export function snapshotFor(db: DB, s: Session, auditLimit = 3000): DB {
  const out: any = { ...db };
  for (const k of Object.keys(db) as Array<keyof DB>) {
    const v = db[k];
    if (!Array.isArray(v)) continue;
    const coll = k as CollectionKey;
    let rows: any[] = [];
    for (const r of v as any[]) {
      const x = viewRecord(db, s, coll, r);
      if (x !== undefined) rows.push(x);
    }
    if (coll === 'audit') rows = rows.slice(-auditLimit);
    out[k] = rows;
  }
  return out as DB;
}

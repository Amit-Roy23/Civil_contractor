import type { CostHead, DB } from './types.js';
import { buildSeed } from './seed.js';
import { COST_HEADS, siteCostSheet } from './selectors.js';

/**
 * Demo dataset for `today`: the generated seed plus opening (pre go-live) costs, sized so each site's
 * books start from a believable margin.
 */
export function buildDemoDB(today: string): DB {
  const d = buildSeed(today);
  const target: Record<string, number> = { s1: 0.885, s2: 0.93, s3: 0.86, s4: 1.04, s5: 0.95 };
  for (const s of d.sites) {
    const win = siteCostSheet(d, s.id, { from: '0000-01-01', to: '9999-12-31' });
    const desired = win.workDone * (target[s.id] ?? 0.9);
    const gap = Math.max(0, desired - win.cost);
    const mix: Record<CostHead, number> = { MATERIAL: 0.5, LABOUR: 0.13, STAFF: 0, SUBCONTRACT: 0.08, VEHICLE: 0.18, MISC: 0.05, OVERHEAD: 0.06 };
    COST_HEADS.forEach((h) => (s.openingCost[h] = Math.round(gap * mix[h])));
  }
  return d;
}

/** A blank company — used when a real client is set up (masters are then imported). */
export function emptyDB(company: DB['company'], settings: DB['settings'], roles: DB['roles']): DB {
  return {
    version: 1, seededOn: '', company, settings, roles, firms: [],
    sites: [], stores: [], plants: [], materials: [], suppliers: [], clients: [], subcons: [], workers: [], vehicles: [], fuelSources: [], expenseHeads: [], units: [], recipes: [], boq: [],
    stockTxns: [], requisitions: [], quotations: [], pos: [], invoices: [], payments: [], debitNotes: [], attendance: [], advances: [], wageRuns: [], workOrders: [], subconBills: [],
    imprests: [], expenses: [], overheads: [], fuelPurchases: [], fuelIssues: [], dips: [], logs: [], jobCards: [], tyres: [], production: [], dispatches: [], plantCosts: [], stockpiles: [],
    measurements: [], raBills: [], guarantees: [], bankFacilities: [], taxCredits: [], tankDips: [], salesInvoices: [], labTests: [], safety: [], siteRegisters: [], dprs: [], hireOuts: [], loans: [], subsidyClaims: [], staff: [], staffAttendance: [], staffAdvances: [], salaryRuns: [], users: [], audit: [], notifications: [], seq: {},
  };
}

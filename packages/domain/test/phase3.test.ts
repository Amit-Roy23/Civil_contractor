import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCompanyDB } from '../src/setup.js';
import { applyCommand, type Command } from '../src/policy.js';
import { buildSession } from '../src/session.js';
import { costEntries, fuelCostBySite } from '../src/selectors.js';
import { cubesDue, dipRows, dprDraft, ewayRow, loanSchedule, plantDay, productionRatios, programme, salesTotals } from '../src/ops.js';
import { bankFile, ecrFile, esicRows, musterRoll, wageRegister } from '../src/labourreg.js';
import type { DB } from '../src/types.js';

const TODAY = '2026-11-01';
const spec = JSON.parse(readFileSync(new URL('../../../apps/api/setup/saurajit-deb.json', import.meta.url), 'utf8'));
let n = 0;
const run = (db: DB, cmd: Command, userId = 'u1') => applyCommand({ db, session: buildSession(db, userId)!, today: TODAY, now: `${TODAY}T10:00:00.000Z`, hour: 10, newId: () => `p3-${++n}` }, cmd);
const ins = (db: DB, coll: any, rec: any) => run(db, { kind: 'insert', coll, rec });
const ZERO = { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 };
const M = (db: DB, code: string) => db.materials.find((m) => m.code === code)!.id;

/** client setup + two works, a DBM mix, opening plant stock */
function world() {
  let db = buildCompanyDB(spec, TODAY).db;
  const work = (name: string) => {
    const r = ins(db, 'sites', { name, short: name, clientId: 'c-pwd-rb-tr', contractValue: 20000000, status: 'ACTIVE', workType: 'ROAD', budget: ZERO, openingCost: ZERO, startDate: '2026-06-01', scheduledCompletion: '2027-05-31', milestones: [{ date: '2026-11-30', targetPct: 40, label: '' }] });
    db = r.db;
    return r.record.id as string;
  };
  const A = work('Work A');
  const B = work('Work B');
  let r = ins(db, 'materials', { code: 'DBM-II', name: 'DBM Grade II', category: 'Plant Output', unit: 'MT', kind: 'OUTPUT', hsn: '2715', gstPct: 18 });
  db = r.db;
  const dbm = r.record.id;
  r = ins(db, 'recipes', { code: 'JMF-DBM', name: 'DBM JMF', productId: dbm, perUnit: 'MT', lines: [{ materialId: M(db, 'BIT-VG30'), qty: 0.045 }, { materialId: M(db, 'AGG-20'), qty: 0.4 }, { materialId: M(db, 'AGG-10'), qty: 0.3 }, { materialId: M(db, 'AGG-06'), qty: 0.2 }, { materialId: M(db, 'STN-DUST'), qty: 0.05 }] });
  db = r.db;
  const recipe = r.record.id;
  const plant = db.plants[0]!;
  db = run(db, { kind: 'update', coll: 'plants', id: plant.id, patch: { burnerFuelId: M(db, 'LDO'), dgFuelId: M(db, 'HSD'), ldoPerMtNorm: 7, dieselPerMtNorm: 1.5 } }).db;
  db = ins(db, 'stockTxns', { type: 'OPENING', date: '2026-10-30', toStoreId: plant.storeId, lines: [['BIT-VG30', 20, 52000], ['AGG-20', 200, 1400], ['AGG-10', 150, 1400], ['AGG-06', 100, 1400], ['STN-DUST', 30, 900], ['LDO', 4000, 92], ['HSD', 1000, 90]].map(([c, q, rt]) => ({ materialId: M(db, c as string), qty: q, rate: rt })) }).db;
  return { db, A, B, dbm, recipe, plant };
}

describe('Phase 3 test 1 — one day of hot mix reconciles bitumen with the tank dip', () => {
  it('production uses bitumen, LDO and DG diesel; dispatches move the mix; the dip matches the book', () => {
    let { db, A, dbm, recipe, plant } = world();
    const tip = db.vehicles.find((v) => v.code === 'TIP-01')!.id;
    const p = ins(db, 'production', { date: TODAY, shift: 'DAY', plantId: plant.id, productId: dbm, recipeId: recipe, qty: 200, startMeter: 100, stopMeter: 108, startTime: '07:00', stopTime: '15:00', mixTemp: 155, dgHours: 8, actual: [{ materialId: M(db, 'BIT-VG30'), qty: 9.1 }, { materialId: M(db, 'LDO'), qty: 1700 }, { materialId: M(db, 'HSD'), qty: 320 }] });
    db = p.db;
    const ratio = productionRatios(db, p.record);
    expect([ratio.bitPct, ratio.jmfPct, ratio.ldoPerMt, ratio.dieselPerMt]).toEqual([4.55, 4.5, 8.5, 1.6]);
    // LDO 8.5 L/MT is above the 7 L/MT norm + 10% fuel tolerance; diesel 1.6 is within 1.5 + 10%
    expect(ratio.flags).toEqual(['LDO 8.5 L/MT against norm 7']);
    db = ins(db, 'dispatches', { date: TODAY, time: '09:10', plantId: plant.id, productId: dbm, vehicleId: tip, siteId: A, gross: 27.4, tare: 9.4, qty: 0, temperature: 150, weighbridgeSlip: 'WB-1' }).db;
    expect(db.dispatches[0]!.qty).toBe(18);
    db = ins(db, 'tankDips', { date: TODAY, storeId: plant.storeId, materialId: M(db, 'BIT-VG30'), location: 'Bitumen tank 25 MT', qty: 10.9 }).db;
    const day = plantDay(db, plant.id, TODAY);
    const bit = day.find((x) => x.materialId === M(db, 'BIT-VG30'))!;
    expect([bit.opening, bit.used, bit.closing, bit.dip, bit.diff]).toEqual([20, 9.1, 10.9, 10.9, 0]);
    const mix = day.find((x) => x.materialId === dbm)!;
    expect([mix.produced, mix.dispatched, mix.closing]).toEqual([200, 18, 182]);
    expect(day.find((x) => x.materialId === M(db, 'LDO'))!.used).toBe(1700);
    expect(dipRows(db)[0]).toMatchObject({ book: 10.9, diff: 0, ok: true });
  });
});

describe('Phase 3 test 2 — a sale to an outside buyer gives a correct GST invoice', () => {
  it('invoices delivered loads once, with HSN 2715 and CGST/SGST', () => {
    let { db, dbm, recipe, plant } = world();
    const tip = db.vehicles.find((v) => v.code === 'TIP-02')!.id;
    db = ins(db, 'production', { date: TODAY, shift: 'DAY', plantId: plant.id, productId: dbm, recipeId: recipe, qty: 100, startMeter: 0, stopMeter: 5 }).db;
    let r = ins(db, 'clients', { code: 'BUY-1', name: 'Dharmanagar Municipal Council', kind: 'BUYER', gstin: '16AAALD1234K1Z5' });
    db = r.db;
    const buyer = r.record.id;
    r = ins(db, 'dispatches', { date: TODAY, plantId: plant.id, productId: dbm, vehicleId: tip, buyerId: buyer, qty: 25.5, weighbridgeSlip: 'WB-9' });
    db = r.db;
    expect([r.record.status, r.record.customer]).toEqual(['RECEIVED', 'Dharmanagar Municipal Council']);
    const inv = ins(db, 'salesInvoices', { date: TODAY, buyerId: buyer, plantId: plant.id, dispatchIds: [r.record.id], rates: { [dbm]: 6200 }, eway: { vehicleNo: 'TR05F1888', distanceKm: 6 } } as any);
    const t = salesTotals(inv.db, inv.record);
    expect(inv.record.no).toBe('SD/INV/2026-27/0001');
    expect(inv.record.lines[0]).toMatchObject({ hsn: '2715', qty: 25.5, rate: 6200, gstPct: 18 });
    expect([t.taxable, t.cgst, t.sgst, t.igst, t.total]).toEqual([158100, 14229, 14229, 0, 186558]);
    expect(() => ins(inv.db, 'salesInvoices', { date: TODAY, buyerId: buyer, plantId: plant.id, dispatchIds: [r.record.id], rates: { [dbm]: 6200 } } as any)).toThrow(/already invoiced/);
    expect(ewayRow(inv.db, inv.record)).toMatchObject({ recipientGstin: '16AAALD1234K1Z5', hsn: '2715', vehicleNo: 'TR05F1888', total: 186558 });
    const paid = run(inv.db, { kind: 'update', coll: 'salesInvoices', id: inv.record.id, patch: { receipts: [{ date: TODAY, amount: 186558, utr: 'U' }] } });
    expect(paid.record.status).toBe('PAID');
  });
});

describe('Phase 3 test 3 — one month of labour: muster roll, wage register, EPF ECR', () => {
  it('works out days, wages, EPF / EPS / ESIC and writes the ECR line', () => {
    let { db, A } = world();
    let r = ins(db, 'workers', { code: 'W-001', name: 'Bikash Das', trade: 'Mason', wageRate: 500, otRate: 100, ownership: 'OWN', siteId: A, uan: '100123456789', pfMember: true, esiMember: true, esicNo: '3112345678', bankAccount: '33221100998877', ifsc: 'SBIN0001234' });
    db = r.db;
    const w = r.record.id;
    for (let d = 1; d <= 31; d++) {
      const date = `2026-10-${String(d).padStart(2, '0')}`;
      const status = d <= 5 ? 'A' : d <= 7 ? 'H' : 'P';
      db = ins(db, 'attendance', { date, siteId: A, workerId: w, status, otHours: d === 10 || d === 11 ? 3 : 0 }).db;
    }
    db = ins(db, 'advances', { date: '2026-10-15', siteId: A, workerId: w, amount: 1000, mode: 'CASH' }).db;
    const mr = musterRoll(db, A, '2026-10')[0]!;
    expect([mr.present, mr.half, mr.absent, mr.paidDays, mr.otHours]).toEqual([24, 2, 5, 25, 6]);
    expect(mr.days.slice(0, 8)).toEqual(['A', 'A', 'A', 'A', 'A', 'H', 'H', 'P']);
    const wr = wageRegister(db, A, '2026-10')[0]!;
    expect([wr.basic, wr.otPay, wr.gross, wr.pfWages, wr.pf, wr.eps, wr.erPf, wr.esi, wr.esiEr, wr.advance, wr.net]).toEqual([12500, 600, 13100, 12500, 1500, 1041, 459, 99, 426, 1000, 10501]);
    const ecr = ecrFile(db, A, '2026-10');
    expect(ecr.errors).toEqual([]);
    expect(ecr.text).toBe('100123456789#~#BIKASH DAS#~#13100#~#12500#~#12500#~#12500#~#1500#~#1041#~#459#~#5#~#0');
    expect(esicRows(db, A, '2026-10')[0]).toMatchObject({ ipNo: '3112345678', days: 25, wages: 13100, ee: 99, er: 426 });
    expect(bankFile(db, A, '2026-10').rows[0]).toMatchObject({ account: '33221100998877', ifsc: 'SBIN0001234', amount: 10501 });
  });
});

describe('Phase 3 test 4 — tipper trips and fuel are charged to the right work', () => {
  it('splits the day by trips per work; a hired-out day is charged to no work', () => {
    let { db, A, B } = world();
    const tip = db.vehicles.find((v) => v.code === 'TIP-01')!;
    db = run(db, { kind: 'update', coll: 'vehicles', id: tip.id, patch: { tankCapacity: 200, stdKmpl: 4, internalRate: 0 } }).db;
    let r = ins(db, 'fuelSources', { code: 'FS-1', name: 'Diesel barrel — plant', type: 'OWN_TANK', capacity: 2000 });
    db = r.db;
    db = ins(db, 'fuelIssues', { date: TODAY, time: '08:00', vehicleId: tip.id, siteId: A, sourceId: r.record.id, litres: 60, rate: 90, odometer: 1000, fullTank: true, slipPhoto: false, meterPhoto: false }).db;
    const trip = (siteId: string) => ({ siteId, material: 'DBM', from: 'Kalikapur plant', to: 'Site', qty: 18, unit: 'MT', chainage: '' });
    const log = ins(db, 'logs', { date: TODAY, vehicleId: tip.id, siteId: A, driver: 'X', openKm: 1000, closeKm: 1120, tripRows: [trip(A), trip(A), trip(A), trip(B)] });
    db = log.db;
    expect(log.record.split).toEqual([{ siteId: A, share: 0.75 }, { siteId: B, share: 0.25 }]);
    expect(log.record.trips).toBe(4);
    const fuel = fuelCostBySite(db).filter((f) => f.vehicleId === tip.id);
    expect(Object.fromEntries(fuel.map((f) => [f.siteId === A ? 'A' : 'B', Math.round(f.amount)]))).toEqual({ A: 4050, B: 1350 });
    const cost = (s: string) => Math.round(costEntries(db).filter((c) => c.siteId === s && c.head === 'VEHICLE').reduce((a, c) => a + c.amount, 0));
    expect([cost(A), cost(B)]).toEqual([4050, 1350]);
    const hired = ins(db, 'logs', { date: TODAY, vehicleId: tip.id, siteId: A, driver: 'X', openKm: 1120, closeKm: 1180, trips: 2, hiredOut: true });
    expect(hired.record.split).toBeUndefined();
  });
});

describe('site progress, quality and loans', () => {
  it('DPR draft, programme and LD risk, cube tests due, NEDFi EMI schedule', () => {
    let { db, A } = world();
    db = ins(db, 'boq', { siteId: A, itemNo: '1', description: 'BC 30mm', unit: 'sqm', qty: 10000, rate: 400 }).db;
    db = ins(db, 'measurements', { date: TODAY, siteId: A, boqItemId: db.boq[0]!.id, qty: 500, chainage: 'Ch 1+000' }).db;
    const dpr = dprDraft(db, A, TODAY);
    expect(dpr.work[0]).toMatchObject({ qty: 500, chainage: 'Ch 1+000' });
    const site = db.sites.find((s) => s.id === A)!;
    const pg = programme(db, site, TODAY, 1)!;
    expect(pg.planned).toBeGreaterThan(30);
    expect(pg.risk).toBe('HIGH');
    db = ins(db, 'labTests', { date: '2026-10-20', kind: 'CUBE', siteId: A, lot: 'M25 deck', cube: { castDate: '2026-10-20', grade: 'M25', nos: 3 } }).db;
    expect(cubesDue(db, TODAY).map((c) => c.age)).toEqual([7]);
    const emi = loanSchedule({ amount: 1000000, ratePct: 12, startDate: '2026-12-05', tenureMonths: 12, moratoriumMonths: 0 } as any);
    expect(emi[0]!.emi).toBe(88848.79);
    expect(emi.at(-1)!.closing).toBe(0);
  });
});

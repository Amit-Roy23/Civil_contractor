import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCompanyDB } from '../src/setup.js';
import { applyCommand, type Command } from '../src/policy.js';
import { buildSession } from '../src/session.js';
import { snapshotFor } from '../src/visibility.js';
import { costEntries, overheadAllocation, siteCostSheet, vehicleCost } from '../src/selectors.js';
import { advanceBalance, advancesOutstanding, licenceAlerts, runTotals, salaryLine } from '../src/staffpay.js';
import type { DB } from '../src/types.js';
import { checkImport, templateById } from '../src/imports.js';

const TODAY = '2026-11-12';
const spec = JSON.parse(readFileSync(new URL('../../../apps/api/setup/saurajit-deb.json', import.meta.url), 'utf8'));
let n = 0;
const run = (db: DB, cmd: Command, userId = 'u1') => applyCommand({ db, session: buildSession(db, userId)!, today: TODAY, now: `${TODAY}T10:00:00.000Z`, hour: 10, newId: () => `st-${++n}` }, cmd);
const ins = (db: DB, coll: any, rec: any, userId?: string) => run(db, { kind: 'insert', coll, rec }, userId);
const upd = (db: DB, coll: any, id: string, patch: any, reason?: string) => run(db, { kind: 'update', coll, id, patch, reason });
const ZERO = { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 };
const OCT = { from: '2026-10-01', to: '2026-10-31' };

function world() {
  let db = buildCompanyDB(spec, TODAY).db;
  const work = (name: string, short: string) => {
    const r = ins(db, 'sites', { name, short, clientId: db.clients[0]!.id, contractValue: 20000000, status: 'ACTIVE', workType: 'ROAD', startDate: '2026-06-01', scheduledCompletion: '2027-05-31', budget: ZERO, openingCost: ZERO });
    db = r.db;
    return r.record.id as string;
  };
  const A = work('Kadamtala – Kurti Road', 'Kadamtala Rd');
  const B = work('Panisagar BC Road', 'Panisagar Rd');
  const r = ins(db, 'users', { name: 'Rahul Paul', username: 'rahul', phone: '9862000001', roleId: 'engineer', siteIds: [A], plantIds: [], active: true });
  db = r.db;
  return { db, A, B, engineer: r.record.id as string };
}
const staffRec = (x: Record<string, unknown>) => ({ name: 'Bikash Das', fatherName: 'Haripada Das', phone: '9862000010', aadhaar: '1234 5678 9012', designation: 'Supervisor', joiningDate: '2026-09-01', basis: 'MONTHLY', salary: 18000, allowances: { food: 1500, mobile: 300, travel: 0 }, otRate: 100, posting: 'HEAD_OFFICE', payMode: 'BANK', bankAccount: '30112233445', ifsc: 'sbin0001234', pfMember: true, uan: '100123456789', esiMember: true, ...x });

/** October 2026: every working day present except 6 Oct absent, 7–8 Oct half days, 9 Oct leave; OT 4 h on 12 Oct */
function markOctober(db: DB, staffId: string) {
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue; // Sundays: weekly off, not marked
    const status = d === 6 ? 'A' : d === 7 || d === 8 ? 'H' : d === 9 ? 'L' : 'P';
    db = ins(db, 'staffAttendance', { staffId, date, status, otHours: d === 12 ? 4 : 0 }).db;
  }
  return db;
}

describe('Salaried staff master', () => {
  it('gives the next staff ID, masks Aadhaar, and checks the posting', () => {
    let { db, A } = world();
    const r = ins(db, 'staff', staffRec({ posting: 'SITE', siteId: A }));
    db = r.db;
    expect([r.record.code, r.record.aadhaar, r.record.ifsc]).toEqual(['STF-001', 'XXXX-XXXX-9012', 'SBIN0001234']);
    expect(ins(db, 'staff', staffRec({ name: 'Second' })).record.code).toBe('STF-002');
    expect(() => ins(db, 'staff', staffRec({ posting: 'SITE' }))).toThrow(/Choose the work/);
    expect(() => ins(db, 'staff', staffRec({ posting: 'VEHICLE' }))).toThrow(/vehicle/);
    expect(() => ins(db, 'staff', staffRec({ basis: 'PER_TRIP' }))).toThrow(/per-trip salary needs the vehicle/);
    expect(() => ins(db, 'staff', staffRec({ designation: '' }))).toThrow(/designation/);
  });

  it('only the owner and accountant see staff and salaries; a site engineer cannot add or see them', () => {
    let { db, engineer } = world();
    db = ins(db, 'staff', staffRec({})).db;
    expect(snapshotFor(db, buildSession(db, 'u1')!).staff).toHaveLength(1);
    expect(snapshotFor(db, buildSession(db, engineer)!).staff).toHaveLength(0);
    expect(() => ins(db, 'staff', staffRec({ name: 'X' }), engineer)).toThrow();
    // a role saved before the Staff module existed: the accountant still gets it
    const acc = ins(db, 'users', { name: 'Accounts', username: 'accounts', phone: '9862000002', roleId: 'accountant', siteIds: [], plantIds: [], active: true });
    db = acc.db;
    const roles = db.roles.map((r) => (r.id === 'accountant' ? { ...r, perms: Object.fromEntries(Object.entries(r.perms).filter(([k]) => k !== 'staff')) as any } : r));
    db = { ...db, roles };
    expect(buildSession(db, acc.record.id)!.can('staff', 'approve')).toBe(true);
    expect(buildSession(db, engineer)!.can('staff')).toBe(false);
  });
});

describe('Monthly payroll', () => {
  it('pays for days worked, allowances in proportion, OT, PF / ESI, and recovers advances and loan instalments', () => {
    let { db } = world();
    const st = ins(db, 'staff', staffRec({}));
    db = markOctober(st.db, st.record.id);
    db = ins(db, 'staffAdvances', { staffId: st.record.id, date: '2026-10-10', kind: 'ADVANCE', amount: 5000, instalment: 0 }).db;
    const loan = ins(db, 'staffAdvances', { staffId: st.record.id, date: '2026-10-15', kind: 'LOAN', amount: 12000, instalment: 2000 });
    db = loan.db;
    const r = ins(db, 'salaryRuns', { month: '2026-10' });
    db = r.db;
    const l = r.record.lines[0];
    // 31 days: 23 present + 2 half + 1 leave + 4 Sundays = 29 paid days
    expect([l.present, l.half, l.leave, l.holiday, l.absent, l.unmarked, l.paidDays]).toEqual([23, 2, 1, 4, 1, 0, 29]);
    // 18,000 × 29/31 = 16,839 · 1,800 × 29/31 = 1,684 · OT 4 h × 100 = 400
    expect([l.basic, l.allowances, l.ot, l.gross]).toEqual([16839, 1684, 400, 18923]);
    // EPF 12% of 15,000 · ESI 0.75% of 18,923 rounded up · advance in full · loan instalment
    expect([l.pf, l.esi, l.advance, l.loan, l.net]).toEqual([1800, 142, 5000, 2000, 9981]);
    expect(r.record.no).toBe('SAL/2026-10');
    expect(() => ins(db, 'salaryRuns', { month: '2026-10' })).toThrow(/already exists/);
  });

  it('a draft takes other deductions; approval locks the month, records recoveries; payments track the balance', () => {
    let { db } = world();
    const st = ins(db, 'staff', staffRec({}));
    db = markOctober(st.db, st.record.id);
    const loan = ins(db, 'staffAdvances', { staffId: st.record.id, date: '2026-10-15', kind: 'LOAN', amount: 12000, instalment: 2000 });
    db = loan.db;
    const r = ins(db, 'salaryRuns', { month: '2026-10' });
    db = upd(r.db, 'salaryRuns', r.record.id, { other: { [st.record.id]: { amount: 500, note: 'Canteen' } } }).db;
    expect(db.salaryRuns[0]!.lines[0]).toMatchObject({ other: 500, otherNote: 'Canteen', net: 18923 - 1800 - 142 - 2000 - 500 });
    expect(() => upd(db, 'salaryRuns', r.record.id, { payments: [{ staffId: st.record.id, date: TODAY, amount: 100, mode: 'CASH', ref: '' }] })).toThrow(/Approve the salary sheet/);
    db = upd(db, 'salaryRuns', r.record.id, { status: 'APPROVED' }).db;
    const net = db.salaryRuns[0]!.lines[0]!.net;
    expect(advanceBalance(db, db.staffAdvances[0]!)).toBe(10000);
    // attendance of October is locked now
    const a = db.staffAttendance.find((x) => x.date === '2026-10-05')!;
    expect(() => upd(db, 'staffAttendance', a.id, { status: 'A' })).toThrow(/locked/);
    expect(() => ins(db, 'staffAttendance', { staffId: st.record.id, date: '2026-10-04', status: 'P' })).toThrow(/locked/);
    // part payment, then the rest; never more than the net
    db = upd(db, 'salaryRuns', r.record.id, { payments: [{ staffId: st.record.id, date: TODAY, amount: 5000, mode: 'CASH', ref: '' }] }).db;
    expect(runTotals(db.salaryRuns[0]!).pending).toBe(net - 5000);
    expect(() => upd(db, 'salaryRuns', r.record.id, { payments: [...db.salaryRuns[0]!.payments, { staffId: st.record.id, date: TODAY, amount: net, mode: 'BANK', ref: 'U1' }] })).toThrow(/More than the net salary/);
    db = upd(db, 'salaryRuns', r.record.id, { payments: [...db.salaryRuns[0]!.payments, { staffId: st.record.id, date: TODAY, amount: net - 5000, mode: 'BANK', ref: 'U1' }] }).db;
    expect(runTotals(db.salaryRuns[0]!).pending).toBe(0);
    // November recovers the next instalment from the remaining loan
    db = ins(db, 'staffAttendance', { staffId: st.record.id, date: '2026-11-02', status: 'P' }).db;
    expect(salaryLine(db, db.staff[0]!, '2026-11').loan).toBe(2000);
    expect(advancesOutstanding(db).map((x) => x.balance)).toEqual([10000]);
  });

  it('per-day and per-trip salaries; unmarked working days are not paid', () => {
    let { db, A } = world();
    const tip = db.vehicles.find((v) => v.regNo === 'TR05K1886')!.id;
    const drv = ins(db, 'staff', staffRec({ name: 'Ratan Debnath', designation: 'Driver', basis: 'PER_TRIP', salary: 300, allowances: { food: 0, mobile: 0, travel: 0 }, posting: 'VEHICLE', vehicleId: tip, pfMember: false, esiMember: false, licenceNo: 'TR05 20190001234', licenceExpiry: '2026-11-30' }));
    const day = ins(drv.db, 'staff', staffRec({ name: 'Sukanta Nath', designation: 'Watchman', basis: 'PER_DAY', salary: 500, allowances: { food: 0, mobile: 0, travel: 0 }, pfMember: false, esiMember: false }));
    db = day.db;
    for (const [date, trips] of [['2026-10-05', 4], ['2026-10-06', 3]] as const) {
      db = ins(db, 'staffAttendance', { staffId: drv.record.id, date, status: 'P' }).db;
      db = ins(db, 'logs', { date, vehicleId: tip, siteId: A, driver: 'Ratan', openKm: 1000, closeKm: 1080, trips, route: 'Quarry → site', idleHours: 0 }).db;
    }
    db = ins(db, 'staffAttendance', { staffId: day.record.id, date: '2026-10-05', status: 'P' }).db;
    db = ins(db, 'staffAttendance', { staffId: day.record.id, date: '2026-10-06', status: 'H' }).db;
    const lines = ins(db, 'salaryRuns', { month: '2026-10' }).record.lines;
    const d = lines.find((x: any) => x.staffId === drv.record.id);
    const w = lines.find((x: any) => x.staffId === day.record.id);
    expect([d.trips, d.basic]).toEqual([7, 2100]);
    // watchman: 1.5 days marked + 4 Sundays = 5.5 paid; the other working days are unmarked
    expect([w.paidDays, w.basic, w.unmarked]).toEqual([5.5, 2750, 25]);
    expect(licenceAlerts(db, TODAY).map((x) => [x.staff.name, x.daysLeft])).toEqual([['Ratan Debnath', 18]]);
  });
});

describe('Salary costing', () => {
  it('site staff → that work as Staff salary; a driver → where the vehicle worked; head office → overheads', () => {
    let { db, A, B } = world();
    const tip = db.vehicles.find((v) => v.regNo === 'TR05F1888')!.id;
    const site = ins(db, 'staff', staffRec({ name: 'Site Munshi', designation: 'Munshi', posting: 'SITE', siteId: A, otRate: 0, allowances: { food: 0, mobile: 0, travel: 0 }, salary: 15500 }));
    const drv = ins(site.db, 'staff', staffRec({ name: 'Driver', designation: 'Driver', posting: 'VEHICLE', vehicleId: tip, otRate: 0, allowances: { food: 0, mobile: 0, travel: 0 }, salary: 15500 }));
    const ho = ins(drv.db, 'staff', staffRec({ name: 'Office', designation: 'Accountant', posting: 'HEAD_OFFICE', otRate: 0, allowances: { food: 0, mobile: 0, travel: 0 }, salary: 31000 }));
    db = ho.db;
    for (const id of [site.record.id, drv.record.id, ho.record.id]) db = ins(db, 'staffAttendance', { staffId: id, date: '2026-10-05', status: 'P' }).db;
    // the tipper worked 3 trips for Kadamtala and 1 for Panisagar that day
    db = ins(db, 'logs', { date: '2026-10-05', vehicleId: tip, siteId: A, driver: 'D', openKm: 1, closeKm: 40, trips: 0, route: '', idleHours: 0, tripRows: [A, A, A, B].map((s) => ({ siteId: s, material: 'GSB', from: 'Quarry', to: 'Site', qty: 10, unit: 'MT', chainage: '' })) }).db;
    const day = (x: number) => x / 31; // one day of a monthly salary in October
    const ce = costEntries(db).filter((c) => c.date === '2026-10-05');
    const staffA = ce.filter((c) => c.siteId === A && c.head === 'STAFF').reduce((s, c) => s + c.amount, 0);
    const vehA = ce.filter((c) => c.siteId === A && c.source === 'Driver / operator salary').reduce((s, c) => s + c.amount, 0);
    const vehB = ce.filter((c) => c.siteId === B && c.source === 'Driver / operator salary').reduce((s, c) => s + c.amount, 0);
    expect([staffA, vehA, vehB].map((x) => Math.round(x))).toEqual([Math.round(day(15500)), Math.round(day(15500) * 0.75), Math.round(day(15500) * 0.25)]);
    // head office: the day's salary (and Sundays from then on) goes into October's overhead pool, shared by the works
    const oh = overheadAllocation(db).filter((o) => o.month === '2026-10');
    expect(oh.length).toBe(2);
    // office: 5 Oct + Sundays 11, 18, 25; the driver's Sundays too (no log that day, vehicle not parked at a work)
    expect(Math.round(oh.reduce((s, o) => s + o.amount, 0))).toBe(Math.round(day(31000) * 4 + day(15500) * 3));
    expect(siteCostSheet(db, A, OCT).heads.STAFF).toBeGreaterThan(0);
    // the vehicle's cost uses the driver's actual salary instead of the flat driver salary
    expect(Math.round(vehicleCost(db, OCT).find((v) => v.vehicleId === tip)!.driver)).toBe(Math.round(day(15500) * 4)); // 5 Oct + Sundays 11, 18, 25
  });
});

describe('Staff Excel import', () => {
  it('imports with the next staff IDs, masks Aadhaar, finds the vehicle by number; a site engineer cannot import', () => {
    let { db, engineer } = world();
    const t = templateById('staff')!;
    const sheet = [
      ['Staff ID', 'Name', 'Designation', 'Salary / rate', 'Aadhaar', 'Posting', 'Vehicle', 'IFSC', 'Licence expiry'],
      ['', 'Ratan Debnath', 'Driver', 16000, '1234 5678 4321', 'Vehicle', 'TR05K1886', 'sbin0001234', '31/12/2027'],
      ['', 'Mithu Saha', 'Accountant', 22000, '', 'Head office', '', '', ''],
    ];
    const res = checkImport(db, t, sheet);
    expect(res.errors).toEqual([]);
    expect(() => run(db, { kind: 'import', template: 'staff', ops: res.ops }, engineer)).toThrow();
    db = run(db, { kind: 'import', template: 'staff', ops: res.ops }).db;
    expect(db.staff.map((x) => [x.code, x.name, x.aadhaar, x.posting, x.ifsc, x.licenceExpiry])).toEqual([
      ['STF-001', 'Ratan Debnath', 'XXXX-XXXX-4321', 'VEHICLE', 'SBIN0001234', '2027-12-31'],
      ['STF-002', 'Mithu Saha', '', 'HEAD_OFFICE', '', undefined],
    ]);
    expect(db.staff[0]!.vehicleId).toBe(db.vehicles.find((v) => v.regNo === 'TR05K1886')!.id);
  });
});

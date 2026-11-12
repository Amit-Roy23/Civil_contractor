import type { DB, ID, SalaryLine, SalaryRun, Staff, StaffAdvance } from './types.js';
import { STATUTORY } from './labourreg.js';
import { addDays } from './format.js';
import { round, sum } from './utils.js';

/**
 * Salaried staff payroll and costing.
 *
 * Paid days in a month = present + ½ × half days + holidays + leave (when leave is paid, a setting)
 * + the weekly off (Sunday by default) on days not marked otherwise. Absent and unmarked working days
 * are not paid, and unmarked days are reported so the attendance can be completed before the salary.
 *   Monthly fixed : salary ÷ days in the month × paid days
 *   Per day       : rate × paid days
 *   Per trip      : rate × trips logged by the linked vehicle in the month
 * Fixed allowances (food / batta, mobile, travel) are paid in the same proportion as the salary
 * (allowance ÷ days in the month × paid days). OT = hours × OT rate.
 * Deductions: EPF 12% of basic up to ₹15,000 and ESI 0.75% of gross up to ₹21,000 (when applicable),
 * salary advances and loans (oldest first, by instalment, never more than the pay left), and other.
 */

export const staffSettings = (db: DB) => ({ weeklyOff: db.settings.staff?.weeklyOff ?? 0, leavePaid: db.settings.staff?.leavePaid ?? true });
export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const dayKey = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const allowanceTotal = (s: Pick<Staff, 'allowances'>) => (s.allowances?.food || 0) + (s.allowances?.mobile || 0) + (s.allowances?.travel || 0);

/** employed on this date (joined, and not yet left) */
export const employedOn = (s: Staff, date: string) => (!s.joiningDate || s.joiningDate <= date) && (!s.leftOn || s.leftOn >= date);

/** one attendance record per staff and day */
function attIndex(db: DB) {
  const m = new Map<string, DB['staffAttendance'][number]>();
  for (const a of db.staffAttendance) m.set(`${a.staffId}|${a.date}`, a);
  return m;
}

/** trips the linked vehicle made on each date (per-trip drivers) */
function tripsIndex(db: DB) {
  const m = new Map<string, number>();
  for (const l of db.logs) m.set(`${l.vehicleId}|${l.date}`, (m.get(`${l.vehicleId}|${l.date}`) || 0) + (l.tripRows?.length || l.trips || 0));
  return m;
}

/** a day's status: marked, or the weekly off, or unmarked; NA when not employed */
export type DayStatus = 'P' | 'A' | 'H' | 'L' | 'HO' | 'WO' | 'U' | 'NA';
export function dayStatus(db: DB, s: Staff, date: string, idx = attIndex(db)): DayStatus {
  if (!employedOn(s, date)) return 'NA';
  const a = idx.get(`${s.id}|${date}`);
  if (a) return a.status;
  return weekday(date) === staffSettings(db).weeklyOff ? 'WO' : 'U';
}
export function paidFraction(db: DB, st: DayStatus) {
  if (st === 'P' || st === 'HO' || st === 'WO') return 1;
  if (st === 'H') return 0.5;
  if (st === 'L') return staffSettings(db).leavePaid ? 1 : 0;
  return 0;
}

/* ---------------- advances and loans ---------------- */
/** recovered so far in approved salary sheets (optionally leaving one sheet out) */
export function advanceRecovered(db: DB, advanceId: ID, exceptRunId?: ID) {
  return sum(
    db.salaryRuns.filter((r) => r.status === 'APPROVED' && r.id !== exceptRunId),
    (r) => sum(r.lines, (l) => sum(l.recoveries.filter((x) => x.advanceId === advanceId), (x) => x.amount)),
  );
}
export const advanceBalance = (db: DB, a: StaffAdvance, exceptRunId?: ID) => round(a.amount - advanceRecovered(db, a.id, exceptRunId), 2);

/* ---------------- the salary line for one person and month ---------------- */
export function salaryLine(db: DB, s: Staff, month: string, opts: { other?: number; otherNote?: string; runId?: ID } = {}): SalaryLine {
  const D = daysIn(month);
  const idx = attIndex(db);
  const trips = tripsIndex(db);
  const c = { present: 0, half: 0, leave: 0, holiday: 0, absent: 0, unmarked: 0 };
  let paidDays = 0;
  let otHours = 0;
  let tripCount = 0;
  for (let d = 1; d <= D; d++) {
    const date = dayKey(month, d);
    const st = dayStatus(db, s, date, idx);
    if (st === 'NA') continue;
    if (st === 'P') c.present++;
    else if (st === 'H') c.half++;
    else if (st === 'L') c.leave++;
    else if (st === 'HO' || st === 'WO') c.holiday++;
    else if (st === 'A') c.absent++;
    else c.unmarked++;
    paidDays += paidFraction(db, st);
    otHours += idx.get(`${s.id}|${date}`)?.otHours || 0;
    if (s.basis === 'PER_TRIP' && s.vehicleId && (st === 'P' || st === 'H')) tripCount += trips.get(`${s.vehicleId}|${date}`) || 0;
  }
  const basic = Math.round(s.basis === 'MONTHLY' ? (s.salary * paidDays) / D : s.basis === 'PER_DAY' ? s.salary * paidDays : s.salary * tripCount);
  const allowances = Math.round((allowanceTotal(s) * paidDays) / D);
  const ot = Math.round(otHours * (s.otRate || 0));
  const gross = basic + allowances + ot;
  const pf = s.pfMember ? Math.round((Math.min(basic, STATUTORY.pfCeiling) * STATUTORY.pfRate) / 100) : 0;
  const esi = s.esiMember && gross > 0 && gross <= STATUTORY.esiCeiling ? Math.ceil((gross * STATUTORY.esiEe) / 100) : 0;
  const other = Math.max(0, Math.round(opts.other || 0));
  // advances and loans: oldest first, by instalment, never more than the pay that is left
  let room = Math.max(0, gross - pf - esi - other);
  const monthEnd = dayKey(month, D);
  const recoveries: SalaryLine['recoveries'] = [];
  let advance = 0;
  let loan = 0;
  for (const a of db.staffAdvances.filter((x) => x.staffId === s.id && x.date <= monthEnd).sort((x, y) => x.date.localeCompare(y.date))) {
    const bal = advanceBalance(db, a, opts.runId);
    if (bal <= 0 || room <= 0) continue;
    const take = Math.min(bal, a.instalment > 0 ? a.instalment : bal, room);
    if (take <= 0) continue;
    recoveries.push({ advanceId: a.id, amount: round(take, 2) });
    if (a.kind === 'LOAN') loan += take;
    else advance += take;
    room -= take;
  }
  advance = round(advance, 2);
  loan = round(loan, 2);
  const net = round(gross - pf - esi - advance - loan - other, 2);
  return {
    staffId: s.id, basis: s.basis, rate: s.salary, daysInMonth: D, ...c, paidDays: round(paidDays, 2), trips: tripCount,
    basic, allowances, otHours: round(otHours, 2), ot, gross, pf, esi, advance, loan, other, otherNote: opts.otherNote || '', recoveries, net,
  };
}

/** staff on the payroll of a month: employed on any day of it */
export function payrollStaff(db: DB, month: string) {
  const first = `${month}-01`;
  const last = dayKey(month, daysIn(month));
  return db.staff
    .filter((s) => (!s.joiningDate || s.joiningDate <= last) && (!s.leftOn || s.leftOn >= first) && (s.active !== false || (s.leftOn && s.leftOn >= first)))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function buildSalaryLines(db: DB, month: string, keep: SalaryRun['lines'] = [], runId?: ID) {
  return payrollStaff(db, month).map((s) => {
    const k = keep.find((l) => l.staffId === s.id);
    return salaryLine(db, s, month, { other: k?.other, otherNote: k?.otherNote, runId });
  });
}

export function runTotals(r: SalaryRun) {
  const paid = (staffId: ID) => sum(r.payments.filter((p) => p.staffId === staffId), (p) => p.amount);
  return {
    gross: sum(r.lines, (l) => l.gross),
    deductions: sum(r.lines, (l) => l.pf + l.esi + l.advance + l.loan + l.other),
    net: sum(r.lines, (l) => l.net),
    paid: sum(r.payments, (p) => p.amount),
    pending: round(sum(r.lines, (l) => Math.max(0, l.net - paid(l.staffId))), 2),
    paidOf: paid,
  };
}

/* ---------------- costing: each day's pay, charged where the person worked ---------------- */
/**
 * Pay earned per day from attendance (salary share + allowance share + OT; per-trip drivers by the
 * day's trips). Costing starts on the first marked day of each person, so years before go-live
 * are never charged; it runs to today or the leaving date.
 */
const dailyCache = new WeakMap<DB, Map<string, Array<{ date: string; staffId: ID; amount: number }>>>();
export function staffDailyCost(db: DB, today: string) {
  const c = dailyCache.get(db)?.get(today);
  if (c) return c;
  const res = computeDailyCost(db, today);
  if (!dailyCache.has(db)) dailyCache.set(db, new Map());
  dailyCache.get(db)!.set(today, res);
  return res;
}
function computeDailyCost(db: DB, today: string) {
  const idx = attIndex(db);
  const trips = tripsIndex(db);
  const first = new Map<ID, string>();
  for (const a of db.staffAttendance) if (!first.has(a.staffId) || a.date < first.get(a.staffId)!) first.set(a.staffId, a.date);
  const out: Array<{ date: string; staffId: ID; amount: number }> = [];
  for (const s of db.staff) {
    const start = first.get(s.id);
    if (!start) continue;
    const end = s.leftOn && s.leftOn < today ? s.leftOn : today;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const st = dayStatus(db, s, d, idx);
      if (st === 'NA') continue;
      const f = paidFraction(db, st);
      const D = daysIn(d.slice(0, 7));
      const pay =
        s.basis === 'MONTHLY' ? (s.salary * f) / D : s.basis === 'PER_DAY' ? s.salary * f : st === 'P' || st === 'H' ? s.salary * (trips.get(`${s.vehicleId}|${d}`) || 0) : 0;
      const amount = pay + (allowanceTotal(s) * f) / D + (idx.get(`${s.id}|${d}`)?.otHours || 0) * (s.otRate || 0);
      if (amount > 0) out.push({ date: d, staffId: s.id, amount });
    }
  }
  return out;
}

/** plant staff salary for a plant and month (goes into the plant's running cost per MT) */
export function plantStaffCost(db: DB, plantId: ID, month: string, today: string) {
  const ids = new Set(db.staff.filter((s) => s.posting === 'PLANT' && s.plantId === plantId).map((s) => s.id));
  if (!ids.size) return 0;
  return sum(staffDailyCost(db, today).filter((c) => ids.has(c.staffId) && c.date.startsWith(month)), (c) => c.amount);
}

/** licences of drivers and operators expiring within `days` (or expired) */
export function licenceAlerts(db: DB, today: string, days = 30) {
  return db.staff
    .filter((s) => s.active !== false && !s.leftOn && s.licenceExpiry && s.licenceExpiry <= addDays(today, days))
    .map((s) => ({ staff: s, expiry: s.licenceExpiry!, daysLeft: Math.round((Date.parse(s.licenceExpiry!) - Date.parse(today)) / 86400000) }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}

/** advances and loans with a balance still to recover */
export function advancesOutstanding(db: DB) {
  return db.staffAdvances
    .map((a) => ({ advance: a, recovered: advanceRecovered(db, a.id), balance: advanceBalance(db, a) }))
    .filter((x) => x.balance > 0.005)
    .sort((a, b) => a.advance.date.localeCompare(b.advance.date));
}

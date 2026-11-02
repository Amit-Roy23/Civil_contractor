import type { DB, ID, Worker } from './types.js';
import { round, sum } from './utils.js';

/**
 * Labour registers and statutory files (LAB-02 … LAB-05).
 * EPF: 12% employee on EPF wages up to ₹15,000; employer 12% split as EPS 8.33% (on wages up to ₹15,000)
 * and the balance to EPF. ESIC: 0.75% employee and 3.25% employer when gross is up to ₹21,000 a month.
 */
export const STATUTORY = { pfCeiling: 15000, pfRate: 12, epsRate: 8.33, esiCeiling: 21000, esiEe: 0.75, esiEr: 3.25 };

const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const dayKey = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

/** workers on a work's rolls for a month (own labour) — those assigned there or with attendance there */
export function rollWorkers(db: DB, siteId: ID | undefined, month: string): Worker[] {
  const ids = new Set(db.attendance.filter((a) => a.workerId && a.date.startsWith(month) && (!siteId || a.siteId === siteId)).map((a) => a.workerId!));
  return db.workers
    .filter((w) => w.ownership === 'OWN' && (ids.has(w.id) || ((!siteId || w.siteId === siteId) && w.active !== false && (!w.leftOn || w.leftOn >= `${month}-01`))))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/* ---------------- Form XVI: muster roll ---------------- */
export function musterRoll(db: DB, siteId: ID | undefined, month: string) {
  const n = daysIn(month);
  return rollWorkers(db, siteId, month).map((w) => {
    const days: string[] = [];
    let P = 0;
    let H = 0;
    let A = 0;
    let ot = 0;
    for (let d = 1; d <= n; d++) {
      const a = db.attendance.find((x) => x.workerId === w.id && x.date === dayKey(month, d) && (!siteId || x.siteId === siteId));
      const st = a?.status || '';
      days.push(st);
      if (st === 'P') P++;
      else if (st === 'H') H++;
      else if (st === 'A') A++;
      ot += a?.otHours || 0;
    }
    return { worker: w, days, present: P, half: H, absent: A, paidDays: P + H / 2, otHours: round(ot, 2) };
  });
}

/* ---------------- Form XVII: register of wages ---------------- */
export function wageRegister(db: DB, siteId: ID | undefined, month: string) {
  const from = `${month}-01`;
  const to = dayKey(month, daysIn(month));
  return musterRoll(db, siteId, month).map((m) => {
    const w = m.worker;
    const basic = Math.round(m.paidDays * w.wageRate);
    const otPay = Math.round(m.otHours * w.otRate);
    const gross = basic + otPay;
    const pfWages = w.pfMember ? Math.min(basic, STATUTORY.pfCeiling) : 0;
    const pf = w.pfMember ? Math.round((pfWages * STATUTORY.pfRate) / 100) : 0;
    const eps = w.pfMember ? Math.round((pfWages * STATUTORY.epsRate) / 100) : 0;
    const erPf = w.pfMember ? Math.round((pfWages * STATUTORY.pfRate) / 100) - eps : 0;
    const esiApplies = !!w.esiMember && gross > 0 && gross <= STATUTORY.esiCeiling;
    // ESIC rounds contributions up to the next rupee
    const esi = esiApplies ? Math.ceil((gross * STATUTORY.esiEe) / 100) : 0;
    const esiEr = esiApplies ? Math.ceil((gross * STATUTORY.esiEr) / 100) : 0;
    const advance = Math.round(sum(db.advances.filter((a) => a.workerId === w.id && a.date >= from && a.date <= to), (a) => a.amount));
    const deductions = pf + esi + advance;
    return {
      workerId: w.id, code: w.code, name: w.name, trade: w.trade, rate: w.wageRate, otRate: w.otRate,
      paidDays: m.paidDays, present: m.present, half: m.half, absent: m.absent, otHours: m.otHours,
      basic, otPay, gross, pfWages, pf, eps, erPf, esi, esiEr, advance, deductions, net: gross - deductions,
      ncpDays: m.absent, uan: w.uan || '', esicNo: w.esicNo || '', bankAccount: w.bankAccount || '', ifsc: w.ifsc || '', upi: w.upi || '',
    };
  });
}

/* ---------------- LAB-04: EPFO ECR 2.0 text file ---------------- */
export function ecrFile(db: DB, siteId: ID | undefined, month: string) {
  const rows = wageRegister(db, siteId, month).filter((r) => db.workers.find((w) => w.id === r.workerId)?.pfMember);
  const errors = rows.filter((r) => !/^\d{12}$/.test(r.uan)).map((r) => `${r.name}: UAN missing or not 12 digits`);
  const lines = rows
    .filter((r) => /^\d{12}$/.test(r.uan))
    .map((r) => [r.uan, r.name.toUpperCase().replace(/[^A-Z .]/g, ''), r.gross, r.pfWages, r.pfWages, r.pfWages, r.pf, r.eps, r.erPf, r.ncpDays, 0].join('#~#'));
  return { text: lines.join('\n'), lines: lines.length, totals: { pf: sum(rows, (r) => r.pf), eps: sum(rows, (r) => r.eps), erPf: sum(rows, (r) => r.erPf), wages: sum(rows, (r) => r.pfWages) }, errors };
}

/* ---------------- LAB-04: ESIC monthly contribution ---------------- */
export function esicRows(db: DB, siteId: ID | undefined, month: string) {
  return wageRegister(db, siteId, month)
    .filter((r) => db.workers.find((w) => w.id === r.workerId)?.esiMember)
    .map((r) => ({ ipNo: r.esicNo, name: r.name, days: Math.ceil(r.paidDays), wages: r.gross <= STATUTORY.esiCeiling ? r.gross : 0, ee: r.esi, er: r.esiEr, reason: r.gross > STATUTORY.esiCeiling ? 'Above wage ceiling' : r.paidDays === 0 ? 'No work' : '' }));
}

/* ---------------- LAB-02: bank payment file ---------------- */
export function bankFile(db: DB, siteId: ID | undefined, month: string) {
  const rows = wageRegister(db, siteId, month).filter((r) => r.net > 0);
  return { rows: rows.filter((r) => r.bankAccount && r.ifsc).map((r) => ({ name: r.name, account: r.bankAccount, ifsc: r.ifsc, amount: r.net, narration: `Wages ${month} ${r.code}` })), missing: rows.filter((r) => !r.bankAccount || !r.ifsc).map((r) => `${r.name}${r.upi ? ` (UPI ${r.upi})` : ''}`) };
}

/* ---------------- LAB-05: minimum wage ---------------- */
export function minWageBreaches(db: DB) {
  const min = db.settings.minWages || {};
  return db.workers
    .filter((w) => w.active !== false && !w.leftOn && min[w.trade] && w.wageRate < min[w.trade]!)
    .map((w) => ({ worker: w, min: min[w.trade]!, short: round(min[w.trade]! - w.wageRate, 2) }));
}

/* ---------------- LAB-06: licences ---------------- */
export function licences(db: DB, today: string) {
  const out: Array<{ who: string; no: string; validTo: string; days: number; kind: 'OWN' | 'SUBCON'; id: ID }> = [];
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86400000);
  for (const f of db.firms) if (f.labourLicence?.validTo) out.push({ who: f.legalName, no: f.labourLicence.no, validTo: f.labourLicence.validTo, days: days(f.labourLicence.validTo), kind: 'OWN', id: f.id });
  for (const s of db.subcons.filter((x) => x.active !== false)) if (s.licenceExpiry) out.push({ who: s.name, no: s.licenceNo || '', validTo: s.licenceExpiry, days: days(s.licenceExpiry), kind: 'SUBCON', id: s.id });
  return out.sort((a, b) => a.days - b.days);
}

/* ---------------- LAB-03: half-yearly return data (SWAAGAT) ---------------- */
export function halfYearly(db: DB, year: number, half: 1 | 2) {
  const months = Array.from({ length: 6 }, (_, i) => `${year}-${String(half === 1 ? i + 1 : i + 7).padStart(2, '0')}`);
  const from = `${months[0]}-01`;
  const to = `${months[5]}-31`;
  return db.sites
    .filter((s) => !(s as any).outOfScope)
    .map((s) => {
      const att = db.attendance.filter((a) => a.siteId === s.id && a.date >= from && a.date <= to);
      const byDay = new Map<string, number>();
      for (const a of att) byDay.set(a.date, (byDay.get(a.date) || 0) + (a.workerId ? (a.status === 'P' || a.status === 'H' ? 1 : 0) : a.headcount || 0));
      const ownIds = new Set(att.filter((a) => a.workerId && a.status !== 'A').map((a) => a.workerId!));
      const men = [...ownIds].filter((id) => db.workers.find((w) => w.id === id)?.gender !== 'F').length;
      const women = ownIds.size - men;
      const manDays = sum(att, (a) => (a.workerId ? (a.status === 'P' ? 1 : a.status === 'H' ? 0.5 : 0) : a.headcount || 0));
      const wages = sum(months, (m) => sum(wageRegister(db, s.id, m), (r) => r.gross));
      return { siteId: s.id, work: s.name, daysWorked: byDay.size, maxOnAnyDay: Math.max(0, ...byDay.values()), men, women, manDays: round(manDays, 1), wages, from, to };
    })
    .filter((x) => x.daysWorked > 0);
}

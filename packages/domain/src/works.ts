import type { Client, DB, DeductionProfile, Firm, Plant, Site, SiteStatus, WorkStage } from './types.js';
import { addDays } from './format.js';

/** Works master helpers (Query 1): stages, deductions, dates, firms. */

export const WORK_STAGES: Array<{ value: WorkStage; label: string }> = [
  { value: 'BID_SUBMITTED', label: 'Bid submitted' },
  { value: 'LOA_RECEIVED', label: 'LOA received' },
  { value: 'AGREEMENT_SIGNED', label: 'Agreement signed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'STOPPED', label: 'Stopped (hindrance)' },
  { value: 'PHYSICALLY_COMPLETE', label: 'Physically complete' },
  { value: 'FINAL_BILL_SUBMITTED', label: 'Final bill submitted' },
  { value: 'FINAL_BILL_PAID', label: 'Final bill paid' },
  { value: 'DLP', label: 'Defect liability period' },
  { value: 'SECURITY_RELEASED', label: 'Security released' },
  { value: 'CLOSED', label: 'Closed' },
];
export const stageLabel = (s?: WorkStage) => WORK_STAGES.find((x) => x.value === s)?.label || '';

/** the simple status every screen uses, derived from the detailed stage */
export function stageStatus(stage: WorkStage): SiteStatus {
  if (stage === 'STOPPED' || stage === 'BID_SUBMITTED') return 'ON_HOLD';
  if (stage === 'LOA_RECEIVED' || stage === 'AGREEMENT_SIGNED' || stage === 'IN_PROGRESS') return 'ACTIVE';
  return 'COMPLETED';
}
export function siteStage(s: Site): WorkStage {
  return s.stage || (s.status === 'ACTIVE' ? 'IN_PROGRESS' : s.status === 'ON_HOLD' ? 'STOPPED' : 'PHYSICALLY_COMPLETE');
}

/** Query 2 defaults: GST TDS 2% above ₹2.5 lakh, income-tax TDS 1% (individual), labour cess 1%, TCS 0 */
export function defaultDeductions(): DeductionProfile {
  return { gstTdsPct: 2, gstTdsThreshold: 250000, itTdsPct: 1, itTdsOnGst: false, labourCessPct: 1, labourCessOnGst: false, tcsPct: 0, others: [] };
}
export function clientDeductions(c?: Client): DeductionProfile {
  if (c?.deductions) return { ...c.deductions, others: c.deductions.others.map((o) => ({ ...o })) };
  const d = defaultDeductions();
  if (c) {
    d.itTdsPct = c.tdsPct;
    d.labourCessPct = c.cessPct;
  }
  return d;
}
/** deductions that apply to a work: its own profile, else its client's defaults */
export function workDeductions(db: DB, s: Site): DeductionProfile {
  return s.deductions || clientDeductions(db.clients.find((c) => c.id === s.clientId));
}

/** stipulated completion after the latest extension of time */
export function currentCompletion(s: Site): string {
  const eots = (s.eots || []).filter((e) => e.newCompletion).sort((a, b) => a.newCompletion.localeCompare(b.newCompletion));
  return eots.at(-1)?.newCompletion || s.scheduledCompletion;
}

export function addMonths(d: string, months: number): string {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}

/** security deposit release falls due when the defect liability period ends */
export function sdReleaseDue(s: Site): string {
  if (!s.actualCompletion || !s.dlpMonths) return '';
  return addMonths(s.actualCompletion, s.dlpMonths);
}

/** contract time in months between start and stipulated completion */
export function timeAllowedMonths(s: Pick<Site, 'startDate' | 'scheduledCompletion'>): number {
  if (!s.startDate || !s.scheduledCompletion) return 0;
  const days = (Date.parse(s.scheduledCompletion) - Date.parse(s.startDate)) / 86400000;
  return Math.max(0, Math.round((days / 30.4375) * 10) / 10);
}

/** the firm that holds a work / plant; old records fall back to the first firm */
export function firmOf(db: DB, rec?: Pick<Site | Plant, 'firmId'>): Firm | undefined {
  return db.firms.find((f) => f.id === rec?.firmId) || db.firms[0];
}

/** current plant in-charge as of a date */
export function plantInCharge(db: DB, p: Plant, onDate: string): string {
  const h = (p.inCharges || []).filter((x) => x.from <= onDate).sort((a, b) => a.from.localeCompare(b.from)).at(-1);
  return h?.name || db.users.find((u) => u.id === p.inChargeId)?.name || '';
}

/** contract value without GST (taxable) */
export function contractTaxable(s: Site): number {
  return s.gstIncluded ? s.contractValue / (1 + s.gstPct / 100) : s.contractValue;
}

export { addDays };

/* ---------- plain names for screens (internal codes stay internal) ---------- */
type VehicleLike = { regNo?: string; model?: string; type?: string; code?: string };
/** a machine as people know it: registration no., else its model / type */
export const vehicleName = (v?: VehicleLike) => (v ? v.regNo || v.model || v.type || v.code || '' : '');
/** registration no. with what it is, e.g. "TR05K1886 · Tipper" */
export const vehicleLabel = (v?: VehicleLike) => (v ? [v.regNo, v.model || v.type].filter(Boolean).join(' · ') || v.code || '' : '');
/** "PWD (R&B), Government of Tripura" → "PWD (R&B)" for charts and narrow columns */
export const clientShort = (c?: { name: string }) => (c ? c.name.split(',')[0]!.trim() : '');

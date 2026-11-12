import { useEffect, useMemo, useState } from 'react';
import { BadgeIndianRupee, CircleCheck, FileSpreadsheet, FileText, FileUp, HandCoins, IdCard, Plus, Printer, RefreshCw, Truck, Users, Wallet } from 'lucide-react';
import { runCommand, useDB } from '../../data/store';
import { useSession } from '../../data/session';
import { STAFF_ROLES, type DB, type ID, type SalaryLine, type SalaryRun, type Staff, type StaffAdvance, type StaffAttStatus } from '../../data/types';
import { advanceBalance, advanceRecovered, advancesOutstanding, allowanceTotal, buildSalaryLines, dayStatus, daysIn, employedOn, licenceAlerts, runTotals } from '@civil/domain/staffpay';
import { templateById } from '@civil/domain/imports';
import { Badge, Button, Callout, Card, CardHeader, Drawer, Modal, PageHeader, Section, Stat, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { AttachField, Combo, Field, Input, NumberInput, Segmented, Select, Textarea, Toggle } from '../../components/ui/fields';
import { downloadXlsx, printDocument, printTable, type ExportTable } from '../../lib/export';
import { addDays, date, inr, monthLabel, num, today } from '../../lib/format';
import { cn, sum } from '../../lib/utils';
import { useModuleTab, useNames } from '../shared';
import { navigate } from '../../lib/router';
import { ImportDialog, exportTemplate } from '../masters/ImportExport';

/* ---------------- labels ---------------- */
const BASIS: Record<Staff['basis'], string> = { MONTHLY: 'Monthly', PER_DAY: 'Per day', PER_TRIP: 'Per trip' };
const BASIS_UNIT: Record<Staff['basis'], string> = { MONTHLY: '/month', PER_DAY: '/day', PER_TRIP: '/trip' };
const POSTING: Record<Staff['posting'], string> = { HEAD_OFFICE: 'Head office', SITE: 'Site', VEHICLE: 'Vehicle', PLANT: 'Plant' };
const ATT: Array<{ v: StaffAttStatus; label: string; tone: string }> = [
  { v: 'P', label: 'P', tone: 'bg-good text-white border-good' },
  { v: 'H', label: '½', tone: 'bg-warn text-white border-warn' },
  { v: 'A', label: 'A', tone: 'bg-bad text-white border-bad' },
  { v: 'L', label: 'L', tone: 'bg-info text-white border-info' },
  { v: 'HO', label: 'Hol', tone: 'bg-violet text-white border-violet' },
];
const ATT_NAME: Record<string, string> = { P: 'Present', H: 'Half day', A: 'Absent', L: 'Leave', HO: 'Holiday', WO: 'Weekly off', U: 'Not marked', NA: '' };
const prevMonth = () => {
  const t = today();
  const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 2, 1));
  return d.toISOString().slice(0, 7);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const designations = (db: DB) => (db.settings.staff?.designations?.length ? db.settings.staff.designations : [...STAFF_ROLES]);

export function postedTo(n: ReturnType<typeof useNames>, s: Staff) {
  if (s.posting === 'SITE') return n.site(s.siteId);
  if (s.posting === 'VEHICLE') return n.veh(s.vehicleId);
  if (s.posting === 'PLANT') return n.plant(s.plantId);
  return 'Head office';
}

/** owner and accountant only — everyone else sees this note */
function NoAccess() {
  return <Callout tone="warn">Salaried staff and salaries are seen only by the owner and the accountant (Staff & salaries permission in Roles).</Callout>;
}

export default function StaffPage() {
  const { tab, tabsEl } = useModuleTab('staff');
  const s = useSession();
  return (
    <div>
      <PageHeader
        title="Staff & payroll"
        subtitle="Drivers, operators and office staff on salary — kept apart from daily-wage labour. Salary is charged to the vehicle, plant, work or head office they are posted to."
      />
      {tabsEl}
      {!s.can('staff') ? <NoAccess /> : (
        <>
          {tab === 'list' && <StaffListTab />}
          {tab === 'attendance' && <AttendanceTab />}
          {tab === 'payroll' && <PayrollTab />}
          {tab === 'advances' && <AdvancesTab />}
          {tab === 'reports' && <ReportsTab />}
        </>
      )}
    </div>
  );
}

/* =================================================================== */
/*  Staff master                                                        */
/* =================================================================== */
export function StaffListTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [edit, setEdit] = useState<Staff | 'new' | null>(null);
  const [imp, setImp] = useState(false);
  const [show, setShow] = useState<'active' | 'all'>('active');
  if (!s.can('staff')) return <NoAccess />;
  const tpl = templateById('staff')!;
  const alerts = licenceAlerts(db, today());
  const rows = db.staff.filter((x) => show === 'all' || x.active !== false).slice().sort((a, b) => a.code.localeCompare(b.code));
  const active = db.staff.filter((x) => x.active !== false);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <Stat label="Staff on roll" value={active.length} format={(x) => num(x)} icon={<Users className="w-[18px] h-[18px]" />} tone="brand" sub={`${active.filter((x) => x.posting === 'VEHICLE').length} with vehicles · ${active.filter((x) => x.posting === 'HEAD_OFFICE').length} at head office`} />
        <Stat label="Monthly salary bill" value={sum(active.filter((x) => x.basis === 'MONTHLY'), (x) => x.salary + allowanceTotal(x))} format={inr} icon={<BadgeIndianRupee className="w-[18px] h-[18px]" />} tone="violet" sub="monthly-paid staff, with allowances" />
        <Stat label="Advances to recover" value={sum(advancesOutstanding(db), (x) => x.balance)} format={inr} icon={<HandCoins className="w-[18px] h-[18px]" />} tone="warn" onClick={() => navigate('/staff/advances')} />
        <Stat label="Licence alerts" value={alerts.length} format={(x) => num(x)} icon={<IdCard className="w-[18px] h-[18px]" />} tone={alerts.length ? 'bad' : 'good'} sub={alerts.length ? 'expired or expiring in 30 days' : 'all licences valid'} />
      </div>
      {alerts.length > 0 && (
        <Callout tone="bad">
          Driving licence {alerts.map((a) => `${a.staff.name} (${a.daysLeft < 0 ? `expired ${date(a.expiry)}` : `expires ${date(a.expiry)}`})`).join(', ')}.
        </Callout>
      )}
      <DataTable
        title="Salaried staff"
        subtitle="Never deleted once used — mark Inactive with the leaving date"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={s.can('staff', 'edit') ? setEdit : undefined}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <Segmented value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }]} />
            <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => exportTemplate(db, tpl)}>Excel</Button>
            {s.can('staff', 'add') && <Button icon={<FileUp className="w-4 h-4" />} onClick={() => setImp(true)}>Import</Button>}
            {s.can('staff', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit('new')}>Add staff</Button>}
          </div>
        }
        columns={[
          { key: 'code', header: 'Staff ID', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: 'name', header: 'Name', primary: true, value: (r) => r.name, cell: (r) => <div><div className="font-medium">{r.name}</div><div className="text-[11px] text-muted">{r.phone || '—'}</div></div> },
          { key: 'des', header: 'Designation', value: (r) => r.designation },
          { key: 'post', header: 'Posted to', value: (r) => `${POSTING[r.posting]} ${postedTo(n, r)}`, cell: (r) => <div><div className="text-[13px]">{postedTo(n, r)}</div><div className="text-[11px] text-muted">{POSTING[r.posting]}</div></div> },
          { key: 'sal', header: 'Salary', align: 'right', rate: true, value: (r) => r.salary, cell: (r) => <div><b>{inr(r.salary)}</b><span className="text-[11px] text-muted">{BASIS_UNIT[r.basis]}</span>{allowanceTotal(r) > 0 && <div className="text-[11px] text-muted">+ {inr(allowanceTotal(r))} allowances</div>}</div> },
          { key: 'mode', header: 'Paid by', value: (r) => r.payMode, hideMobile: true },
          { key: 'stat', header: 'PF / ESI', value: (r) => [r.pfMember && 'PF', r.esiMember && 'ESI'].filter(Boolean).join(' + ') || '—', hideMobile: true },
          { key: 'lic', header: 'Licence', value: (r) => r.licenceExpiry || '', hideMobile: true, cell: (r) => (r.licenceExpiry ? <Badge tone={r.licenceExpiry < today() ? 'bad' : r.licenceExpiry <= addDays(today(), 30) ? 'warn' : 'neutral'}>{date(r.licenceExpiry)}</Badge> : <span className="text-muted">—</span>) },
          { key: 'active', header: 'Status', value: (r) => (r.active === false ? 'Inactive' : 'Active'), cell: (r) => (r.active === false ? <Badge>Inactive{r.leftOn ? ` · left ${date(r.leftOn)}` : ''}</Badge> : <Badge tone="good" dot>Active</Badge>) },
        ]}
      />
      {edit && <StaffForm rec={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {imp && <ImportDialog template={tpl} onClose={() => setImp(false)} />}
    </div>
  );
}

type StaffDraft = Omit<Staff, 'id' | 'createdAt' | 'createdBy'> & { id?: ID };
const blank = (): StaffDraft => ({
  code: '', name: '', fatherName: '', phone: '', aadhaar: '', pan: '', address: '', designation: '', joiningDate: '', leftOn: '',
  basis: 'MONTHLY', salary: 0, allowances: { food: 0, mobile: 0, travel: 0 }, otRate: 0, posting: 'HEAD_OFFICE',
  payMode: 'CASH', bankAccount: '', ifsc: '', upi: '', pfMember: false, uan: '', esiMember: false, esicNo: '', licenceNo: '', licenceExpiry: '', photos: 0, idDocs: 0, active: true,
});

function StaffForm({ rec, onClose }: { rec: Staff | null; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const [v, setV] = useState<StaffDraft>(() => (rec ? { ...blank(), ...rec } : blank()));
  const [aadhaar, setAadhaar] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<StaffDraft>) => setV((x) => ({ ...x, ...p }));
  const G = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
  const roles = designations(db);
  const roleOpts = [...roles, ...(v.designation && !roles.includes(v.designation) ? [v.designation] : [])].map((x) => ({ value: x, label: x }));
  const sites = db.sites.filter((x) => x.status !== 'COMPLETED' || x.id === v.siteId).map((x) => ({ value: x.id, label: x.short }));
  const vehicles = db.vehicles.filter((x) => x.active !== false || x.id === v.vehicleId).map((x) => ({ value: x.id, label: x.regNo, hint: x.type }));
  const plants = db.plants.filter((x) => x.active !== false || x.id === v.plantId).map((x) => ({ value: x.id, label: x.name }));
  const driverLike = /driver|operator/i.test(v.designation);

  const save = async () => {
    if (!v.name.trim()) return toast.error('Name is required');
    if (!v.designation) return toast.error('Choose the designation');
    if (!(v.salary > 0)) return toast.error('Give the salary or rate');
    if (v.posting === 'SITE' && !v.siteId) return toast.error('Choose the work this person is posted to');
    if (v.posting === 'VEHICLE' && !v.vehicleId) return toast.error('Choose the vehicle');
    if (v.posting === 'PLANT' && !v.plantId) return toast.error('Choose the plant');
    if (v.basis === 'PER_TRIP' && !v.vehicleId) return toast.error('A per-trip salary needs the vehicle — post this person to the vehicle');
    if (v.leftOn && v.joiningDate && v.leftOn < v.joiningDate) return toast.error('Leaving date is before the joining date');
    const digits = aadhaar.replace(/\D/g, '');
    if (aadhaar && digits.length !== 12) return toast.error('Aadhaar is 12 digits');
    const out: Record<string, unknown> = {
      ...v,
      aadhaar: digits ? `XXXX-XXXX-${digits.slice(-4)}` : v.aadhaar,
      pan: v.pan.trim().toUpperCase(), ifsc: v.ifsc.trim().toUpperCase(),
      siteId: v.posting === 'SITE' ? v.siteId : undefined,
      vehicleId: v.posting === 'VEHICLE' ? v.vehicleId : undefined,
      plantId: v.posting === 'PLANT' ? v.plantId : undefined,
      leftOn: v.leftOn || undefined, licenceExpiry: v.licenceExpiry || undefined,
    };
    setBusy(true);
    try {
      if (!rec) {
        delete out.id;
        const r = await runCommand({ kind: 'insert', coll: 'staff', rec: out }, `Staff ${v.name}`);
        toast.success(`${r?.code || 'Staff'} added`, v.name);
      } else {
        const { id, createdAt, createdBy, ...patch } = out as any;
        await runCommand({ kind: 'update', coll: 'staff', id: rec.id, patch }, `Staff ${v.name}`);
        toast.success('Saved', v.name);
      }
      onClose();
    } catch (e) {
      toast.error('Not saved', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = async () => {
    if (rec?.active !== false && !v.leftOn) return toast.error('Give the leaving date first', 'Salary is worked out up to that day');
    setBusy(true);
    try {
      await runCommand({ kind: 'update', coll: 'staff', id: rec!.id, patch: { active: rec!.active === false, leftOn: rec!.active === false ? undefined : v.leftOn } }, `Staff ${rec!.name}`);
      toast.success(rec!.active === false ? 'Active again' : 'Marked inactive', rec!.name);
      onClose();
    } catch (e) {
      toast.error('Not saved', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={rec ? `${rec.code} · ${rec.name}` : 'Add salaried staff'}
      subtitle={rec ? rec.designation : 'Staff ID is given automatically (STF-001 …)'}
      width="max-w-3xl"
      footer={
        <>
          {rec && (s.can('staff', 'delete') || s.isAdmin) && <Button onClick={toggleActive} disabled={busy}>{rec.active === false ? 'Make active' : 'Mark inactive'}</Button>}
          <div className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<CircleCheck className="w-4 h-4" />} onClick={save} disabled={busy}>Save</Button>
        </>
      }
    >
      <div className="space-y-6">
        <Section title="Person">
          <div className={G}>
            <Field label="Name" required><Input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Father's name"><Input value={v.fatherName} onChange={(e) => set({ fatherName: e.target.value })} /></Field>
            <Field label="Phone"><Input inputMode="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="Aadhaar" hint={v.aadhaar ? `Saved: ${v.aadhaar} — type all 12 digits to change` : 'Only the last 4 digits are kept'}>
              <Input inputMode="numeric" value={aadhaar} placeholder={v.aadhaar || 'XXXX XXXX XXXX'} onChange={(e) => setAadhaar(e.target.value.replace(/[^\d ]/g, '').slice(0, 14))} />
            </Field>
            <Field label="PAN" hint="optional"><Input value={v.pan} onChange={(e) => set({ pan: e.target.value.toUpperCase().slice(0, 10) })} placeholder="ABCDE1234F" /></Field>
            {rec && <Field label="Staff ID"><Input value={v.code} onChange={(e) => set({ code: e.target.value })} /></Field>}
            <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Job">
          <div className={G}>
            <Field label="Designation" required hint="the list is edited in Admin › Settings"><Combo value={v.designation} onChange={(x) => set({ designation: x })} options={roleOpts} /></Field>
            <Field label="Joining date" hint="blank if not known — then paid from the first day marked"><Input type="date" value={v.joiningDate} max={today()} onChange={(e) => set({ joiningDate: e.target.value })} /></Field>
            <Field label="Leaving date" hint="the last day paid"><Input type="date" value={v.leftOn || ''} onChange={(e) => set({ leftOn: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Posting — where the salary is charged">
          <div className="space-y-4">
            <Segmented value={v.posting} onChange={(x) => set({ posting: x })} options={(Object.keys(POSTING) as Staff['posting'][]).map((k) => ({ value: k, label: POSTING[k] }))} />
            <div className={G}>
              {v.posting === 'SITE' && <Field label="Work" required><Select value={v.siteId || ''} onChange={(x) => set({ siteId: x })} options={sites} placeholder="Choose the work" /></Field>}
              {v.posting === 'VEHICLE' && <Field label="Vehicle / machine" required><Combo value={v.vehicleId || ''} onChange={(x) => set({ vehicleId: x })} options={vehicles} /></Field>}
              {v.posting === 'PLANT' && <Field label="Plant" required><Select value={v.plantId || ''} onChange={(x) => set({ plantId: x })} options={plants} placeholder="Choose the plant" /></Field>}
            </div>
            <p className="text-xs text-muted">
              {v.posting === 'SITE' && 'Salary goes to this work as “Staff salary”, separate from labour.'}
              {v.posting === 'VEHICLE' && 'Salary goes into this vehicle’s cost and on to the works it served each day (from the logbook). Idle days go to overheads.'}
              {v.posting === 'PLANT' && 'Salary goes into the plant’s running cost, and so into the cost per MT charged to works.'}
              {v.posting === 'HEAD_OFFICE' && 'Salary goes into head-office overheads and is shared by the works like other overheads.'}
            </p>
          </div>
        </Section>

        <Section title="Salary">
          <div className={G}>
            <Field label="Salary basis">
              <Segmented value={v.basis} onChange={(x) => set({ basis: x })} options={(Object.keys(BASIS) as Staff['basis'][]).map((k) => ({ value: k, label: BASIS[k] }))} />
            </Field>
            <Field label={v.basis === 'MONTHLY' ? 'Monthly salary' : v.basis === 'PER_DAY' ? 'Rate per day' : 'Rate per trip'} required hint={v.basis === 'MONTHLY' ? 'paid as salary ÷ days in month × days paid' : v.basis === 'PER_TRIP' ? 'trips from the vehicle logbook on days present' : 'per paid day'}>
              <NumberInput value={v.salary || ''} onChange={(x) => set({ salary: Number(x) || 0 })} prefix="₹" />
            </Field>
            <Field label="Food / batta allowance" hint="per month"><NumberInput value={v.allowances.food || ''} onChange={(x) => set({ allowances: { ...v.allowances, food: Number(x) || 0 } })} prefix="₹" /></Field>
            <Field label="Mobile allowance" hint="per month"><NumberInput value={v.allowances.mobile || ''} onChange={(x) => set({ allowances: { ...v.allowances, mobile: Number(x) || 0 } })} prefix="₹" /></Field>
            <Field label="Travel allowance" hint="per month"><NumberInput value={v.allowances.travel || ''} onChange={(x) => set({ allowances: { ...v.allowances, travel: Number(x) || 0 } })} prefix="₹" /></Field>
            <Field label="OT rate per hour" hint="optional"><NumberInput value={v.otRate || ''} onChange={(x) => set({ otRate: Number(x) || 0 })} prefix="₹" /></Field>
          </div>
          <p className="text-xs text-muted mt-2">Allowances are paid in the same proportion as the days paid.</p>
        </Section>

        <Section title="Payment">
          <div className={G}>
            <Field label="Paid by"><Segmented value={v.payMode} onChange={(x) => set({ payMode: x })} options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK', label: 'Bank' }, { value: 'UPI', label: 'UPI' }]} /></Field>
            <div />
            {v.payMode === 'BANK' && <Field label="Bank account no."><Input inputMode="numeric" value={v.bankAccount} onChange={(e) => set({ bankAccount: e.target.value.replace(/\D/g, '') })} /></Field>}
            {v.payMode === 'BANK' && <Field label="IFSC"><Input value={v.ifsc} onChange={(e) => set({ ifsc: e.target.value.toUpperCase().slice(0, 11) })} placeholder="SBIN0001234" /></Field>}
            {v.payMode === 'UPI' && <Field label="UPI ID"><Input value={v.upi} onChange={(e) => set({ upi: e.target.value })} placeholder="name@bank" /></Field>}
          </div>
        </Section>

        <Section title="PF / ESI">
          <div className={G}>
            <Toggle checked={v.pfMember} onChange={(x) => set({ pfMember: x })} label="EPF applicable" hint="12% of basic, up to ₹15,000" />
            {v.pfMember ? <Field label="UAN"><Input inputMode="numeric" value={v.uan} onChange={(e) => set({ uan: e.target.value.replace(/\D/g, '').slice(0, 12) })} /></Field> : <div />}
            <Toggle checked={v.esiMember} onChange={(x) => set({ esiMember: x })} label="ESI applicable" hint="0.75% of gross, up to ₹21,000" />
            {v.esiMember ? <Field label="ESIC IP no."><Input value={v.esicNo} onChange={(e) => set({ esicNo: e.target.value })} /></Field> : <div />}
          </div>
        </Section>

        <Section title={driverLike ? 'Driving licence' : 'Driving licence (drivers and operators)'}>
          <div className={G}>
            <Field label="Licence no."><Input value={v.licenceNo} onChange={(e) => set({ licenceNo: e.target.value.toUpperCase() })} /></Field>
            <Field label="Valid up to" hint="an alert shows 30 days before"><Input type="date" value={v.licenceExpiry || ''} onChange={(e) => set({ licenceExpiry: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Photo and ID">
          <div className={G}>
            <AttachField count={v.photos || 0} onChange={(x) => set({ photos: x })} label="Photo" />
            <AttachField count={v.idDocs || 0} onChange={(x) => set({ idDocs: x })} label="ID proof (Aadhaar, licence)" />
          </div>
        </Section>
      </div>
    </Drawer>
  );
}

/* =================================================================== */
/*  Attendance                                                          */
/* =================================================================== */
function AttendanceTab() {
  const [mode, setMode] = useState<'mark' | 'register'>('mark');
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'mark', label: 'Mark attendance' }, { value: 'register', label: 'Monthly register' }]} />
      {mode === 'mark' ? <MarkAttendance /> : <AttendanceRegister />}
    </div>
  );
}

const monthLocked = (db: DB, d: string) => db.salaryRuns.some((r) => r.month === d.slice(0, 7) && r.status === 'APPROVED');

function MarkAttendance() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [d, setD] = useState(today());
  const [posting, setPosting] = useState<'ALL' | Staff['posting']>('ALL');
  const [busy, setBusy] = useState(false);
  const locked = monthLocked(db, d);
  const crew = useMemo(() => db.staff.filter((x) => (x.active !== false || (x.leftOn && x.leftOn >= d)) && employedOn(x, d) && (posting === 'ALL' || x.posting === posting)).sort((a, b) => a.code.localeCompare(b.code)), [db, d, posting]);
  const existing = useMemo(() => new Map(db.staffAttendance.filter((a) => a.date === d).map((a) => [a.staffId, a])), [db, d]);
  const [marks, setMarks] = useState<Record<ID, { status: StaffAttStatus | ''; ot: number; remark: string }>>({});
  useEffect(() => {
    const m: typeof marks = {};
    for (const x of db.staff) {
      const e = existing.get(x.id);
      m[x.id] = { status: e?.status || '', ot: e?.otHours || 0, remark: e?.remark || '' };
    }
    setMarks(m);
  }, [d, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = (id: ID, p: Partial<(typeof marks)[string]>) => setMarks((m) => ({ ...m, [id]: { ...(m[id] || { status: '', ot: 0, remark: '' }), ...p } }));
  const allPresent = () => setMarks((m) => { const o = { ...m }; for (const x of crew) if (!o[x.id]?.status) o[x.id] = { ...(o[x.id] || { ot: 0, remark: '' }), status: 'P' }; return o; });
  const ranOn = (x: Staff) => !!x.vehicleId && db.logs.some((l) => l.vehicleId === x.vehicleId && l.date === d);
  const fromLogs = () => {
    let k = 0;
    setMarks((m) => {
      const o = { ...m };
      for (const x of crew) if (x.posting === 'VEHICLE' && ranOn(x) && !o[x.id]?.status) { o[x.id] = { ...(o[x.id] || { ot: 0, remark: '' }), status: 'P' }; k++; }
      return o;
    });
    toast.info(k ? `${k} driver${k > 1 ? 's' : ''} marked present` : 'No more drivers to mark', 'from vehicles with a logbook entry on this day');
  };
  const changed = crew.filter((x) => {
    const m = marks[x.id];
    const e = existing.get(x.id);
    return m?.status && (!e || e.status !== m.status || (e.otHours || 0) !== (m.ot || 0) || (e.remark || '') !== m.remark);
  });
  const counts = { P: 0, H: 0, A: 0, L: 0, HO: 0, '': 0 } as Record<string, number>;
  for (const x of crew) counts[marks[x.id]?.status || ''] = (counts[marks[x.id]?.status || ''] || 0) + 1;

  const save = async () => {
    if (locked) return toast.error('Salary for this month is approved', 'Attendance of an approved month cannot be changed');
    if (!changed.length) return toast.info('Nothing to save');
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const x of changed) {
      const m = marks[x.id]!;
      const e = existing.get(x.id);
      const ot = m.status === 'P' || m.status === 'H' ? m.ot || 0 : 0;
      try {
        if (e) await runCommand({ kind: 'update', coll: 'staffAttendance', id: e.id, patch: { status: m.status, otHours: ot, remark: m.remark } }, `Staff attendance ${x.name} ${d}`);
        else await runCommand({ kind: 'insert', coll: 'staffAttendance', rec: { staffId: x.id, date: d, status: m.status, otHours: ot, remark: m.remark } }, `Staff attendance ${x.name} ${d}`);
        ok++;
      } catch (err) {
        errors.push(`${x.name}: ${errMsg(err)}`);
      }
    }
    setBusy(false);
    if (errors.length) toast.error(`${errors.length} not saved`, errors.slice(0, 3).join(' · '));
    if (ok) toast.success('Attendance saved', `${ok} staff · ${date(d)}`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col lg:flex-row lg:items-end gap-3">
        <Field label="Date" className="lg:w-48"><Input type="date" value={d} max={today()} onChange={(e) => e.target.value && setD(e.target.value)} /></Field>
        <Field label="Posted at" className="lg:w-auto">
          <Segmented value={posting} onChange={setPosting} options={[{ value: 'ALL', label: 'All' }, ...(Object.keys(POSTING) as Staff['posting'][]).map((k) => ({ value: k, label: POSTING[k] }))]} />
        </Field>
        <div className="flex-1 grid grid-cols-4 gap-2">
          {[['Present', counts.P! + counts.H! * 0.5], ['Absent', counts.A], ['Leave / holiday', counts.L! + counts.HO!], ['Not marked', counts['']]].map(([l, x]) => (
            <div key={l as string} className="rounded-xl bg-surface-2 border border-line px-3 py-2"><div className="text-[11px] text-muted">{l}</div><div className="text-lg font-bold">{num(x as number, 1)}</div></div>
          ))}
        </div>
      </Card>
      {locked && <Callout tone="warn">The salary of {monthLabel(d.slice(0, 7))} is approved, so its attendance is locked.</Callout>}
      <Card>
        <CardHeader
          title={`Staff attendance — ${date(d)}`}
          subtitle="P present · ½ half day · A absent · L leave · Hol holiday. The weekly off is paid without marking."
        />
        {!locked && s.can('staff', 'edit') && crew.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            <Button size="sm" icon={<Truck className="w-4 h-4" />} onClick={fromLogs}>Drivers from logbook</Button>
            <Button size="sm" onClick={allPresent}>Rest present</Button>
          </div>
        )}
        <div className="divide-y divide-line">
          {crew.map((x) => {
            const m = marks[x.id] || { status: '', ot: 0, remark: '' };
            const wo = !m.status && dayStatus(db, x, d) === 'WO';
            return (
              <div key={x.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{x.name} <span className="font-mono text-[11px] text-muted">{x.code}</span></div>
                  <div className="text-[11px] text-muted">
                    {x.designation} · {postedTo(n, x)}
                    {x.posting === 'VEHICLE' && (ranOn(x) ? <Badge tone="good" className="ml-2">logbook ✓</Badge> : <Badge className="ml-2">no log</Badge>)}
                    {wo && <Badge tone="info" className="ml-2">weekly off</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {ATT.map((a) => (
                    <button
                      key={a.v}
                      type="button"
                      disabled={locked || !s.can('staff', 'edit')}
                      title={ATT_NAME[a.v]}
                      onClick={() => mark(x.id, { status: m.status === a.v ? '' : a.v })}
                      className={cn('min-w-9 h-9 px-2 rounded-lg border text-sm font-semibold transition', m.status === a.v ? a.tone : 'border-line bg-surface hover:bg-surface-2 text-fg-2')}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 md:w-64">
                  <NumberInput className="w-24" value={m.ot || ''} disabled={locked || !(m.status === 'P' || m.status === 'H')} onChange={(v) => mark(x.id, { ot: Math.min(16, Number(v) || 0) })} placeholder="OT h" />
                  <Input className="flex-1" value={m.remark} disabled={locked} onChange={(e) => mark(x.id, { remark: e.target.value })} placeholder="Remark" />
                </div>
              </div>
            );
          })}
          {!crew.length && <div className="p-6 text-center text-sm text-muted">No staff employed on this day.</div>}
        </div>
        {!locked && s.can('staff', 'edit') && crew.length > 0 && (
          <div className="p-4 flex items-center justify-end gap-3 border-t border-line">
            <span className="text-xs text-muted">{changed.length} change{changed.length === 1 ? '' : 's'}</span>
            <Button variant="primary" icon={<CircleCheck className="w-4 h-4" />} onClick={save} disabled={busy || !changed.length}>Save attendance</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function AttendanceRegister() {
  const db = useDB();
  const [month, setMonth] = useState(today().slice(0, 7));
  const D = daysIn(month);
  const days = Array.from({ length: D }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const lines = useMemo(() => buildSalaryLines(db, month), [db, month]);
  const staff = db.staff.filter((x) => lines.some((l) => l.staffId === x.id)).sort((a, b) => a.code.localeCompare(b.code));
  const letter = (st: string) => (st === 'NA' ? '' : st === 'U' ? '·' : st === 'H' ? '½' : st);
  const tone = (st: string) => ({ P: 'text-good', A: 'text-bad', H: 'text-warn', L: 'text-info', HO: 'text-violet', WO: 'text-muted', U: 'text-bad' } as Record<string, string>)[st] || '';
  const table = (): ExportTable => ({
    title: `Staff attendance register — ${monthLabel(month)}`,
    headers: ['Staff ID', 'Name', ...days.map((x) => x.slice(8)), 'Paid days', 'Absent', 'Not marked'],
    rows: staff.map((x) => {
      const l = lines.find((y) => y.staffId === x.id)!;
      return [x.code, x.name, ...days.map((dd) => letter(dayStatus(db, x, dd))), l.paidDays, l.absent, l.unmarked];
    }),
  });
  return (
    <Card>
      <CardHeader
        title={`Attendance register — ${monthLabel(month)}`}
        subtitle="WO weekly off (paid) · · not marked (not paid until marked)"
        action={
          <div className="flex flex-wrap gap-2">
            <Input type="month" value={month} max={today().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
            <Button size="sm" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => downloadXlsx(table())}>Excel</Button>
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => printTable(table())}>PDF</Button>
          </div>
        }
      />
      <div className="overflow-x-auto px-4 pb-4">
        <table className="text-[12px] border-collapse">
          <thead>
            <tr className="text-muted">
              <th className="text-left pr-3 py-1 sticky left-0 bg-surface">Staff</th>
              {days.map((x) => <th key={x} className="w-7 text-center font-normal">{Number(x.slice(8))}</th>)}
              <th className="px-2 text-right">Paid</th>
              <th className="px-2 text-right">Not marked</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((x) => {
              const l = lines.find((y) => y.staffId === x.id)!;
              return (
                <tr key={x.id} className="border-t border-line">
                  <td className="pr-3 py-1 whitespace-nowrap sticky left-0 bg-surface">{x.name}</td>
                  {days.map((dd) => { const st = dayStatus(db, x, dd); return <td key={dd} className={cn('text-center font-semibold', tone(st))}>{letter(st)}</td>; })}
                  <td className="px-2 text-right font-semibold">{num(l.paidDays, 1)}</td>
                  <td className={cn('px-2 text-right', l.unmarked ? 'text-bad font-semibold' : 'text-muted')}>{l.unmarked}</td>
                </tr>
              );
            })}
            {!staff.length && <tr><td colSpan={D + 3} className="p-6 text-center text-muted">No staff on the payroll in this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* =================================================================== */
/*  Monthly salary                                                      */
/* =================================================================== */
function PayrollTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [month, setMonth] = useState(prevMonth());
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState<SalaryLine | null>(null);
  const [pay, setPay] = useState<SalaryLine | null>(null);
  const [cancel, setCancel] = useState(false);
  const run = db.salaryRuns.find((r) => r.month === month && r.status !== 'CANCELLED');
  const preview = useMemo(() => (run ? [] : buildSalaryLines(db, month)), [db, month, run]);
  const lines = run ? run.lines : preview;
  const staffOf = (id: ID) => db.staff.find((x) => x.id === id);
  const t = run ? runTotals(run) : null;
  const unmarked = lines.filter((l) => l.unmarked > 0);

  const act = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(`${label} — not done`, errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const create = () => act('Salary sheet', () => runCommand({ kind: 'insert', coll: 'salaryRuns', rec: { month } }, `Salary sheet ${month}`), `Salary sheet for ${monthLabel(month)} prepared`);
  const recompute = () => act('Recalculate', () => runCommand({ kind: 'update', coll: 'salaryRuns', id: run!.id, patch: { recompute: true } }, `Salary ${month} recalculated`), 'Worked out again from attendance and advances');
  const approve = () => {
    if (unmarked.length && !confirm(`${unmarked.length} staff have days not marked — those days will not be paid. Approve anyway?`)) return;
    void act('Approve', () => runCommand({ kind: 'update', coll: 'salaryRuns', id: run!.id, patch: { status: 'APPROVED' } }, `Salary ${month} approved`), `Salary of ${monthLabel(month)} approved — attendance is now locked`);
  };
  const payAll = () => {
    if (!run || !t) return;
    const add = run.lines.filter((l) => l.net - t.paidOf(l.staffId) > 0.5).map((l) => ({ staffId: l.staffId, date: today(), amount: Math.round((l.net - t.paidOf(l.staffId)) * 100) / 100, mode: staffOf(l.staffId)?.payMode || 'CASH', ref: '' }));
    if (!add.length) return toast.info('Everything is paid');
    if (!confirm(`Record payment of ${inr(sum(add, (x) => x.amount))} to ${add.length} staff today, each by their usual mode?`)) return;
    void act('Payment', () => runCommand({ kind: 'update', coll: 'salaryRuns', id: run.id, patch: { payments: [...run.payments, ...add] } }, `Salary ${month} paid`), `${add.length} payments recorded`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col md:flex-row md:items-end gap-3">
        <Field label="Month" className="md:w-48"><Input type="month" value={month} max={today().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
        <div className="flex-1 text-sm">
          {run ? (
            <div className="flex items-center gap-2"><span className="font-mono">{run.no}</span><StatusBadge status={run.status} />{run.approvedOn && <span className="text-xs text-muted">approved {date(run.approvedOn)}</span>}</div>
          ) : (
            <span className="text-muted">No salary sheet yet — the figures below are worked out from attendance so far.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!run && s.can('staff', 'add') && <Button variant="primary" icon={<BadgeIndianRupee className="w-4 h-4" />} onClick={create} disabled={busy || !preview.length}>Prepare salary sheet</Button>}
          {run?.status === 'DRAFT' && s.can('staff', 'edit') && <Button icon={<RefreshCw className="w-4 h-4" />} onClick={recompute} disabled={busy}>Recalculate</Button>}
          {run?.status === 'DRAFT' && s.can('staff', 'approve') && <Button variant="primary" icon={<CircleCheck className="w-4 h-4" />} onClick={approve} disabled={busy}>Approve</Button>}
          {run?.status === 'APPROVED' && s.can('staff', 'edit') && t && t.pending > 0 && <Button variant="primary" icon={<Wallet className="w-4 h-4" />} onClick={payAll} disabled={busy}>Pay all pending</Button>}
          {run && s.isAdmin && !run.payments.length && <Button onClick={() => setCancel(true)} disabled={busy}>Cancel sheet</Button>}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 stagger">
        <Stat label="Gross salary" value={sum(lines, (l) => l.gross)} format={inr} tone="brand" icon={<BadgeIndianRupee className="w-[18px] h-[18px]" />} sub={`${lines.length} staff`} />
        <Stat label="Deductions" value={sum(lines, (l) => l.pf + l.esi + l.advance + l.loan + l.other)} format={inr} tone="warn" sub={`PF ${inr(sum(lines, (l) => l.pf))} · ESI ${inr(sum(lines, (l) => l.esi))}`} />
        <Stat label="Net payable" value={sum(lines, (l) => l.net)} format={inr} tone="violet" />
        <Stat label="Paid" value={t?.paid || 0} format={inr} tone="good" icon={<Wallet className="w-[18px] h-[18px]" />} />
        <Stat label="Pending" value={t ? t.pending : sum(lines, (l) => l.net)} format={inr} tone={t && t.pending === 0 ? 'good' : 'bad'} />
      </div>

      {unmarked.length > 0 && run?.status !== 'APPROVED' && (
        <Callout tone="warn">
          Attendance is not complete: {unmarked.slice(0, 6).map((l) => `${staffOf(l.staffId)?.name} (${l.unmarked} day${l.unmarked > 1 ? 's' : ''})`).join(', ')}{unmarked.length > 6 ? ` and ${unmarked.length - 6} more` : ''}. Days not marked are not paid — mark them in Attendance, then Recalculate.
        </Callout>
      )}

      <DataTable
        title={`Salary register — ${monthLabel(month)}`}
        subtitle={run?.status === 'DRAFT' ? 'Draft: click a row to add other deductions' : undefined}
        rows={lines}
        rowKey={(l) => l.staffId}
        onRowClick={run?.status === 'DRAFT' && s.can('staff', 'edit') ? setOther : undefined}
        pageSize={50}
        columns={[
          { key: 'name', header: 'Staff', primary: true, value: (l) => `${staffOf(l.staffId)?.code} ${staffOf(l.staffId)?.name}`, cell: (l) => <div><div className="font-medium">{staffOf(l.staffId)?.name}</div><div className="text-[11px] text-muted">{staffOf(l.staffId)?.code} · {staffOf(l.staffId)?.designation} · {postedTo(n, staffOf(l.staffId)!)}</div></div> },
          { key: 'days', header: 'Days paid', align: 'right', value: (l) => l.paidDays, cell: (l) => <div><b>{num(l.paidDays, 1)}</b><span className="text-muted">/{l.daysInMonth}</span>{l.unmarked > 0 && <div className="text-[11px] text-bad">{l.unmarked} not marked</div>}{l.basis === 'PER_TRIP' && <div className="text-[11px] text-muted">{l.trips} trips</div>}</div> },
          { key: 'basic', header: 'Basic', align: 'right', value: (l) => l.basic, cell: (l) => inr(l.basic), hideMobile: true },
          { key: 'allow', header: 'Allowances', align: 'right', value: (l) => l.allowances, cell: (l) => inr(l.allowances), hideMobile: true },
          { key: 'ot', header: 'OT', align: 'right', value: (l) => l.ot, cell: (l) => (l.ot ? <span title={`${l.otHours} h`}>{inr(l.ot)}</span> : '—'), hideMobile: true },
          { key: 'gross', header: 'Gross', align: 'right', value: (l) => l.gross, cell: (l) => <b>{inr(l.gross)}</b> },
          { key: 'pfesi', header: 'PF + ESI', align: 'right', value: (l) => l.pf + l.esi, cell: (l) => (l.pf + l.esi ? inr(l.pf + l.esi) : '—'), hideMobile: true },
          { key: 'adv', header: 'Advance / loan', align: 'right', value: (l) => l.advance + l.loan, cell: (l) => (l.advance + l.loan ? inr(l.advance + l.loan) : '—'), hideMobile: true },
          { key: 'other', header: 'Other', align: 'right', value: (l) => l.other, cell: (l) => (l.other ? <span title={l.otherNote}>{inr(l.other)}</span> : '—'), hideMobile: true },
          { key: 'net', header: 'Net pay', align: 'right', value: (l) => l.net, cell: (l) => <b className="text-brand">{inr(l.net)}</b> },
          ...(run?.status === 'APPROVED' && t
            ? [
                { key: 'bal', header: 'Balance', align: 'right' as const, value: (l: SalaryLine) => l.net - t.paidOf(l.staffId), cell: (l: SalaryLine) => { const b = l.net - t.paidOf(l.staffId); return b > 0.5 ? <span className="text-bad font-semibold">{inr(b)}</span> : <Badge tone="good">Paid</Badge>; } },
                {
                  key: 'act', header: '', value: () => '', cell: (l: SalaryLine) => (
                    <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" icon={<FileText className="w-3.5 h-3.5" />} onClick={() => printSlip(db, run, l)}>Slip</Button>
                      {l.net - t.paidOf(l.staffId) > 0.5 && s.can('staff', 'edit') && <Button size="sm" variant="primary" onClick={() => setPay(l)}>Pay</Button>}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
        totals={{ gross: <b>{inr(sum(lines, (l) => l.gross))}</b>, net: <b>{inr(sum(lines, (l) => l.net))}</b>, __export: { gross: sum(lines, (l) => l.gross), net: sum(lines, (l) => l.net) } }}
        toolbar={run && (
          <div className="flex gap-2">
            <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => downloadXlsx(registerTable(db, run))}>Register Excel</Button>
            <Button icon={<Printer className="w-4 h-4" />} onClick={() => printTable(registerTable(db, run))}>Register PDF</Button>
          </div>
        )}
      />

      {run && run.payments.length > 0 && (
        <DataTable
          title="Payments"
          rows={run.payments.map((p, i) => ({ ...p, i }))}
          rowKey={(p) => String(p.i)}
          columns={[
            { key: 'date', header: 'Date', value: (p) => p.date, cell: (p) => date(p.date) },
            { key: 'staff', header: 'Staff', primary: true, value: (p) => staffOf(p.staffId)?.name || '' },
            { key: 'mode', header: 'Mode', value: (p) => p.mode },
            { key: 'ref', header: 'Reference', value: (p) => p.ref || '—' },
            { key: 'amt', header: 'Amount', align: 'right', value: (p) => p.amount, cell: (p) => <b>{inr(p.amount)}</b> },
          ]}
        />
      )}

      {other && run && <OtherDeduction run={run} line={other} onClose={() => setOther(null)} />}
      {pay && run && t && <PayModal run={run} line={pay} balance={pay.net - t.paidOf(pay.staffId)} onClose={() => setPay(null)} />}
      {cancel && run && <CancelRun run={run} onClose={() => setCancel(false)} />}
    </div>
  );
}

function OtherDeduction({ run, line, onClose }: { run: SalaryRun; line: SalaryLine; onClose: () => void }) {
  const db = useDB();
  const [amount, setAmount] = useState<number | ''>(line.other || '');
  const [note, setNote] = useState(line.otherNote);
  const st = db.staff.find((x) => x.id === line.staffId);
  const save = async () => {
    try {
      await runCommand({ kind: 'update', coll: 'salaryRuns', id: run.id, patch: { other: { [line.staffId]: { amount: Number(amount) || 0, note } } } }, `Salary ${run.month}: other deduction ${st?.name}`);
      toast.success('Saved', 'Net pay worked out again');
      onClose();
    } catch (e) {
      toast.error('Not saved', errMsg(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={`Other deduction — ${st?.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Amount" hint={`Gross ${inr(line.gross)} · after PF/ESI and recoveries ${inr(line.net + line.other)}`}><NumberInput value={amount} onChange={setAmount} prefix="₹" /></Field>
        <Field label="Reason"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Damage, canteen, fine…" /></Field>
        <p className="text-xs text-muted">Advances and loans are recovered automatically — record them under Advances & loans.</p>
      </div>
    </Modal>
  );
}

function PayModal({ run, line, balance, onClose }: { run: SalaryRun; line: SalaryLine; balance: number; onClose: () => void }) {
  const db = useDB();
  const st = db.staff.find((x) => x.id === line.staffId)!;
  const [d, setD] = useState(today());
  const [amount, setAmount] = useState<number | ''>(Math.round(balance * 100) / 100);
  const [mode, setMode] = useState<'CASH' | 'BANK' | 'UPI'>(st.payMode);
  const [ref, setRef] = useState('');
  const save = async () => {
    if (!(Number(amount) > 0)) return toast.error('Enter the amount');
    if (Number(amount) > balance + 0.5) return toast.error(`More than the balance of ${inr(balance)}`);
    try {
      await runCommand({ kind: 'update', coll: 'salaryRuns', id: run.id, patch: { payments: [...run.payments, { staffId: st.id, date: d, amount: Number(amount), mode, ref }] } }, `Salary ${run.month} paid to ${st.name}`);
      toast.success('Payment recorded', `${inr(Number(amount))} to ${st.name}`);
      onClose();
    } catch (e) {
      toast.error('Not saved', errMsg(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={`Pay ${st.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Record payment</Button></>}>
      <div className="space-y-3">
        <div className="text-sm">Net {inr(line.net)} · balance <b>{inr(balance)}</b></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Amount"><NumberInput value={amount} onChange={setAmount} prefix="₹" /></Field>
        </div>
        <Field label="Mode"><Segmented value={mode} onChange={setMode} options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK', label: 'Bank' }, { value: 'UPI', label: 'UPI' }]} /></Field>
        <Field label="Reference" hint={mode === 'BANK' ? `A/c ${st.bankAccount || '—'} · ${st.ifsc || ''}` : mode === 'UPI' ? st.upi || '' : 'voucher no.'}><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR / cheque / voucher" /></Field>
      </div>
    </Modal>
  );
}

function CancelRun({ run, onClose }: { run: SalaryRun; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const save = async () => {
    if (!reason.trim()) return toast.error('Give the reason');
    try {
      await runCommand({ kind: 'update', coll: 'salaryRuns', id: run.id, patch: { status: 'CANCELLED' }, reason }, `Salary ${run.month} cancelled`);
      toast.success('Salary sheet cancelled', 'Attendance is open again; a new sheet can be prepared');
      onClose();
    } catch (e) {
      toast.error('Not cancelled', errMsg(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={`Cancel ${run.no}?`} footer={<><Button onClick={onClose}>Keep</Button><Button variant="danger" onClick={save}>Cancel sheet</Button></>}>
      <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function registerTable(db: DB, run: SalaryRun): ExportTable {
  const t = runTotals(run);
  const st = (id: ID) => db.staff.find((x) => x.id === id);
  return {
    title: `Salary register — ${monthLabel(run.month)}`,
    subtitle: `${run.no} · ${run.status === 'APPROVED' ? `approved ${run.approvedOn ? date(run.approvedOn) : ''}` : run.status.toLowerCase()}`,
    headers: ['Staff ID', 'Name', 'Designation', 'Basis', 'Rate', 'Days in month', 'Present', 'Half days', 'Leave', 'Holidays / off', 'Absent', 'Not marked', 'Paid days', 'Trips', 'Basic', 'Allowances', 'OT hours', 'OT', 'Gross', 'EPF', 'ESI', 'Advance', 'Loan', 'Other', 'Net pay', 'Paid', 'Balance', 'Paid by', 'Account / UPI', 'UAN'],
    numeric: Array.from({ length: 23 }, (_, i) => i + 4),
    rows: run.lines.map((l) => {
      const s = st(l.staffId);
      return [s?.code, s?.name, s?.designation, BASIS[l.basis], l.rate, l.daysInMonth, l.present, l.half, l.leave, l.holiday, l.absent, l.unmarked, l.paidDays, l.trips, l.basic, l.allowances, l.otHours, l.ot, l.gross, l.pf, l.esi, l.advance, l.loan, l.other, l.net, t.paidOf(l.staffId), Math.max(0, l.net - t.paidOf(l.staffId)), s?.payMode, s?.payMode === 'BANK' ? `${s.bankAccount} ${s.ifsc}` : s?.payMode === 'UPI' ? s.upi : '', s?.uan || ''];
    }),
    totals: ['Total', '', '', '', '', '', '', '', '', '', '', '', '', '', sum(run.lines, (l) => l.basic), sum(run.lines, (l) => l.allowances), '', sum(run.lines, (l) => l.ot), t.gross, sum(run.lines, (l) => l.pf), sum(run.lines, (l) => l.esi), sum(run.lines, (l) => l.advance), sum(run.lines, (l) => l.loan), sum(run.lines, (l) => l.other), t.net, t.paid, t.pending, '', '', ''],
  };
}

function printSlip(db: DB, run: SalaryRun, l: SalaryLine) {
  const s = db.staff.find((x) => x.id === l.staffId)!;
  const paid = runTotals(run).paidOf(l.staffId);
  const pays = run.payments.filter((p) => p.staffId === l.staffId);
  const earn: Array<[string, number]> = [
    [l.basis === 'PER_TRIP' ? `Basic (${l.trips} trips × ${inr(l.rate)})` : l.basis === 'PER_DAY' ? `Basic (${l.paidDays} days × ${inr(l.rate)})` : `Basic (${inr(l.rate)} × ${l.paidDays}/${l.daysInMonth})`, l.basic],
    ['Allowances (food, mobile, travel)', l.allowances],
    [`Overtime (${l.otHours} h)`, l.ot],
  ];
  const ded: Array<[string, number]> = [['EPF (employee 12%)', l.pf], ['ESI (employee 0.75%)', l.esi], ['Salary advance recovered', l.advance], ['Loan instalment', l.loan], [`Other${l.otherNote ? ` — ${l.otherNote}` : ''}`, l.other]];
  const rows = Array.from({ length: Math.max(earn.length, ded.length) }, (_, i) => [earn[i]?.[0] || '', earn[i] ? earn[i]![1] : '', ded[i]?.[0] || '', ded[i] ? ded[i]![1] : '']);
  printDocument({
    title: `Salary slip — ${monthLabel(run.month)}`,
    meta: [
      ['Staff ID', s.code], ['Name', s.name], ['Designation', s.designation], ["Father's name", s.fatherName || '—'],
      ['Days paid', `${l.paidDays} of ${l.daysInMonth} (P ${l.present}, ½ ${l.half}, L ${l.leave}, off ${l.holiday}, A ${l.absent}${l.unmarked ? `, not marked ${l.unmarked}` : ''})`],
      ['Paid by', s.payMode === 'BANK' ? `Bank ${s.bankAccount} ${s.ifsc}` : s.payMode === 'UPI' ? `UPI ${s.upi}` : 'Cash'],
      ...(s.uan ? [['UAN', s.uan] as [string, string]] : []), ...(s.esicNo ? [['ESIC IP no.', s.esicNo] as [string, string]] : []),
    ],
    table: { title: 'Earnings and deductions', headers: ['Earnings', '₹', 'Deductions', '₹'], numeric: [1, 3], rows, totals: ['Gross', l.gross, 'Total deductions', l.pf + l.esi + l.advance + l.loan + l.other] },
    summary: [['Gross earnings', inr(l.gross)], ['Deductions', inr(l.pf + l.esi + l.advance + l.loan + l.other)], ['Paid', inr(paid)], ['Balance', inr(Math.max(0, l.net - paid))], ['Net pay', inr(l.net)]],
    footerNote: pays.length ? `Payments: ${pays.map((p) => `${date(p.date)} ${p.mode} ${inr(p.amount)}${p.ref ? ` (${p.ref})` : ''}`).join(' · ')}` : undefined,
  });
}

/* =================================================================== */
/*  Advances and loans                                                  */
/* =================================================================== */
function AdvancesTab() {
  const db = useDB();
  const s = useSession();
  const [form, setForm] = useState(false);
  const [view, setView] = useState<StaffAdvance | null>(null);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const st = (id: ID) => db.staff.find((x) => x.id === id);
  const rows = db.staffAdvances.map((a) => ({ a, rec: advanceRecovered(db, a.id), bal: advanceBalance(db, a) })).filter((x) => show === 'all' || x.bal > 0.005).reverse();
  return (
    <div className="space-y-4">
      <Callout>
        An advance is recovered in full from the next salary unless an instalment is given; a loan is recovered by its monthly instalment. Recovery never takes more than the pay left after PF / ESI, and is counted when the salary sheet is approved.
      </Callout>
      <DataTable
        title="Advances & loans"
        rows={rows}
        rowKey={(x) => x.a.id}
        onRowClick={s.can('staff', 'edit') ? (x) => setView(x.a) : undefined}
        toolbar={
          <div className="flex gap-2">
            <Segmented value={show} onChange={setShow} options={[{ value: 'open', label: 'To recover' }, { value: 'all', label: 'All' }]} />
            {s.can('staff', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Give advance / loan</Button>}
          </div>
        }
        columns={[
          { key: 'no', header: 'No.', value: (x) => x.a.no, cell: (x) => <span className="font-mono text-[13px]">{x.a.no}</span> },
          { key: 'date', header: 'Date', value: (x) => x.a.date, cell: (x) => date(x.a.date) },
          { key: 'staff', header: 'Staff', primary: true, value: (x) => st(x.a.staffId)?.name || '', cell: (x) => <div><div className="font-medium">{st(x.a.staffId)?.name}</div><div className="text-[11px] text-muted">{st(x.a.staffId)?.code}</div></div> },
          { key: 'kind', header: 'Type', value: (x) => x.a.kind, cell: (x) => <Badge tone={x.a.kind === 'LOAN' ? 'violet' : 'info'}>{x.a.kind === 'LOAN' ? 'Loan' : 'Advance'}</Badge> },
          { key: 'amt', header: 'Amount', align: 'right', value: (x) => x.a.amount, cell: (x) => inr(x.a.amount) },
          { key: 'inst', header: 'Per salary', align: 'right', value: (x) => x.a.instalment, cell: (x) => (x.a.instalment ? inr(x.a.instalment) : 'Full'), hideMobile: true },
          { key: 'rec', header: 'Recovered', align: 'right', value: (x) => x.rec, cell: (x) => inr(x.rec), hideMobile: true },
          { key: 'bal', header: 'Balance', align: 'right', value: (x) => x.bal, cell: (x) => (x.bal > 0.005 ? <b className="text-bad">{inr(x.bal)}</b> : <Badge tone="good">Recovered</Badge>) },
        ]}
        totals={{ bal: <b>{inr(sum(rows, (x) => x.bal))}</b>, __export: { bal: sum(rows, (x) => x.bal) } }}
      />
      {form && <AdvanceForm onClose={() => setForm(false)} />}
      {view && <AdvanceView a={view} onClose={() => setView(null)} />}
    </div>
  );
}

function AdvanceForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [staffId, setStaffId] = useState('');
  const [d, setD] = useState(today());
  const [kind, setKind] = useState<'ADVANCE' | 'LOAN'>('ADVANCE');
  const [amount, setAmount] = useState<number | ''>('');
  const [inst, setInst] = useState<number | ''>('');
  const [mode, setMode] = useState<'CASH' | 'BANK' | 'UPI'>('CASH');
  const [ref, setRef] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const outstanding = staffId ? sum(advancesOutstanding(db).filter((x) => x.advance.staffId === staffId), (x) => x.balance) : 0;
  const save = async () => {
    if (!staffId) return toast.error('Choose the staff member');
    if (!(Number(amount) > 0)) return toast.error('Enter the amount');
    if (kind === 'LOAN' && !(Number(inst) > 0)) return toast.error('Give the monthly instalment for a loan');
    setBusy(true);
    try {
      const r = await runCommand({ kind: 'insert', coll: 'staffAdvances', rec: { staffId, date: d, kind, amount: Number(amount), instalment: Number(inst) || 0, mode, ref, remark } }, `Staff ${kind === 'LOAN' ? 'loan' : 'advance'} ${inr(Number(amount))}`);
      toast.success(`${r?.no || 'Saved'}`, `${inr(Number(amount))} — recovered from the next salary`);
      onClose();
    } catch (e) {
      toast.error('Not saved', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title="Advance or loan to staff" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy} icon={<CircleCheck className="w-4 h-4" />}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Staff" required hint={outstanding ? `Already to recover: ${inr(outstanding)}` : undefined}>
          <Combo value={staffId} onChange={setStaffId} options={db.staff.filter((x) => x.active !== false).map((x) => ({ value: x.id, label: x.name, hint: `${x.code} · ${x.designation}` }))} />
        </Field>
        <Field label="Type"><Segmented value={kind} onChange={setKind} options={[{ value: 'ADVANCE', label: 'Salary advance' }, { value: 'LOAN', label: 'Loan (instalments)' }]} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Amount" required><NumberInput value={amount} onChange={setAmount} prefix="₹" /></Field>
          <Field label={kind === 'LOAN' ? 'Instalment per salary' : 'Recover per salary'} required={kind === 'LOAN'} hint={kind === 'LOAN' ? undefined : 'blank = all from the next salary'}><NumberInput value={inst} onChange={setInst} prefix="₹" /></Field>
          <Field label="Paid by"><Select value={mode} onChange={(x) => setMode(x as typeof mode)} options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK', label: 'Bank' }, { value: 'UPI', label: 'UPI' }]} /></Field>
        </div>
        {kind === 'LOAN' && Number(amount) > 0 && Number(inst) > 0 && <p className="text-xs text-muted">About {Math.ceil(Number(amount) / Number(inst))} salaries to recover.</p>}
        <Field label="Reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="voucher / UTR" /></Field>
        <Field label="Remark"><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

function AdvanceView({ a, onClose }: { a: StaffAdvance; onClose: () => void }) {
  const db = useDB();
  const st = db.staff.find((x) => x.id === a.staffId);
  const bal = advanceBalance(db, a);
  const [inst, setInst] = useState<number | ''>(a.instalment || '');
  const history = db.salaryRuns.filter((r) => r.status === 'APPROVED').flatMap((r) => r.lines.flatMap((l) => l.recoveries.filter((x) => x.advanceId === a.id).map((x) => ({ month: r.month, amount: x.amount }))));
  const save = async () => {
    try {
      await runCommand({ kind: 'update', coll: 'staffAdvances', id: a.id, patch: { instalment: Number(inst) || 0 } }, `${a.no} instalment`);
      toast.success('Saved', 'Applies from the next salary sheet');
      onClose();
    } catch (e) {
      toast.error('Not saved', errMsg(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={`${a.no} · ${st?.name}`} footer={<><Button onClick={onClose}>Close</Button>{bal > 0.005 && <Button variant="primary" onClick={save}>Save instalment</Button>}</>}>
      <div className="space-y-3 text-sm">
        <div>{a.kind === 'LOAN' ? 'Loan' : 'Advance'} of <b>{inr(a.amount)}</b> on {date(a.date)} · balance <b>{inr(bal)}</b></div>
        {bal > 0.005 && <Field label="Recover per salary" hint={a.kind === 'LOAN' ? 'loan instalment' : 'blank = all from the next salary'}><NumberInput value={inst} onChange={setInst} prefix="₹" /></Field>}
        <div>
          <div className="text-[11px] uppercase text-muted mb-1">Recovered</div>
          {history.length ? history.map((h) => <div key={h.month} className="flex justify-between"><span>{monthLabel(h.month)}</span><span>{inr(h.amount)}</span></div>) : <div className="text-muted">Nothing yet</div>}
        </div>
      </div>
    </Modal>
  );
}

/* =================================================================== */
/*  Reports                                                             */
/* =================================================================== */
function ReportsTab() {
  const db = useDB();
  const n = useNames();
  const [r, setR] = useState<'list' | 'register' | 'advances' | 'licence'>('list');
  const [month, setMonth] = useState(prevMonth());
  const run = db.salaryRuns.find((x) => x.month === month && x.status !== 'CANCELLED');
  const st = (id: ID) => db.staff.find((x) => x.id === id);
  const alerts = licenceAlerts(db, today(), 30);
  const withLicence = db.staff.filter((x) => x.active !== false && x.licenceNo);
  return (
    <div className="space-y-4">
      <Segmented value={r} onChange={setR} options={[{ value: 'list', label: 'Staff list' }, { value: 'register', label: 'Salary register' }, { value: 'advances', label: 'Advances outstanding' }, { value: 'licence', label: 'Licence expiry' }]} />
      {r === 'list' && (
        <DataTable
          title="Staff list"
          rows={db.staff.slice().sort((a, b) => a.code.localeCompare(b.code))}
          rowKey={(x) => x.id}
          pageSize={50}
          columns={[
            { key: 'code', header: 'Staff ID', value: (x) => x.code },
            { key: 'name', header: 'Name', primary: true, value: (x) => x.name },
            { key: 'father', header: "Father's name", value: (x) => x.fatherName, hideMobile: true },
            { key: 'phone', header: 'Phone', value: (x) => x.phone, hideMobile: true },
            { key: 'aadhaar', header: 'Aadhaar', value: (x) => x.aadhaar, hideMobile: true },
            { key: 'des', header: 'Designation', value: (x) => x.designation },
            { key: 'post', header: 'Posted to', value: (x) => `${POSTING[x.posting]}: ${postedTo(n, x)}` },
            { key: 'join', header: 'Joined', value: (x) => x.joiningDate, cell: (x) => (x.joiningDate ? date(x.joiningDate) : '—'), hideMobile: true },
            { key: 'basis', header: 'Basis', value: (x) => BASIS[x.basis], hideMobile: true },
            { key: 'sal', header: 'Salary', align: 'right', rate: true, value: (x) => x.salary, cell: (x) => inr(x.salary) },
            { key: 'allow', header: 'Allowances', align: 'right', rate: true, value: (x) => allowanceTotal(x), cell: (x) => inr(allowanceTotal(x)), hideMobile: true },
            { key: 'mode', header: 'Paid by', value: (x) => x.payMode, hideMobile: true },
            { key: 'status', header: 'Status', value: (x) => (x.active === false ? `Inactive${x.leftOn ? ` (left ${x.leftOn})` : ''}` : 'Active') },
          ]}
        />
      )}
      {r === 'register' && (
        <>
          <Card className="p-4 flex items-end gap-3">
            <Field label="Month" className="w-48"><Input type="month" value={month} max={today().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
            {run && (
              <div className="flex gap-2">
                <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => downloadXlsx(registerTable(db, run))}>Excel</Button>
                <Button icon={<Printer className="w-4 h-4" />} onClick={() => printTable(registerTable(db, run))}>PDF</Button>
              </div>
            )}
          </Card>
          {!run ? (
            <Callout>No salary sheet for {monthLabel(month)} yet — prepare it in Monthly salary.</Callout>
          ) : (
            <DataTable
              title={`Salary register — ${monthLabel(month)} (${run.status.toLowerCase()})`}
              rows={run.lines}
              rowKey={(l) => l.staffId}
              pageSize={50}
              columns={[
                { key: 'name', header: 'Staff', primary: true, value: (l) => `${st(l.staffId)?.code} ${st(l.staffId)?.name}` },
                { key: 'days', header: 'Days paid', align: 'right', value: (l) => l.paidDays },
                { key: 'gross', header: 'Gross', align: 'right', value: (l) => l.gross, cell: (l) => inr(l.gross) },
                { key: 'ded', header: 'Deductions', align: 'right', value: (l) => l.pf + l.esi + l.advance + l.loan + l.other, cell: (l) => inr(l.pf + l.esi + l.advance + l.loan + l.other) },
                { key: 'net', header: 'Net', align: 'right', value: (l) => l.net, cell: (l) => <b>{inr(l.net)}</b> },
                { key: 'paid', header: 'Paid', align: 'right', value: (l) => runTotals(run).paidOf(l.staffId), cell: (l) => inr(runTotals(run).paidOf(l.staffId)) },
              ]}
            />
          )}
        </>
      )}
      {r === 'advances' && (
        <DataTable
          title="Advances outstanding"
          rows={advancesOutstanding(db)}
          rowKey={(x) => x.advance.id}
          columns={[
            { key: 'staff', header: 'Staff', primary: true, value: (x) => st(x.advance.staffId)?.name || '' },
            { key: 'no', header: 'No.', value: (x) => x.advance.no },
            { key: 'date', header: 'Date', value: (x) => x.advance.date, cell: (x) => date(x.advance.date) },
            { key: 'kind', header: 'Type', value: (x) => (x.advance.kind === 'LOAN' ? 'Loan' : 'Advance') },
            { key: 'amt', header: 'Given', align: 'right', value: (x) => x.advance.amount, cell: (x) => inr(x.advance.amount) },
            { key: 'rec', header: 'Recovered', align: 'right', value: (x) => x.recovered, cell: (x) => inr(x.recovered) },
            { key: 'inst', header: 'Per salary', align: 'right', value: (x) => x.advance.instalment || x.balance, cell: (x) => (x.advance.instalment ? inr(x.advance.instalment) : 'Full') },
            { key: 'bal', header: 'Balance', align: 'right', value: (x) => x.balance, cell: (x) => <b>{inr(x.balance)}</b> },
          ]}
          totals={{ bal: <b>{inr(sum(advancesOutstanding(db), (x) => x.balance))}</b>, __export: { bal: sum(advancesOutstanding(db), (x) => x.balance) } }}
        />
      )}
      {r === 'licence' && (
        <>
          {alerts.length === 0 && <Callout tone="good">No driving licence expires in the next 30 days.</Callout>}
          <DataTable
            title="Driving licences"
            subtitle="expired or expiring within 30 days first"
            rows={withLicence.slice().sort((a, b) => (a.licenceExpiry || '9999').localeCompare(b.licenceExpiry || '9999'))}
            rowKey={(x) => x.id}
            columns={[
              { key: 'name', header: 'Staff', primary: true, value: (x) => x.name },
              { key: 'des', header: 'Designation', value: (x) => x.designation },
              { key: 'veh', header: 'Vehicle', value: (x) => (x.vehicleId ? n.veh(x.vehicleId) : '—') },
              { key: 'no', header: 'Licence no.', value: (x) => x.licenceNo },
              { key: 'exp', header: 'Valid up to', value: (x) => x.licenceExpiry || '', cell: (x) => (x.licenceExpiry ? date(x.licenceExpiry) : <Badge tone="warn">not given</Badge>) },
              {
                key: 'left', header: 'Days left', align: 'right', value: (x) => (x.licenceExpiry ? Math.round((Date.parse(x.licenceExpiry) - Date.parse(today())) / 86400000) : ''),
                cell: (x) => { if (!x.licenceExpiry) return '—'; const dl = Math.round((Date.parse(x.licenceExpiry) - Date.parse(today())) / 86400000); return <Badge tone={dl < 0 ? 'bad' : dl <= 30 ? 'warn' : 'good'}>{dl < 0 ? `expired ${-dl} d` : `${dl} d`}</Badge>; },
              },
            ]}
          />
        </>
      )}
    </div>
  );
}


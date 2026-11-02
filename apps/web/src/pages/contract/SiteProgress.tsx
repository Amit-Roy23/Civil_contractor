import { useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, Plus, Printer, Share2 } from 'lucide-react';
import { cubesDue, dprDraft, hindranceDays, programme } from '@civil/domain/ops';
import { measuredUpto } from '@civil/domain/billing';
import { useDB, insert, update } from '../../data/store';
import { useSession } from '../../data/session';
import type { DB, Dpr, Site, SiteRegister } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, KV, Progress, Section, Stat, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, NumberInput, Select, Textarea } from '../../components/ui/fields';
import { printDocument, shareWhatsApp } from '../../lib/export';
import { date, inr, num, today } from '../../lib/format';
import { round, sum } from '../../lib/utils';
import { LabTab } from '../plant/PlantOps';
import { useNames } from '../shared';

function useWork() {
  const db = useDB();
  const s = useSession();
  const { siteId } = useSiteFilter();
  const works = db.sites.filter((x) => s.seesSite(x.id) && !(x as any).outOfScope);
  const [pick, setPick] = useState('');
  const id = siteId || pick || works.find((w) => w.status === 'ACTIVE')?.id || works[0]?.id || '';
  return { works, siteId: id, setSiteId: setPick, site: works.find((w) => w.id === id) };
}
function WorkPicker({ w }: { w: ReturnType<typeof useWork> }) {
  return <Select value={w.siteId} onChange={w.setSiteId} options={w.works.map((x) => ({ value: x.id, label: x.short || x.name }))} className="w-52" />;
}

/** value of work done up to a date, as % of the BOQ value */
export function workDonePct(db: DB, siteId: string, upto: string) {
  const items = db.boq.filter((b) => b.siteId === siteId && !b.isExtra);
  const total = sum(items, (b) => b.qty * b.rate);
  if (!total) return 0;
  return round((sum(items, (b) => Math.min(measuredUpto(db, b.id, upto), b.qty) * b.rate) / total) * 100, 1);
}

/* ================= DPR-01: daily progress report ================= */
export function DprTab() {
  const db = useDB();
  const s = useSession();
  const w = useWork();
  const [form, setForm] = useState<Dpr | 'new' | null>(null);
  const rows = db.dprs.filter((d) => d.siteId === w.siteId).sort((a, b) => b.date.localeCompare(a.date));
  const share = (d: Dpr) =>
    shareWhatsApp(`*DPR ${w.site?.short || ''} — ${date(d.date)}*\nWeather: ${d.weather.toLowerCase().replace('_', ' ')}\nManpower: ${d.manpower} (${d.manpowerNote})\nMachines: ${d.machines || '—'}\nMaterials: ${d.materials || '—'}\nWork done:\n${d.work.map((x) => `• ${x.description} — ${num(x.qty, 2)} ${x.unit} ${x.chainage}`).join('\n') || '—'}${d.hindrance ? `\nHindrance: ${d.hindrance}` : ''}${d.remarks ? `\nRemarks: ${d.remarks}` : ''}`);
  const print = (d: Dpr) =>
    printDocument({
      title: 'DAILY PROGRESS REPORT',
      firmId: w.site?.firmId,
      meta: [['Work', w.site?.name || ''], ['Date', date(d.date)], ['Weather', d.weather.toLowerCase().replace('_', ' ')], ['Manpower', `${d.manpower} (${d.manpowerNote})`], ['Machines', d.machines], ['Materials', d.materials], ['Hindrance', d.hindrance || 'Nil']],
      table: { title: 'Work done', headers: ['Item', 'Qty', 'Unit', 'Chainage'], numeric: [1], rows: d.work.map((x) => [x.description, x.qty, x.unit, x.chainage]) },
      footerNote: d.remarks,
    });
  return (
    <div className="space-y-4">
      <DataTable
        title="Daily progress reports"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => setForm(r)}
        toolbar={<><WorkPicker w={w} />{s.can('contract', 'add') && <Button variant="primary" icon={<ClipboardList className="w-4 h-4" />} onClick={() => setForm('new')}>Today's DPR</Button>}</>}
        columns={[
          { key: 'd', header: 'Date', primary: true, value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'w', header: 'Weather', value: (r) => r.weather, cell: (r) => <Badge tone={r.weather.includes('RAIN') ? 'info' : 'neutral'}>{r.weather.toLowerCase().replace('_', ' ')}</Badge> },
          { key: 'm', header: 'Manpower', align: 'right', value: (r) => r.manpower },
          { key: 'x', header: 'Work done', value: (r) => r.work.map((x) => x.description).join('; '), cell: (r) => <span className="text-[13px]">{r.work.map((x) => `${x.description.slice(0, 40)} ${num(x.qty, 2)} ${x.unit}`).join('; ') || '—'}</span> },
          { key: 'h', header: 'Hindrance', value: (r) => r.hindrance, hideMobile: true },
          { key: 'a', header: '', value: () => '', cell: (r) => <div className="flex gap-1" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" icon={<Printer className="w-4 h-4" />} onClick={() => print(r)}>Print</Button><Button size="sm" variant="ghost" icon={<Share2 className="w-4 h-4" />} onClick={() => share(r)}>WhatsApp</Button></div> },
        ]}
      />
      {form && w.site && <DprForm site={w.site} dpr={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
      {!w.site && <Callout>Choose a work.</Callout>}
    </div>
  );
}

function DprForm({ site, dpr, onClose }: { site: Site; dpr?: Dpr; onClose: () => void }) {
  const db = useDB();
  const [d, setD] = useState(dpr?.date || today());
  const draft = useMemo(() => dprDraft(db, site.id, d), [db, site.id, d]);
  const [f, setF] = useState<Omit<Dpr, 'id' | 'siteId' | 'date' | 'createdAt' | 'createdBy'>>(() => (dpr ? { ...dpr } : { weather: 'CLEAR' as Dpr['weather'], manpower: draft.manpower, manpowerNote: draft.manpowerNote, machines: draft.machines, materials: draft.materials, work: draft.work, hindrance: draft.hindrance, remarks: '' }));
  const refill = () => setF({ ...f, manpower: draft.manpower, manpowerNote: draft.manpowerNote, machines: draft.machines, materials: draft.materials, work: draft.work, hindrance: draft.hindrance });
  const save = () => {
    if (dpr) update('dprs', dpr.id, { weather: f.weather, manpower: f.manpower, manpowerNote: f.manpowerNote, machines: f.machines, materials: f.materials, work: f.work, hindrance: f.hindrance, remarks: f.remarks }, `DPR ${site.short} ${d}`, 'DPR');
    else {
      if (db.dprs.some((x) => x.siteId === site.id && x.date === d)) return toast.error('The DPR for this date already exists');
      insert('dprs', { siteId: site.id, date: d, ...f } as any, `DPR ${site.short} ${d}`, 'DPR');
    }
    toast.success('DPR saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={`DPR — ${site.short || site.name}`} subtitle="Filled from today's attendance, logbooks, store issues, hot mix received and measurements — check and add remarks" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save DPR</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Date"><Input type="date" value={d} max={today()} disabled={!!dpr} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Weather"><Select value={f.weather} onChange={(v) => setF({ ...f, weather: v as Dpr['weather'] })} options={[{ value: 'CLEAR', label: 'Clear' }, { value: 'CLOUDY', label: 'Cloudy' }, { value: 'RAIN', label: 'Rain' }, { value: 'HEAVY_RAIN', label: 'Heavy rain' }]} /></Field>
          <Field label="Manpower" hint={f.manpowerNote}><NumberInput value={f.manpower} onChange={(v) => setF({ ...f, manpower: Number(v) || 0 })} /></Field>
        </div>
        {!dpr && <Button size="sm" variant="ghost" onClick={refill}>Refill from the day's entries</Button>}
        <Field label="Machines"><Textarea rows={2} value={f.machines} onChange={(e) => setF({ ...f, machines: e.target.value })} /></Field>
        <Field label="Materials"><Textarea rows={2} value={f.materials} onChange={(e) => setF({ ...f, materials: e.target.value })} /></Field>
        <Section title="Work done" action={<Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setF({ ...f, work: [...f.work, { description: '', qty: 0, unit: '', chainage: '' }] })}>Add line</Button>}>
          <div className="space-y-2">
            {f.work.map((x, i) => {
              const set = (p: Partial<typeof x>) => setF({ ...f, work: f.work.map((y, j) => (j === i ? { ...y, ...p } : y)) });
              return (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <Input className="col-span-2 sm:col-span-3" value={x.description} onChange={(e) => set({ description: e.target.value })} placeholder="Item / activity" />
                  <NumberInput value={x.qty} onChange={(v) => set({ qty: Number(v) || 0 })} />
                  <Input value={x.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="Unit" />
                  <Input value={x.chainage} onChange={(e) => set({ chainage: e.target.value })} placeholder="Chainage" />
                </div>
              );
            })}
            {!f.work.length && <p className="text-sm text-muted">No measurements entered for the day — add lines here.</p>}
          </div>
        </Section>
        <Field label="Hindrance"><Input value={f.hindrance} onChange={(e) => setF({ ...f, hindrance: e.target.value })} /></Field>
        <Field label="Remarks"><Textarea rows={2} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}

/* ================= DPR-02: hindrance register and site order book ================= */
export function SiteRegistersTab() {
  const db = useDB();
  const s = useSession();
  const w = useWork();
  const [kind, setKind] = useState<SiteRegister['kind']>('HINDRANCE');
  const [form, setForm] = useState<SiteRegister | 'new' | null>(null);
  const rows = db.siteRegisters.filter((r) => r.siteId === w.siteId && r.kind === kind).slice().reverse();
  const days = w.siteId ? hindranceDays(db, w.siteId, today()) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <WorkPicker w={w} />
        <Select value={kind} onChange={(v) => setKind(v as SiteRegister['kind'])} options={[{ value: 'HINDRANCE', label: 'Hindrance register' }, { value: 'SITE_ORDER', label: 'Site order book' }]} className="w-48" />
        <div className="flex-1" />
        {kind === 'HINDRANCE' && <Badge tone={days ? 'warn' : 'neutral'}>{days} hindrance days so far (for extension of time)</Badge>}
        {s.can('contract', 'add') && w.site && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm('new')}>{kind === 'HINDRANCE' ? 'Record hindrance' : 'Site order'}</Button>}
      </div>
      <DataTable
        title={kind === 'HINDRANCE' ? 'Hindrance register' : 'Site order book'}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => setForm(r)}
        columns={[
          { key: 'no', header: 'No.', primary: true, value: (r) => r.no, cell: (r) => <div><b>{r.no}</b><div className="text-[11px] text-muted">{date(r.date)}</div></div> },
          { key: 'd', header: 'Description', value: (r) => r.description, cell: (r) => <span className="text-[13px]">{r.description.slice(0, 140)}</span> },
          { key: 'by', header: kind === 'HINDRANCE' ? 'Reported to' : 'Issued by', value: (r) => r.by, hideMobile: true },
          ...(kind === 'HINDRANCE' ? [{ key: 'p', header: 'Period', value: (r: SiteRegister) => r.fromDate || '', cell: (r: SiteRegister) => `${r.fromDate ? date(r.fromDate) : ''} – ${r.toDate ? date(r.toDate) : 'continuing'}` }] : []),
          { key: 'c', header: kind === 'HINDRANCE' ? 'Status' : 'Compliance', value: (r) => r.compliance || (r.closedOn ? 'Closed' : 'Open'), cell: (r) => (r.closedOn ? <Badge tone="good">Closed {date(r.closedOn)}</Badge> : r.compliance ? <span className="text-[13px]">{r.compliance.slice(0, 80)}</span> : <Badge tone="warn">Open</Badge>) },
        ]}
      />
      {form && w.site && <RegisterForm site={w.site} kind={kind} rec={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    </div>
  );
}

function RegisterForm({ site, kind, rec, onClose }: { site: Site; kind: SiteRegister['kind']; rec?: SiteRegister; onClose: () => void }) {
  const [f, setF] = useState({ date: rec?.date || today(), ref: rec?.ref || '', by: rec?.by || '', description: rec?.description || '', fromDate: rec?.fromDate || (kind === 'HINDRANCE' ? today() : ''), toDate: rec?.toDate || '', compliance: rec?.compliance || '', closedOn: rec?.closedOn || '' });
  const save = () => {
    if (!f.description.trim()) return toast.error('Description is required');
    if (rec) update('siteRegisters', rec.id, { ref: f.ref, by: f.by, description: f.description, fromDate: f.fromDate, toDate: f.toDate, compliance: f.compliance, closedOn: f.closedOn }, `${rec.no} updated`, 'Site register');
    else insert('siteRegisters', { kind, siteId: site.id, no: '', ...f } as any, `${kind === 'HINDRANCE' ? 'Hindrance' : 'Site order'} ${site.short}`, 'Site register');
    toast.success('Saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={rec ? rec.no : kind === 'HINDRANCE' ? 'Record hindrance' : 'Site order'} subtitle={site.name} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Date"><Input type="date" value={f.date} max={today()} disabled={!!rec} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Letter / reference"><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
        <Field label={kind === 'HINDRANCE' ? 'Reported to' : 'Issued by (EE / AE / JE)'} className="sm:col-span-2"><Input value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })} /></Field>
        <Field label={kind === 'HINDRANCE' ? 'Hindrance (land, utility shifting, rain, drawings…)' : 'Instruction'} required className="sm:col-span-2"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {kind === 'HINDRANCE' && (
          <>
            <Field label="From" required><Input type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} /></Field>
            <Field label="To" hint="Blank = still continuing"><Input type="date" value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} /></Field>
          </>
        )}
        <Field label={kind === 'HINDRANCE' ? 'Action / remarks' : 'Compliance'} className="sm:col-span-2"><Textarea rows={2} value={f.compliance} onChange={(e) => setF({ ...f, compliance: e.target.value })} /></Field>
        <Field label="Closed on"><Input type="date" value={f.closedOn} onChange={(e) => setF({ ...f, closedOn: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}

/* ================= DPR-03: site quality, cube reminders ================= */
export function QualityTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const due = cubesDue(db, today()).filter((c) => !c.siteId || s.seesSite(c.siteId));
  const [enter, setEnter] = useState<{ id: string; age: 7 | 28 } | null>(null);
  const [val, setVal] = useState<number | ''>('');
  const save = () => {
    const t = db.labTests.find((x) => x.id === enter!.id);
    if (!t?.cube || val === '') return;
    const cube = { ...t.cube, [enter!.age === 7 ? 'd7' : 'd28']: Number(val) };
    update('labTests', t.id, { cube }, `Cube ${enter!.age}-day result`, 'Lab test');
    setEnter(null);
    setVal('');
    toast.success('Result saved');
  };
  return (
    <div className="space-y-4">
      {due.length > 0 && (
        <Card className="p-4">
          <CardHeader title="Cube tests due" icon={<CalendarClock className="w-4 h-4" />} subtitle="7-day and 28-day crushing due today or overdue" />
          <div className="mt-3 space-y-2">
            {due.map((c) => (
              <div key={c.testId + c.age} className="flex flex-wrap items-center gap-3 text-sm">
                <Badge tone={c.overdue ? 'bad' : 'warn'}>{c.age}-day {c.overdue ? `${c.overdue} days overdue` : 'due'}</Badge>
                <span>{n.site(c.siteId)} · {c.grade} · due {date(c.due)}</span>
                {enter?.id === c.testId && enter.age === c.age ? (
                  <span className="flex gap-2"><NumberInput value={val} onChange={setVal} suffix="N/mm²" className="w-32" /><Button size="sm" onClick={save}>Save</Button></span>
                ) : (
                  s.can('contract', 'edit') && <Button size="sm" onClick={() => setEnter({ id: c.testId, age: c.age })}>Enter result</Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      <LabTab scope="site" />
    </div>
  );
}

/* ================= DPR-04: programme vs actual, time-penalty risk ================= */
export function ProgrammeTab() {
  const db = useDB();
  const s = useSession();
  const w = useWork();
  const actual = w.siteId ? workDonePct(db, w.siteId, today()) : 0;
  const p = w.site ? programme(db, w.site, today(), actual) : null;
  const [ms, setMs] = useState<{ date: string; targetPct: number | ''; label: string }>({ date: '', targetPct: '', label: '' });
  const addMilestone = () => {
    if (!w.site || !ms.date || ms.targetPct === '') return toast.error('Date and target % are required');
    update('sites', w.site.id, { milestones: [...(w.site.milestones || []), { date: ms.date, targetPct: Number(ms.targetPct), label: ms.label }].sort((a, b) => a.date.localeCompare(b.date)) }, `Milestone ${ms.label}`, 'Work');
    setMs({ date: '', targetPct: '', label: '' });
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><WorkPicker w={w} /></div>
      {!p ? (
        <Callout>Enter the start date and the stipulated completion date on the work to see the programme.</Callout>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Planned by today" value={p.planned} format={(x) => `${round(x, 1)}%`} />
            <Stat label="Actual (value of work measured)" value={p.actual} format={(x) => `${round(x, 1)}%`} tone="good" />
            <Stat label="Behind programme" value={Math.max(0, p.behind)} format={(x) => `${round(x, 1)}%`} tone={p.behind > 3 ? 'bad' : 'good'} />
            <Stat label="Hindrance days" value={p.hindranceDays} tone="warn" />
          </div>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Progress</div>
              <Badge tone={p.risk === 'HIGH' ? 'bad' : p.risk === 'MEDIUM' ? 'warn' : 'good'}>{p.risk.toLowerCase()} risk</Badge>
            </div>
            <div className="text-xs text-muted">Planned</div>
            <Progress value={p.planned} tone="info" />
            <div className="text-xs text-muted">Actual</div>
            <Progress value={p.actual} tone={p.behind > 10 ? 'bad' : p.behind > 3 ? 'warn' : 'good'} />
            <KV cols={3} items={[['Stipulated completion', date(p.completion)], ['Projected at present rate', p.projected ? date(p.projected) : '—'], ['Likely delay', p.delayDays ? `${p.delayDays} days` : 'None'], ['Time-penalty risk', s.showRates ? inr(p.ldRisk) : '—'], ['Next milestone', p.nextMilestone ? `${p.nextMilestone.label || ''} ${p.nextMilestone.targetPct}% by ${date(p.nextMilestone.date)}` : '—']]} />
            {p.delayDays > 0 && p.hindranceDays > 0 && <Callout tone="warn">Apply for extension of time: {p.hindranceDays} hindrance days are recorded in the hindrance register.</Callout>}
          </Card>
          <DataTable
            title="Milestones"
            rows={w.site?.milestones || []}
            rowKey={(r, i) => r.date + i}
            searchable={false}
            exportable={false}
            toolbar={s.can('masters', 'edit') && <div className="flex gap-2 items-end"><Input type="date" value={ms.date} onChange={(e) => setMs({ ...ms, date: e.target.value })} className="w-36" /><NumberInput value={ms.targetPct} onChange={(v) => setMs({ ...ms, targetPct: v })} suffix="%" className="w-24" /><Input value={ms.label} onChange={(e) => setMs({ ...ms, label: e.target.value })} placeholder="Label" className="w-32" /><Button size="sm" onClick={addMilestone}>Add</Button></div>}
            columns={[
              { key: 'd', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
              { key: 'l', header: 'Milestone', primary: true, value: (r) => r.label },
              { key: 't', header: 'Target', align: 'right', value: (r) => r.targetPct, cell: (r) => `${r.targetPct}%` },
              { key: 'a', header: 'Actual by then', align: 'right', value: (r) => (r.date <= today() ? workDonePct(db, w.siteId, r.date) : ''), cell: (r) => (r.date <= today() ? `${workDonePct(db, w.siteId, r.date)}%` : '—') },
            ]}
          />
        </>
      )}
    </div>
  );
}

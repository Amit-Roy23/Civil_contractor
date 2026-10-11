import { useEffect, useMemo, useState } from 'react';
import { Camera, CircleCheck, Lock, MapPin, Plus, Printer, Users, Wallet } from 'lucide-react';
import { useDB, insert, update, nextNo } from '../../data/store';
import { useSession } from '../../data/session';
import { contractorLedger, contractorRate, labourCostRows, lookup, subconBillCalc, theoreticalVsActual, wageFor } from '../../data/selectors';
import type { Attendance, AttStatus, ID, SubconBill, Trade, WageRun, WorkOrder } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, KV, Modal, PageHeader, Section, Stat, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, Field, Input, NumberInput, Segmented, Select,} from '../../components/ui/fields';
import { ColumnChart } from '../../components/ui/charts';
import { addDays, date, dateShort, daysBetween, inr, inrCompact, num, qty, today } from '../../lib/format';
import { printDocument } from '../../lib/export';
import { cn, groupBy, round, sum } from '../../lib/utils';
import { Money, useAutoOpen, useModuleTab, useNames, useNewParam,} from '../shared';

const TRADES: Trade[] = ['Mason', 'Helper', 'Carpenter', 'Bar Bender', 'Operator', 'Driver', 'Electrician', 'Supervisor'];

export default function Labour() {
  const { tab, tabsEl } = useModuleTab('labour');
  return (
    <div>
      <PageHeader title="Labour" subtitle="Daily labour cost per site — own rolls, labour contractors and piece-rate sub-contractors." tags={['LAB-01…13']} />
      {tabsEl}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'daily' && <DailyTab />}
      {tab === 'wages' && <WagesTab />}
      {tab === 'advances' && <AdvancesTab />}
      {tab === 'contractors' && <ContractorsTab />}
      {tab === 'subcontract' && <SubcontractTab />}
      {tab === 'compliance' && <ComplianceTab />}
    </div>
  );
}

function useSite() {
  const { siteId, sites } = useSiteFilter();
  const [site, setSite] = useState(siteId || sites.find((s) => s.status === 'ACTIVE')?.id || sites[0]?.id || '');
  useEffect(() => {
    if (siteId) setSite(siteId);
  }, [siteId]);
  return { site, setSite, sites };
}

/** LAB-05: attendance locks after the set hour on the next day */
function isLocked(db: ReturnType<typeof useDB>, d: string) {
  const age = daysBetween(d, today());
  if (age <= 0) return false;
  if (age === 1) return new Date().getHours() >= db.settings.attendanceLockHour;
  return true;
}

/* ================= Attendance (LAB-01..05) ================= */
function AttendanceTab() {
  const [mode, setMode] = useState<'mark' | 'register'>('mark');
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setMode('mark'), () => setNw(null));
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'mark', label: 'Mark attendance' }, { value: 'register', label: 'Monthly register' }]} />
      {mode === 'mark' ? <MarkAttendance /> : <AttendanceRegister />}
    </div>
  );
}

function MarkAttendance() {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const { site, setSite, sites } = useSite();
  const [d, setD] = useState(today());
  const locked = isLocked(db, d) && !s.isAdmin;
  const existing = useMemo(() => db.attendance.filter((a) => a.siteId === site && a.date === d), [db, site, d]);
  const crew = useMemo(() => {
    const own = db.workers.filter((w) => w.siteId === site && w.active !== false);
    const visiting = existing.filter((a) => a.workerId && !own.some((w) => w.id === a.workerId)).map((a) => lk.worker[a.workerId!]!);
    return [...own, ...visiting];
  }, [db, site, existing]); // eslint-disable-line react-hooks/exhaustive-deps
  const [marks, setMarks] = useState<Record<ID, { status: AttStatus; ot: number }>>({});
  const [heads, setHeads] = useState<Array<{ contractorId: ID; trade: Trade; headcount: number | ''; ot: number | '' }>>([]);
  const [photo, setPhoto] = useState(false);
  const [gps, setGps] = useState('');
  const [addWorker, setAddWorker] = useState('');
  useEffect(() => {
    const m: Record<ID, { status: AttStatus; ot: number }> = {};
    for (const w of crew) {
      const e = existing.find((a) => a.workerId === w.id);
      m[w.id] = { status: e?.status || 'P', ot: e?.otHours || 0 };
    }
    setMarks(m);
    const h = existing.filter((a) => a.contractorId).map((a) => ({ contractorId: a.contractorId!, trade: a.trade || 'Helper', headcount: a.headcount || 0, ot: a.otHours || 0 }));
    setHeads(h.length ? h : [{ contractorId: db.subcons.find((c) => c.kind === 'LABOUR_CONTRACTOR')!.id, trade: 'Helper', headcount: '', ot: '' }]);
    setPhoto(existing.some((a) => a.photo));
    setGps(existing.find((a) => a.gps)?.gps || '');
  }, [site, d, existing.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const present = Object.values(marks).filter((m) => m.status === 'P').length + Object.values(marks).filter((m) => m.status === 'H').length * 0.5;
  const contractorHc = sum(heads, (h) => Number(h.headcount) || 0);
  const cost = sum(crew, (w) => { const m = marks[w.id]; return m ? (m.status === 'P' ? 1 : m.status === 'H' ? 0.5 : 0) * w.wageRate + m.ot * w.otRate : 0; }) + sum(heads, (h) => (Number(h.headcount) || 0) * contractorRate(db, h.contractorId, h.trade));

  const captureGps = () => {
    if (!navigator.geolocation) return setGps(lk.site[site]?.gps || '');
    navigator.geolocation.getCurrentPosition(
      (p) => setGps(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`),
      () => setGps(lk.site[site]?.gps || ''),
      { timeout: 4000 },
    );
  };

  const save = () => {
    if (locked) return toast.error('Attendance is locked', `Entries lock at ${db.settings.attendanceLockHour}:00 the next day (LAB-05). Ask Admin.`);
    for (const w of crew) {
      const m = marks[w.id];
      if (!m) continue;
      const e = existing.find((a) => a.workerId === w.id);
      if (e) {
        if (e.status !== m.status || e.otHours !== m.ot) update('attendance', e.id, { status: m.status, otHours: m.ot }, `Attendance ${w.name} ${d}`, 'Attendance');
      } else insert('attendance', { date: d, siteId: site, workerId: w.id, status: m.status, otHours: m.ot, photo, gps } as any, `Attendance ${w.name} ${d}`, 'Attendance');
    }
    for (const h of heads.filter((x) => Number(x.headcount) > 0)) {
      const e = existing.find((a) => a.contractorId === h.contractorId && a.trade === h.trade);
      if (e) update('attendance', e.id, { headcount: Number(h.headcount), otHours: Number(h.ot) || 0 }, `Headcount ${h.trade}`, 'Attendance');
      else insert('attendance', { date: d, siteId: site, contractorId: h.contractorId, trade: h.trade, headcount: Number(h.headcount), otHours: Number(h.ot) || 0, photo, gps } as any, `Headcount ${lk.subcon[h.contractorId]?.name} ${h.trade} ${h.headcount}`, 'Attendance');
    }
    toast.success('Attendance saved', `${num(present + contractorHc)} on site · ${s.showRates ? inr(cost) : ''}`);
  };

  const otherWorkers = db.workers.filter((w) => w.siteId !== site && !crew.some((c) => c.id === w.id)).map((w) => ({ value: w.id, label: w.name, hint: `${w.trade} · ${lk.site[w.siteId]?.short}` }));

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col lg:flex-row lg:items-end gap-3">
        <Field label="Site" className="lg:w-72">
          <Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.short }))} />
        </Field>
        <Field label="Date" className="lg:w-48">
          <Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} />
        </Field>
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-surface-2 border border-line px-3 py-2"><div className="text-[11px] text-muted">Own present</div><div className="text-lg font-bold">{num(present, 1)}</div></div>
          <div className="rounded-xl bg-surface-2 border border-line px-3 py-2"><div className="text-[11px] text-muted">Contractor</div><div className="text-lg font-bold">{num(contractorHc)}</div></div>
          <div className="rounded-xl bg-surface-2 border border-line px-3 py-2"><div className="text-[11px] text-muted">Day’s cost</div><div className="text-lg font-bold"><Money v={cost} /></div></div>
        </div>
      </Card>
      {locked && <Callout tone="warn" icon={<Lock className="w-4 h-4" />}>Attendance for {date(d)} is locked (LAB-05). Only Admin can edit with a reason.</Callout>}

      <Card>
        <CardHeader title="Own labour" subtitle="Tap to cycle Present → Half-day → Absent. OT hours per worker." icon={<Users className="w-[18px] h-[18px]" />} action={<Button size="sm" variant="ghost" onClick={() => setMarks(Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, { ...v, status: 'P' }])))}>All present</Button>} />
        <div className="px-3 sm:px-5 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 stagger">
          {crew.map((w) => {
            const m = marks[w.id] || { status: 'P' as AttStatus, ot: 0 };
            const set = (p: Partial<typeof m>) => setMarks({ ...marks, [w.id]: { ...m, ...p } });
            return (
              <div key={w.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface">
                <button
                  disabled={locked}
                  onClick={() => set({ status: m.status === 'P' ? 'H' : m.status === 'H' ? 'A' : 'P' })}
                  className={cn('w-11 h-11 rounded-xl font-bold text-sm shrink-0 transition-all active:scale-90', m.status === 'P' ? 'bg-good text-white' : m.status === 'H' ? 'bg-warn text-white' : 'bg-surface-3 text-muted')}
                >
                  {m.status}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{w.name}</div>
                  <div className="text-[11px] text-muted">
                    {w.trade} · {w.code}
                    {w.siteId !== site && <Badge tone="violet" className="ml-1">from {lk.site[w.siteId]?.short}</Badge>}
                  </div>
                </div>
                <div className="w-20 shrink-0">
                  <NumberInput value={m.ot || ''} onChange={(v) => set({ ot: Number(v) || 0 })} placeholder="OT" suffix="h" disabled={locked} className="h-9 text-xs" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-3 sm:px-5 pb-4 flex flex-col sm:flex-row gap-2 sm:items-end">
          <Field label="Worker from another site (LAB-04)" className="sm:w-80">
            <Combo value={addWorker} onChange={setAddWorker} options={otherWorkers} placeholder="Add shifted worker" />
          </Field>
          <Button disabled={!addWorker || locked} onClick={() => { insert('attendance', { date: d, siteId: site, workerId: addWorker, status: 'P', otHours: 0 } as any, `Shifted worker ${lk.worker[addWorker]?.name} to ${lk.site[site]?.short}`, 'Attendance'); setAddWorker(''); toast.success('Worker added — day cost goes to this site'); }}>
            Add for the day
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Contractor labour — headcount by trade" subtitle='LAB-02 · e.g. "Ramesh Contractor: 6 masons, 12 helpers"' />
        <div className="px-3 sm:px-5 pb-4 space-y-2">
          {heads.map((h, i) => {
            const set = (p: Partial<typeof h>) => setHeads(heads.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-end p-2.5 rounded-xl border border-line">
                <Field label={i === 0 ? 'Contractor' : undefined} className="col-span-12 sm:col-span-5">
                  <Select value={h.contractorId} onChange={(v) => set({ contractorId: v })} options={db.subcons.filter((c) => c.kind === 'LABOUR_CONTRACTOR').map((c) => ({ value: c.id, label: c.name }))} disabled={locked} />
                </Field>
                <Field label={i === 0 ? 'Trade' : undefined} className="col-span-5 sm:col-span-3">
                  <Select value={h.trade} onChange={(v) => set({ trade: v as Trade })} options={TRADES.map((t) => ({ value: t, label: t }))} disabled={locked} />
                </Field>
                <Field label={i === 0 ? 'Heads' : undefined} className="col-span-4 sm:col-span-2">
                  <NumberInput value={h.headcount} onChange={(v) => set({ headcount: v })} disabled={locked} />
                </Field>
                <Field label={i === 0 ? 'OT hrs' : undefined} className="col-span-3 sm:col-span-2">
                  <NumberInput value={h.ot} onChange={(v) => set({ ot: v })} disabled={locked} />
                </Field>
              </div>
            );
          })}
          <Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setHeads([...heads, { contractorId: heads[0]?.contractorId || 'sc1', trade: 'Mason', headcount: '', ot: '' }])} disabled={locked}>
            Add trade
          </Button>
        </div>
      </Card>

      <Card className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex gap-2 flex-wrap">
          <Button icon={<Camera className="w-4 h-4" />} variant={photo ? 'success' : 'secondary'} onClick={() => setPhoto(true)}>
            {photo ? 'Gang photo attached' : 'Gang photo (LAB-03)'}
          </Button>
          <Button icon={<MapPin className="w-4 h-4" />} variant={gps ? 'success' : 'secondary'} onClick={captureGps}>
            {gps ? `GPS ${gps}` : 'Capture GPS & time'}
          </Button>
        </div>
        <div className="flex-1" />
        <Button variant="primary" size="lg" onClick={save} disabled={locked} icon={<CircleCheck className="w-5 h-5" />}>
          Save attendance
        </Button>
      </Card>
    </div>
  );
}

function AttendanceRegister() {
  const db = useDB();
  const { site, setSite, sites } = useSite();
  const [month, setMonth] = useState(today().slice(0, 7));
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const workers = db.workers.filter((w) => w.siteId === site);
  const att = useMemo(() => groupBy(db.attendance.filter((a) => a.workerId && a.date.startsWith(month)), (a) => a.workerId!), [db, month]);
  return (
    <Card className="overflow-hidden">
      <div className="p-3 flex flex-wrap gap-2 border-b border-line">
        <Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.short }))} className="w-56" />
        <Input type="month" value={month} max={today().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        <div className="flex items-center gap-3 text-xs text-muted ml-auto">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-good" />Present</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-warn" />Half</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-surface-3 border border-line" />Absent</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr className="bg-surface-2">
              <th className="sticky left-0 bg-surface-2 text-left px-3 py-2 font-semibold min-w-[160px]">Worker</th>
              {Array.from({ length: days }, (_, i) => (
                <th key={i} className="px-0.5 py-2 font-medium text-muted w-7">{i + 1}</th>
              ))}
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-right">OT</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => {
              const rows = att[w.id] || [];
              const byDay = Object.fromEntries(rows.map((a) => [Number(a.date.slice(8, 10)), a]));
              return (
                <tr key={w.id} className="border-t border-line">
                  <td className="sticky left-0 bg-surface px-3 py-1.5 font-medium whitespace-nowrap">
                    {w.name}
                    <div className="text-[10px] text-muted font-normal">{w.trade}</div>
                  </td>
                  {Array.from({ length: days }, (_, i) => {
                    const a = byDay[i + 1] as Attendance | undefined;
                    return (
                      <td key={i} className="px-0.5 py-1">
                        <div title={a ? `${a.status}${a.otHours ? ` +${a.otHours}h OT` : ''}${a.siteId !== w.siteId ? ' (other site)' : ''}` : ''} className={cn('w-6 h-6 rounded-md mx-auto flex items-center justify-center text-[9px] font-bold', !a ? 'bg-transparent' : a.status === 'P' ? 'bg-good text-white' : a.status === 'H' ? 'bg-warn text-white' : 'bg-surface-3 text-muted', a && a.siteId !== w.siteId && 'ring-2 ring-violet')}>
                          {a?.otHours ? a.otHours : ''}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 text-right font-semibold num">{sum(rows, (a) => (a.status === 'P' ? 1 : a.status === 'H' ? 0.5 : 0))}</td>
                  <td className="px-3 text-right num">{sum(rows, (a) => a.otHours)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ================= Daily labour report ================= */
function DailyTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [d, setD] = useState(today());
  const all = useMemo(() => labourCostRows(db).filter((r) => s.seesSite(r.siteId) && (!siteId || r.siteId === siteId)), [db, s, siteId]);
  const rows = useMemo(() => {
    const m = new Map<string, { siteId: ID; trade: string; own: number; contractor: number; cost: number }>();
    for (const r of all.filter((x) => x.date === d)) {
      const k = `${r.siteId}|${r.trade}`;
      const e = m.get(k) || { siteId: r.siteId, trade: r.trade, own: 0, contractor: 0, cost: 0 };
      if (r.source === 'OWN') e.own += r.headcount;
      else e.contractor += r.headcount;
      e.cost += r.cost;
      m.set(k, e);
    }
    return [...m.values()];
  }, [all, d]);
  const trend = useMemo(() => {
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const day = addDays(today(), -i);
      const rs = all.filter((r) => r.date === day);
      out.push({ label: dateShort(day), values: { own: sum(rs.filter((r) => r.source === 'OWN'), (r) => r.headcount), con: sum(rs.filter((r) => r.source === 'CONTRACTOR'), (r) => r.headcount) } });
    }
    return out;
  }, [all]);
  const monthCost = useMemo(() => Object.entries(groupBy(all.filter((r) => r.date.startsWith(today().slice(0, 7))), (r) => r.siteId)).map(([sid, rs]) => ({ sid, cost: sum(rs, (r) => r.cost), md: sum(rs, (r) => r.headcount) })), [all]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        {monthCost.map((m) => (
          <Stat key={m.sid} label={`${n.site(m.sid)} — this month`} value={s.showRates ? m.cost : m.md} format={s.showRates ? inrCompact : (x) => `${num(x)} man-days`} tone="violet" sub={`${num(m.md)} man-days`} />
        ))}
      </div>
      <Card>
        <CardHeader title="Headcount — last 30 days" subtitle="Own labour vs contractor labour" />
        <div className="px-4 pb-4">
          <ColumnChart stacked data={trend} height={200} series={[{ key: 'own', label: 'Own labour' }, { key: 'con', label: 'Contractor labour' }]} />
        </div>
      </Card>
      <DataTable
        title={`Daily labour report — ${date(d)}`}
        rows={rows}
        rowKey={(r) => `${r.siteId}-${r.trade}`}
        toolbar={<Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} className="w-44" />}
        columns={[
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'trade', header: 'Trade', primary: true, value: (r) => r.trade },
          { key: 'own', header: 'Own', align: 'right', value: (r) => r.own },
          { key: 'con', header: 'Contractor', align: 'right', value: (r) => r.contractor },
          { key: 'tot', header: 'Total', align: 'right', value: (r) => r.own + r.contractor, cell: (r) => <b>{num(r.own + r.contractor, 1)}</b> },
          { key: 'cost', header: 'Cost', align: 'right', rate: true, value: (r) => Math.round(r.cost), cell: (r) => inr(r.cost) },
        ]}
        totals={{ tot: num(sum(rows, (r) => r.own + r.contractor), 1), cost: inr(sum(rows, (r) => r.cost)), __export: { tot: sum(rows, (r) => r.own + r.contractor), cost: Math.round(sum(rows, (r) => r.cost)) } }}
      />
    </div>
  );
}

/* ================= Wages (LAB-06/08) ================= */
function WagesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [view, setView] = useState<WageRun | null>(null);
  const rows = db.wageRuns.filter((w) => s.seesSite(w.siteId) && (!siteId || w.siteId === siteId)).slice().reverse();
  return (
    <>
      <DataTable
        title="Wage sheets"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setView}
        toolbar={s.can('labour', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Generate wage sheet</Button>}
        columns={[
          { key: 'no', header: 'Wage sheet', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'period', header: 'Period', value: (r) => r.from, cell: (r) => `${date(r.from)} – ${date(r.to)}` },
          { key: 'freq', header: 'Frequency', value: (r) => r.frequency.toLowerCase(), hideMobile: true },
          { key: 'workers', header: 'Workers', align: 'right', value: (r) => r.lines.length },
          { key: 'gross', header: 'Gross', align: 'right', rate: true, value: (r) => sum(r.lines, (l) => l.gross), cell: (r) => inr(sum(r.lines, (l) => l.gross)) },
          { key: 'net', header: 'Net payable', align: 'right', rate: true, value: (r) => sum(r.lines, (l) => l.net), cell: (r) => <b>{inr(sum(r.lines, (l) => l.net))}</b> },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {form && <WageForm onClose={() => setForm(false)} />}
      {view && <WageView run={view} onClose={() => setView(null)} />}
    </>
  );
}

function WageForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const { site, setSite, sites } = useSite();
  const [freq, setFreq] = useState<WageRun['frequency']>('WEEKLY');
  const [from, setFrom] = useState(addDays(today(), -7));
  const [to, setTo] = useState(addDays(today(), -1));
  const lines = useMemo(() => db.workers.filter((w) => w.siteId === site).map((w) => wageFor(db, w.id, from, to)), [db, site, from, to]);
  const n = useNames();
  const setFreqAndRange = (f: WageRun['frequency']) => {
    setFreq(f);
    const len = f === 'WEEKLY' ? 7 : f === 'FORTNIGHTLY' ? 14 : 30;
    setFrom(addDays(today(), -len));
    setTo(addDays(today(), -1));
  };
  const save = () => {
    const no = nextNo('WAGE');
    insert('wageRuns', { no, siteId: site, frequency: freq, from, to, lines, status: 'DRAFT' } as any, `Wage sheet ${no}`, 'Wage run');
    toast.success(`${no} generated`, `${lines.length} workers · ${inr(sum(lines, (l) => l.net))} net`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Generate wage sheet" subtitle="LAB-06 · days × daily rate + OT hours × OT rate − advances − deductions" width="max-w-3xl" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Generate</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Site" className="col-span-2 sm:col-span-1"><Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.short }))} /></Field>
          <Field label="Frequency"><Select value={freq} onChange={(v) => setFreqAndRange(v as WageRun['frequency'])} options={[{ value: 'WEEKLY', label: 'Weekly' }, { value: 'FORTNIGHTLY', label: 'Fortnightly' }, { value: 'MONTHLY', label: 'Monthly' }]} /></Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase text-muted">
              <tr><th className="text-left px-3 py-2">Worker</th><th className="text-right px-3">Days</th><th className="text-right px-3">OT h</th><th className="text-right px-3">Gross</th><th className="text-right px-3">Adv.</th><th className="text-right px-3">Net</th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.workerId} className="border-t border-line">
                  <td className="px-3 py-2">{n.lk.worker[l.workerId]?.name}<div className="text-[11px] text-muted">{n.lk.worker[l.workerId]?.trade} · ₹{n.lk.worker[l.workerId]?.wageRate}/day</div></td>
                  <td className="text-right px-3 num">{l.days}</td>
                  <td className="text-right px-3 num">{l.otHours}</td>
                  <td className="text-right px-3 num">{inr(l.gross)}</td>
                  <td className="text-right px-3 num">{l.advance ? inr(l.advance) : '—'}</td>
                  <td className="text-right px-3 num font-semibold">{inr(l.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-2 font-semibold"><tr className="border-t-2 border-line"><td className="px-3 py-2">Total</td><td /><td /><td className="text-right px-3 num">{inr(sum(lines, (l) => l.gross))}</td><td className="text-right px-3 num">{inr(sum(lines, (l) => l.advance))}</td><td className="text-right px-3 num">{inr(sum(lines, (l) => l.net))}</td></tr></tfoot>
          </table>
        </div>
      </div>
    </Drawer>
  );
}

function WageView({ run, onClose }: { run: WageRun; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const r = db.wageRuns.find((x) => x.id === run.id) || run;
  const [pay, setPay] = useState(false);
  const [mode, setMode] = useState('BANK');
  const payslip = (l: WageRun['lines'][number]) => {
    const w = n.lk.worker[l.workerId]!;
    printDocument({
      title: `Payslip — ${w.name}`,
      meta: [['Worker', `${w.name} (${w.code})`], ['Trade', w.trade], ['Site', n.site(r.siteId)], ['Period', `${date(r.from)} – ${date(r.to)}`], ['Payment', r.paidMode || 'Pending'], ['UPI / bank', w.upi]],
      table: { title: 'Earnings', headers: ['Item', 'Basis', 'Amount'], rows: [['Wages', `${l.days} days × ₹${w.wageRate}`, Math.round(l.days * w.wageRate)], ['Overtime', `${l.otHours} h × ₹${w.otRate}`, Math.round(l.otHours * w.otRate)], ['Less: advances', '', -l.advance], ['Less: deductions', '', -l.deduction]], numeric: [2] },
      summary: [['Net pay', inr(l.net)]],
    });
  };
  return (
    <Drawer open onClose={onClose} title={r.no} subtitle={`${n.site(r.siteId)} · ${date(r.from)} – ${date(r.to)}`} width="max-w-3xl"
      footer={
        <>
          <Button icon={<Printer className="w-4 h-4" />} onClick={() => printDocument({ title: `Wage sheet ${r.no}`, meta: [['Site', n.site(r.siteId)], ['Period', `${date(r.from)} – ${date(r.to)}`], ['Status', r.status]], table: { title: 'Wage sheet', headers: ['Worker', 'Trade', 'Days', 'OT h', 'Gross', 'Advance', 'Deduction', 'Net', 'Signature'], rows: r.lines.map((l) => [n.lk.worker[l.workerId]?.name, n.lk.worker[l.workerId]?.trade, l.days, l.otHours, l.gross, l.advance, l.deduction, l.net, '']), numeric: [2, 3, 4, 5, 6, 7], totals: ['Total', '', '', '', sum(r.lines, (l) => l.gross), sum(r.lines, (l) => l.advance), sum(r.lines, (l) => l.deduction), sum(r.lines, (l) => l.net), ''] } })}>Print sheet</Button>
          {r.status === 'DRAFT' && s.can('labour', 'approve') && <Button variant="success" onClick={() => (update('wageRuns', r.id, { status: 'APPROVED' }, `${r.no} approved`, 'Wage run', undefined, 'APPROVE'), toast.success('Approved'))}>Approve</Button>}
          {r.status === 'APPROVED' && s.can('labour', 'approve') && <Button variant="primary" icon={<Wallet className="w-4 h-4" />} onClick={() => setPay(true)}>Mark paid</Button>}
        </>
      }>
      <div className="space-y-4">
        <div className="flex gap-2"><StatusBadge status={r.status} />{r.paidMode && <Badge tone="good">Paid by {r.paidMode}</Badge>}</div>
        <div className="rounded-xl border border-line divide-y divide-line">
          {r.lines.map((l) => (
            <div key={l.workerId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium">{n.lk.worker[l.workerId]?.name}</div>
                <div className="text-[11px] text-muted">{l.days} days · {l.otHours} OT h · gross {inr(l.gross)}{l.advance ? ` · adv −${inr(l.advance)}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <b className="num text-sm"><Money v={l.net} /></b>
                <Button size="sm" variant="ghost" onClick={() => payslip(l)} icon={<Printer className="w-3.5 h-3.5" />}>Slip</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Modal open={pay} onClose={() => setPay(false)} title="Record wage payment" footer={<><Button onClick={() => setPay(false)}>Cancel</Button><Button variant="primary" onClick={() => (update('wageRuns', r.id, { status: 'PAID', paidMode: mode as any }, `${r.no} paid`, 'Wage run'), setPay(false), toast.success('Wages marked paid', `${inr(sum(r.lines, (l) => l.net))} by ${mode}`))}>Mark paid</Button></>}>
        <Field label="Payment mode (LAB-08)"><Select value={mode} onChange={setMode} options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK', label: 'Bank transfer' }, { value: 'UPI', label: 'UPI' }]} /></Field>
      </Modal>
    </Drawer>
  );
}

/* ================= Advances (LAB-07) ================= */
function AdvancesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [to, setTo] = useState<'worker' | 'contractor'>('worker');
  const [who, setWho] = useState('');
  const [amt, setAmt] = useState<number | ''>('');
  const [mode, setMode] = useState('CASH');
  const [remark, setRemark] = useState('');
  const rows = db.advances.filter((a) => s.seesSite(a.siteId) && (!siteId || a.siteId === siteId)).slice().reverse();
  const save = () => {
    if (!who || !amt) return toast.error('Choose person and amount');
    const site = to === 'worker' ? n.lk.worker[who]!.siteId : siteId || 's1';
    insert('advances', { date: today(), siteId: site, workerId: to === 'worker' ? who : undefined, contractorId: to === 'contractor' ? who : undefined, amount: Number(amt), mode, remark } as any, `Advance ${inr(Number(amt))}`, 'Advance');
    toast.success('Advance recorded', 'Recovered automatically in the next wage run');
    setForm(false);
  };
  return (
    <>
      <DataTable
        title="Advances"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('labour', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Give advance</Button>}
        columns={[
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'to', header: 'To', primary: true, value: (r) => (r.workerId ? n.lk.worker[r.workerId]?.name : n.lk.subcon[r.contractorId!]?.name), cell: (r) => <div>{r.workerId ? n.lk.worker[r.workerId]?.name : n.lk.subcon[r.contractorId!]?.name}<div className="text-[11px] text-muted">{r.workerId ? 'Worker' : 'Labour contractor'}</div></div> },
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'remark', header: 'Purpose', value: (r) => r.remark },
          { key: 'mode', header: 'Mode', value: (r) => r.mode, hideMobile: true },
          { key: 'amt', header: 'Amount', align: 'right', rate: true, value: (r) => r.amount, cell: (r) => <b>{inr(r.amount)}</b> },
        ]}
      />
      <Drawer open={form} onClose={() => setForm(false)} title="Give advance" subtitle="LAB-07 · recovered in later wage runs / contractor bills" footer={<><Button onClick={() => setForm(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Advance to"><Segmented value={to} onChange={(v) => (setTo(v), setWho(''))} options={[{ value: 'worker', label: 'Worker' }, { value: 'contractor', label: 'Contractor' }]} /></Field>
          <Field label={to === 'worker' ? 'Worker' : 'Contractor'} required>
            <Combo value={who} onChange={setWho} options={to === 'worker' ? db.workers.filter((w) => s.seesSite(w.siteId)).map((w) => ({ value: w.id, label: w.name, hint: `${w.trade} · ${n.site(w.siteId)}` })) : db.subcons.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Amount" required><NumberInput value={amt} onChange={setAmt} prefix="₹" /></Field>
          <Field label="Mode"><Select value={mode} onChange={setMode} options={['CASH', 'UPI', 'BANK'].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Purpose" className="sm:col-span-2"><Input value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
        </div>
      </Drawer>
    </>
  );
}

/* ================= Contractor ledgers (LAB-09) ================= */
function ContractorsTab() {
  const db = useDB();
  const [c, setC] = useState('sc1');
  const rows = useMemo(() => contractorLedger(db, c).slice().reverse(), [db, c]);
  const sc = db.subcons.find((x) => x.id === c)!;
  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col md:flex-row md:items-center gap-4">
        <Combo value={c} onChange={setC} options={db.subcons.map((x) => ({ value: x.id, label: x.name, hint: x.kind === 'LABOUR_CONTRACTOR' ? 'Labour contractor' : 'Sub-contractor' }))} className="md:w-96" />
        <KV cols={3} items={[['Type', sc.kind === 'LABOUR_CONTRACTOR' ? 'Labour contractor' : 'Sub-contractor'], ['Trade', sc.trade], ['Balance payable', <Money key="b" v={rows[0]?.balance || 0} />]]} />
      </Card>
      {sc.kind === 'LABOUR_CONTRACTOR' && <Callout>Rates: {Object.entries(sc.tradeRates).map(([t, r]) => `${t} ₹${r}/day`).join(' · ')}. Bills are built weekly from headcount attendance.</Callout>}
      <DataTable
        title={`Ledger — ${sc.name}`}
        rows={rows}
        rowKey={(r, i) => `${r.ref}-${i}`}
        columns={[
          { key: 'date', header: 'Date', primary: true, value: (r) => r.date, cell: (r) => (r.date ? date(r.date) : '—') },
          { key: 'type', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.type === 'Payment' ? 'good' : r.type === 'Advance' ? 'violet' : 'neutral'}>{r.type}</Badge> },
          { key: 'ref', header: 'Reference', value: (r) => r.ref },
          { key: 'debit', header: 'Paid / advance', align: 'right', rate: true, value: (r) => r.debit, cell: (r) => (r.debit ? inr(r.debit) : '') },
          { key: 'credit', header: 'Billed', align: 'right', rate: true, value: (r) => r.credit, cell: (r) => (r.credit ? inr(r.credit) : '') },
          { key: 'balance', header: 'Balance', align: 'right', rate: true, value: (r) => r.balance, cell: (r) => <b>{inr(r.balance)}</b> },
        ]}
      />
    </div>
  );
}

/* ================= Sub-contract (LAB-10/11/12) ================= */
function SubcontractTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [woForm, setWoForm] = useState(false);
  const [billFor, setBillFor] = useState<WorkOrder | null>(null);
  const [viewBill, setViewBill] = useState<SubconBill | null>(null);
  const wos = db.workOrders.filter((w) => s.seesSite(w.siteId));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg-2 uppercase tracking-wider">Work orders</h3>
        {s.can('labour', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setWoForm(true)}>New work order</Button>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
        {wos.map((w) => {
          const bills = db.subconBills.filter((b) => b.workOrderId === w.id);
          const value = sum(w.lines, (l) => l.qty * l.rate);
          const done = sum(bills, (b) => subconBillCalc(db, b).gross);
          return (
            <Card key={w.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-muted">{w.no} · {n.site(w.siteId)}</div>
                  <div className="font-semibold">{n.lk.subcon[w.subContractorId]?.name}</div>
                  <div className="text-xs text-fg-2 mt-0.5">{w.lines.map((l) => `${n.lk.boq[l.boqItemId]?.description} — ${qty(l.qty, n.lk.boq[l.boqItemId]?.unit)} @ ₹${l.rate}`).join(' · ')}</div>
                </div>
                <StatusBadge status={w.status} />
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1"><span className="text-muted">Billed <Money v={done} compact /> of <Money v={value} compact /></span><span className="font-semibold">{((done / value) * 100).toFixed(0)}%</span></div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-violet rounded-full bar-grow" style={{ width: `${Math.min(100, (done / value) * 100)}%` }} /></div>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-muted">
                <span>{date(w.start)} → {date(w.end)} · retention {w.retentionPct}% · TDS {w.tdsPct}%</span>
                {s.can('labour', 'add') && <Button size="sm" onClick={() => setBillFor(w)}>New bill</Button>}
              </div>
            </Card>
          );
        })}
      </div>
      <DataTable
        title="Sub-contractor bills"
        rows={db.subconBills.filter((b) => wos.some((w) => w.id === b.workOrderId)).slice().reverse()}
        rowKey={(r) => r.id}
        onRowClick={setViewBill}
        columns={[
          { key: 'no', header: 'Bill', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'sc', header: 'Sub-contractor', value: (r) => n.lk.subcon[n.lk.workOrder[r.workOrderId]?.subContractorId || '']?.name },
          { key: 'site', header: 'Site', value: (r) => n.site(n.lk.workOrder[r.workOrderId]?.siteId) },
          { key: 'gross', header: 'Gross', align: 'right', rate: true, value: (r) => Math.round(subconBillCalc(db, r).gross), cell: (r) => inr(subconBillCalc(db, r).gross) },
          { key: 'net', header: 'Net', align: 'right', rate: true, value: (r) => Math.round(subconBillCalc(db, r).net), cell: (r) => <b>{inr(subconBillCalc(db, r).net)}</b> },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {woForm && <WorkOrderForm onClose={() => setWoForm(false)} />}
      {billFor && <SubconBillForm wo={billFor} onClose={() => setBillFor(null)} />}
      {viewBill && (
        <Drawer open onClose={() => setViewBill(null)} title={viewBill.no} subtitle={n.lk.subcon[n.lk.workOrder[viewBill.workOrderId]?.subContractorId || '']?.name}>
          {(() => {
            const c = subconBillCalc(db, viewBill);
            const wo = n.lk.workOrder[viewBill.workOrderId]!;
            return (
              <div className="space-y-4">
                <StatusBadge status={viewBill.status} />
                <div className="rounded-xl border border-line divide-y divide-line">
                  {viewBill.lines.map((l) => (
                    <div key={l.boqItemId} className="px-3 py-2 flex justify-between text-sm"><span>{n.lk.boq[l.boqItemId]?.description}<div className="text-[11px] text-muted">{qty(l.qty, n.lk.boq[l.boqItemId]?.unit)} × ₹{l.rate}</div></span><b className="num"><Money v={l.qty * l.rate} /></b></div>
                  ))}
                </div>
                <KV cols={2} items={[['Gross', <Money key="g" v={c.gross} />], [`Retention ${wo.retentionPct}%`, <Money key="r" v={-c.retention} />], [`TDS ${wo.tdsPct}%`, <Money key="t" v={-c.tds} />], ['Material recovery (LAB-12)', <Money key="m" v={-viewBill.materialRecovery} />], ['Advance recovery', <Money key="a" v={-viewBill.advanceRecovery} />], ['Penalty', <Money key="p" v={-viewBill.penalty} />], ['Net payable', <b key="n"><Money v={c.net} /></b>]]} />
                {viewBill.status === 'PENDING' && s.can('approvals', 'approve') && (
                  <div className="flex gap-2 justify-end">
                    <Button onClick={() => (update('subconBills', viewBill.id, { status: 'REJECTED' }, `${viewBill.no} rejected`, 'Sub-contractor bill', undefined, 'REJECT'), setViewBill(null))}>Reject</Button>
                    <Button variant="success" onClick={() => (update('subconBills', viewBill.id, { status: 'APPROVED' }, `${viewBill.no} approved`, 'Sub-contractor bill', undefined, 'APPROVE'), toast.success('Bill approved'), setViewBill(null))}>Approve</Button>
                  </div>
                )}
              </div>
            );
          })()}
        </Drawer>
      )}
    </div>
  );
}

function WorkOrderForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const [sc, setSc] = useState('');
  const [site, setSite] = useState(db.sites.find((x) => s.seesSite(x.id))?.id || '');
  const [lines, setLines] = useState<Array<{ boqItemId: string; qty: number | ''; rate: number | '' }>>([{ boqItemId: '', qty: '', rate: '' }]);
  const [end, setEnd] = useState(addDays(today(), 180));
  const [ret, setRet] = useState<number | ''>(5);
  const [tds, setTds] = useState<number | ''>(2);
  const boq = db.boq.filter((b) => b.siteId === site);
  const save = () => {
    const valid = lines.filter((l) => l.boqItemId && Number(l.qty) > 0 && Number(l.rate) > 0);
    if (!sc || !valid.length) return toast.error('Sub-contractor and items required');
    const no = nextNo('WO');
    insert('workOrders', { no, date: today(), subContractorId: sc, siteId: site, lines: valid.map((l) => ({ boqItemId: l.boqItemId, qty: Number(l.qty), rate: Number(l.rate) })), start: today(), end, retentionPct: Number(ret) || 0, tdsPct: Number(tds) || 0, status: 'ACTIVE' } as any, `Work order ${no}`, 'Work order');
    toast.success(`${no} issued`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Work order to sub-contractor" subtitle="LAB-10 · site, BOQ items, qty, rate, dates" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Issue work order</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Sub-contractor" required><Combo value={sc} onChange={setSc} options={db.subcons.filter((x) => x.kind === 'SUB_CONTRACTOR').map((x) => ({ value: x.id, label: x.name, hint: x.trade }))} /></Field>
          <Field label="Site" required><Select value={site} onChange={setSite} options={db.sites.filter((x) => s.seesSite(x.id)).map((x) => ({ value: x.id, label: x.short }))} /></Field>
          <Field label="End date"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Retention %"><NumberInput value={ret} onChange={setRet} /></Field>
            <Field label="TDS %"><NumberInput value={tds} onChange={setTds} /></Field>
          </div>
        </div>
        <Section title="Items">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 mb-2">
              <div className="col-span-12 sm:col-span-6"><Combo value={l.boqItemId} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, boqItemId: v } : x)))} options={boq.map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description}`, hint: `BOQ rate ₹${b.rate}/${b.unit}` }))} /></div>
              <div className="col-span-6 sm:col-span-3"><NumberInput value={l.qty} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: v } : x)))} placeholder="Qty" /></div>
              <div className="col-span-6 sm:col-span-3"><NumberInput value={l.rate} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, rate: v } : x)))} prefix="₹" placeholder="Rate" /></div>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setLines([...lines, { boqItemId: '', qty: '', rate: '' }])}>Add item</Button>
        </Section>
      </div>
    </Drawer>
  );
}

function SubconBillForm({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const last = db.subconBills.filter((b) => b.workOrderId === wo.id).map((b) => b.date).sort().pop() || wo.start;
  const measured = (boqItemId: string) => round(sum(db.measurements.filter((m) => m.boqItemId === boqItemId && m.date > last), (m) => m.qty), 2);
  const [qtys, setQtys] = useState<Record<string, number | ''>>(Object.fromEntries(wo.lines.map((l) => [l.boqItemId, measured(l.boqItemId)])));
  const excess = useMemo(() => {
    const tva = theoreticalVsActual(db, { from: last, to: today() }, wo.siteId).filter((t) => t.diff > 0);
    const relevant = new Set(wo.lines.flatMap((l) => n.lk.recipe[n.lk.boq[l.boqItemId]?.recipeId || '']?.lines.map((x) => x.materialId) || []));
    return sum(tva.filter((t) => relevant.has(t.materialId)), (t) => t.diffValue);
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mat, setMat] = useState<number | ''>(Math.round(excess));
  const [adv, setAdv] = useState<number | ''>(0);
  const [pen, setPen] = useState<number | ''>(0);
  const lines = wo.lines.map((l) => ({ boqItemId: l.boqItemId, qty: Number(qtys[l.boqItemId]) || 0, rate: l.rate })).filter((l) => l.qty > 0);
  const draft = { id: '', createdAt: '', createdBy: '', no: '', date: today(), workOrderId: wo.id, lines, materialRecovery: Number(mat) || 0, advanceRecovery: Number(adv) || 0, penalty: Number(pen) || 0, status: 'PENDING' as const };
  const c = subconBillCalc(db, draft);
  const save = () => {
    if (!lines.length) return toast.error('Enter measured quantity');
    const no = nextNo('SCB');
    insert('subconBills', { ...draft, id: undefined, createdAt: undefined, createdBy: undefined, no } as any, `Sub-contractor bill ${no}`, 'Sub-contractor bill');
    toast.success(`${no} submitted for approval`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={`Bill — ${n.lk.subcon[wo.subContractorId]?.name}`} subtitle="LAB-11 · qty done × rate − material, advance, retention, TDS, penalties" footer={<><span className="mr-auto text-sm">Net <b><Money v={c.net} /></b></span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Submit bill</Button></>}>
      <div className="space-y-5">
        <Section title={`Measured since ${date(last)}`}>
          {wo.lines.map((l) => (
            <div key={l.boqItemId} className="grid grid-cols-12 gap-2 items-center mb-2">
              <div className="col-span-7 text-sm">{n.lk.boq[l.boqItemId]?.description}<div className="text-[11px] text-muted">MB shows {qty(measured(l.boqItemId), n.lk.boq[l.boqItemId]?.unit)} · ₹{l.rate}</div></div>
              <div className="col-span-5"><NumberInput value={qtys[l.boqItemId] ?? ''} onChange={(v) => setQtys({ ...qtys, [l.boqItemId]: v })} suffix={n.lk.boq[l.boqItemId]?.unit} /></div>
            </div>
          ))}
        </Section>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Material recovery" hint={`Excess over norm in period ≈ ${inr(excess)} (LAB-12)`}><NumberInput value={mat} onChange={setMat} prefix="₹" /></Field>
          <Field label="Advance recovery"><NumberInput value={adv} onChange={setAdv} prefix="₹" /></Field>
          <Field label="Penalty"><NumberInput value={pen} onChange={setPen} prefix="₹" /></Field>
        </div>
        <KV cols={3} items={[['Gross', <Money key="g" v={c.gross} />], [`Retention ${wo.retentionPct}%`, <Money key="r" v={c.retention} />], [`TDS ${wo.tdsPct}%`, <Money key="t" v={c.tds} />]]} />
      </div>
    </Drawer>
  );
}

/* ================= Compliance (LAB-13) ================= */
function ComplianceTab() {
  const db = useDB();
  const rows = db.subcons;
  const exp = (d?: string) => (d ? daysBetween(today(), d) : null);
  return (
    <DataTable
      title="Labour compliance"
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: 'name', header: 'Contractor', primary: true, value: (r) => r.name, cell: (r) => <div>{r.name}<div className="text-[11px] text-muted">{r.kind === 'LABOUR_CONTRACTOR' ? 'Labour contractor' : 'Sub-contractor'}</div></div> },
        { key: 'lic', header: 'Labour licence', value: (r) => r.licenceNo || '', cell: (r) => r.licenceNo || '—' },
        { key: 'exp', header: 'Licence expiry', value: (r) => r.licenceExpiry || '', cell: (r) => { const d = exp(r.licenceExpiry); return r.licenceExpiry ? <span className="inline-flex items-center gap-2">{date(r.licenceExpiry)} {d! < 0 ? <Badge tone="bad">Expired</Badge> : d! <= 30 ? <Badge tone="warn">{d} days</Badge> : <Badge tone="good">Valid</Badge>}</span> : '—'; } },
        { key: 'pf', header: 'PF no.', value: (r) => r.pfNo || '—', hideMobile: true },
        { key: 'esi', header: 'ESI no.', value: (r) => r.esiNo || '—', hideMobile: true },
        { key: 'bocw', header: 'BOCW reg.', value: (r) => r.bocwNo || '—' },
        { key: 'pan', header: 'PAN', value: (r) => r.pan, hideMobile: true },
      ]}
    />
  );
}


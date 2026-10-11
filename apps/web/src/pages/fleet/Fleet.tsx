import { useMemo, useState } from 'react';
import { CircleCheck, Droplets, FileWarning, Fuel, Gauge, Plus, Route, Truck, Wrench } from 'lucide-react';
import { useDB, insert, update, nextNo } from '../../data/store';
import { useSession } from '../../data/session';
import { docExpiries, fuelEfficiency, fuelTankLedger, hireBills, lookup, meterOf, serviceDue, validateMeter, vehicleCost, vehicleEfficiencySummary, vehicleMeter } from '../../data/selectors';
import type { FuelIssue, JobCard, LogEntry, Vehicle } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, KV, Modal, PageHeader, Progress, Section, Stat, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { AttachField, Combo, DateRangePicker, Field, Input, NumberInput, Segmented, Select, Textarea, Toggle } from '../../components/ui/fields';
import { ColumnChart, LineChart } from '../../components/ui/charts';
import { addDays, date, dateShort, daysBetween, inr, inrCompact, monthLabel, num, today } from '../../lib/format';
import { cn, groupBy, round, sum } from '../../lib/utils';
import { DateRuleNote, entryDateRule, Money, useAutoOpen, useModuleTab, useNames, useNewParam, useQueryParam, useRange } from '../shared';

export default function Fleet() {
  const { tab, tabsEl } = useModuleTab('fleet');
  return (
    <div>
      <PageHeader title="Vehicles & machinery" subtitle="Where each machine worked, the fuel it took and should have taken, what it cost, and when its papers and services are due." tags={['FUEL-01…10', 'VEH-01…05', 'HIRE', 'MNT', 'DOC']} />
      {tabsEl}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'fuel' && <FuelTab />}
      {tab === 'tanks' && <TanksTab />}
      {tab === 'logbook' && <LogbookTab />}
      {tab === 'efficiency' && <EfficiencyTab />}
      {tab === 'hire' && <HireTab />}
      {tab === 'maintenance' && <MaintenanceTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'cost' && <CostTab />}
    </div>
  );
}

const vehicleOpts = (vs: Vehicle[]) => vs.map((v) => ({ value: v.id, label: `${v.code} — ${v.regNo}`, hint: `${v.type} · ${v.make} ${v.model}${v.ownership === 'HIRED' ? ' · hired' : ''}` }));
const unitOf = (v?: Vehicle) => (v?.meterType === 'HOURS' ? 'hrs' : 'km');

function useVehicles() {
  const db = useDB();
  const { siteId } = useSiteFilter();
  const s = useSession();
  return useMemo(() => db.vehicles.filter((v) => (s.allSites || !v.siteId || s.seesSite(v.siteId)) && (!siteId || v.siteId === siteId)), [db, siteId, s]);
}

/* ================= Overview ================= */
function OverviewTab() {
  const db = useDB();
  const n = useNames();
  const vs = useVehicles();
  const q = useQueryParam('v');
  const [view, setView] = useState<string | null>(q);
  const [status, setStatus] = useState('all');
  const eff = useMemo(() => Object.fromEntries(vehicleEfficiencySummary(db, { from: addDays(today(), -30), to: today() }).map((e) => [e.vehicleId, e])), [db]);
  const svc = useMemo(() => Object.fromEntries(serviceDue(db).map((x) => [x.vehicleId, x])), [db]);
  const docs = useMemo(() => groupBy(docExpiries(db).filter((d) => d.days <= 30), (d) => d.vehicleId), [db]);
  const shown = vs.filter((v) => status === 'all' || v.status === status || (status === 'HIRED' && v.ownership === 'HIRED'));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <Stat label="Working" value={vs.filter((v) => v.status === 'WORKING').length} tone="good" icon={<Truck className="w-[18px] h-[18px]" />} sub={`of ${vs.length} vehicles & machines`} />
        <Stat label="Idle" value={vs.filter((v) => v.status === 'IDLE').length} tone="warn" icon={<Gauge className="w-[18px] h-[18px]" />} />
        <Stat label="Breakdown" value={vs.filter((v) => v.status === 'BREAKDOWN').length} tone="bad" icon={<Wrench className="w-[18px] h-[18px]" />} />
        <Stat label="Papers due ≤ 30 days" value={Object.keys(docs).length} tone="violet" icon={<FileWarning className="w-[18px] h-[18px]" />} />
      </div>
      <Segmented value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'WORKING', label: 'Working' }, { value: 'IDLE', label: 'Idle' }, { value: 'BREAKDOWN', label: 'Breakdown' }, { value: 'HIRED', label: 'Hired' }]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 stagger">
        {shown.map((v) => {
          const e = eff[v.id];
          const sv = svc[v.id];
          return (
            <Card key={v.id} hover className="p-4 cursor-pointer" onClick={() => setView(v.id)}>
              <div className="flex items-start gap-3">
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', v.status === 'WORKING' ? 'bg-good-soft text-good' : v.status === 'IDLE' ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad')}>
                  <Truck className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold">{v.code}</span>
                    <StatusBadge status={v.status} />
                    {v.ownership === 'HIRED' && <Badge tone="violet">Hired</Badge>}
                  </div>
                  <div className="text-xs text-muted truncate">{v.regNo} · {v.make} {v.model}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div><div className="text-muted">Meter</div><div className="font-semibold num">{num(vehicleMeter(db, v.id))} {unitOf(v)}</div></div>
                <div><div className="text-muted">{v.meterType === 'HOURS' ? 'LPH' : 'KMPL'}</div><div className={cn('font-semibold num', e && e.variancePct > db.settings.tolerance.fuel && 'text-bad')}>{e ? e.actual.toFixed(2) : '—'} <span className="text-muted font-normal">/ {v.stdKmpl || v.stdLph}</span></div></div>
                <div><div className="text-muted">Site</div><div className="font-semibold truncate">{n.site(v.siteId)}</div></div>
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                {sv && sv.status !== 'OK' && <Badge tone={sv.status === 'OVERDUE' ? 'bad' : 'warn'}>Service {sv.status.toLowerCase()}</Badge>}
                {(docs[v.id] || []).slice(0, 2).map((d) => <Badge key={d.type} tone={d.days < 0 ? 'bad' : 'warn'}>{d.type} {d.days < 0 ? 'expired' : `${d.days}d`}</Badge>)}
              </div>
            </Card>
          );
        })}
      </div>
      {view && <VehicleDrawer id={view} onClose={() => setView(null)} />}
    </div>
  );
}

function VehicleDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const s = useSession();
  const v = db.vehicles.find((x) => x.id === id)!;
  const fills = fuelEfficiency(db).filter((e) => e.vehicleId === id).slice(-12);
  const cost = vehicleCost(db, { from: addDays(today(), -29), to: today() }).find((c) => c.vehicleId === id)!;
  const sv = serviceDue(db).find((x) => x.vehicleId === id)!;
  const [st, setSt] = useState(v.status);
  return (
    <Drawer open onClose={onClose} title={`${v.code} · ${v.regNo}`} subtitle={`${v.type} · ${v.make} ${v.model} (${v.year}) · ${v.ownership === 'HIRED' ? `hired from ${v.ownerName}` : 'owned'}`} width="max-w-3xl">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={st} onChange={(x) => (setSt(x), update('vehicles', v.id, { status: x }, `${v.code} status → ${x}`, 'Vehicle'), toast.success('Status updated'))} options={[{ value: 'WORKING', label: 'Working' }, { value: 'IDLE', label: 'Idle' }, { value: 'BREAKDOWN', label: 'Breakdown' }]} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3"><div className="text-[11px] text-muted">Meter</div><div className="font-bold num">{num(vehicleMeter(db, id))} {unitOf(v)}</div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">Next service in</div><div className={cn('font-bold num', sv.left <= 0 && 'text-bad')}>{num(sv.left)} {unitOf(v)}</div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">Cost (30 days)</div><div className="font-bold"><Money v={cost.total} compact /></div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">Availability</div><div className="font-bold">{cost.availability.toFixed(1)}%</div></Card>
        </div>
        {fills.length > 1 && (
          <Section title={`Fuel efficiency between full-tank fills (${v.meterType === 'HOURS' ? 'LPH' : 'KMPL'})`}>
            <LineChart data={fills.map((f) => ({ label: dateShort(f.to), values: { a: f.actual } }))} series={[{ key: 'a', label: 'Actual' }]} height={170} format={(x) => x.toFixed(1)} refLine={{ value: fills[0]!.standard, label: `Standard ${fills[0]!.standard}` }} />
          </Section>
        )}
        <KV items={[['Driver / operator', v.driver], ['Site', n.site(v.siteId)], ['Fuel / tank', `${v.fuelType} · ${v.tankCapacity} L`], ['Standard', v.meterType === 'HOURS' ? `${v.stdLph} LPH` : `${v.stdKmpl} KMPL`], ['Hire terms', v.ownership === 'HIRED' ? `₹${v.hireRate} ${v.hireBasis?.replace('PER_', 'per ').toLowerCase()}${v.minGuaranteedHours ? `, min ${v.minGuaranteedHours} h/month` : ''}${v.hireWithFuel ? ', with fuel' : ', without fuel'}` : '—'], ['Internal hire rate (VEH-05)', s.showRates ? `₹${v.internalRate} per ${unitOf(v).replace('s', '')}` : '••••']]} />
        <Section title="Documents (DOC-01)">
          <div className="rounded-xl border border-line divide-y divide-line">
            {v.docs.map((d) => {
              const days = daysBetween(today(), d.expiry);
              return (
                <div key={d.type} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{d.type}<span className="text-[11px] text-muted ml-2 font-mono">{d.number}</span></span>
                  <span className="flex items-center gap-2">{date(d.expiry)} <Badge tone={days < 0 ? 'bad' : days <= 7 ? 'bad' : days <= 30 ? 'warn' : 'good'}>{days < 0 ? 'Expired' : `${days}d`}</Badge></span>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </Drawer>
  );
}

/* ================= Fuel issue (FUEL-04/05/06) ================= */
function FuelTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.fuelIssues.filter((f) => s.seesSite(f.siteId) && (!siteId || f.siteId === siteId)).slice().reverse(), [db, s, siteId]);
  return (
    <>
      <DataTable
        title="Fuel issue register"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('fleet', 'add') && <Button variant="primary" icon={<Fuel className="w-4 h-4" />} onClick={() => setForm(true)}>Issue fuel</Button>}
        rowClassName={(r) => (r.flag ? 'bg-bad-soft/40' : undefined)}
        columns={[
          { key: 'no', header: 'Slip', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{date(r.date)} {r.time}</div></div> },
          { key: 'veh', header: 'Vehicle', value: (r) => n.veh(r.vehicleId), cell: (r) => <div>{n.veh(r.vehicleId)}<div className="text-[11px] text-muted">{r.driver}</div></div> },
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'src', header: 'Source', value: (r) => n.lk.fuelSource[r.sourceId]?.code, cell: (r) => <Badge tone={n.lk.fuelSource[r.sourceId]?.type === 'OUTSIDE_PUMP' ? 'violet' : 'neutral'}>{n.lk.fuelSource[r.sourceId]?.code}</Badge>, hideMobile: true },
          { key: 'litres', header: 'Litres', align: 'right', value: (r) => r.litres, cell: (r) => <b>{num(r.litres)} L</b> },
          { key: 'meter', header: 'Meter', align: 'right', value: (r) => meterOf(r), cell: (r) => <span>{num(meterOf(r), 1)} {r.odometer !== undefined ? 'km' : 'h'}</span> },
          { key: 'full', header: 'Fill', value: (r) => (r.fullTank ? 'Full' : 'Partial'), cell: (r) => (r.fullTank ? <Badge tone="info">Full</Badge> : <Badge>Partial</Badge>), hideMobile: true },
          { key: 'amt', header: 'Amount', align: 'right', rate: true, value: (r) => Math.round(r.litres * r.rate), cell: (r) => inr(r.litres * r.rate) },
          { key: 'st', header: 'Status', value: (r) => r.status, cell: (r) => (r.flag ? <span title={r.flag}><Badge tone="bad">⚠ {r.flag}</Badge></span> : <StatusBadge status={r.status} />) },
        ]}
      />
      {form && <FuelForm onClose={() => setForm(false)} />}
    </>
  );
}

function FuelForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const vs = useVehicles();
  const [vid, setVid] = useState('');
  const v = lk.vehicle[vid];
  const [d, setD] = useState(today());
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [site, setSite] = useState('');
  const [src, setSrc] = useState('');
  const [litres, setLitres] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>(92.1);
  const [reading, setReading] = useState<number | ''>('');
  const [full, setFull] = useState(true);
  const [photos, setPhotos] = useState(0);
  const pick = (id: string) => {
    setVid(id);
    const x = lk.vehicle[id]!;
    setSite(x.siteId || 's1');
    setSrc(db.fuelSources.find((f) => f.siteId === x.siteId)?.id || 'fs1');
    setReading('');
  };
  const warn = v && reading !== '' ? validateMeter(db, vid, Number(reading), d) : null;
  const last = v ? vehicleMeter(db, vid) : 0;
  const rule = entryDateRule(db, d, s.isAdmin);
  const source = lk.fuelSource[src];
  const amount = Number(litres || 0) * Number(rate || 0);
  const save = () => {
    if (rule.error) return toast.error(rule.error);
    if (!v || !litres || reading === '' || !site || !src) return toast.error('Vehicle, litres, meter reading, site and source are required');
    if (Number(litres) > v.tankCapacity * 1.05) return toast.error(`More than tank capacity (${v.tankCapacity} L)`);
    const status: FuelIssue['status'] = warn || rule.needsApproval || amount > db.settings.approvalLimits.fuel ? 'PENDING' : 'APPROVED';
    const no = nextNo('FIS', d);
    insert('fuelIssues', { no, date: d, time, vehicleId: vid, driver: v.driver, siteId: site, sourceId: src, litres: Number(litres), rate: Number(rate), odometer: v.meterType !== 'HOURS' ? Number(reading) : undefined, hourMeter: v.meterType === 'HOURS' ? Number(reading) : undefined, fullTank: full, slipPhoto: photos > 0, meterPhoto: photos > 1, status, flag: warn || undefined } as any, `Fuel issue ${no} ${v.code} ${litres} L`, 'Fuel issue');
    toast[warn ? 'warn' : 'success'](`${no} saved`, warn ? `Flagged: ${warn} (FUEL-06)` : source?.type === 'OUTSIDE_PUMP' ? `Posted to ${lk.supplier[source.supplierId!]?.name} credit ledger (FUEL-05)` : 'Fuel tank stock reduced');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Fuel load" subtitle="FUEL-04 · reading must be more than the last one; odd jumps are flagged" footer={<><span className="mr-auto text-sm">Amount <b><Money v={amount} /></b></span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Vehicle / machine" required><Combo value={vid} onChange={pick} options={vehicleOpts(vs)} /></Field>
        {v && <Callout>Driver <b>{v.driver}</b> · tank {v.tankCapacity} L · standard {v.meterType === 'HOURS' ? `${v.stdLph} LPH` : `${v.stdKmpl} KMPL`} · last reading <b>{num(last, 1)} {unitOf(v)}</b></Callout>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Site where it is working" required><Select value={site} onChange={setSite} options={db.sites.filter((x) => s.seesSite(x.id)).map((x) => ({ value: x.id, label: x.short }))} /></Field>
          <Field label="Fuel source" required><Select value={src} onChange={setSrc} options={db.fuelSources.map((f) => ({ value: f.id, label: `${f.code} — ${f.type === 'OUTSIDE_PUMP' ? 'outside pump' : f.type === 'BOWSER' ? 'bowser' : 'own tank'}` }))} /></Field>
          <Field label="Litres" required><NumberInput value={litres} onChange={setLitres} suffix="L" /></Field>
          <Field label="Rate"><NumberInput value={rate} onChange={setRate} prefix="₹" /></Field>
          <Field label={v?.meterType === 'HOURS' ? 'Hour meter at fill' : 'Odometer at fill'} required error={warn} className="col-span-2">
            <NumberInput value={reading} onChange={setReading} suffix={unitOf(v)} placeholder={last ? `> ${num(last, 1)}` : ''} />
          </Field>
        </div>
        <Toggle checked={full} onChange={setFull} label="Full tank" hint="Efficiency is calculated between two full-tank fills (FUEL-07)" />
        <AttachField count={photos} onChange={setPhotos} label="Pump slip & meter photo" />
        <DateRuleNote date={d} />
      </div>
    </Drawer>
  );
}

/* ================= Tanks & bowsers (FUEL-01/02/03) ================= */
function TanksTab() {
  const db = useDB();
  const s = useSession();
  const tanks = db.fuelSources.filter((f) => f.type !== 'OUTSIDE_PUMP');
  const [src, setSrc] = useState(tanks[0]!.id);
  const [buy, setBuy] = useState(false);
  const [dip, setDip] = useState(false);
  const rows = useMemo(() => fuelTankLedger(db, src).slice().reverse(), [db, src]);
  const bal = rows[0]?.balance || 0;
  const tank = tanks.find((t) => t.id === src)!;
  const lastDip = rows.find((r) => r.dip !== undefined);
  const [litres, setLitres] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>(91.6);
  const [inv, setInv] = useState('');
  const [dipL, setDipL] = useState<number | ''>('');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Segmented value={src} onChange={setSrc} options={tanks.map((t) => ({ value: t.id, label: t.code }))} />
        <div className="flex-1" />
        {s.can('fleet', 'add') && (
          <>
            <Button icon={<Droplets className="w-4 h-4" />} onClick={() => setDip(true)}>Dip reading</Button>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setBuy(true)}>Fuel purchase</Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-1">
          <div className="text-sm font-semibold">{tank.name}</div>
          <div className="text-xs text-muted">{tank.type === 'BOWSER' ? 'Mobile bowser — moves between sites (FUEL-03)' : 'Own fuel tank'}</div>
          <div className="flex items-end gap-4 mt-4">
            <div className="relative w-20 h-36 rounded-2xl border-2 border-line-strong overflow-hidden bg-surface-2">
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-1000" style={{ height: `${Math.min(100, (bal / tank.capacity) * 100)}%` }} />
            </div>
            <div>
              <div className="text-3xl font-bold num">{num(bal)} L</div>
              <div className="text-xs text-muted">of {num(tank.capacity)} L capacity</div>
              {lastDip && (
                <div className="mt-2 text-xs">
                  Last dip <b>{num(lastDip.dip)} L</b> ({date(lastDip.date)})
                  <div className={cn('font-semibold', Math.abs(lastDip.variance || 0) > bal * 0.02 ? 'text-bad' : 'text-good')}>Book vs dip: {(lastDip.variance || 0) > 0 ? '+' : ''}{num(lastDip.variance, 1)} L</div>
                </div>
              )}
            </div>
          </div>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader title="Book vs dip — last 30 days" subtitle="FUEL-02 · variance between book balance and physical dip" />
          <div className="px-4 pb-4">
            <LineChart
              height={180}
              format={(x) => `${num(x)} L`}
              data={rows.filter((r) => r.dip !== undefined).slice(0, 30).reverse().map((r) => ({ label: dateShort(r.date), values: { book: r.balance, dip: r.dip || 0 } }))}
              series={[{ key: 'book', label: 'Book balance' }, { key: 'dip', label: 'Dip reading' }]}
            />
          </div>
        </Card>
      </div>
      <DataTable
        title={`Fuel stock ledger — ${tank.code}`}
        rows={rows}
        rowKey={(r, i) => `${r.ref}-${i}`}
        columns={[
          { key: 'date', header: 'Date', primary: true, value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'type', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.type === 'Purchase' ? 'good' : r.type === 'Opening' ? 'neutral' : 'brand'}>{r.type}</Badge> },
          { key: 'ref', header: 'Reference', value: (r) => r.ref },
          { key: 'in', header: 'In (L)', align: 'right', value: (r) => r.inL, cell: (r) => (r.inL ? <span className="text-good">+{num(r.inL)}</span> : '') },
          { key: 'out', header: 'Out (L)', align: 'right', value: (r) => r.outL, cell: (r) => (r.outL ? num(r.outL) : '') },
          { key: 'bal', header: 'Book', align: 'right', value: (r) => r.balance, cell: (r) => <b>{num(r.balance)}</b> },
          { key: 'dip', header: 'Dip', align: 'right', value: (r) => r.dip ?? '', cell: (r) => (r.dip !== undefined ? num(r.dip) : '') },
          { key: 'var', header: 'Variance', align: 'right', value: (r) => r.variance ?? '', cell: (r) => (r.variance !== undefined ? <span className={Math.abs(r.variance) > r.balance * 0.02 ? 'text-bad font-semibold' : 'text-muted'}>{r.variance > 0 ? '+' : ''}{num(r.variance, 1)}</span> : '') },
        ]}
      />
      <Drawer open={buy} onClose={() => setBuy(false)} title="Fuel purchase into tank" subtitle="FUEL-01 · supplier, litres, rate, invoice, dip before / after" footer={<><Button onClick={() => setBuy(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (!litres) return toast.error('Litres required'); insert('fuelPurchases', { no: nextNo('FPR'), date: today(), sourceId: src, supplierId: 'sp14', litres: Number(litres), rate: Number(rate), invoiceNo: inv, dipBefore: Math.round(bal), dipAfter: Math.round(bal + Number(litres)) } as any, `Fuel purchase ${litres} L into ${tank.code}`, 'Fuel purchase'); setBuy(false); toast.success('Purchase recorded'); }}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Litres" required><NumberInput value={litres} onChange={setLitres} suffix="L" /></Field>
          <Field label="Rate"><NumberInput value={rate} onChange={setRate} prefix="₹" /></Field>
          <Field label="Supplier invoice"><Input value={inv} onChange={(e) => setInv(e.target.value)} /></Field>
          <Field label="Dip before"><Input disabled value={`${num(bal)} L`} /></Field>
        </div>
      </Drawer>
      <Modal open={dip} onClose={() => setDip(false)} title={`Daily dip — ${tank.code}`} footer={<><Button onClick={() => setDip(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (dipL === '') return; insert('dips', { date: today(), sourceId: src, litres: Number(dipL) } as any, `Dip ${tank.code} ${dipL} L`, 'Dip reading'); setDip(false); toast.success('Dip saved', `Variance ${num(Number(dipL) - bal, 1)} L vs book`); }}>Save</Button></>}>
        <Field label="Dip reading (litres)" hint={`Book balance ${num(bal)} L`}><NumberInput value={dipL} onChange={setDipL} suffix="L" /></Field>
      </Modal>
    </div>
  );
}

/* ================= Logbook (VEH-01/02) ================= */
function LogbookTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.logs.filter((l) => s.seesSite(l.siteId) && (!siteId || l.siteId === siteId || l.split?.some((x) => x.siteId === siteId))).slice().reverse(), [db, s, siteId]);
  return (
    <>
      <DataTable
        title="Vehicle & machine logbook"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('fleet', 'add') && <Button variant="primary" icon={<Route className="w-4 h-4" />} onClick={() => setForm(true)}>Log entry</Button>}
        columns={[
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'veh', header: 'Vehicle', primary: true, value: (r) => n.veh(r.vehicleId), cell: (r) => <div>{n.veh(r.vehicleId)}<div className="text-[11px] text-muted">{r.driver}</div></div> },
          { key: 'site', header: 'Site(s)', value: (r) => n.site(r.siteId), cell: (r) => (r.split ? <span className="text-[13px]">{r.split.map((x) => `${n.site(x.siteId)} ${Math.round(x.share * 100)}%`).join(' / ')}</span> : n.site(r.siteId)) },
          { key: 'run', header: 'Run', align: 'right', value: (r) => (r.closeKm ?? r.closeHr ?? 0) - (r.openKm ?? r.openHr ?? 0), cell: (r) => (r.openKm !== undefined ? `${num((r.closeKm || 0) - r.openKm)} km` : `${num((r.closeHr || 0) - (r.openHr || 0), 1)} h`) },
          { key: 'trips', header: 'Trips', align: 'right', value: (r) => r.trips },
          { key: 'route', header: 'Route / material', value: (r) => `${r.route} ${r.material || ''}`, cell: (r) => <span className="text-[13px]">{r.route}{r.material ? ` · ${r.material} ${num(r.materialQty, 1)}` : ''}</span>, hideMobile: true },
          { key: 'idle', header: 'Idle', align: 'right', value: (r) => r.idleHours, cell: (r) => (r.idleHours ? <span title={r.idleReason}>{r.idleHours} h {r.idleReason && <span className="text-[11px] text-muted">({r.idleReason})</span>}</span> : '—') },
        ]}
      />
      {form && <LogForm onClose={() => setForm(false)} />}
    </>
  );
}

function LogForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const vs = useVehicles();
  const [vid, setVid] = useState('');
  const v = lk.vehicle[vid];
  const [d, setD] = useState(addDays(today(), -1));
  const [site, setSite] = useState('');
  const [open, setOpen] = useState<number | ''>('');
  const [close, setClose] = useState<number | ''>('');
  const [trips, setTrips] = useState<number | ''>(0);
  const [routeTxt, setRouteTxt] = useState('');
  const [mat, setMat] = useState('');
  const [matQty, setMatQty] = useState<number | ''>('');
  const [idle, setIdle] = useState<number | ''>(0);
  const [reason, setReason] = useState<LogEntry['idleReason']>('');
  const [split, setSplit] = useState(false);
  const [site2, setSite2] = useState('');
  const [share, setShare] = useState<number | ''>(50);
  const pick = (id: string) => {
    setVid(id);
    const x = lk.vehicle[id]!;
    setSite(x.siteId || 's1');
    const m = vehicleMeter(db, id);
    setOpen(round(m, 1));
    setClose('');
  };
  const rule = entryDateRule(db, d, s.isAdmin);
  const run = close !== '' && open !== '' ? Number(close) - Number(open) : 0;
  const save = () => {
    if (rule.error) return toast.error(rule.error);
    if (!v || open === '' || close === '') return toast.error('Vehicle and opening / closing readings are required');
    if (Number(close) < Number(open)) return toast.error('Closing reading cannot be less than opening');
    const isHr = v.meterType === 'HOURS';
    const rec: Partial<LogEntry> = { date: d, vehicleId: vid, siteId: site, driver: v.driver, trips: Number(trips) || 0, route: routeTxt || 'Within site', material: mat || undefined, materialQty: Number(matQty) || undefined, idleHours: Number(idle) || 0, idleReason: reason || undefined, ...(isHr ? { openHr: Number(open), closeHr: Number(close) } : { openKm: Number(open), closeKm: Number(close) }), split: split && site2 ? [{ siteId: site, share: Number(share) / 100 }, { siteId: site2, share: 1 - Number(share) / 100 }] : undefined };
    insert('logs', rec as any, `Logbook ${v.code} ${d}`, 'Logbook');
    toast.success('Logbook saved', split ? 'Cost split between the two sites (VEH-02)' : undefined);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Daily logbook" subtitle="VEH-01 · opening/closing km or hours, trips, material carried, idle hours" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Vehicle / machine" required><Combo value={vid} onChange={pick} options={vehicleOpts(vs)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Site"><Select value={site} onChange={setSite} options={db.sites.filter((x) => s.seesSite(x.id)).map((x) => ({ value: x.id, label: x.short }))} /></Field>
          <Field label={`Opening ${unitOf(v)}`} required><NumberInput value={open} onChange={setOpen} /></Field>
          <Field label={`Closing ${unitOf(v)}`} required hint={run ? `${num(run, 1)} ${unitOf(v)} today` : undefined}><NumberInput value={close} onChange={setClose} /></Field>
          <Field label="Trips"><NumberInput value={trips} onChange={setTrips} /></Field>
          <Field label="From → to"><Input value={routeTxt} onChange={(e) => setRouteTxt(e.target.value)} placeholder="HMP → Ch 14+200" /></Field>
          <Field label="Material carried"><Input value={mat} onChange={(e) => setMat(e.target.value)} placeholder="DBM / GSB / earth" /></Field>
          <Field label="Quantity"><NumberInput value={matQty} onChange={setMatQty} suffix="MT/cum" /></Field>
          <Field label="Idle hours"><NumberInput value={idle} onChange={setIdle} suffix="h" /></Field>
          <Field label="Idle reason"><Select value={reason || ''} onChange={(x) => setReason(x as LogEntry['idleReason'])} options={[{ value: '', label: '—' }, ...['Breakdown', 'No work', 'Rain', 'No operator'].map((x) => ({ value: x, label: x }))]} /></Field>
        </div>
        <Toggle checked={split} onChange={setSplit} label="Worked at two sites today" hint="Hours / km and cost are split in this ratio (VEH-02)" />
        {split && (
          <div className="grid grid-cols-2 gap-4 anim-pop">
            <Field label="Second site"><Select value={site2} onChange={setSite2} placeholder="Choose" options={db.sites.filter((x) => x.id !== site).map((x) => ({ value: x.id, label: x.short }))} /></Field>
            <Field label={`Share at ${lk.site[site]?.short}`}><NumberInput value={share} onChange={setShare} suffix="%" /></Field>
          </div>
        )}
        <DateRuleNote date={d} />
      </div>
    </Drawer>
  );
}

/* ================= Efficiency (FUEL-07..10) ================= */
function EfficiencyTab() {
  const db = useDB();
  const n = useNames();
  const vs = useVehicles();
  const [range, setRange] = useRange('30d');
  const [by, setBy] = useState<'vehicle' | 'fills' | 'month'>('vehicle');
  const summary = useMemo(() => vehicleEfficiencySummary(db, range).filter((e) => vs.some((v) => v.id === e.vehicleId)), [db, range, vs]);
  const fills = useMemo(() => fuelEfficiency(db).filter((e) => e.to >= range.from && e.to <= range.to && vs.some((v) => v.id === e.vehicleId)).slice().reverse(), [db, range, vs]);
  const monthly = useMemo(() => {
    const g = groupBy(db.fuelIssues.filter((f) => vs.some((v) => v.id === f.vehicleId)), (f) => f.date.slice(0, 7));
    return Object.entries(g).sort().map(([m, l]) => ({ label: monthLabel(m), values: { l: sum(l, (f) => f.litres) } }));
  }, [db, vs]);
  const tol = db.settings.tolerance.fuel;
  return (
    <div className="space-y-4">
      <Callout>
        Efficiency is worked out between two full-tank fills: <b>KMPL = km run ÷ litres filled</b>, <b>LPH = litres ÷ engine hours</b>. Expected fuel = km ÷ standard KMPL, or hours × standard LPH. Variance above {tol}% raises an alert to the owner (FUEL-07/08).
      </Callout>
      <div className="flex flex-wrap gap-2 items-center">
        <Segmented value={by} onChange={setBy} options={[{ value: 'vehicle', label: 'By vehicle' }, { value: 'fills', label: 'Fill-to-fill' }, { value: 'month', label: 'Monthly trend' }]} />
        <div className="flex-1" />
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      {by === 'vehicle' && (
        <>
          <Card>
            <CardHeader title="Variance vs standard (%)" subtitle={`Above ${tol}% is flagged`} />
            <div className="px-4 pb-4">
              <ColumnChart data={summary.slice().sort((a, b) => b.variancePct - a.variancePct).map((e) => ({ label: n.lk.vehicle[e.vehicleId]?.code || '', values: { v: round(Math.max(0, e.variancePct), 1) } }))} series={[{ key: 'v', label: 'Over standard %', color: 'var(--s2)' }]} height={200} format={(x) => `${x.toFixed(0)}%`} />
            </div>
          </Card>
          <DataTable
            title="Fuel consumption vs standard"
            rows={summary}
            rowKey={(r) => r.vehicleId}
            initialSort={{ key: 'pct', dir: 'desc' }}
            rowClassName={(r) => (r.variancePct > tol ? 'bg-bad-soft/40' : undefined)}
            columns={[
              { key: 'veh', header: 'Vehicle', primary: true, value: (r) => n.veh(r.vehicleId), cell: (r) => <div>{n.veh(r.vehicleId)}<div className="text-[11px] text-muted">{n.lk.vehicle[r.vehicleId]?.type} · {n.lk.vehicle[r.vehicleId]?.driver}</div></div> },
              { key: 'run', header: 'Run', align: 'right', value: (r) => round(r.run, 1), cell: (r) => `${num(r.run)} ${r.unit === 'KMPL' ? 'km' : 'h'}` },
              { key: 'litres', header: 'Litres', align: 'right', value: (r) => round(r.litres, 1), cell: (r) => num(r.litres) },
              { key: 'actual', header: 'Actual', align: 'right', value: (r) => round(r.actual, 2), cell: (r) => `${r.actual.toFixed(2)} ${r.unit}` },
              { key: 'std', header: 'Standard', align: 'right', value: (r) => r.standard, cell: (r) => `${r.standard} ${r.unit}` },
              { key: 'exp', header: 'Expected L', align: 'right', value: (r) => round(r.expected, 1), cell: (r) => num(r.expected), hideMobile: true },
              { key: 'var', header: 'Variance L', align: 'right', value: (r) => round(r.variance, 1), cell: (r) => <span className={r.variance > 0 ? 'text-bad' : 'text-good'}>{r.variance > 0 ? '+' : ''}{num(r.variance)}</span> },
              { key: 'pct', header: 'Variance %', align: 'right', value: (r) => round(r.variancePct, 1), cell: (r) => <Badge tone={r.variancePct > tol ? 'bad' : r.variancePct > tol / 2 ? 'warn' : 'good'}>{r.variancePct > 0 ? '+' : ''}{r.variancePct.toFixed(1)}%</Badge> },
              { key: 'val', header: 'Variance ₹', align: 'right', rate: true, value: (r) => Math.round(r.varianceValue), cell: (r) => inr(r.varianceValue) },
            ]}
          />
        </>
      )}
      {by === 'fills' && (
        <DataTable
          title="Fill-to-fill efficiency"
          rows={fills}
          rowKey={(r, i) => `${r.vehicleId}-${r.to}-${i}`}
          columns={[
            { key: 'veh', header: 'Vehicle', primary: true, value: (r) => n.veh(r.vehicleId) },
            { key: 'period', header: 'Between fills', value: (r) => r.to, cell: (r) => `${date(r.from)} → ${date(r.to)}` },
            { key: 'run', header: 'Run', align: 'right', value: (r) => r.run, cell: (r) => `${num(r.run, 1)} ${r.unit === 'KMPL' ? 'km' : 'h'}` },
            { key: 'litres', header: 'Litres', align: 'right', value: (r) => r.litres },
            { key: 'actual', header: 'Actual', align: 'right', value: (r) => r.actual, cell: (r) => `${r.actual} ${r.unit}` },
            { key: 'pct', header: 'Variance', align: 'right', value: (r) => round(r.variancePct, 1), cell: (r) => <span className={r.variancePct > tol ? 'text-bad font-semibold' : ''}>{r.variancePct > 0 ? '+' : ''}{r.variancePct.toFixed(1)}%</span> },
          ]}
        />
      )}
      {by === 'month' && (
        <Card>
          <CardHeader title="Fuel issued per month (litres)" subtitle="FUEL-10 · consumption trend" />
          <div className="px-4 pb-4"><ColumnChart data={monthly} series={[{ key: 'l', label: 'Litres' }]} height={240} format={(x) => num(x)} /></div>
        </Card>
      )}
    </div>
  );
}

/* ================= Hire (HIRE-01/02) ================= */
function HireTab() {
  const db = useDB();
  const n = useNames();
  const rows = useMemo(() => hireBills(db).slice().reverse(), [db]);
  const hired = db.vehicles.filter((v) => v.ownership === 'HIRED');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 stagger">
        {hired.map((v) => (
          <Card key={v.id} className="p-4">
            <div className="font-semibold">{v.code} <span className="text-xs text-muted font-normal">{v.type}</span></div>
            <div className="text-xs text-muted">{v.ownerName}</div>
            <div className="mt-2 text-sm">
              <Money v={v.hireRate || 0} /> <span className="text-muted">{v.hireBasis?.replace('PER_', 'per ').toLowerCase()}</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge>{v.hireWithFuel ? 'With fuel' : 'Without fuel'}</Badge>
              {v.minGuaranteedHours && <Badge tone="info">Min {v.minGuaranteedHours} h / month</Badge>}
            </div>
          </Card>
        ))}
      </div>
      <DataTable
        title="Hire bills from logbook"
        subtitle="HIRE-02 · computed from logbook & terms, less fuel supplied by us; posted to owner ledger and charged to sites"
        rows={rows}
        rowKey={(r) => `${r.vehicleId}-${r.month}`}
        columns={[
          { key: 'veh', header: 'Vehicle', primary: true, value: (r) => r.vehicleCode, cell: (r) => <div>{r.vehicleCode}<div className="text-[11px] text-muted">{n.sup(r.supplierId)}</div></div> },
          { key: 'month', header: 'Month', value: (r) => r.month, cell: (r) => monthLabel(r.month) },
          { key: 'basis', header: 'Basis', value: (r) => r.basis.replace('PER_', 'per ').toLowerCase(), hideMobile: true },
          { key: 'units', header: 'Logged', align: 'right', value: (r) => r.units },
          { key: 'billed', header: 'Billed units', align: 'right', value: (r) => r.billedUnits, cell: (r) => <span>{num(r.billedUnits, 2)}{r.billedUnits > r.units + 0.01 && <Badge tone="warn" className="ml-1">min guarantee</Badge>}</span> },
          { key: 'gross', header: 'Gross', align: 'right', rate: true, value: (r) => Math.round(r.gross), cell: (r) => inr(r.gross) },
          { key: 'fuel', header: 'Less fuel', align: 'right', rate: true, value: (r) => Math.round(r.fuelDeduction), cell: (r) => (r.fuelDeduction ? `−${inr(r.fuelDeduction)}` : '—') },
          { key: 'net', header: 'Net', align: 'right', rate: true, value: (r) => Math.round(r.net), cell: (r) => <b>{inr(r.net)}</b> },
          { key: 'sites', header: 'Charged to', value: (r) => Object.keys(r.bySite).map((x) => n.site(x)).join(', '), hideMobile: true },
        ]}
      />
    </div>
  );
}

/* ================= Maintenance (MNT-01..04) ================= */
function MaintenanceTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [view, setView] = useState<'schedule' | 'jobs' | 'tyres'>('schedule');
  const [form, setForm] = useState(false);
  const svc = useMemo(() => serviceDue(db), [db]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Segmented value={view} onChange={setView} options={[{ value: 'schedule', label: 'Service schedule' }, { value: 'jobs', label: 'Job cards' }, { value: 'tyres', label: 'Tyres & batteries' }]} />
        <div className="flex-1" />
        {s.can('fleet', 'add') && <Button variant="primary" icon={<Wrench className="w-4 h-4" />} onClick={() => setForm(true)}>New job card</Button>}
      </div>
      {view === 'schedule' && (
        <DataTable
          title="Service schedule"
          rows={svc}
          rowKey={(r) => r.vehicleId}
          initialSort={{ key: 'left', dir: 'asc' }}
          columns={[
            { key: 'veh', header: 'Vehicle', primary: true, value: (r) => n.veh(r.vehicleId), cell: (r) => <div>{n.veh(r.vehicleId)}<div className="text-[11px] text-muted">{n.lk.vehicle[r.vehicleId]?.type}</div></div> },
            { key: 'every', header: 'Interval', align: 'right', value: (r) => n.lk.vehicle[r.vehicleId]?.serviceEvery || 0, cell: (r) => `every ${num(n.lk.vehicle[r.vehicleId]?.serviceEvery)} ${unitOf(n.lk.vehicle[r.vehicleId])}` },
            { key: 'since', header: 'Since last', align: 'right', value: (r) => r.since, cell: (r) => `${num(r.since)} ${unitOf(n.lk.vehicle[r.vehicleId])}` },
            { key: 'bar', header: 'Used', sortable: false, cell: (r) => <div className="w-28"><Progress value={(r.since / (n.lk.vehicle[r.vehicleId]?.serviceEvery || 1)) * 100} tone={r.status === 'OVERDUE' ? 'bad' : r.status === 'DUE SOON' ? 'warn' : 'good'} thin /></div>, hideMobile: true },
            { key: 'left', header: 'Due in', align: 'right', value: (r) => r.left, cell: (r) => <span className={r.left <= 0 ? 'text-bad font-semibold' : ''}>{num(r.left)} {unitOf(n.lk.vehicle[r.vehicleId])}</span> },
            { key: 'st', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
      {view === 'jobs' && (
        <DataTable
          title="Job cards"
          rows={db.jobCards.slice().reverse()}
          rowKey={(r) => r.id}
          columns={[
            { key: 'no', header: 'Job card', primary: true, value: (r) => r.no, cell: (r) => <div><span className="font-mono text-[13px]">{r.no}</span><div className="text-[11px] text-muted">{date(r.date)}</div></div> },
            { key: 'veh', header: 'Vehicle', value: (r) => n.veh(r.vehicleId) },
            { key: 'type', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.type === 'BREAKDOWN' ? 'bad' : r.type === 'SERVICE' ? 'info' : 'warn'}>{r.type.toLowerCase()}</Badge> },
            { key: 'complaint', header: 'Complaint / work done', value: (r) => `${r.complaint} ${r.workDone}`, cell: (r) => <div className="text-[13px]">{r.complaint}<div className="text-[11px] text-muted">{r.workDone}</div></div> },
            { key: 'down', header: 'Downtime', align: 'right', value: (r) => r.downtimeHours, cell: (r) => `${r.downtimeHours} h` },
            { key: 'cost', header: 'Cost', align: 'right', rate: true, value: (r) => r.sparesCost + r.labourCost, cell: (r) => inr(r.sparesCost + r.labourCost) },
            { key: 'st', header: 'Status', value: (r) => (r.closed ? 'Closed' : 'Open'), cell: (r) => (r.closed ? <Badge tone="good">Closed</Badge> : <Badge tone="bad">Open</Badge>) },
          ]}
        />
      )}
      {view === 'tyres' && (
        <DataTable
          title="Tyre & battery register"
          rows={db.tyres.slice().reverse()}
          rowKey={(r) => r.id}
          columns={[
            { key: 'veh', header: 'Vehicle', primary: true, value: (r) => n.veh(r.vehicleId) },
            { key: 'kind', header: 'Item', value: (r) => r.kind, cell: (r) => <Badge>{r.kind.toLowerCase()}</Badge> },
            { key: 'serial', header: 'Serial no.', value: (r) => r.serial, cell: (r) => <span className="font-mono text-xs">{r.serial}</span> },
            { key: 'pos', header: 'Position', value: (r) => r.position },
            { key: 'fit', header: 'Fitted', value: (r) => r.fitDate, cell: (r) => `${date(r.fitDate)} @ ${num(r.meterAtFit)}` },
            { key: 'removed', header: 'Removed', value: (r) => r.removedDate || '', cell: (r) => (r.removedDate ? `${date(r.removedDate)} @ ${num(r.removedMeter)} · ${r.reason}` : <Badge tone="good">In use</Badge>) },
            { key: 'cost', header: 'Cost', align: 'right', rate: true, value: (r) => r.cost, cell: (r) => inr(r.cost) },
          ]}
        />
      )}
      {form && <JobCardForm onClose={() => setForm(false)} />}
    </div>
  );
}

function JobCardForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const vs = useVehicles();
  const [vid, setVid] = useState('');
  const [type, setType] = useState<JobCard['type']>('SERVICE');
  const [complaint, setComplaint] = useState('');
  const [work, setWork] = useState('');
  const [spares, setSpares] = useState<number | ''>('');
  const [labour, setLabour] = useState<number | ''>('');
  const [down, setDown] = useState<number | ''>('');
  const save = () => {
    if (!vid || !complaint) return toast.error('Vehicle and complaint are required');
    const no = nextNo('JC');
    const meter = vehicleMeter(db, vid);
    insert('jobCards', { no, date: today(), vehicleId: vid, type, complaint, workDone: work, sparesCost: Number(spares) || 0, labourCost: Number(labour) || 0, downtimeHours: Number(down) || 0, meterAt: meter, closed: !!work } as any, `Job card ${no}`, 'Job card');
    if (type === 'SERVICE') update('vehicles', vid, { lastServiceAt: meter }, 'Service done — schedule reset', 'Vehicle');
    if (type === 'BREAKDOWN' && !work) update('vehicles', vid, { status: 'BREAKDOWN' }, 'Breakdown reported', 'Vehicle');
    toast.success(`${no} created`, type === 'SERVICE' ? 'Next service due date reset (MNT-01)' : undefined);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Job card" subtitle="MNT-02 · complaint, work done, spares, outside labour, downtime" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Vehicle" required className="sm:col-span-2"><Combo value={vid} onChange={setVid} options={vehicleOpts(vs)} /></Field>
        <Field label="Type"><Select value={type} onChange={(x) => setType(x as JobCard['type'])} options={[{ value: 'SERVICE', label: 'Periodic service' }, { value: 'REPAIR', label: 'Repair' }, { value: 'BREAKDOWN', label: 'Breakdown' }]} /></Field>
        <Field label="Downtime"><NumberInput value={down} onChange={setDown} suffix="h" /></Field>
        <Field label="Complaint" required className="sm:col-span-2"><Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} /></Field>
        <Field label="Work done" className="sm:col-span-2" hint="Leave blank to keep the job open"><Textarea value={work} onChange={(e) => setWork(e.target.value)} /></Field>
        <Field label="Spares cost" hint="Spares from store are issued via Central store (STR-05)"><NumberInput value={spares} onChange={setSpares} prefix="₹" /></Field>
        <Field label="Outside labour"><NumberInput value={labour} onChange={setLabour} prefix="₹" /></Field>
      </div>
    </Drawer>
  );
}

/* ================= Documents (DOC-01/02) ================= */
function DocumentsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [renew, setRenew] = useState<{ vehicleId: string; type: string; expiry: string } | null>(null);
  const [newDate, setNewDate] = useState('');
  const rows = useMemo(() => docExpiries(db), [db]);
  const bucket = (d: number) => (d < 0 ? 'Expired' : d <= 7 ? '≤ 7 days' : d <= 15 ? '≤ 15 days' : d <= 30 ? '≤ 30 days' : 'Valid');
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 stagger">
        <Stat label="Expired" value={rows.filter((r) => r.days < 0).length} tone="bad" />
        <Stat label="Within 7 days" value={rows.filter((r) => r.days >= 0 && r.days <= 7).length} tone="bad" />
        <Stat label="Within 15 days" value={rows.filter((r) => r.days > 7 && r.days <= 15).length} tone="warn" />
        <Stat label="Within 30 days" value={rows.filter((r) => r.days > 15 && r.days <= 30).length} tone="info" />
      </div>
      <DataTable
        title="Document expiry"
        subtitle="Alerts go out 30, 15 and 7 days before expiry (DOC-02)"
        rows={rows}
        rowKey={(r) => `${r.vehicleId}-${r.type}`}
        rowClassName={(r) => (r.days < 0 ? 'bg-bad-soft/40' : undefined)}
        columns={[
          { key: 'veh', header: 'Vehicle', primary: true, value: (r) => n.veh(r.vehicleId), cell: (r) => <div>{n.veh(r.vehicleId)}<div className="text-[11px] text-muted">{n.lk.vehicle[r.vehicleId]?.regNo}</div></div> },
          { key: 'type', header: 'Document', value: (r) => r.type },
          { key: 'number', header: 'Number', value: (r) => r.number, cell: (r) => <span className="font-mono text-xs">{r.number}</span>, hideMobile: true },
          { key: 'expiry', header: 'Expiry', value: (r) => r.expiry, cell: (r) => date(r.expiry) },
          { key: 'days', header: 'Days left', align: 'right', value: (r) => r.days },
          { key: 'st', header: 'Status', value: (r) => bucket(r.days), cell: (r) => <Badge tone={r.days < 0 || r.days <= 7 ? 'bad' : r.days <= 30 ? 'warn' : 'good'}>{bucket(r.days)}</Badge> },
          { key: 'act', header: '', sortable: false, cell: (r) => (r.days <= 30 && s.can('fleet', 'edit') ? <Button size="sm" onClick={(e) => (e.stopPropagation(), setRenew(r), setNewDate(addDays(r.expiry < today() ? today() : r.expiry, 365)))}>Renew</Button> : null) },
        ]}
      />
      <Modal open={!!renew} onClose={() => setRenew(null)} title={`Renew ${renew?.type}`} footer={<><Button onClick={() => setRenew(null)}>Cancel</Button><Button variant="primary" onClick={() => { const v = db.vehicles.find((x) => x.id === renew!.vehicleId)!; update('vehicles', v.id, { docs: v.docs.map((d) => (d.type === renew!.type ? { ...d, expiry: newDate } : d)) }, `${v.code} ${renew!.type} renewed`, 'Vehicle'); setRenew(null); toast.success('Document renewed'); }}>Save</Button></>}>
        <Field label="New expiry date"><Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></Field>
        <div className="mt-3"><AttachField count={0} onChange={() => {}} label="Scanned copy" /></div>
      </Modal>
    </>
  );
}

/* ================= Vehicle cost (VEH-03/04) ================= */
function CostTab() {
  const db = useDB();
  const n = useNames();
  const vs = useVehicles();
  const [range, setRange] = useRange('30d');
  const rows = useMemo(() => vehicleCost(db, range).filter((r) => vs.some((v) => v.id === r.vehicleId)), [db, range, vs]);
  return (
    <DataTable
      title="Vehicle cost & profitability"
      subtitle={`${date(range.from)} to ${date(range.to)} · fuel, driver, maintenance, spares, tyres, insurance/tax spread, EMI or hire`}
      rows={rows}
      rowKey={(r) => r.vehicleId}
      initialSort={{ key: 'total', dir: 'desc' }}
      toolbar={<DateRangePicker value={range} onChange={setRange} />}
      columns={[
        { key: 'veh', header: 'Vehicle', primary: true, value: (r) => n.veh(r.vehicleId), cell: (r) => <div>{n.veh(r.vehicleId)}<div className="text-[11px] text-muted">{n.lk.vehicle[r.vehicleId]?.type}</div></div> },
        { key: 'fuel', header: 'Fuel', align: 'right', rate: true, value: (r) => Math.round(r.fuel), cell: (r) => inrCompact(r.fuel) },
        { key: 'driver', header: 'Driver', align: 'right', rate: true, value: (r) => Math.round(r.driver), cell: (r) => inrCompact(r.driver), hideMobile: true },
        { key: 'mnt', header: 'Maint. & spares', align: 'right', rate: true, value: (r) => Math.round(r.maintenance + r.spares + r.tyres), cell: (r) => inrCompact(r.maintenance + r.spares + r.tyres) },
        { key: 'ins', header: 'Ins./tax', align: 'right', rate: true, value: (r) => Math.round(r.insurance), cell: (r) => inrCompact(r.insurance), hideMobile: true },
        { key: 'emi', header: 'EMI / hire', align: 'right', rate: true, value: (r) => Math.round(r.emi + r.hire), cell: (r) => inrCompact(r.emi + r.hire) },
        { key: 'total', header: 'Total', align: 'right', rate: true, value: (r) => Math.round(r.total), cell: (r) => <b>{inrCompact(r.total)}</b> },
        { key: 'per', header: 'Per km / hr', align: 'right', rate: true, value: (r) => Math.round(r.perUnit), cell: (r) => (r.perUnit ? `${inr(r.perUnit)}/${unitOf(n.lk.vehicle[r.vehicleId]).replace('s', '')}` : '—') },
        { key: 'trip', header: 'Per trip', align: 'right', rate: true, value: (r) => Math.round(r.perTrip), cell: (r) => (r.perTrip ? inr(r.perTrip) : '—'), hideMobile: true },
        { key: 'mt', header: 'Per MT/cum', align: 'right', rate: true, value: (r) => Math.round(r.perMT), cell: (r) => (r.perMT ? inr(r.perMT) : '—'), hideMobile: true },
        { key: 'avail', header: 'Availability', align: 'right', value: (r) => round(r.availability, 1), cell: (r) => `${r.availability.toFixed(1)}%` },
      ]}
      totals={{ total: inrCompact(sum(rows, (r) => r.total)), __export: { total: Math.round(sum(rows, (r) => r.total)) } }}
    />
  );
}


import { useMemo, useState } from 'react';
import { CircleCheck, Factory, Gauge, Plus, Truck } from 'lucide-react';
import { useDB, insert, update, nextNo } from '../../data/store';
import { useSession } from '../../data/session';
import { getLedger, availability, productionUse } from '../../data/ledger';
import { lookup, plantReconciliation, siteRawAllocation, stockRegister, storeValue } from '../../data/selectors';
import type { Plant as PlantT, Production } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, KV, PageHeader, Section, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, DateRangePicker, Field, Input, NumberInput, Segmented, Select,} from '../../components/ui/fields';
import { ColumnChart, Donut } from '../../components/ui/charts';
import { addDays, date, dateShort, inr, inrCompact, monthLabel, monthOf, num, qty, today } from '../../lib/format';
import { cn, groupBy, round, sum } from '../../lib/utils';
import { DateRuleNote, entryDateRule, Money, useAutoOpen, useModuleTab, useNames, useNewParam, useRange } from '../shared';

export default function Plant() {
  const { tab, tabsEl } = useModuleTab('plant');
  return (
    <div>
      <PageHeader title="Production plants" subtitle="Each plant keeps its own raw-material ledger; every tonne it dispatches carries its share of raw material and running cost to the receiving site." tags={['PLT-01…16']} />
      {tabsEl}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'production' && <ProductionTab />}
      {tab === 'dispatch' && <DispatchTab />}
      {tab === 'raw-material' && <RawTab />}
      {tab === 'allocation' && <AllocationTab />}
      {tab === 'cost' && <CostTab />}
      {tab === 'reconciliation' && <ReconTab />}
    </div>
  );
}

function usePlants() {
  const db = useDB();
  const s = useSession();
  return db.plants.filter((p) => s.allSites || s.plantIds.includes(p.id));
}
const unitFor = (p?: PlantT) => (p?.type === 'BATCHING' ? 'cum' : 'MT');

/* ================= Overview ================= */
function OverviewTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const plants = usePlants();
  const t = today();
  const mo = monthOf(t);
  const L = getLedger(db);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger">
        {plants.map((p) => {
          const prodT = db.production.filter((x) => x.plantId === p.id && x.date === t);
          const prodM = db.production.filter((x) => x.plantId === p.id && x.date.startsWith(mo));
          const dispT = db.dispatches.filter((x) => x.plantId === p.id && x.date === t);
          const unitCosts = L.plantCosts.filter((c) => c.plantId === p.id && c.month === mo);
          const trend: Array<{ label: string; values: Record<string, number> }> = [];
          for (let i = 13; i >= 0; i--) {
            const d = addDays(t, -i);
            trend.push({ label: dateShort(d), values: { q: sum(db.production.filter((x) => x.plantId === p.id && x.date === d), (x) => x.qty) } });
          }
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2"><span className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-surface-3">{p.code}</span><Badge tone="info">{p.type.replace('_', ' ').toLowerCase()}</Badge></div>
                  <div className="font-semibold mt-1.5">{p.name}</div>
                  <div className="text-xs text-muted">{p.capacityPerHour} {p.capacityUnit} · in-charge {n.user(p.inChargeId)}</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-info-soft text-info flex items-center justify-center"><Factory className="w-5 h-5" /></div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[11px] text-muted">Today</div><div className="font-bold num">{num(sum(prodT, (x) => x.qty))}</div><div className="text-[10px] text-muted">{unitFor(p)}</div></div>
                <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[11px] text-muted">This month</div><div className="font-bold num">{num(sum(prodM, (x) => x.qty))}</div><div className="text-[10px] text-muted">{unitFor(p)}</div></div>
                <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[11px] text-muted">Trips today</div><div className="font-bold num">{dispT.length}</div><div className="text-[10px] text-muted">{num(sum(dispT, (x) => x.qty))} {unitFor(p)}</div></div>
              </div>
              <div className="mt-4"><ColumnChart data={trend} series={[{ key: 'q', label: 'Produced' }]} height={120} format={(x) => num(x)} /></div>
              {s.showRates && (
                <div className="mt-3 pt-3 border-t border-line space-y-1">
                  <div className="text-[11px] font-semibold uppercase text-muted">Cost per unit this month (PLT-14)</div>
                  {unitCosts.slice(0, 4).map((c) => (
                    <div key={c.productId} className="flex justify-between text-[13px]"><span>{n.mat(c.productId)}</span><b className="num">{inr(c.unitCost)}/{n.unit(c.productId)}</b></div>
                  ))}
                  <div className="flex justify-between text-[13px] pt-1"><span className="text-muted">Raw material in yard</span><b className="num">{inrCompact(storeValue(db, p.storeId))}</b></div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Production (PLT-05..09) ================= */
function ProductionTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const plants = usePlants();
  const [plant, setPlant] = useState('all');
  const [form, setForm] = useState(false);
  const [view, setView] = useState<Production | null>(null);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.production.filter((p) => plants.some((x) => x.id === p.plantId) && (plant === 'all' || p.plantId === plant)).slice().reverse(), [db, plant, plants]);
  return (
    <>
      <DataTable
        title="Daily production report"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setView}
        toolbar={
          <>
            <Select value={plant} onChange={setPlant} className="w-44" options={[{ value: 'all', label: 'All plants' }, ...plants.map((p) => ({ value: p.id, label: p.code }))]} />
            {s.can('plant', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Production entry</Button>}
          </>
        }
        columns={[
          { key: 'no', header: 'Entry', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{date(r.date)} · {r.shift.toLowerCase()}</div></div> },
          { key: 'plant', header: 'Plant', value: (r) => n.lk.plant[r.plantId]?.code },
          { key: 'product', header: 'Product', value: (r) => n.mat(r.productId), cell: (r) => <div>{n.lk.plant[r.plantId]?.type === 'CRUSHER' ? 'Boulders crushed' : n.mat(r.productId)}<div className="text-[11px] text-muted">{n.lk.recipe[r.recipeId]?.code}</div></div> },
          { key: 'qty', header: 'Quantity', align: 'right', value: (r) => r.qty, cell: (r) => <b>{qty(r.qty, n.unit(r.productId))}</b> },
          { key: 'hours', header: 'Run hrs', align: 'right', value: (r) => r.runHours, hideMobile: true },
          { key: 'rate', header: 'Output / hr', align: 'right', value: (r) => round(r.qty / (r.runHours || 1), 1), cell: (r) => num(r.qty / (r.runHours || 1), 1), hideMobile: true },
          { key: 'fuel', header: 'Fuel / DG', align: 'right', value: (r) => r.fuelUsed, cell: (r) => <span className="text-[13px]">{num(r.fuelUsed)} L · {num(r.dgUnits)} u</span>, hideMobile: true },
          { key: 'act', header: 'Consumption', value: (r) => (r.actual ? 'Actual' : 'Theoretical'), cell: (r) => (r.actual ? <Badge tone="info">Actual printout</Badge> : <Badge>Recipe</Badge>) },
          { key: 'rej', header: 'Rejected', align: 'right', value: (r) => r.rejectedQty, cell: (r) => (r.rejectedQty ? <span className="text-bad" title={r.rejectReason}>{qty(r.rejectedQty)}</span> : '—') },
        ]}
      />
      {form && <ProductionForm onClose={() => setForm(false)} />}
      {view && <ProductionView p={view} onClose={() => setView(null)} />}
    </>
  );
}

function ProductionView({ p, onClose }: { p: Production; onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const use = productionUse(db, p);
  const isCrusher = n.lk.plant[p.plantId]?.type === 'CRUSHER';
  return (
    <Drawer open onClose={onClose} title={p.no} subtitle={`${n.lk.plant[p.plantId]?.name} · ${date(p.date)} · ${p.shift.toLowerCase()} shift`}>
      <div className="space-y-5">
        <KV items={[['Product', isCrusher ? 'Crusher run — boulders' : n.mat(p.productId)], ['Quantity', qty(p.qty, n.unit(p.productId))], ['Recipe / JMF', n.lk.recipe[p.recipeId]?.name], ['Run hours', `${p.runHours} h (${p.startMeter} → ${p.stopMeter})`], ['DG / power', `${p.dgUnits} units`], ['Fuel used', `${p.fuelUsed} L`], ['Operator', p.operator], ['Rejected', p.rejectedQty ? `${p.rejectedQty} — ${p.rejectReason}` : '—']]} />
        <Section title={isCrusher ? 'Output split (PLT-08)' : 'Raw material — theoretical vs actual (PLT-06)'}>
          <div className="rounded-xl border border-line divide-y divide-line">
            {isCrusher
              ? (p.actual || []).map((o) => (
                  <div key={o.materialId} className="flex justify-between px-3 py-2 text-sm"><span>{n.mat(o.materialId)}</span><span className="num"><b>{qty(o.qty, 'MT')}</b> · {((o.qty / p.qty) * 100).toFixed(1)}%</span></div>
                ))
              : use.map((u) => (
                  <div key={u.materialId} className="flex justify-between px-3 py-2 text-sm">
                    <span>{n.mat(u.materialId)}</span>
                    <span className="num text-right">
                      <b>{qty(u.qty, n.unit(u.materialId))}</b>
                      <span className="text-[11px] text-muted block">recipe {qty(u.theoretical)} · {u.theoretical ? (((u.qty - u.theoretical) / u.theoretical) * 100).toFixed(1) : 0}%</span>
                    </span>
                  </div>
                ))}
            {isCrusher && <div className="flex justify-between px-3 py-2 text-sm text-bad"><span>Loss / fines</span><span className="num">{qty(p.qty - sum(p.actual || [], (o) => o.qty), 'MT')}</span></div>}
          </div>
        </Section>
      </div>
    </Drawer>
  );
}

function ProductionForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const plants = usePlants();
  const [plantId, setPlantId] = useState(plants[0]?.id || 'p1');
  const plant = lk.plant[plantId]!;
  const isCrusher = plant.type === 'CRUSHER';
  const products = db.recipes.filter((r) => r.productId && lk.material[r.productId] && (isCrusher ? !!r.split : !r.split && lk.material[r.productId]?.kind === 'OUTPUT' && (plant.type === 'HOT_MIX' ? ['m30', 'm31'] : ['m32', 'm33', 'm34']).includes(r.productId)));
  const [recipeId, setRecipeId] = useState(products[0]?.id || '');
  const rec = lk.recipe[recipeId];
  const [d, setD] = useState(today());
  const [shift, setShift] = useState<'DAY' | 'NIGHT'>('DAY');
  const [q, setQ] = useState<number | ''>('');
  const lastStop = Math.max(0, ...db.production.filter((p) => p.plantId === plantId).map((p) => p.stopMeter));
  const [start, setStart] = useState<number | ''>(lastStop);
  const [stop, setStop] = useState<number | ''>('');
  const [dg, setDg] = useState<number | ''>('');
  const [fuel, setFuel] = useState<number | ''>('');
  const [operator, setOperator] = useState('');
  const [override, setOverride] = useState(false);
  const [actual, setActual] = useState<Record<string, number | ''>>({});
  const [split, setSplit] = useState<Record<string, number | ''>>({});
  const [rej, setRej] = useState<number | ''>('');
  const [rejReason, setRejReason] = useState('');
  const changePlant = (id: string) => {
    setPlantId(id);
    const p = lk.plant[id]!;
    const first = db.recipes.find((r) => (p.type === 'CRUSHER' ? !!r.split : !r.split && (p.type === 'HOT_MIX' ? ['m30', 'm31'] : ['m32', 'm33', 'm34']).includes(r.productId)));
    setRecipeId(first?.id || '');
    setStart(Math.max(0, ...db.production.filter((x) => x.plantId === id).map((x) => x.stopMeter)));
  };
  const theo = rec && q ? rec.lines.map((l) => ({ materialId: l.materialId, qty: round(l.qty * Number(q), 3) })) : [];
  const shortages = theo.filter((t) => {
    const used = override && actual[t.materialId] !== undefined && actual[t.materialId] !== '' ? Number(actual[t.materialId]) : t.qty;
    return used > availability(db, plant.storeId, t.materialId, d).onDate + 1e-6;
  });
  const rule = entryDateRule(db, d, s.isAdmin);
  const save = () => {
    if (rule.error) return toast.error(rule.error);
    if (!rec || !q || stop === '' || Number(stop) < Number(start)) return toast.error('Product, quantity and meter readings are required');
    if (shortages.length) return toast.error('Not enough raw material in plant yard', shortages.map((x) => lk.material[x.materialId]?.name).join(', '));
    const no = nextNo(isCrusher ? 'CRS' : plant.type === 'HOT_MIX' ? 'HMP' : 'RMC', d);
    const act = isCrusher
      ? rec.split!.map((x) => ({ materialId: x.materialId, qty: split[x.materialId] !== undefined && split[x.materialId] !== '' ? Number(split[x.materialId]) : round((Number(q) * x.pct) / 100, 2) }))
      : override
        ? theo.map((t) => ({ materialId: t.materialId, qty: actual[t.materialId] !== undefined && actual[t.materialId] !== '' ? Number(actual[t.materialId]) : t.qty }))
        : undefined;
    insert('production', { no, date: d, shift, plantId, productId: rec.productId, recipeId, qty: Number(q), runHours: round(Number(stop) - Number(start), 1), startMeter: Number(start), stopMeter: Number(stop), dgUnits: Number(dg) || 0, fuelUsed: Number(fuel) || 0, operator, actual: act, rejectedQty: Number(rej) || 0, rejectReason: rejReason || undefined } as any, `Production ${no}`, 'Production');
    toast.success(`${no} saved`, isCrusher ? 'Crusher output added to yard stock' : `${override ? 'Actual' : 'Recipe'} raw material consumed from plant yard`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Production entry" subtitle="PLT-05 · product, quantity, run hours, meters, power, fuel, operator" width="max-w-3xl" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Plant" className="col-span-2"><Select value={plantId} onChange={changePlant} options={plants.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} /></Field>
          <Field label="Date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Shift"><Select value={shift} onChange={(x) => setShift(x as 'DAY' | 'NIGHT')} options={[{ value: 'DAY', label: 'Day' }, { value: 'NIGHT', label: 'Night' }]} /></Field>
          <Field label={isCrusher ? 'Crusher mode' : 'Product / job mix'} className="col-span-2"><Select value={recipeId} onChange={setRecipeId} options={products.map((r) => ({ value: r.id, label: isCrusher ? r.name : `${lk.material[r.productId]?.name} — ${r.code}${r.siteId ? ` (${lk.site[r.siteId]?.short})` : ''}` }))} /></Field>
          <Field label={isCrusher ? 'Boulders fed' : 'Quantity produced'} required className="col-span-2"><NumberInput value={q} onChange={setQ} suffix={isCrusher ? 'MT' : unitFor(plant)} /></Field>
          <Field label="Start meter"><NumberInput value={start} onChange={setStart} suffix="h" /></Field>
          <Field label="Stop meter" required hint={stop !== '' ? `${round(Number(stop) - Number(start), 1)} run hours` : undefined}><NumberInput value={stop} onChange={setStop} suffix="h" /></Field>
          <Field label="Power / DG units"><NumberInput value={dg} onChange={setDg} /></Field>
          <Field label={plant.type === 'HOT_MIX' ? 'Burner fuel (FO)' : 'Fuel used'}><NumberInput value={fuel} onChange={setFuel} suffix="L" /></Field>
          <Field label="Operator" className="col-span-2"><Input value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
        </div>
        <DateRuleNote date={d} />
        {isCrusher && rec?.split ? (
          <Section title="Output split by size (PLT-08) — yield & loss tracked">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {rec.split.map((x) => (
                <Field key={x.materialId} label={`${lk.material[x.materialId]?.name} (${x.pct}%)`}>
                  <NumberInput value={split[x.materialId] ?? (q ? round((Number(q) * x.pct) / 100, 1) : '')} onChange={(v) => setSplit({ ...split, [x.materialId]: v })} suffix="MT" />
                </Field>
              ))}
            </div>
            {q !== '' && <div className="text-xs text-muted">Loss / fines: {qty(Number(q) - sum(rec.split, (x) => (split[x.materialId] !== undefined && split[x.materialId] !== '' ? Number(split[x.materialId]) : (Number(q) * x.pct) / 100)), 'MT')}</div>}
          </Section>
        ) : (
          rec && (
            <Section title="Raw material consumed" action={<Segmented value={override ? 'a' : 't'} onChange={(v) => setOverride(v === 'a')} options={[{ value: 't', label: 'From recipe' }, { value: 'a', label: 'Actual printout' }]} />}>
              <div className="rounded-xl border border-line divide-y divide-line">
                {theo.length === 0 && <div className="px-3 py-4 text-sm text-muted">Enter quantity to calculate.</div>}
                {theo.map((t) => {
                  const av = availability(db, plant.storeId, t.materialId, d).onDate;
                  const short = shortages.some((x) => x.materialId === t.materialId);
                  return (
                    <div key={t.materialId} className={cn('grid grid-cols-12 gap-2 items-center px-3 py-2', short && 'bg-bad-soft/40')}>
                      <div className="col-span-5 text-sm">{lk.material[t.materialId]?.name}<div className="text-[11px] text-muted">yard {qty(av, lk.material[t.materialId]?.unit)}</div></div>
                      <div className="col-span-3 text-sm num text-right">{qty(t.qty, lk.material[t.materialId]?.unit)}</div>
                      <div className="col-span-4">{override ? <NumberInput value={actual[t.materialId] ?? t.qty} onChange={(v) => setActual({ ...actual, [t.materialId]: v })} className="h-9" /> : <span className="text-xs text-muted">recipe</span>}</div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted">Both theoretical and actual figures are kept (PLT-06).</p>
            </Section>
          )
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Rejected / waste (PLT-09)"><NumberInput value={rej} onChange={setRej} suffix={unitFor(plant)} /></Field>
          <Field label="Rejection reason"><Input value={rejReason} onChange={(e) => setRejReason(e.target.value)} placeholder="e.g. under-temperature batch" /></Field>
        </div>
      </div>
    </Drawer>
  );
}

/* ================= Dispatch (PLT-10..12) ================= */
function DispatchTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const plants = usePlants();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [view, setView] = useState<'register' | 'site'>('register');
  const [range, setRange] = useRange('7d');
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.dispatches.filter((d) => plants.some((p) => p.id === d.plantId) && (!siteId || d.siteId === siteId) && d.date >= range.from && d.date <= range.to).slice().reverse(), [db, plants, siteId, range]);
  const siteWise = useMemo(() => Object.entries(groupBy(rows, (d) => `${d.plantId}|${d.siteId || d.toPlantId || d.customer}|${d.productId}`)).map(([k, l]) => ({ k, plantId: l[0]!.plantId, to: l[0]!.siteId ? n.site(l[0]!.siteId) : l[0]!.toPlantId ? n.lk.plant[l[0]!.toPlantId]?.code : l[0]!.customer, productId: l[0]!.productId, trips: l.length, qty: sum(l, (d) => d.qty), received: sum(l, (d) => d.receivedQty || 0) })), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Segmented value={view} onChange={setView} options={[{ value: 'register', label: 'Dispatch register' }, { value: 'site', label: 'Plant × site summary' }]} />
        <div className="flex-1" />
        <DateRangePicker value={range} onChange={setRange} />
        {s.can('plant', 'add') && <Button variant="primary" icon={<Truck className="w-4 h-4" />} onClick={() => setForm(true)}>Dispatch slip</Button>}
      </div>
      {view === 'register' ? (
        <DataTable
          title="Dispatch register"
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.status === 'RETURNED' || (r.receivedQty !== undefined && ((r.qty - r.receivedQty) / r.qty) * 100 > db.settings.tolerance.dispatch) ? 'bg-bad-soft/40' : undefined)}
          columns={[
            { key: 'no', header: 'Slip', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{date(r.date)} {r.time}</div></div> },
            { key: 'plant', header: 'Plant', value: (r) => n.lk.plant[r.plantId]?.code },
            { key: 'product', header: 'Product', value: (r) => n.mat(r.productId) },
            { key: 'qty', header: 'Qty', align: 'right', value: (r) => r.qty, cell: (r) => <b>{qty(r.qty, n.unit(r.productId))}</b> },
            { key: 'to', header: 'To', value: (r) => (r.siteId ? n.site(r.siteId) : r.toPlantId ? n.lk.plant[r.toPlantId]?.code : r.customer), cell: (r) => <div>{r.siteId ? n.site(r.siteId) : r.toPlantId ? `Plant ${n.lk.plant[r.toPlantId]?.code}` : <Badge tone="violet">Sale: {r.customer}</Badge>}<div className="text-[11px] text-muted">{r.chainage}</div></div> },
            { key: 'veh', header: 'Vehicle', value: (r) => n.veh(r.vehicleId), hideMobile: true },
            { key: 'temp', header: 'Temp', align: 'right', value: (r) => r.temperature || '', cell: (r) => (r.temperature ? <span className={r.temperature < 125 ? 'text-bad font-semibold' : ''}>{r.temperature}°C</span> : '—'), hideMobile: true },
            { key: 'recv', header: 'Received', align: 'right', value: (r) => r.receivedQty ?? '', cell: (r) => (r.receivedQty !== undefined ? <span className={((r.qty - r.receivedQty) / r.qty) * 100 > db.settings.tolerance.dispatch ? 'text-bad font-semibold' : ''}>{qty(r.receivedQty)}</span> : '—') },
            { key: 'st', header: 'Status', value: (r) => r.status, cell: (r) => (r.status === 'RETURNED' ? <span title={r.returnReason}><StatusBadge status="RETURNED" /></span> : <StatusBadge status={r.status} />) },
          ]}
        />
      ) : (
        <DataTable
          title="Dispatch by plant and site"
          rows={siteWise}
          rowKey={(r) => r.k}
          columns={[
            { key: 'plant', header: 'Plant', value: (r) => n.lk.plant[r.plantId]?.code },
            { key: 'to', header: 'Receiving site', primary: true, value: (r) => r.to },
            { key: 'product', header: 'Product', value: (r) => n.mat(r.productId) },
            { key: 'trips', header: 'Trips', align: 'right', value: (r) => r.trips },
            { key: 'qty', header: 'Dispatched', align: 'right', value: (r) => round(r.qty, 2), cell: (r) => qty(r.qty, n.unit(r.productId)) },
            { key: 'recv', header: 'Received', align: 'right', value: (r) => round(r.received, 2), cell: (r) => qty(r.received) },
            { key: 'diff', header: 'Transit diff.', align: 'right', value: (r) => round(r.qty - r.received, 2), cell: (r) => qty(r.qty - r.received) },
          ]}
        />
      )}
      {form && <DispatchForm onClose={() => setForm(false)} />}
    </div>
  );
}

function DispatchForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const lk = lookup(db);
  const plants = usePlants();
  const [plantId, setPlantId] = useState(plants[0]?.id || 'p1');
  const plant = lk.plant[plantId]!;
  const products = db.materials.filter((m) => (plant.type === 'HOT_MIX' ? ['m30', 'm31'] : plant.type === 'BATCHING' ? ['m32', 'm33', 'm34'] : ['m06', 'm07', 'm08', 'm09']).includes(m.id));
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [toKind, setToKind] = useState<'site' | 'sale'>('site');
  const [site, setSite] = useState('s1');
  const [customer, setCustomer] = useState('');
  const [saleRate, setSaleRate] = useState<number | ''>('');
  const [q, setQ] = useState<number | ''>('');
  const [veh, setVeh] = useState('');
  const [boq, setBoq] = useState('');
  const [chain, setChain] = useState('');
  const [temp, setTemp] = useState<number | ''>('');
  const [wb, setWb] = useState('');
  const [d] = useState(today());
  const stock = availability(db, plant.storeId, productId, d).onDate;
  const rec = db.recipes.find((r) => r.productId === productId && r.siteId === site) || db.recipes.find((r) => r.productId === productId && !r.siteId && !r.split);
  const save = () => {
    if (!q || !veh || (toKind === 'site' ? !site : !customer)) return toast.error('Quantity, vehicle and destination are required');
    if (Number(q) > stock + 1e-6) return toast.error('More than produced stock in plant yard', `${qty(stock, lk.material[productId]?.unit)} available`);
    const no = nextNo(plant.type === 'HOT_MIX' ? 'DSP-H' : plant.type === 'BATCHING' ? 'DSP-R' : 'DSP-C', d);
    insert('dispatches', { no, date: d, time: new Date().toTimeString().slice(0, 5), plantId, productId, qty: Number(q), vehicleId: veh, driver: lk.vehicle[veh]?.driver, siteId: toKind === 'site' ? site : undefined, customer: toKind === 'sale' ? customer : undefined, saleRate: toKind === 'sale' ? Number(saleRate) : undefined, boqItemId: boq || undefined, chainage: chain, temperature: temp === '' ? undefined : Number(temp), weighbridgeSlip: wb, status: toKind === 'sale' ? 'RECEIVED' : 'DISPATCHED', receivedQty: toKind === 'sale' ? Number(q) : undefined } as any, `Dispatch ${no}`, 'Dispatch');
    toast.success(`${no} issued`, toKind === 'site' ? 'Site must confirm receipt (PLT-11)' : 'Sale invoice with GST posted to customer ledger (PLT-12)');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Dispatch slip" subtitle="PLT-10 · per trip: product, qty, vehicle, driver, receiving site, BOQ / chainage, temperature, weighbridge" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<Truck className="w-4 h-4" />}>Dispatch</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Plant"><Select value={plantId} onChange={(v) => (setPlantId(v), setProductId(''))} options={plants.map((p) => ({ value: p.id, label: p.code }))} /></Field>
          <Field label="Product" hint={productId ? `${qty(stock, lk.material[productId]?.unit)} in yard` : undefined}><Select value={productId} onChange={setProductId} placeholder="Choose" options={products.map((m) => ({ value: m.id, label: m.name }))} /></Field>
          <Field label="Quantity" required><NumberInput value={q} onChange={setQ} suffix={lk.material[productId]?.unit} /></Field>
          <Field label="Vehicle" required><Combo value={veh} onChange={setVeh} options={db.vehicles.filter((v) => ['Tipper', 'Transit Mixer'].includes(v.type)).map((v) => ({ value: v.id, label: `${v.code} — ${v.regNo}`, hint: v.driver }))} /></Field>
        </div>
        <Segmented value={toKind} onChange={setToKind} options={[{ value: 'site', label: 'To own site' }, { value: 'sale', label: 'Sale to outside party' }]} />
        {toKind === 'site' ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Receiving site" required><Select value={site} onChange={(v) => (setSite(v), setBoq(''))} options={db.sites.filter((x) => x.status === 'ACTIVE').map((x) => ({ value: x.id, label: x.short }))} /></Field>
            <Field label="BOQ item"><Select value={boq} onChange={setBoq} placeholder="—" options={db.boq.filter((b) => b.siteId === site).map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description.slice(0, 40)}` }))} /></Field>
            <Field label="Chainage / location"><Input value={chain} onChange={(e) => setChain(e.target.value)} placeholder="Ch 14+200 LHS" /></Field>
            <Field label="Weighbridge slip"><Input value={wb} onChange={(e) => setWb(e.target.value)} /></Field>
            {plant.type === 'HOT_MIX' && <Field label="Mix temperature" hint="Hot mix: typically 140–165 °C"><NumberInput value={temp} onChange={setTemp} suffix="°C" /></Field>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer" required className="col-span-2"><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
            <Field label="Sale rate (excl. GST)"><NumberInput value={saleRate} onChange={setSaleRate} prefix="₹" /></Field>
            <Field label="GST"><Input disabled value={`${lk.material[productId]?.gstPct ?? 18}%`} /></Field>
          </div>
        )}
        {rec && toKind === 'site' && q !== '' && (
          <Callout>
            Raw material carried to {lk.site[site]?.short} by this load (PLT-13, {rec.code}{rec.siteId ? ', site-specific mix' : ''}): {rec.lines.map((l) => `${lk.material[l.materialId]?.name} ${qty(l.qty * Number(q), lk.material[l.materialId]?.unit)}`).join(' · ')}
          </Callout>
        )}
      </div>
    </Drawer>
  );
}

/* ================= Raw-material ledger (PLT-01..04) ================= */
function RawTab() {
  const db = useDB();
  const n = useNames();
  const plants = usePlants();
  const [plantId, setPlantId] = useState(plants[0]?.id || 'p1');
  const [range, setRange] = useRange('mtd');
  const plant = n.lk.plant[plantId]!;
  const rows = useMemo(() => stockRegister(db, plant.storeId, range), [db, plant, range]);
  const piles = db.stockpiles.filter((x) => x.plantId === plantId).slice(-8).reverse();
  const [form, setForm] = useState(false);
  const [mat, setMat] = useState('');
  const [phys, setPhys] = useState<number | ''>('');
  return (
    <div className="space-y-4">
      <DataTable
        title={`Raw-material ledger — ${plant.name}`}
        subtitle={`${date(range.from)} to ${date(range.to)}`}
        rows={rows}
        rowKey={(r) => r.materialId}
        toolbar={
          <>
            <Select value={plantId} onChange={setPlantId} options={plants.map((p) => ({ value: p.id, label: p.code }))} className="w-36" />
            <DateRangePicker value={range} onChange={setRange} />
            <Button onClick={() => setForm(true)} icon={<Gauge className="w-4 h-4" />}>Stockpile / dip</Button>
          </>
        }
        columns={[
          { key: 'mat', header: 'Material', primary: true, value: (r) => n.mat(r.materialId), cell: (r) => <div>{n.mat(r.materialId)}{n.lk.material[r.materialId]?.kind === 'OUTPUT' && <Badge tone="info" className="ml-1">product</Badge>}</div> },
          { key: 'opening', header: 'Opening', align: 'right', value: (r) => round(r.opening, 2), cell: (r) => qty(r.opening) },
          { key: 'received', header: 'Received', align: 'right', value: (r) => round(r.received, 2), cell: (r) => <span className="text-good">{r.received ? `+${qty(r.received)}` : '—'}</span> },
          { key: 'consumed', header: 'Used in production', align: 'right', value: (r) => round(r.consumed, 2), cell: (r) => (r.consumed ? qty(r.consumed) : '—') },
          { key: 'out', header: 'Dispatched / out', align: 'right', value: (r) => round(r.transferred, 2), cell: (r) => (r.transferred ? qty(r.transferred) : '—') },
          { key: 'wasted', header: 'Wastage', align: 'right', value: (r) => round(r.wasted, 2), cell: (r) => (r.wasted ? qty(r.wasted) : '—'), hideMobile: true },
          { key: 'closing', header: 'Closing', align: 'right', value: (r) => round(r.closing, 2), cell: (r) => <b>{qty(r.closing, n.unit(r.materialId))}</b> },
          { key: 'value', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(r.closingValue), cell: (r) => inr(r.closingValue) },
        ]}
      />
      {piles.length > 0 && (
        <Card>
          <CardHeader title="Stockpile & dip readings (PLT-04)" subtitle="Physical measurement vs book stock on the day" />
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {piles.map((p) => {
              const book = availability(db, plant.storeId, p.materialId, p.date).onDate;
              const v = p.physicalQty - book;
              return (
                <div key={p.id} className="rounded-xl border border-line p-3">
                  <div className="text-[11px] text-muted">{date(p.date)}</div>
                  <div className="text-sm font-medium">{n.mat(p.materialId)}</div>
                  <div className="text-xs mt-1 num">Physical {qty(p.physicalQty)} · book {qty(book)}</div>
                  <div className={cn('text-xs font-semibold', Math.abs(v) > book * 0.02 ? 'text-bad' : 'text-good')}>{v > 0 ? '+' : ''}{qty(v)} ({book ? ((v / book) * 100).toFixed(1) : 0}%)</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <Drawer open={form} onClose={() => setForm(false)} title="Stockpile measurement / dip" subtitle="PLT-04 · daily dip for bitumen & fuel; stockpile measurement for aggregates" footer={<><Button onClick={() => setForm(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (!mat || phys === '') return; insert('stockpiles', { date: today(), plantId, materialId: mat, physicalQty: Number(phys) } as any, `Stockpile ${n.mat(mat)}`, 'Stockpile'); setForm(false); toast.success('Reading saved'); }}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Material"><Select value={mat} onChange={setMat} placeholder="Choose" options={rows.map((r) => ({ value: r.materialId, label: n.mat(r.materialId) }))} /></Field>
          <Field label="Physical quantity" hint={mat ? `Book ${qty(availability(db, plant.storeId, mat, today()).onDate, n.unit(mat))}` : undefined}><NumberInput value={phys} onChange={setPhys} suffix={n.unit(mat)} /></Field>
        </div>
      </Drawer>
    </div>
  );
}

/* ================= Site-wise allocation (PLT-13) ================= */
function AllocationTab() {
  const db = useDB();
  const n = useNames();
  const s = useSession();
  const [range, setRange] = useRange('mtd');
  const rows = useMemo(() => siteRawAllocation(db, range).filter((r) => s.seesSite(r.siteId)), [db, range, s]);
  const bySiteProduct = groupBy(rows, (r) => `${r.siteId}|${r.productId}`);
  const sentences = Object.values(bySiteProduct).map((list) => {
    const f = list[0]!;
    return `${n.site(f.siteId)} received ${qty(f.productQty, n.unit(f.productId))} of ${n.mat(f.productId)} containing ${list.map((l) => `${qty(l.qty, n.unit(l.materialId))} ${n.mat(l.materialId).replace(/ \(.*\)/, '')}`).join(', ')}`;
  });
  const bitumen = Object.entries(groupBy(rows.filter((r) => r.materialId === 'm12'), (r) => r.siteId)).map(([sid, l]) => ({ label: n.site(sid), value: sum(l, (x) => x.qty) }));
  const cement = Object.entries(groupBy(rows.filter((r) => r.materialId === 'm01'), (r) => r.siteId)).map(([sid, l]) => ({ label: n.site(sid), value: sum(l, (x) => x.qty) }));
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><DateRangePicker value={range} onChange={setRange} /></div>
      <Callout>
        For every dispatch the system allocates the raw material in that load to the receiving site, using the recipe for that site (PLT-07/13). The owner can see exactly how much bitumen, aggregate or cement went to each site through the plants.
      </Callout>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Bitumen VG-30 delivered via hot mix" subtitle="MT by site" />
          <div className="px-4 pb-4"><Donut segments={bitumen} format={(x) => `${num(x, 1)} MT`} center={<><div className="text-[11px] text-muted">Bitumen</div><div className="font-bold">{num(sum(bitumen, (b) => b.value), 1)} MT</div></>} /></div>
        </Card>
        <Card>
          <CardHeader title="Cement delivered via RMC" subtitle="MT by site" />
          <div className="px-4 pb-4"><Donut segments={cement} format={(x) => `${num(x, 1)} MT`} center={<><div className="text-[11px] text-muted">Cement</div><div className="font-bold">{num(sum(cement, (b) => b.value), 1)} MT</div></>} /></div>
        </Card>
      </div>
      <Card className="p-4 sm:p-5 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted">Allocation statement</div>
        {sentences.map((t) => (
          <p key={t} className="text-sm text-fg-2">• {t}</p>
        ))}
      </Card>
      <DataTable
        title="Site-wise raw-material allocation"
        subtitle={`${date(range.from)} to ${date(range.to)}`}
        rows={rows}
        rowKey={(r) => `${r.siteId}-${r.productId}-${r.materialId}`}
        columns={[
          { key: 'site', header: 'Site', primary: true, value: (r) => n.site(r.siteId) },
          { key: 'plant', header: 'Plant', value: (r) => n.lk.plant[r.plantId]?.code },
          { key: 'product', header: 'Product received', value: (r) => n.mat(r.productId), cell: (r) => `${n.mat(r.productId)} — ${qty(r.productQty, n.unit(r.productId))}` },
          { key: 'mat', header: 'Raw material', value: (r) => n.mat(r.materialId) },
          { key: 'qty', header: 'Quantity', align: 'right', value: (r) => round(r.qty, 3), cell: (r) => <b>{qty(r.qty, n.unit(r.materialId))}</b> },
        ]}
      />
    </div>
  );
}

/* ================= Cost sheet (PLT-14/15) ================= */
function CostTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const plants = usePlants();
  const L = getLedger(db);
  const months = Array.from(new Set(L.plantCosts.map((c) => c.month))).sort().reverse();
  const [month, setMonth] = useState(months[0] || monthOf(today()));
  const rows = L.plantCosts.filter((c) => c.month === month && plants.some((p) => p.id === c.plantId));
  const running = db.plantCosts.filter((c) => c.month === month);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} className="w-40" />
      </div>
      <Callout>
        Plant cost per unit = (raw material + plant fuel + power + plant labour + machinery + maintenance + overhead) ÷ quantity produced (PLT-14). Each site is charged qty received × plant cost per unit, or a fixed internal rate if selected (PLT-15).
      </Callout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {plants.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{p.code}</div>
              {s.isAdmin ? (
                <Segmented value={p.costMode} onChange={(v) => (update('plants', p.id, { costMode: v }, `${p.code} site charging → ${v}`, 'Plant'), toast.success(v === 'FIXED' ? 'Sites charged at fixed internal rate' : 'Sites charged at actual plant cost'))} options={[{ value: 'ACTUAL', label: 'Actual' }, { value: 'FIXED', label: 'Fixed rate' }]} />
              ) : (
                <Badge>{p.costMode === 'FIXED' ? 'Fixed rate' : 'Actual cost'}</Badge>
              )}
            </div>
            {(() => {
              const r = running.find((x) => x.plantId === p.id);
              return r ? (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                  {(['labour', 'power', 'machinery', 'maintenance', 'overhead'] as const).map((k) => (
                    <div key={k} className="flex justify-between"><span className="text-muted capitalize">{k}</span><Money v={r[k]} compact /></div>
                  ))}
                </div>
              ) : null;
            })()}
          </Card>
        ))}
      </div>
      <DataTable
        title={`Plant cost sheet — ${monthLabel(month)}`}
        rows={rows}
        rowKey={(r) => `${r.plantId}-${r.productId}`}
        columns={[
          { key: 'plant', header: 'Plant', value: (r) => n.lk.plant[r.plantId]?.code },
          { key: 'product', header: 'Product', primary: true, value: (r) => n.mat(r.productId) },
          { key: 'qty', header: 'Produced', align: 'right', value: (r) => r.qty, cell: (r) => qty(r.qty, n.unit(r.productId)) },
          { key: 'rm', header: 'Raw material', align: 'right', rate: true, value: (r) => Math.round(r.rmValue), cell: (r) => inrCompact(r.rmValue) },
          { key: 'run', header: 'Running cost share', align: 'right', rate: true, value: (r) => Math.round(r.runningShare), cell: (r) => inrCompact(r.runningShare) },
          { key: 'unit', header: 'Cost / unit', align: 'right', rate: true, value: (r) => round(r.unitCost, 2), cell: (r) => <b>{inr(r.unitCost)}</b> },
          { key: 'fixed', header: 'Fixed internal rate', align: 'right', rate: true, value: (r) => n.lk.plant[r.plantId]?.fixedRate[r.productId] || '', cell: (r) => (n.lk.plant[r.plantId]?.fixedRate[r.productId] ? inr(n.lk.plant[r.plantId]!.fixedRate[r.productId]!) : '—') },
        ]}
      />
    </div>
  );
}

/* ================= Reconciliation (PLT-16) ================= */
function ReconTab() {
  const db = useDB();
  const n = useNames();
  const plants = usePlants();
  const [plantId, setPlantId] = useState(plants[0]?.id || 'p1');
  const months = Array.from(new Set(db.production.map((p) => monthOf(p.date)))).sort().reverse();
  const [month, setMonth] = useState(months[0] || monthOf(today()));
  const rows = useMemo(() => plantReconciliation(db, plantId, month), [db, plantId, month]);
  return (
    <div className="space-y-4">
      <Callout>Opening raw material + received − theoretical consumption − closing physical stock = <b>unexplained loss</b>, per material per month (PLT-16). Closing physical comes from the latest stockpile / dip measurement in the month, otherwise book stock.</Callout>
      <DataTable
        title={`Plant reconciliation — ${n.lk.plant[plantId]?.code} ${monthLabel(month)}`}
        rows={rows}
        rowKey={(r) => r.materialId}
        toolbar={
          <>
            <Select value={plantId} onChange={setPlantId} options={plants.map((p) => ({ value: p.id, label: p.code }))} className="w-36" />
            <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} className="w-36" />
          </>
        }
        columns={[
          { key: 'mat', header: 'Material', primary: true, value: (r) => n.mat(r.materialId) },
          { key: 'opening', header: 'Opening', align: 'right', value: (r) => round(r.opening, 2), cell: (r) => qty(r.opening) },
          { key: 'received', header: 'Received', align: 'right', value: (r) => round(r.received, 2), cell: (r) => qty(r.received) },
          { key: 'theo', header: 'Theoretical use', align: 'right', value: (r) => round(r.theoretical, 2), cell: (r) => qty(r.theoretical) },
          { key: 'actual', header: 'Actual (printout)', align: 'right', value: (r) => round(r.actualUsed, 2), cell: (r) => qty(r.actualUsed), hideMobile: true },
          { key: 'physical', header: 'Closing physical', align: 'right', value: (r) => round(r.physical, 2), cell: (r) => <span>{qty(r.physical)}{r.physicalFromStockpile ? <Badge tone="info" className="ml-1">measured</Badge> : ''}</span> },
          { key: 'loss', header: 'Unexplained loss', align: 'right', value: (r) => round(r.loss, 2), cell: (r) => <span className={r.lossPct > db.settings.tolerance.plant ? 'text-bad font-semibold' : r.loss > 0 ? 'text-warn' : 'text-good'}>{qty(r.loss, n.unit(r.materialId))}</span> },
          { key: 'pct', header: '%', align: 'right', value: (r) => round(r.lossPct, 2), cell: (r) => <Badge tone={r.lossPct > db.settings.tolerance.plant ? 'bad' : r.lossPct > 0 ? 'warn' : 'good'}>{r.lossPct.toFixed(2)}%</Badge> },
        ]}
      />
    </div>
  );
}


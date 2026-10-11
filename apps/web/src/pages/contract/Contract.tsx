import { useMemo, useState } from 'react';
import { CircleCheck, FileUp, IndianRupee, Plus, Printer, Ruler, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useDB, insert, update } from '../../data/store';
import { useSession } from '../../data/session';
import { boqProgress, costEntries, COST_HEADS, COST_HEAD_LABEL, lookup, raCalc, receivablesAgeing, siteCostSheet } from '../../data/selectors';
import type { BoqItem, CostHead, RaBill } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, KV, Modal, PageHeader, Progress, Section, Stat, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, Field, Input, NumberInput, Select, Textarea } from '../../components/ui/fields';
import { BarList, ColumnChart, Donut } from '../../components/ui/charts';
import { date, inr, inrCompact, monthLabel, monthOf, num, qty, today } from '../../lib/format';
import { printDocument } from '../../lib/export';
import { csvObjects, pickFile } from '../../lib/csv';
import { cn, groupBy, round, sum } from '../../lib/utils';
import { Money, useAutoOpen, useModuleTab, useNames, useNewParam, useQueryParam } from '../shared';

export default function Contract() {
  const { tab, tabsEl } = useModuleTab('contract');
  return (
    <div>
      <PageHeader title="Contracts, billing & site costing" subtitle="What was billed against what was spent — profit or loss per site, every day." tags={['BOQ-01…03', 'BIL-01…06', 'CST-01…04']} />
      {tabsEl}
      {tab === 'costing' && <CostingTab />}
      {tab === 'boq' && <BoqTab />}
      {tab === 'measurements' && <MeasurementsTab />}
      {tab === 'bills' && <BillsTab />}
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'boq-cost' && <BoqCostTab />}
    </div>
  );
}

function useContractSite(allowAll = false) {
  const q = useQueryParam('site');
  const { siteId, sites } = useSiteFilter();
  const [site, setSite] = useState(q || siteId || (allowAll ? '' : sites[0]?.id || ''));
  const picker = (
    <Select
      value={site}
      onChange={setSite}
      className="w-60"
      options={[...(allowAll ? [{ value: '', label: 'All sites — company summary' }] : []), ...sites.map((x) => ({ value: x.id, label: x.name }))]}
    />
  );
  return { site, setSite, picker, sites };
}

/* ================= Site profitability (CST-01/02) ================= */
function CostingTab() {
  const db = useDB();
  const s = useSession();
  const { site, picker, sites } = useContractSite(true);
  if (!s.showRates) return <Callout>Site profitability needs rate visibility. Ask Admin.</Callout>;
  if (!site) {
    const rows = sites.map((x) => ({ site: x, ...siteCostSheet(db, x.id) }));
    const tot = { wd: sum(rows, (r) => r.workDone), cost: sum(rows, (r) => r.cost), billed: sum(rows, (r) => r.billed), rec: sum(rows, (r) => r.received) };
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{picker}</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <Stat label="Work done (all sites)" value={tot.wd} format={inrCompact} tone="brand" />
          <Stat label="Cost to date" value={tot.cost} format={inrCompact} tone="warn" />
          <Stat label="Profit" value={tot.wd - tot.cost} format={inrCompact} tone={tot.wd >= tot.cost ? 'good' : 'bad'} sub={`${(((tot.wd - tot.cost) / (tot.wd || 1)) * 100).toFixed(1)}% margin`} />
          <Stat label="Billed · received" value={tot.billed} format={inrCompact} tone="violet" sub={`${inrCompact(tot.rec)} received`} />
        </div>
        <Card>
          <CardHeader title="Work done vs cost by site" />
          <div className="px-4 pb-4">
            <ColumnChart data={rows.map((r) => ({ label: r.site.short, values: { wd: r.workDone, cost: r.cost, billed: r.billed } }))} series={[{ key: 'wd', label: 'Value of work done' }, { key: 'cost', label: 'Cost to date' }, { key: 'billed', label: 'Billed' }]} format={inrCompact} height={240} />
          </div>
        </Card>
        <DataTable
          title="Company-wide site profitability"
          rows={rows}
          rowKey={(r) => r.site.id}
          columns={[
            { key: 'site', header: 'Site', primary: true, value: (r) => r.site.name, cell: (r) => <div><div className="font-medium">{r.site.short}</div><div className="text-[11px] text-muted">{r.site.code}</div></div> },
            { key: 'cv', header: 'Contract', align: 'right', value: (r) => r.site.contractValue, cell: (r) => inrCompact(r.site.contractValue) },
            { key: 'wd', header: 'Work done', align: 'right', value: (r) => Math.round(r.workDone), cell: (r) => inrCompact(r.workDone) },
            { key: 'billed', header: 'Billed', align: 'right', value: (r) => Math.round(r.billed), cell: (r) => inrCompact(r.billed) },
            { key: 'rec', header: 'Received', align: 'right', value: (r) => Math.round(r.received), cell: (r) => inrCompact(r.received) },
            { key: 'cost', header: 'Cost', align: 'right', value: (r) => Math.round(r.cost), cell: (r) => inrCompact(r.cost) },
            { key: 'profit', header: 'Profit / loss', align: 'right', value: (r) => Math.round(r.profit), cell: (r) => <b className={r.profit >= 0 ? 'text-good' : 'text-bad'}>{inrCompact(r.profit)}</b> },
            { key: 'margin', header: 'Margin', align: 'right', value: (r) => round(r.margin, 1), cell: (r) => <Badge tone={r.margin >= 8 ? 'good' : r.margin >= 0 ? 'warn' : 'bad'}>{r.margin.toFixed(1)}%</Badge> },
          ]}
        />
      </div>
    );
  }
  return <SiteSheet siteId={site} picker={picker} />;
}

function SiteSheet({ siteId, picker }: { siteId: string; picker: React.ReactNode }) {
  const db = useDB();
  const n = useNames();
  const site = n.lk.site[siteId]!;
  const cs = siteCostSheet(db, siteId);
  const monthly = useMemo(() => {
    const e = costEntries(db).filter((c) => c.siteId === siteId);
    const ms = Array.from(new Set(e.map((x) => monthOf(x.date)))).sort();
    return ms.map((m) => ({
      label: monthLabel(m),
      values: {
        cost: sum(e.filter((x) => monthOf(x.date) === m), (x) => x.amount),
        wd: sum(db.measurements.filter((x) => x.siteId === siteId && monthOf(x.date) === m), (x) => x.qty * (n.lk.boq[x.boqItemId]?.rate || 0)),
      },
    }));
  }, [db, siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sources = Object.entries(cs.sources).sort((a, b) => b[1] - a[1]);
  const pct = (cs.workDone / site.contractValue) * 100;
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{site.name}</div>
          <div className="text-xs text-muted">{n.lk.client[site.clientId]?.name} · WO {site.workOrderNo} · {date(site.startDate)} → {date(site.scheduledCompletion)}</div>
        </div>
        {picker}
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 stagger">
        <Stat label="Contract value" value={site.contractValue} format={inrCompact} tone="info" icon={<IndianRupee className="w-[18px] h-[18px]" />} sub={`${pct.toFixed(1)}% executed`} />
        <Stat label="Value of work done" value={cs.workDone} format={inrCompact} tone="brand" sub="BOQ rate × executed qty" />
        <Stat label="Billed · received" value={cs.billed} format={inrCompact} tone="violet" sub={`${inrCompact(cs.received)} received`} />
        <Stat label="Cost to date" value={cs.cost} format={inrCompact} tone="warn" icon={<Wallet className="w-[18px] h-[18px]" />} />
        <Stat label="Profit / loss" value={cs.profit} format={inrCompact} tone={cs.profit >= 0 ? 'good' : 'bad'} icon={cs.profit >= 0 ? <TrendingUp className="w-[18px] h-[18px]" /> : <TrendingDown className="w-[18px] h-[18px]" />} sub={`${cs.margin.toFixed(1)}% on work done`} className="col-span-2 xl:col-span-1" />
      </div>
      {cs.profit < 0 && <Callout tone="bad">Cost has crossed the value of work done at this site (ALT-06). Check material over-use and labour productivity.</Callout>}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="xl:col-span-3">
          <CardHeader title="Site cost sheet (CST-01)" subtitle={`Includes cost before go-live (opening balances as of ${date(site.openingAsOf)})`} />
          <div className="px-4 sm:px-5 pb-5">
            <div className="rounded-xl border border-line divide-y divide-line">
              {COST_HEADS.map((h) => (
                <div key={h} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{COST_HEAD_LABEL[h]}</div>
                    <div className="text-[11px] text-muted">{({ MATERIAL: 'Site consumption (MAT-04), plant receipts (MAT-03 / PLT-15)', LABOUR: 'Attendance & wages (LAB-06), labour contractor bills', SUBCONTRACT: 'Sub-contractor bills (LAB-11)', VEHICLE: 'Fuel (FUEL-09), hire bills (HIRE-02), internal rate (VEH-05), maintenance', MISC: 'Expenses (EXP-02)', OVERHEAD: 'Allocation (EXP-05)' } as Record<CostHead, string>)[h]}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold num">{inr(cs.heads[h])}</div>
                    <div className="text-[11px] text-muted">{((cs.heads[h] / (cs.cost || 1)) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-3 bg-surface-2 font-semibold">
                <span>Total cost to date</span>
                <span className="num">{inr(cs.cost)}</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Cost vs revenue (CST-02)" />
          <div className="px-4 sm:px-5 pb-5">
            <BarList rows={[{ label: 'Value of work done', value: cs.workDone, color: 'var(--s1)' }, { label: 'Amount billed', value: cs.billed, color: 'var(--s7)' }, { label: 'Amount received', value: cs.received, color: 'var(--s3)' }, { label: 'Cost to date', value: cs.cost, color: 'var(--s2)' }]} format={inrCompact} />
            <div className="mt-5 text-xs font-semibold uppercase text-muted mb-2">Since go-live, by source</div>
            <div className="space-y-1.5">
              {sources.map(([k, v]) => (
                <div key={k} className="flex justify-between text-[13px]"><span className="text-fg-2">{k}</span><span className="num font-medium">{inrCompact(v)}</span></div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Monthly cost vs work done" subtitle="Since go-live" />
        <div className="px-4 pb-4"><ColumnChart data={monthly} series={[{ key: 'wd', label: 'Work done' }, { key: 'cost', label: 'Cost' }]} format={inrCompact} height={220} /></div>
      </Card>
    </div>
  );
}

/* ================= BOQ (BOQ-01/03) ================= */
function BoqTab() {
  const db = useDB();
  const s = useSession();
  const { site, picker } = useContractSite();
  const [extra, setExtra] = useState(false);
  const rows = useMemo(() => boqProgress(db, site), [db, site]);
  const totals = { amount: sum(rows, (r) => r.amount), done: sum(rows, (r) => r.doneValue) };
  const doImport = async () => {
    const text = await pickFile('.csv,text/csv');
    if (!text) return;
    const objs = csvObjects(text);
    let count = 0;
    for (const o of objs) {
      const itemNo = o.itemno || o.item || o.no;
      const desc = o.description || o.desc;
      if (!itemNo || !desc) continue;
      insert('boq', { siteId: site, itemNo, description: desc, unit: (o.unit || 'NOS').toUpperCase(), qty: Number(o.qty || o.quantity || 0), rate: Number(o.rate || 0), isExtra: true, approvalRef: o.approvalref || 'Imported' } as any, `BOQ item ${itemNo} imported`, 'BOQ');
      count++;
    }
    toast[count ? 'success' : 'warn'](count ? `${count} BOQ items imported` : 'No rows imported', 'Columns: Item No, Description, Unit, Qty, Rate');
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {picker}
        <div className="flex-1" />
        {s.can('contract', 'add') && (
          <>
            <Button icon={<FileUp className="w-4 h-4" />} onClick={doImport}>Import from Excel (CSV)</Button>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setExtra(true)}>Extra / deviation item</Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 stagger">
        <Stat label="BOQ amount" value={s.showRates ? totals.amount : rows.length} format={s.showRates ? inrCompact : (x) => `${x} items`} tone="info" />
        <Stat label="Executed value" value={s.showRates ? totals.done : 0} format={s.showRates ? inrCompact : () => '••••'} tone="brand" sub={`${((totals.done / (totals.amount || 1)) * 100).toFixed(1)}% complete`} />
        <Stat label="Items running" value={rows.filter((r) => r.pct > 0 && r.pct < 100).length} tone="violet" className="col-span-2 lg:col-span-1" />
      </div>
      <DataTable
        title="BOQ progress"
        rows={rows}
        rowKey={(r) => r.item.id}
        pageSize={20}
        columns={[
          { key: 'no', header: 'Item', value: (r) => r.item.itemNo, cell: (r) => <span className="font-mono text-xs">{r.item.itemNo}</span> },
          { key: 'desc', header: 'Description', primary: true, value: (r) => r.item.description, cell: (r) => <div>{r.item.description}{r.item.isExtra && <Badge tone="violet" className="ml-1">Extra · {r.item.approvalRef}</Badge>}</div> },
          { key: 'qty', header: 'BOQ qty', align: 'right', value: (r) => r.item.qty, cell: (r) => qty(r.item.qty, r.item.unit) },
          { key: 'rate', header: 'Rate', align: 'right', rate: true, value: (r) => r.item.rate, cell: (r) => inr(r.item.rate) },
          { key: 'exec', header: 'Executed', align: 'right', value: (r) => round(r.executed, 2), cell: (r) => qty(r.executed) },
          { key: 'pct', header: '% complete', value: (r) => round(r.pct, 1), cell: (r) => <div className="flex items-center gap-2 min-w-[120px]"><Progress value={r.pct} thin tone={r.pct > 100 ? 'bad' : 'brand'} /><span className="text-xs num w-12 text-right">{r.pct.toFixed(1)}%</span></div> },
          { key: 'bal', header: 'Balance', align: 'right', value: (r) => round(r.balance, 2), cell: (r) => <span className={r.balance < 0 ? 'text-bad' : ''}>{qty(r.balance)}</span>, hideMobile: true },
          { key: 'amt', header: 'Amount', align: 'right', rate: true, value: (r) => Math.round(r.amount), cell: (r) => inrCompact(r.amount), hideMobile: true },
        ]}
      />
      {extra && <ExtraItemForm siteId={site} onClose={() => setExtra(false)} />}
    </div>
  );
}

function ExtraItemForm({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const [itemNo, setItemNo] = useState('X-');
  const [desc, setDesc] = useState('');
  const [unit, setUnit] = useState('CUM');
  const [q, setQ] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [ref, setRef] = useState('');
  const save = () => {
    if (!desc || !q || !rate || !ref) return toast.error('All fields including approval reference are required');
    insert('boq', { siteId, itemNo, description: desc, unit, qty: Number(q), rate: Number(rate), isExtra: true, approvalRef: ref } as any, `Extra item ${itemNo}`, 'BOQ');
    toast.success('Extra item added');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Extra / deviation item" subtitle="BOQ-01 · with client approval reference" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Item no."><Input value={itemNo} onChange={(e) => setItemNo(e.target.value)} /></Field>
        <Field label="Unit"><Select value={unit} onChange={setUnit} options={['CUM', 'SQM', 'MT', 'RMT', 'NOS', 'KG'].map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Description" className="col-span-2"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field label="Quantity"><NumberInput value={q} onChange={setQ} /></Field>
        <Field label="Rate"><NumberInput value={rate} onChange={setRate} prefix="₹" /></Field>
        <Field label="Approval reference" className="col-span-2"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Client letter no." /></Field>
      </div>
    </Drawer>
  );
}

/* ================= Measurement book (BOQ-02) ================= */
function MeasurementsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { site, picker } = useContractSite();
  const [form, setForm] = useState(false);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.measurements.filter((m) => m.siteId === site).slice().reverse(), [db, site]);
  return (
    <>
      <DataTable
        title="Measurement book"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={
          <>
            {picker}
            {s.can('contract', 'add') && <Button variant="primary" icon={<Ruler className="w-4 h-4" />} onClick={() => setForm(true)}>Record measurement</Button>}
          </>
        }
        columns={[
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'item', header: 'BOQ item', primary: true, value: (r) => n.lk.boq[r.boqItemId]?.description, cell: (r) => <div><span className="font-mono text-xs text-muted mr-1">{n.lk.boq[r.boqItemId]?.itemNo}</span>{n.lk.boq[r.boqItemId]?.description}</div> },
          { key: 'loc', header: 'Location / chainage', value: (r) => r.chainage },
          { key: 'dims', header: 'L × B × D × Nos', value: (r) => (r.length ? `${r.length}×${r.breadth}×${r.depth}×${r.nos}` : ''), cell: (r) => (r.length ? <span className="text-xs num">{r.length} × {r.breadth} × {r.depth} × {r.nos}</span> : '—'), hideMobile: true },
          { key: 'qty', header: 'Quantity', align: 'right', value: (r) => r.qty, cell: (r) => <b>{qty(r.qty, n.lk.boq[r.boqItemId]?.unit)}</b> },
          { key: 'val', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(r.qty * (n.lk.boq[r.boqItemId]?.rate || 0)), cell: (r) => inr(r.qty * (n.lk.boq[r.boqItemId]?.rate || 0)) },
          { key: 'mb', header: 'MB', value: (r) => r.mbNo, hideMobile: true },
        ]}
      />
      {form && <MeasurementForm siteId={site} onClose={() => setForm(false)} />}
    </>
  );
}

function MeasurementForm({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const db = useDB();
  const [item, setItem] = useState('');
  const [d, setD] = useState(today());
  const [chain, setChain] = useState('');
  const [L, setL] = useState<number | ''>('');
  const [B, setB] = useState<number | ''>('');
  const [Dp, setDp] = useState<number | ''>('');
  const [nos, setNos] = useState<number | ''>(1);
  const [direct, setDirect] = useState<number | ''>('');
  const b = db.boq.find((x) => x.id === item);
  const calc = round((Number(L) || 1) * (Number(B) || 1) * (Number(Dp) || 1) * (Number(nos) || 1), 3);
  const useDims = L !== '' || B !== '' || Dp !== '';
  const q = useDims ? calc : Number(direct) || 0;
  const save = () => {
    if (!b || !q) return toast.error('Choose BOQ item and enter dimensions or quantity');
    insert('measurements', { date: d, siteId, boqItemId: item, chainage: chain, length: Number(L) || 0, breadth: Number(B) || 0, depth: Number(Dp) || 0, nos: Number(nos) || 0, qty: q, mbNo: `MB-${siteId.toUpperCase()}-${today().slice(2, 7).replace('-', '')}` } as any, `Measurement ${b.itemNo} ${q} ${b.unit}`, 'Measurement');
    toast.success('Measurement recorded', `${qty(q, b.unit)} added to executed quantity`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Measurement entry" subtitle="BOQ-02 · BOQ item, location / chainage, length × breadth × depth × nos" footer={<><span className="mr-auto text-sm">Qty <b>{qty(q, b?.unit)}</b></span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="BOQ item" required><Combo value={item} onChange={setItem} options={db.boq.filter((x) => x.siteId === siteId).map((x) => ({ value: x.id, label: `${x.itemNo} ${x.description}`, hint: `${x.unit} · BOQ ${num(x.qty)}` }))} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Location / chainage"><Input value={chain} onChange={(e) => setChain(e.target.value)} placeholder="Ch 2+300 to 2+500" /></Field>
          <Field label="Length (m)"><NumberInput value={L} onChange={setL} /></Field>
          <Field label="Breadth (m)"><NumberInput value={B} onChange={setB} /></Field>
          <Field label="Depth (m)"><NumberInput value={Dp} onChange={setDp} /></Field>
          <Field label="Nos"><NumberInput value={nos} onChange={setNos} /></Field>
        </div>
        {!useDims && <Field label="…or quantity directly" hint="For MT / weighbridge-based items"><NumberInput value={direct} onChange={setDirect} suffix={b?.unit} /></Field>}
      </div>
    </Drawer>
  );
}

/* ================= RA bills (BIL-01..05) ================= */
function printTaxInvoice(db: ReturnType<typeof useDB>, b: RaBill) {
  const lk = lookup(db);
  const site = lk.site[b.siteId]!;
  const client = lk.client[site.clientId]!;
  const c = raCalc(b);
  printDocument({
    title: `Tax Invoice — ${b.no}`,
    meta: [['Client', client.name], ['Client GSTIN', client.gstin], ['Work', site.name], ['Work order', site.workOrderNo], ['Bill date', date(b.date)], ['Running account bill', `RA-${b.seq}`]],
    table: { title: 'Abstract', headers: ['Item', 'Description', 'Unit', 'Up-to-date qty', 'Previous qty', 'This bill qty', 'Rate', 'Amount'], rows: b.lines.filter((l) => l.thisQty > 0).map((l) => [lk.boq[l.boqItemId]?.itemNo, lk.boq[l.boqItemId]?.description, lk.boq[l.boqItemId]?.unit, l.uptoQty, l.prevQty, l.thisQty, l.rate, Math.round(l.thisQty * l.rate)]), numeric: [3, 4, 5, 6, 7] },
    summary: [
      ['Gross value of work', inr(c.gross - (b.escalation || 0))],
      ...(b.escalation ? ([['Price escalation (BIL-05)', inr(b.escalation)]] as Array<[string, string]>) : []),
      [`GST @ ${b.gstPct}%`, inr(c.gst)],
      ['Less: security deposit', inr(-b.deductions.securityDeposit)],
      ['Less: retention', inr(-b.deductions.retention)],
      ['Less: TDS on works contract', inr(-b.deductions.tds)],
      ['Less: labour cess', inr(-b.deductions.cess)],
      ['Less: GST TDS', inr(-b.deductions.gstTds)],
      ['Less: royalty', inr(-b.deductions.royalty)],
      ['Less: advance recovery', inr(-b.deductions.advanceRecovery)],
      ['Less: penalties / other', inr(-(b.deductions.penalty + b.deductions.materialRecovery))],
      ['Net payable', inr(c.net)],
    ],
    footerNote: `SAC 9954 — works contract services. GST charged at ${b.gstPct}% as applicable to this work.`,
  });
}

function BillsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const q = useQueryParam('q');
  const [form, setForm] = useState(false);
  const [view, setView] = useState<RaBill | null>(null);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.raBills.filter((b) => s.seesSite(b.siteId) && (!siteId || b.siteId === siteId) && (!q || b.no === q)).slice().sort((a, b) => b.date.localeCompare(a.date)), [db, s, siteId, q]);
  return (
    <>
      <DataTable
        title="Running account bills"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setView}
        toolbar={s.can('contract', 'add') && s.showRates && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Prepare RA bill</Button>}
        columns={[
          { key: 'no', header: 'Bill', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'gross', header: 'Gross', align: 'right', rate: true, value: (r) => Math.round(raCalc(r).gross), cell: (r) => inrCompact(raCalc(r).gross) },
          { key: 'gst', header: 'GST', align: 'right', rate: true, value: (r) => Math.round(raCalc(r).gst), cell: (r) => inrCompact(raCalc(r).gst), hideMobile: true },
          { key: 'ded', header: 'Deductions', align: 'right', rate: true, value: (r) => Math.round(raCalc(r).deductions), cell: (r) => inrCompact(raCalc(r).deductions), hideMobile: true },
          { key: 'net', header: 'Net payable', align: 'right', rate: true, value: (r) => Math.round(raCalc(r).net), cell: (r) => <b>{inrCompact(raCalc(r).net)}</b> },
          { key: 'rec', header: 'Received', align: 'right', rate: true, value: (r) => Math.round(raCalc(r).received), cell: (r) => inrCompact(raCalc(r).received) },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {form && <RaForm onClose={() => setForm(false)} />}
      {view && <RaView bill={view} onClose={() => setView(null)} />}
    </>
  );
}

function RaView({ bill, onClose }: { bill: RaBill; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const b = db.raBills.find((x) => x.id === bill.id) || bill;
  const c = raCalc(b);
  const [rcpt, setRcpt] = useState(false);
  const [amt, setAmt] = useState<number | ''>(Math.round(c.outstanding));
  const [utr, setUtr] = useState('');
  const next: Record<string, RaBill['status'] | undefined> = { DRAFT: 'SUBMITTED', SUBMITTED: 'CERTIFIED' };
  const ded = b.deductions;
  return (
    <Drawer
      open
      onClose={onClose}
      title={b.no}
      subtitle={`${n.lk.site[b.siteId]?.name} · ${date(b.date)}`}
      width="max-w-3xl"
      footer={
        <>
          <Button icon={<Printer className="w-4 h-4" />} onClick={() => printTaxInvoice(db, b)}>Tax invoice</Button>
          {next[b.status] && s.can('contract', 'edit') && <Button onClick={() => (update('raBills', b.id, { status: next[b.status] }, `${b.no} → ${next[b.status]}`, 'RA bill'), toast.success(`Marked ${next[b.status]!.toLowerCase()}`))}>Mark {next[b.status]!.toLowerCase()}</Button>}
          {(b.status === 'CERTIFIED' || b.status === 'PARTLY_PAID') && s.can('contract', 'edit') && <Button variant="primary" icon={<IndianRupee className="w-4 h-4" />} onClick={() => setRcpt(true)}>Record receipt</Button>}
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex gap-2 flex-wrap"><StatusBadge status={b.status} /><Badge tone="neutral">GST {b.gstPct}%</Badge>{b.escalation ? <Badge tone="violet">Escalation {inrCompact(b.escalation)}</Badge> : null}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3"><div className="text-[11px] text-muted">Gross</div><div className="font-bold"><Money v={c.gross} compact /></div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">GST</div><div className="font-bold"><Money v={c.gst} compact /></div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">Net payable</div><div className="font-bold"><Money v={c.net} compact /></div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">Outstanding</div><div className={cn('font-bold', c.outstanding > 0 && 'text-warn')}><Money v={c.outstanding} compact /></div></Card>
        </div>
        <Section title="Abstract (BIL-01)">
          <div className="rounded-xl border border-line overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[10px] uppercase text-muted"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-2">Up-to-date</th><th className="text-right px-2">Previous</th><th className="text-right px-2">This bill</th><th className="text-right px-3">Amount</th></tr></thead>
              <tbody>
                {b.lines.map((l) => (
                  <tr key={l.boqItemId} className="border-t border-line">
                    <td className="px-3 py-1.5"><span className="font-mono text-[11px] text-muted mr-1">{n.lk.boq[l.boqItemId]?.itemNo}</span>{n.lk.boq[l.boqItemId]?.description}</td>
                    <td className="text-right px-2 num">{num(l.uptoQty, 2)}</td>
                    <td className="text-right px-2 num text-muted">{num(l.prevQty, 2)}</td>
                    <td className="text-right px-2 num font-medium">{num(l.thisQty, 2)}</td>
                    <td className="text-right px-3 num"><Money v={l.thisQty * l.rate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Deductions (BIL-02)">
          <KV cols={3} items={[['Security deposit', <Money key="1" v={ded.securityDeposit} />], ['Retention', <Money key="2" v={ded.retention} />], ['TDS on works contract', <Money key="3" v={ded.tds} />], ['Labour cess', <Money key="4" v={ded.cess} />], ['GST TDS', <Money key="5" v={ded.gstTds} />], ['Royalty', <Money key="6" v={ded.royalty} />], ['Mobilisation advance recovery', <Money key="7" v={ded.advanceRecovery} />], ['Material by client', <Money key="8" v={ded.materialRecovery} />], ['Penalties', <Money key="9" v={ded.penalty} />]]} />
        </Section>
        <Section title="Receipts (BIL-04)">
          {b.receipts.length ? (
            <div className="rounded-xl border border-line divide-y divide-line">
              {b.receipts.map((r, i) => (
                <div key={i} className="flex justify-between px-3 py-2 text-sm"><span>{date(r.date)} · <span className="font-mono text-xs">{r.utr}</span></span><b><Money v={r.amount} /></b></div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No payment received yet.</p>
          )}
        </Section>
      </div>
      <Modal open={rcpt} onClose={() => setRcpt(false)} title="Payment received from client" footer={<><Button onClick={() => setRcpt(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (!amt || !utr) return toast.error('Amount and UTR required'); const receipts = [...b.receipts, { date: today(), amount: Number(amt), utr }]; const received = sum(receipts, (x) => x.amount); update('raBills', b.id, { receipts, status: received >= c.net - 1 ? 'PAID' : 'PARTLY_PAID' }, `${b.no} receipt ${inr(Number(amt))}`, 'RA bill'); setRcpt(false); toast.success('Receipt recorded'); }}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Amount" hint={`Outstanding ${inr(c.outstanding)}`}><NumberInput value={amt} onChange={setAmt} prefix="₹" /></Field>
          <Field label="UTR / reference"><Input value={utr} onChange={(e) => setUtr(e.target.value)} /></Field>
        </div>
      </Modal>
    </Drawer>
  );
}

function RaForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const { sites } = useSiteFilter();
  const [site, setSite] = useState(sites.find((x) => x.status === 'ACTIVE')?.id || '');
  const st = n.lk.site[site]!;
  const client = n.lk.client[st?.clientId || ''];
  const prevBills = db.raBills.filter((b) => b.siteId === site).sort((a, b) => a.date.localeCompare(b.date));
  const last = prevBills[prevBills.length - 1];
  const items = db.boq.filter((b) => b.siteId === site);
  const lines = items.map((it: BoqItem) => {
    const prevQty = last?.lines.find((l) => l.boqItemId === it.id)?.uptoQty || 0;
    const upto = sum(db.measurements.filter((m) => m.boqItemId === it.id && m.date <= today()), (m) => m.qty);
    return { boqItemId: it.id, uptoQty: round(upto, 2), prevQty: round(prevQty, 2), thisQty: round(Math.max(0, upto - prevQty), 2), rate: it.rate };
  }).filter((l) => l.uptoQty > 0);
  const gross = sum(lines, (l) => l.thisQty * l.rate);
  const [escalation, setEscalation] = useState<number | ''>('');
  const [pen, setPen] = useState<number | ''>('');
  const [adv, setAdv] = useState<number | ''>('');
  const [matRec, setMatRec] = useState<number | ''>('');
  const g = gross + (Number(escalation) || 0);
  const ded = {
    securityDeposit: Math.round(g * 0.025),
    retention: Math.round((g * (st?.retentionPct || 5)) / 100),
    tds: Math.round((g * (client?.tdsPct || 2)) / 100),
    cess: Math.round((g * (client?.cessPct || 1)) / 100),
    gstTds: Math.round(g * 0.02),
    royalty: st?.workType === 'ROAD' ? Math.round(g * 0.006) : 0,
    advanceRecovery: Number(adv) || 0,
    materialRecovery: Number(matRec) || 0,
    penalty: Number(pen) || 0,
  };
  const draft: RaBill = { id: '', createdAt: '', createdBy: '', no: '', seq: prevBills.length + 1, date: today(), siteId: site, lines, gstPct: st?.gstPct || 18, deductions: ded, status: 'SUBMITTED', receipts: [], escalation: Number(escalation) || undefined };
  const c = raCalc(draft);
  const save = () => {
    if (gross <= 0) return toast.error('No new measured work since the last bill');
    const no = `${st.code}/RA-${String(draft.seq).padStart(2, '0')}`;
    insert('raBills', { ...draft, id: undefined, createdAt: undefined, createdBy: undefined, no } as any, `RA bill ${no}`, 'RA bill');
    toast.success(`${no} prepared`, `Net payable ${inr(c.net)}`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Prepare RA bill" subtitle="BIL-01 · from measurements: up-to-date qty, previous billed qty, this-bill qty" width="max-w-3xl" footer={<><span className="mr-auto text-sm">Net <b>{inr(c.net)}</b></span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Submit bill</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Site"><Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.short }))} /></Field>
          <Field label="Bill"><Input disabled value={`RA-${draft.seq} · previous ${last ? `${last.no} on ${date(last.date)}` : 'none'}`} /></Field>
        </div>
        <div className="rounded-xl border border-line overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[10px] uppercase text-muted"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-2">Up-to-date</th><th className="text-right px-2">Previous</th><th className="text-right px-2">This bill</th><th className="text-right px-3">Amount</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.boqItemId} className="border-t border-line"><td className="px-3 py-1.5">{n.lk.boq[l.boqItemId]?.itemNo} {n.lk.boq[l.boqItemId]?.description.slice(0, 48)}</td><td className="text-right px-2 num">{num(l.uptoQty, 2)}</td><td className="text-right px-2 num text-muted">{num(l.prevQty, 2)}</td><td className="text-right px-2 num font-semibold">{num(l.thisQty, 2)}</td><td className="text-right px-3 num">{inr(l.thisQty * l.rate)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Escalation (BIL-05)"><NumberInput value={escalation} onChange={setEscalation} prefix="₹" /></Field>
          <Field label="Advance recovery"><NumberInput value={adv} onChange={setAdv} prefix="₹" /></Field>
          <Field label="Material by client"><NumberInput value={matRec} onChange={setMatRec} prefix="₹" /></Field>
          <Field label="Penalty"><NumberInput value={pen} onChange={setPen} prefix="₹" /></Field>
        </div>
        <KV cols={3} items={[['Gross', inr(c.gross)], [`GST ${draft.gstPct}% (BIL-03)`, inr(c.gst)], ['Security deposit 2.5%', inr(ded.securityDeposit)], [`Retention ${st?.retentionPct}%`, inr(ded.retention)], [`TDS ${client?.tdsPct}%`, inr(ded.tds)], [`Labour cess ${client?.cessPct}%`, inr(ded.cess)], ['GST TDS 2%', inr(ded.gstTds)], ['Royalty', inr(ded.royalty)], ['Net payable', <b key="n">{inr(c.net)}</b>]]} />
      </div>
    </Drawer>
  );
}

/* ================= Client ledger & receivables (BIL-06) ================= */
function ReceivablesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const rows = useMemo(() => receivablesAgeing(db).filter((r) => s.seesSite(r.siteId)), [db, s]);
  const byClient = Object.entries(groupBy(rows, (r) => r.clientId)).map(([cid, l]) => ({ cid, total: sum(l, (r) => r.outstanding), b0: sum(l.filter((r) => r.bucket === '0–30'), (r) => r.outstanding), b30: sum(l.filter((r) => r.bucket === '31–60'), (r) => r.outstanding), b60: sum(l.filter((r) => r.bucket === '61–90'), (r) => r.outstanding), b90: sum(l.filter((r) => r.bucket === '90+'), (r) => r.outstanding) }));
  const [client, setClient] = useState(db.clients[0]!.id);
  const ledger = useMemo(() => {
    const items: Array<{ date: string; type: string; ref: string; debit: number; credit: number }> = [];
    for (const b of db.raBills.filter((x) => n.lk.site[x.siteId]?.clientId === client)) {
      items.push({ date: b.date, type: 'RA bill', ref: b.no, debit: Math.round(raCalc(b).net), credit: 0 });
      for (const r of b.receipts) items.push({ date: r.date, type: 'Receipt', ref: `${b.no} · ${r.utr}`, debit: 0, credit: r.amount });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0;
    return items.map((i) => ((bal += i.debit - i.credit), { ...i, balance: bal })).reverse();
  }, [db, client]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Receivables by client" subtitle="Outstanding net of deductions" />
          <div className="px-4 pb-4"><Donut segments={byClient.map((c) => ({ label: n.lk.client[c.cid]?.code || '', value: c.total }))} format={inrCompact} center={<><div className="text-[11px] text-muted">Outstanding</div><div className="font-bold">{inrCompact(sum(byClient, (c) => c.total))}</div></>} /></div>
        </Card>
        <Card>
          <CardHeader title="Ageing" />
          <div className="px-4 pb-4">
            <ColumnChart stacked data={byClient.map((c) => ({ label: n.lk.client[c.cid]?.code || '', values: { b0: c.b0, b30: c.b30, b60: c.b60, b90: c.b90 } }))} series={[{ key: 'b0', label: '0–30' }, { key: 'b30', label: '31–60' }, { key: 'b60', label: '61–90' }, { key: 'b90', label: '90+' }]} format={inrCompact} height={200} />
          </div>
        </Card>
      </div>
      <DataTable
        title="Bills outstanding"
        rows={rows}
        rowKey={(r) => r.billNo}
        columns={[
          { key: 'bill', header: 'Bill', primary: true, value: (r) => r.billNo, cell: (r) => <span className="font-mono text-[13px]">{r.billNo}</span> },
          { key: 'client', header: 'Client', value: (r) => n.lk.client[r.clientId]?.code },
          { key: 'date', header: 'Bill date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'age', header: 'Age', align: 'right', value: (r) => r.age, cell: (r) => <Badge tone={r.age > 90 ? 'bad' : r.age > 45 ? 'warn' : 'neutral'}>{r.age} days</Badge> },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
          { key: 'net', header: 'Net', align: 'right', rate: true, value: (r) => Math.round(r.net), cell: (r) => inrCompact(r.net) },
          { key: 'out', header: 'Outstanding', align: 'right', rate: true, value: (r) => Math.round(r.outstanding), cell: (r) => <b>{inrCompact(r.outstanding)}</b> },
        ]}
      />
      <DataTable
        title={`Client ledger — ${n.lk.client[client]?.name}`}
        rows={ledger}
        rowKey={(r, i) => `${r.ref}-${i}`}
        toolbar={<Select value={client} onChange={setClient} options={db.clients.map((c) => ({ value: c.id, label: c.code }))} className="w-40" />}
        columns={[
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'type', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.type === 'Receipt' ? 'good' : 'info'}>{r.type}</Badge> },
          { key: 'ref', header: 'Reference', primary: true, value: (r) => r.ref },
          { key: 'debit', header: 'Billed', align: 'right', rate: true, value: (r) => r.debit, cell: (r) => (r.debit ? inr(r.debit) : '') },
          { key: 'credit', header: 'Received', align: 'right', rate: true, value: (r) => r.credit, cell: (r) => (r.credit ? inr(r.credit) : '') },
          { key: 'bal', header: 'Balance', align: 'right', rate: true, value: (r) => r.balance, cell: (r) => <b>{inr(r.balance)}</b> },
        ]}
      />
    </div>
  );
}

/* ================= Budget vs actual (CST-03) ================= */
function BudgetTab() {
  const db = useDB();
  const s = useSession();
  const { site, picker } = useContractSite();
  const st = db.sites.find((x) => x.id === site)!;
  const cs = siteCostSheet(db, site);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, number | ''>>({});
  const progress = (cs.workDone / st.contractValue) * 100;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {picker}
        <div className="flex-1" />
        {s.isAdmin && <Button onClick={() => (setDraft({ ...st.budget }), setEdit(true))}>Edit budget</Button>}
      </div>
      <Callout>Physical progress is <b>{progress.toFixed(1)}%</b>. A cost head that has used much more of its budget than the progress is running over (ALT-06).</Callout>
      <Card>
        <CardHeader title="Budget vs actual by cost head" />
        <div className="px-4 pb-4">
          <ColumnChart data={COST_HEADS.map((h) => ({ label: COST_HEAD_LABEL[h].split(' ')[0]!, values: { budget: st.budget[h], actual: cs.heads[h] } }))} series={[{ key: 'budget', label: 'Budget' }, { key: 'actual', label: 'Actual to date' }]} format={inrCompact} height={220} />
        </div>
      </Card>
      <DataTable
        title={`Budget vs actual — ${st.short}`}
        rows={COST_HEADS.map((h) => ({ h, budget: st.budget[h], actual: cs.heads[h] }))}
        rowKey={(r) => r.h}
        searchable={false}
        columns={[
          { key: 'h', header: 'Cost head', primary: true, value: (r) => COST_HEAD_LABEL[r.h] },
          { key: 'budget', header: 'Budget', align: 'right', rate: true, value: (r) => r.budget, cell: (r) => inrCompact(r.budget) },
          { key: 'actual', header: 'Actual', align: 'right', rate: true, value: (r) => Math.round(r.actual), cell: (r) => inrCompact(r.actual) },
          { key: 'var', header: 'Balance', align: 'right', rate: true, value: (r) => Math.round(r.budget - r.actual), cell: (r) => <span className={r.budget - r.actual < 0 ? 'text-bad' : ''}>{inrCompact(r.budget - r.actual)}</span> },
          { key: 'used', header: 'Used', value: (r) => round((r.actual / (r.budget || 1)) * 100, 1), cell: (r) => { const u = (r.actual / (r.budget || 1)) * 100; return <div className="flex items-center gap-2 min-w-[140px]"><Progress value={u} thin tone={u > progress + 15 ? 'bad' : u > progress ? 'warn' : 'good'} /><span className="text-xs num w-12 text-right">{u.toFixed(0)}%</span></div>; } },
        ]}
        totals={{ budget: inrCompact(cs.budgetTotal), actual: inrCompact(cs.cost), __export: { budget: cs.budgetTotal, actual: Math.round(cs.cost) } }}
      />
      <Drawer open={edit} onClose={() => setEdit(false)} title={`Budget — ${st.short}`} footer={<><Button onClick={() => setEdit(false)}>Cancel</Button><Button variant="primary" onClick={() => (update('sites', st.id, { budget: Object.fromEntries(COST_HEADS.map((h) => [h, Number(draft[h]) || 0])) }, `Budget revised for ${st.short}`, 'Site'), setEdit(false), toast.success('Budget saved'))}>Save</Button></>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COST_HEADS.map((h) => (
            <Field key={h} label={COST_HEAD_LABEL[h]}><NumberInput value={draft[h] ?? ''} onChange={(v) => setDraft({ ...draft, [h]: v })} prefix="₹" /></Field>
          ))}
        </div>
      </Drawer>
    </div>
  );
}

/* ================= Cost per BOQ item (CST-04) ================= */
function BoqCostTab() {
  const db = useDB();
  const n = useNames();
  const { site, picker } = useContractSite();
  const rows = useMemo(() => {
    const entries = costEntries(db).filter((c) => c.siteId === site && c.boqItemId);
    const byItem = groupBy(entries, (c) => c.boqItemId!);
    return boqProgress(db, site).map((p) => {
      const list = byItem[p.item.id] || [];
      const mat = sum(list.filter((x) => x.head === 'MATERIAL'), (x) => x.amount);
      const sub = sum(list.filter((x) => x.head === 'SUBCONTRACT'), (x) => x.amount);
      const execInWindow = sum(db.measurements.filter((m) => m.boqItemId === p.item.id && m.date >= (n.lk.site[site]?.openingAsOf || '')), (m) => m.qty);
      const perUnit = execInWindow ? (mat + sub) / execInWindow : 0;
      return { item: p.item, mat, sub, exec: execInWindow, perUnit, margin: p.item.rate ? ((p.item.rate - perUnit) / p.item.rate) * 100 : 0 };
    }).filter((r) => r.mat + r.sub > 0);
  }, [db, site]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{picker}</div>
      <Callout>Direct cost per BOQ item where consumption (MAT-04) or sub-contract bills were tagged to the item, divided by the quantity executed since go-live — compared with the BOQ rate (CST-04).</Callout>
      <DataTable
        title="Cost per BOQ item"
        rows={rows}
        rowKey={(r) => r.item.id}
        columns={[
          { key: 'item', header: 'BOQ item', primary: true, value: (r) => `${r.item.itemNo} ${r.item.description}`, cell: (r) => <div><span className="font-mono text-xs text-muted mr-1">{r.item.itemNo}</span>{r.item.description}</div> },
          { key: 'exec', header: 'Executed', align: 'right', value: (r) => round(r.exec, 2), cell: (r) => qty(r.exec, r.item.unit) },
          { key: 'mat', header: 'Material', align: 'right', rate: true, value: (r) => Math.round(r.mat), cell: (r) => inrCompact(r.mat) },
          { key: 'sub', header: 'Sub-contract', align: 'right', rate: true, value: (r) => Math.round(r.sub), cell: (r) => inrCompact(r.sub) },
          { key: 'per', header: 'Direct cost / unit', align: 'right', rate: true, value: (r) => Math.round(r.perUnit), cell: (r) => <b>{inr(r.perUnit)}</b> },
          { key: 'rate', header: 'BOQ rate', align: 'right', rate: true, value: (r) => r.item.rate, cell: (r) => inr(r.item.rate) },
          { key: 'margin', header: 'Direct margin', align: 'right', rate: true, value: (r) => round(r.margin, 1), cell: (r) => <Badge tone={r.margin > 25 ? 'good' : r.margin > 0 ? 'warn' : 'bad'}>{r.margin.toFixed(1)}%</Badge> },
        ]}
      />
    </div>
  );
}


import { useMemo, useState } from 'react';
import { DprTab, ProgrammeTab, QualityTab, SiteRegistersTab } from './SiteProgress';
import { IndianRupee, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useDB, update } from '../../data/store';
import { useSession } from '../../data/session';
import { boqProgress, costEntries, COST_HEADS, COST_HEAD_LABEL, siteCostSheet } from '../../data/selectors';
import type { CostHead } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, PageHeader, Progress, Stat, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Field, NumberInput, Select } from '../../components/ui/fields';
import { BarList, ColumnChart } from '../../components/ui/charts';
import { date, inr, inrCompact, monthLabel, monthOf, qty } from '../../lib/format';
import { groupBy, round, sum } from '../../lib/utils';
import { useModuleTab, useNames, useQueryParam } from '../shared';
import { BillsTab, BoqTab, MeasurementsTab, ReceivablesTab } from './Billing';
import { GuaranteesTab } from './Guarantees';
import { TaxTab } from './Tax';

export default function Contract() {
  const { tab, tabsEl } = useModuleTab('contract');
  return (
    <div>
      <PageHeader title="Contracts, billing & site costing" subtitle="What was billed against what was spent — profit or loss per site, every day." />
      {tabsEl}
      {tab === 'costing' && <CostingTab />}
      {tab === 'boq' && <BoqTab />}
      {tab === 'measurements' && <MeasurementsTab />}
      {tab === 'bills' && <BillsTab />}
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'guarantees' && <GuaranteesTab />}
      {tab === 'tax' && <TaxTab />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'boq-cost' && <BoqCostTab />}
      {tab === 'dpr' && <DprTab />}
      {tab === 'registers' && <SiteRegistersTab />}
      {tab === 'quality' && <QualityTab />}
      {tab === 'programme' && <ProgrammeTab />}
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
      {cs.profit < 0 && <Callout tone="bad">Cost has crossed the value of work done at this site. Check material over-use and labour productivity.</Callout>}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="xl:col-span-3">
          <CardHeader title="Site cost sheet (CST-01)" subtitle={`Includes cost before go-live (opening balances as of ${date(site.openingAsOf)})`} />
          <div className="px-4 sm:px-5 pb-5">
            <div className="rounded-xl border border-line divide-y divide-line">
              {COST_HEADS.map((h) => (
                <div key={h} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{COST_HEAD_LABEL[h]}</div>
                    <div className="text-[11px] text-muted">{({ MATERIAL: 'Site consumption, plant receipts', LABOUR: 'Attendance & wages, labour contractor bills', SUBCONTRACT: 'Sub-contractor bills', VEHICLE: 'Fuel, hire bills (HIRE-02), internal rate, maintenance', MISC: 'Expenses', OVERHEAD: 'Allocation' } as Record<CostHead, string>)[h]}</div>
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
      <Callout>Physical progress is <b>{progress.toFixed(1)}%</b>. A cost head that has used much more of its budget than the progress is running over.</Callout>
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
      <Callout>Direct cost per BOQ item where consumption or sub-contract bills were tagged to the item, divided by the quantity executed since go-live — compared with the BOQ rate (CST-04).</Callout>
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


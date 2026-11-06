import { useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, FileSpreadsheet, FileUp, IndianRupee, MessageCircleQuestion, Plus, Printer, Ruler, Send, Stamp } from 'lucide-react';
import { billLines, billTotals, computeDeductions, contractRate, deductionDiff, deviation, measureQty, mQty, priceAdjustment, gstSplit } from '@civil/domain/billing';
import { receivables } from '@civil/domain/money';
import { checkAgainstEstimate, readDeptBoq, type DeptBoq } from '@civil/domain/deptboq';
import { readXlsx, type SheetOut } from '@civil/domain/xlsx';
import { templateById } from '@civil/domain/imports';
import { sdReleaseDue } from '@civil/domain/works';
import { useDB, insert, update, runCommand } from '../../data/store';
import { useSession } from '../../data/session';
import { boqProgress } from '../../data/selectors';
import type { BillDeduction, RaBill, Site } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, Modal, Progress, Section, Stat, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, Field, Input, NumberInput, Segmented, Select, Textarea, Toggle } from '../../components/ui/fields';
import { ColumnChart } from '../../components/ui/charts';
import { date, inr, inrCompact, num, qty, today } from '../../lib/format';
import { printDocument, printLetter } from '../../lib/export';
import { cn, groupBy, round, sum } from '../../lib/utils';
import { Money, useAutoOpen, useNames, useNewParam, useQueryParam } from '../shared';
import { ImportDialog } from '../masters/ImportExport';

/* ---------- work picker shared by the billing tabs ---------- */
export function useWorkPicker() {
  const q = useQueryParam('site');
  const { siteId, sites } = useSiteFilter();
  const list = sites.filter((x) => !(x as any).outOfScope);
  const [site, setSite] = useState(q || siteId || list.find((x) => x.status === 'ACTIVE')?.id || list[0]?.id || '');
  const picker = <Select value={site} onChange={setSite} className="w-64" placeholder={list.length ? undefined : 'No works yet'} options={list.map((x) => ({ value: x.id, label: x.short || x.name }))} />;
  return { site, setSite, picker, sites: list };
}
const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', SUBMITTED: 'Submitted', CERTIFIED: 'Passed', PARTLY_PAID: 'Partly paid', PAID: 'Paid' };
const BillStatus = ({ s }: { s: string }) => <Badge tone={s === 'PAID' ? 'good' : s === 'CERTIFIED' || s === 'PARTLY_PAID' ? 'info' : s === 'DRAFT' ? 'neutral' : 'warn'} dot>{STATUS_LABEL[s] || s}</Badge>;
const NoWork = () => <Callout>Add a work first (Masters › Works) — its BOQ, measurements and bills are kept here.</Callout>;

/* ================= BOQ (BIL-01, BIL-04, XL-06) ================= */
export function BoqTab() {
  const db = useDB();
  const s = useSession();
  const { site, picker } = useWorkPicker();
  const st = db.sites.find((x) => x.id === site);
  const [extra, setExtra] = useState(false);
  const [dept, setDept] = useState(false);
  const [tpl, setTpl] = useState(false);
  const rows = useMemo(() => boqProgress(db, site).map((r) => ({ ...r, dev: deviation(r.item, r.executed) })), [db, site]);
  if (!st) return <NoWork />;
  const totals = { amount: sum(rows, (r) => r.amount), est: sum(rows, (r) => (r.item.estRate || 0) * r.item.qty), done: sum(rows, (r) => r.doneValue) };
  const over = rows.filter((r) => r.dev.excess > 0);
  const quote = st.quoteType === 'ITEM_RATE' ? 'Item rate' : st.quoteType === 'PAR' ? 'At par' : st.quoteType ? `${st.quotedPct || 0}% ${st.quoteType === 'ABOVE' ? 'above' : 'below'} estimate` : 'Tendered % not set on the work';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {picker}
        <Badge tone="info">{quote}</Badge>
        <div className="flex-1" />
        {s.can('contract', 'add') && (
          <>
            <Button icon={<FileUp className="w-4 h-4" />} onClick={() => setDept(true)}>Import department BOQ</Button>
            <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => setTpl(true)}>Import from template</Button>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setExtra(true)}>Extra item</Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <Stat label="BOQ at contract rates" value={s.showRates ? totals.amount : rows.length} format={s.showRates ? inrCompact : (x) => `${x} items`} tone="info" />
        <Stat label="BOQ at estimate rates" value={s.showRates ? totals.est : 0} format={s.showRates ? inrCompact : () => '••••'} tone="neutral" sub={st.estimatedCost && s.showRates ? `estimated cost ${inrCompact(st.estimatedCost)}` : undefined} />
        <Stat label="Executed value" value={s.showRates ? totals.done : 0} format={s.showRates ? inrCompact : () => '••••'} tone="brand" sub={`${((totals.done / (totals.amount || 1)) * 100).toFixed(1)}% complete`} />
        <Stat label="Items above BOQ quantity" value={over.length} tone={over.length ? 'bad' : 'good'} sub={over.length ? 'deviation — see red rows' : 'none'} />
      </div>
      <DataTable
        title="BOQ and progress"
        rows={rows}
        rowKey={(r) => r.item.id}
        pageSize={25}
        rowClassName={(r) => (r.dev.excess > 0 ? 'bg-bad-soft/40' : undefined)}
        empty={<div className="p-8 text-center text-sm text-muted">No BOQ yet — import the department's BOQ Excel file, or the WCM template.</div>}
        columns={[
          { key: 'no', header: 'Item', value: (r) => r.item.itemNo, cell: (r) => <span className="font-mono text-xs">{r.item.itemNo}</span> },
          { key: 'desc', header: 'Description', primary: true, value: (r) => r.item.description, cell: (r) => <div className="max-w-xl"><div className="line-clamp-3">{r.item.description}</div>{r.item.isExtra && <Badge tone="violet" className="mt-1">Extra item · {r.item.approvalRef || 'approval pending'}</Badge>}</div> },
          { key: 'qty', header: 'BOQ qty', align: 'right', value: (r) => r.item.qty, cell: (r) => qty(r.item.qty, r.item.unit) },
          { key: 'est', header: 'Estimate rate', align: 'right', rate: true, value: (r) => r.item.estRate || 0, cell: (r) => (r.item.estRate ? inr(r.item.estRate) : '—'), hideMobile: true },
          { key: 'rate', header: 'Contract rate', align: 'right', rate: true, value: (r) => r.item.rate, cell: (r) => inr(r.item.rate) },
          { key: 'exec', header: 'Executed', align: 'right', value: (r) => round(r.executed, 3), cell: (r) => qty(r.executed) },
          { key: 'pct', header: '% done', value: (r) => round(r.pct, 1), cell: (r) => <div className="flex items-center gap-2 min-w-[110px]"><Progress value={Math.min(100, r.pct)} thin tone={r.pct > 100 ? 'bad' : 'brand'} /><span className="text-xs num w-12 text-right">{r.pct.toFixed(1)}%</span></div> },
          { key: 'dev', header: 'Above BOQ', align: 'right', value: (r) => r.dev.pct, cell: (r) => (r.dev.excess > 0 ? <Badge tone="bad">+{num(r.dev.excess)} · {r.dev.pct}%</Badge> : <span className="text-muted">—</span>) },
          { key: 'amt', header: 'Amount', align: 'right', rate: true, value: (r) => Math.round(r.amount), cell: (r) => inrCompact(r.amount), hideMobile: true },
        ]}
      />
      {extra && <ExtraItemForm site={st} onClose={() => setExtra(false)} />}
      {dept && <DeptBoqDialog site={st} onClose={() => setDept(false)} />}
      {tpl && <ImportDialog template={templateById('boq')!} onClose={() => setTpl(false)} />}
    </div>
  );
}

function ExtraItemForm({ site, onClose }: { site: Site; onClose: () => void }) {
  const db = useDB();
  const n = db.boq.filter((x) => x.siteId === site.id && x.isExtra).length + 1;
  const [v, setV] = useState({ itemNo: `EI-${n}`, description: '', unit: 'cum', qty: '' as number | '', rate: '' as number | '', approvalRef: '', approvalDate: '', rateAnalysis: '' });
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const save = () => {
    if (!v.description || !v.qty || !v.rate) return toast.error('Description, quantity and rate are required');
    insert('boq', { siteId: site.id, itemNo: v.itemNo, description: v.description, unit: v.unit, qty: Number(v.qty), rate: Number(v.rate), isExtra: true, approvalRef: v.approvalRef || undefined, approvalDate: v.approvalDate || undefined, rateAnalysis: v.rateAnalysis || undefined } as any, `Extra item ${v.itemNo}`, 'BOQ');
    toast.success('Extra item added');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Extra item" subtitle="With its rate analysis and the approval letter" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Item no."><Input value={v.itemNo} onChange={(e) => set({ itemNo: e.target.value })} /></Field>
        <Field label="Unit"><Input value={v.unit} onChange={(e) => set({ unit: e.target.value })} /></Field>
        <Field label="Description" className="col-span-2" required><Textarea value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Quantity" required><NumberInput value={v.qty} onChange={(x) => set({ qty: x })} /></Field>
        <Field label="Rate" required><NumberInput value={v.rate} onChange={(x) => set({ rate: x })} prefix="₹" /></Field>
        <Field label="Approval letter no." hint="Leave blank while approval is pending"><Input value={v.approvalRef} onChange={(e) => set({ approvalRef: e.target.value })} /></Field>
        <Field label="Approval date"><Input type="date" value={v.approvalDate} onChange={(e) => set({ approvalDate: e.target.value })} /></Field>
        <Field label="Rate analysis" className="col-span-2" hint="Materials, labour, machinery, overheads and profit"><Textarea rows={5} value={v.rateAnalysis} onChange={(e) => set({ rateAnalysis: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}

/** XL-06 / TND-04: the tender's BOQ file, hidden sheets included */
function DeptBoqDialog({ site, onClose }: { site: Site; onClose: () => void }) {
  const [sheets, setSheets] = useState<SheetOut[] | null>(null);
  const [boq, setBoq] = useState<DeptBoq | undefined>();
  const [file, setFile] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xls';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      if (/\.xls$/i.test(f.name)) return toast.error('Old .xls file', 'Open it in Excel and use "Save as" → Excel Workbook (.xlsx), then choose it here. Hidden sheets are kept.');
      try {
        const all = await readXlsx(new Uint8Array(await f.arrayBuffer()));
        setFile(f.name);
        setSheets(all);
        setBoq(readDeptBoq(all));
      } catch (e) {
        toast.error('Could not read the file', (e as Error).message);
      }
    };
    inp.click();
  };
  const check = boq ? checkAgainstEstimate(boq.total, site.estimatedCost) : null;
  const save = async () => {
    if (!boq?.items.length) return;
    setBusy(true);
    try {
      const ops = boq.items.map((it) => ({ row: it.row, kind: 'insert' as const, coll: 'boq' as const, rec: { siteId: site.id, itemNo: it.itemNo, description: it.description, unit: it.unit || 'nos', qty: it.qty, estRate: it.estRate, rate: contractRate(site, it.estRate) } }));
      await runCommand({ kind: 'import', template: 'boq', ops }, 'Department BOQ import');
      toast.success(`${ops.length} BOQ items saved`, `Rates with the tendered % applied`);
      onClose();
    } catch (e) {
      toast.error('Nothing was imported', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const candidates = (sheets || []).filter((s) => readDeptBoq([s]));
  return (
    <Modal open onClose={onClose} size="max-w-3xl" title={`Department BOQ — ${site.short}`} footer={<><Button onClick={onClose}>Cancel</Button><Button icon={<FileUp className="w-4 h-4" />} onClick={pick}>{sheets ? 'Choose another file' : 'Choose BOQ file'}</Button><Button variant="primary" loading={busy} disabled={!boq?.items.length} onClick={save}>{boq ? `Save ${boq.items.length} items` : 'Save'}</Button></>}>
      <div className="space-y-4 text-sm">
        {!sheets && <Callout>Choose the BOQ Excel file that came with the tender. Every sheet is searched, hidden sheets too. The estimate rate is kept and your tendered % is applied to give the contract rate.</Callout>}
        {sheets && !boq && <Callout tone="bad">No BOQ table found in {file}. The sheet needs columns like Item / Description / Quantity / Units / Rate.</Callout>}
        {boq && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{file}</Badge>
              {candidates.length > 1 ? (
                <Select className="w-56" value={boq.sheet} onChange={(x) => setBoq(readDeptBoq(sheets!, x))} options={candidates.map((s) => ({ value: s.name, label: `${s.name}${s.hidden ? ' (hidden)' : ''}` }))} />
              ) : (
                <Badge>{boq.sheet}{boq.hidden ? ' · hidden sheet' : ''}</Badge>
              )}
              <Badge>{boq.items.length} items</Badge>
              <Badge tone="brand">Total {inr(boq.total)}</Badge>
            </div>
            {check && <Callout tone={check.ok ? 'good' : 'warn'}>{check.message}{site.estimatedCost ? ` (estimated cost ${inr(site.estimatedCost)})` : ''}.</Callout>}
            {boq.warnings.length > 0 && <div className="rounded-xl bg-warn-soft text-warn px-3 py-2 text-xs space-y-0.5 max-h-28 overflow-auto">{boq.warnings.slice(0, 30).map((w, i) => <div key={i}>{w}</div>)}</div>}
            <div className="rounded-xl border border-line max-h-72 overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-3 sticky top-0"><tr><th className="text-left px-2 py-1.5">Item</th><th className="text-left px-2">Description</th><th className="text-right px-2">Qty</th><th className="text-left px-2">Unit</th><th className="text-right px-2">Estimate rate</th><th className="text-right px-2">Contract rate</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {boq.items.slice(0, 200).map((it) => (
                    <tr key={it.row}><td className="px-2 py-1 font-mono">{it.itemNo}</td><td className="px-2 py-1"><div className="line-clamp-2">{it.description}</div></td><td className="px-2 text-right num">{num(it.qty)}</td><td className="px-2">{it.unit}</td><td className="px-2 text-right num">{inr(it.estRate)}</td><td className="px-2 text-right num font-medium">{inr(contractRate(site, it.estRate))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ================= Measurement book (BIL-02) ================= */
export function MeasurementsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { site, picker } = useWorkPicker();
  const [form, setForm] = useState(false);
  const [query, setQuery] = useState<{ id: string; remark: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'QUERY'>('all');
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.measurements.filter((m) => m.siteId === site && (filter === 'all' || (m.jeStatus || 'PENDING') === filter)).slice().reverse(), [db, site, filter]);
  if (!db.sites.some((x) => x.id === site)) return <NoWork />;
  const canCheck = s.can('contract', 'edit') || s.can('contract', 'approve');
  const je = (id: string, jeStatus: string, jeRemark?: string) => update('measurements', id, { jeStatus, jeRemark }, `Measurement ${jeStatus === 'CHECKED' ? 'checked by JE' : 'queried by JE'}`, 'Measurement');
  return (
    <>
      <DataTable
        title="Measurement book"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={
          <>
            {picker}
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'PENDING', label: 'To check' }, { value: 'QUERY', label: 'Queried' }]} />
            {s.can('contract', 'add') && <Button variant="primary" icon={<Ruler className="w-4 h-4" />} onClick={() => setForm(true)}>Record measurement</Button>}
          </>
        }
        columns={[
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'item', header: 'BOQ item', primary: true, value: (r) => n.lk.boq[r.boqItemId]?.description, cell: (r) => <div><span className="font-mono text-xs text-muted mr-1">{n.lk.boq[r.boqItemId]?.itemNo}</span>{n.lk.boq[r.boqItemId]?.description?.slice(0, 80)}{r.remarks && <div className="text-[11px] text-muted">{r.remarks}</div>}</div> },
          { key: 'loc', header: 'Location / chainage', value: (r) => r.chainage },
          { key: 'dims', header: 'Nos × L × B × D', value: (r) => [r.nos, r.length, r.breadth, r.depth].filter(Boolean).join(' × '), cell: (r) => <span className="text-xs num">{[r.nos, r.length, r.breadth, r.depth].filter(Boolean).join(' × ') || '—'}</span>, hideMobile: true },
          { key: 'qty', header: 'Quantity', align: 'right', value: (r) => mQty(r), cell: (r) => <b className={r.deduction ? 'text-bad' : ''}>{r.deduction ? '− ' : ''}{qty(r.qty, n.lk.boq[r.boqItemId]?.unit)}</b> },
          { key: 'je', header: 'JE check', value: (r) => r.jeStatus || 'PENDING', cell: (r) => (r.jeStatus === 'CHECKED' ? <Badge tone="good" dot>Checked</Badge> : r.jeStatus === 'QUERY' ? <Badge tone="bad" dot>Query: {r.jeRemark}</Badge> : <Badge tone="warn" dot>To check</Badge>) },
          { key: 'val', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(mQty(r) * (n.lk.boq[r.boqItemId]?.rate || 0)), cell: (r) => inr(mQty(r) * (n.lk.boq[r.boqItemId]?.rate || 0)), hideMobile: true },
          ...(canCheck
            ? [{ key: 'act', header: '', sortable: false, cell: (r: any) => (r.jeStatus === 'CHECKED' ? null : <div className="flex gap-1 justify-end"><Button size="sm" variant="ghost" icon={<CircleCheck className="w-3.5 h-3.5" />} onClick={(e) => (e.stopPropagation(), je(r.id, 'CHECKED'))}>Checked</Button><Button size="sm" variant="ghost" icon={<MessageCircleQuestion className="w-3.5 h-3.5" />} onClick={(e) => (e.stopPropagation(), setQuery({ id: r.id, remark: '' }))}>Query</Button></div>) }]
            : []),
        ]}
      />
      <p className="text-xs text-muted mt-2">Entries under a JE query are left out of RA bills until they are checked.</p>
      {form && <MeasurementForm siteId={site} onClose={() => setForm(false)} />}
      <Modal open={!!query} onClose={() => setQuery(null)} title="JE's query on this measurement" footer={<><Button onClick={() => setQuery(null)}>Cancel</Button><Button variant="primary" onClick={() => (query!.remark.trim() ? (je(query!.id, 'QUERY', query!.remark.trim()), setQuery(null)) : toast.error('Write the query'))}>Save</Button></>}>
        <Field label="Query"><Textarea autoFocus value={query?.remark || ''} onChange={(e) => setQuery({ ...query!, remark: e.target.value })} placeholder="e.g. thickness short at Ch 2+400" /></Field>
      </Modal>
    </>
  );
}

function MeasurementForm({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const db = useDB();
  const [item, setItem] = useState('');
  const [d, setD] = useState(today());
  const [chain, setChain] = useState('');
  const [mb, setMb] = useState('');
  const [nos, setNos] = useState<number | ''>(1);
  const [L, setL] = useState<number | ''>('');
  const [B, setB] = useState<number | ''>('');
  const [Dp, setDp] = useState<number | ''>('');
  const [direct, setDirect] = useState<number | ''>('');
  const [ded, setDed] = useState(false);
  const [remarks, setRemarks] = useState('');
  const b = db.boq.find((x) => x.id === item);
  const dims = { nos: Number(nos) || 0, length: Number(L) || 0, breadth: Number(B) || 0, depth: Number(Dp) || 0 };
  const useDims = !!(dims.length || dims.breadth || dims.depth);
  const q = useDims ? measureQty(dims) || 0 : Number(direct) || 0;
  const save = () => {
    if (!b || !q) return toast.error('Choose the BOQ item and enter dimensions or quantity');
    insert('measurements', { date: d, siteId, boqItemId: item, chainage: chain, ...(useDims ? dims : { nos: 0, length: 0, breadth: 0, depth: 0 }), qty: q, mbNo: mb, deduction: ded || undefined, remarks: remarks || undefined } as any, `Measurement ${b.itemNo} ${ded ? '−' : ''}${q} ${b.unit}`, 'Measurement');
    toast.success(ded ? 'Deduction recorded' : 'Measurement recorded', `${ded ? '−' : ''}${qty(q, b.unit)} · waiting for JE check`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Measurement" subtitle="Nos × length × breadth × depth — blank dimensions are not used" footer={<><span className="mr-auto text-sm">Qty <b className={ded ? 'text-bad' : ''}>{ded ? '− ' : ''}{qty(q, b?.unit)}</b></span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="BOQ item" required><Combo value={item} onChange={setItem} options={db.boq.filter((x) => x.siteId === siteId).map((x) => ({ value: x.id, label: `${x.itemNo} ${x.description.slice(0, 90)}`, hint: `${x.unit} · BOQ ${num(x.qty)}` }))} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="MB no. / page"><Input value={mb} onChange={(e) => setMb(e.target.value)} placeholder="MB 12, p. 34" /></Field>
          <Field label="Location / chainage" className="col-span-2"><Input value={chain} onChange={(e) => setChain(e.target.value)} placeholder="Ch 2+300 to 2+500, LHS" /></Field>
          <Field label="Nos"><NumberInput value={nos} onChange={setNos} /></Field>
          <Field label="Length (m)"><NumberInput value={L} onChange={setL} /></Field>
          <Field label="Breadth (m)"><NumberInput value={B} onChange={setB} /></Field>
          <Field label="Depth / height (m)"><NumberInput value={Dp} onChange={setDp} /></Field>
        </div>
        {!useDims && <Field label="…or quantity directly" hint="For MT / weighbridge-based items"><NumberInput value={direct} onChange={setDirect} suffix={b?.unit} /></Field>}
        <Toggle checked={ded} onChange={setDed} label="This is a deduction" hint="Openings, overlaps — the quantity is subtracted from the item" />
        <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

/* ================= RA bills (BIL-03, 05, 06, 08, 10) ================= */
export function BillsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const q = useQueryParam('q');
  const [form, setForm] = useState(false);
  const [view, setView] = useState<RaBill | null>(null);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.raBills.filter((b) => s.seesSite(b.siteId) && (!siteId || b.siteId === siteId) && (!q || b.no === q)).slice().sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq), [db, s, siteId, q]);
  return (
    <>
      <DataTable
        title="Running account bills"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setView}
        toolbar={s.can('contract', 'add') && s.showRates && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Prepare bill</Button>}
        empty={<div className="p-8 text-center text-sm text-muted">No bills yet. Bills are prepared from the measurement book.</div>}
        columns={[
          { key: 'no', header: 'Bill', primary: true, value: (r) => r.no, cell: (r) => <div><span className="font-mono text-[13px]">{r.no}</span>{r.invoiceNo && <div className="text-[11px] text-muted font-mono">{r.invoiceNo}</div>}</div> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'site', header: 'Work', value: (r) => n.site(r.siteId) },
          { key: 'gross', header: 'Gross', align: 'right', rate: true, value: (r) => Math.round(billTotals(r).gross), cell: (r) => inrCompact(billTotals(r).gross) },
          { key: 'ded', header: 'Deductions', align: 'right', rate: true, value: (r) => Math.round(billTotals(r).deductions), cell: (r) => <span>{inrCompact(billTotals(r).deductions)}{deductionDiff(r).length > 0 && <CircleAlert className="w-3.5 h-3.5 text-warn inline ml-1" aria-label="Differs from expected" />}</span>, hideMobile: true },
          { key: 'net', header: 'Net', align: 'right', rate: true, value: (r) => Math.round(billTotals(r).net), cell: (r) => <b>{inrCompact(billTotals(r).net)}</b> },
          { key: 'out', header: 'Outstanding', align: 'right', rate: true, value: (r) => Math.round(billTotals(r).outstanding), cell: (r) => inrCompact(billTotals(r).outstanding) },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <div className="flex gap-1 flex-wrap"><BillStatus s={r.status} />{r.kind === 'FINAL' && <Badge tone="violet">Final</Badge>}</div> },
        ]}
      />
      {form && <RaForm onClose={() => setForm(false)} />}
      {view && <RaView bill={view} onClose={() => setView(null)} />}
    </>
  );
}

const dedHead = (b: RaBill, code: string) => b.ded?.find((d) => d.code === code)?.head || code.replace(/^OTH:/, '');

function RaForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const { site, setSite, sites } = useWorkPicker();
  const st = db.sites.find((x) => x.id === site);
  const [d, setD] = useState(today());
  const [kind, setKind] = useState<'RA' | 'FINAL'>('RA');
  const [pa, setPa] = useState<Record<string, { currentPrice: number | ''; qty: number | '' }>>({});
  const [man, setMan] = useState<{ materialRecovery: number | ''; penalty: number | ''; interest: number | '' }>({ materialRecovery: '', penalty: '', interest: '' });
  const [fixed, setFixed] = useState<Record<string, number | ''>>({});
  const [busy, setBusy] = useState(false);
  const prev = db.raBills.filter((b) => b.siteId === site).sort((a, b) => a.seq - b.seq);
  const finalDone = prev.some((b) => b.kind === 'FINAL');
  const lines = useMemo(() => (st ? billLines(db, site, d) : []), [db, site, d, st]);
  const work = sum(lines, (l) => l.thisQty * l.rate);
  const paIn = Object.entries(pa).map(([name, x]) => ({ name, currentPrice: Number(x.currentPrice) || 0, qty: Number(x.qty) || 0 }));
  const paLines = st ? priceAdjustment(st, work, paIn) : [];
  const gross = work + sum(paLines, (x) => x.amount);
  const gst = (gross * (st?.gstPct || 0)) / 100;
  const manual = { materialRecovery: Number(man.materialRecovery) || 0, penalty: Number(man.penalty) || 0, interest: Number(man.interest) || 0, fixed: Object.fromEntries(Object.entries(fixed).map(([k, v]) => [k, Number(v) || 0])) };
  const ded: BillDeduction[] = st ? computeDeductions(db, st, gross, gst, prev.length + 1, manual) : [];
  const net = gross + gst - sum(ded, (x) => x.amount);
  const queried = db.measurements.filter((m) => m.siteId === site && m.jeStatus === 'QUERY' && m.date <= d).length;
  const fixedHeads = (st?.deductions?.others || []).filter((o) => o.basis === 'FIXED');
  const save = async (status: 'DRAFT' | 'SUBMITTED') => {
    if (!st) return;
    if (work <= 0 && kind !== 'FINAL') return toast.error('No new measured work since the last bill');
    setBusy(true);
    try {
      const r = await runCommand({ kind: 'insert', coll: 'raBills', rec: { date: d, siteId: site, kind, status, paInputs: paIn, manual } as any }, 'RA bill');
      toast.success(`${r?.no || 'Bill'} ${status === 'DRAFT' ? 'saved as draft' : 'submitted'}`, r?.invoiceNo ? `Tax invoice ${r.invoiceNo}` : undefined);
      onClose();
    } catch (e) {
      toast.error('Bill not saved', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-4xl"
      title={kind === 'FINAL' ? 'Prepare final bill' : 'Prepare RA bill'}
      subtitle="Quantities from the measurement book; deductions from the work's profile"
      footer={<><span className="mr-auto text-sm">Net payable <b>{inr(net)}</b></span><Button onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => save('DRAFT')}>Save draft</Button><Button variant="primary" loading={busy} icon={<Send className="w-4 h-4" />} onClick={() => save('SUBMITTED')}>Submit bill</Button></>}
    >
      {!st ? (
        <NoWork />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Work"><Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.short }))} /></Field>
            <Field label="Bill date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
            <Field label="Bill"><Segmented value={kind} onChange={setKind} options={[{ value: 'RA', label: `RA-${prev.length + 1}` }, { value: 'FINAL', label: 'Final bill' }]} /></Field>
          </div>
          {finalDone && <Callout tone="bad">The final bill of this work has already been made.</Callout>}
          {queried > 0 && <Callout tone="warn">{queried} measurement(s) under a JE query are left out of this bill.</Callout>}
          <Section title="Abstract">
            <div className="rounded-xl border border-line overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-2 text-[10px] uppercase text-muted"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-2">Up to date</th><th className="text-right px-2">Previous</th><th className="text-right px-2">This bill</th><th className="text-right px-2">Rate</th><th className="text-right px-3">Amount</th></tr></thead>
                <tbody>
                  {lines.map((l) => {
                    const it = n.lk.boq[l.boqItemId];
                    const dev = it ? deviation(it, l.uptoQty) : { excess: 0, pct: 0 };
                    return (
                      <tr key={l.boqItemId} className="border-t border-line">
                        <td className="px-3 py-1.5"><span className="font-mono text-[11px] text-muted mr-1">{it?.itemNo}</span>{it?.description.slice(0, 70)}{dev.excess > 0 && <Badge tone="bad" className="ml-1">+{dev.pct}% over BOQ</Badge>}</td>
                        <td className="text-right px-2 num">{num(l.uptoQty, 3)}</td><td className="text-right px-2 num text-muted">{num(l.prevQty, 3)}</td><td className="text-right px-2 num font-semibold">{num(l.thisQty, 3)}</td><td className="text-right px-2 num">{inr(l.rate)}</td><td className="text-right px-3 num">{inr(l.thisQty * l.rate)}</td>
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted">No measurements yet</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
          {st.priceAdjustment?.applicable && (
            <Section title="Price adjustment">
              <div className="space-y-2">
                {st.priceAdjustment.components.map((c) => (
                  <div key={c.name} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                    <div className="text-sm"><b>{c.name}</b><div className="text-[11px] text-muted">base {inr(c.basePrice)}/{c.unit} · {c.method === 'QUANTITY' ? 'by quantity' : `${c.sharePct}% share`}</div></div>
                    <Field label="Current price"><NumberInput value={pa[c.name]?.currentPrice ?? ''} onChange={(x) => setPa({ ...pa, [c.name]: { ...(pa[c.name] || { qty: '', currentPrice: '' }), currentPrice: x } })} prefix="₹" /></Field>
                    {c.method === 'QUANTITY' ? <Field label={`Quantity used (${c.unit})`}><NumberInput value={pa[c.name]?.qty ?? ''} onChange={(x) => setPa({ ...pa, [c.name]: { ...(pa[c.name] || { qty: '', currentPrice: '' }), qty: x } })} /></Field> : <div />}
                    <div className="text-right text-sm num pb-2">{inr(paLines.find((p) => p.name === c.name)?.amount || 0)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section title="Entered for this bill">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Department material recovered"><NumberInput value={man.materialRecovery} onChange={(x) => setMan({ ...man, materialRecovery: x })} prefix="₹" /></Field>
              <Field label="Time penalty / LD"><NumberInput value={man.penalty} onChange={(x) => setMan({ ...man, penalty: x })} prefix="₹" /></Field>
              <Field label="Interest on advance"><NumberInput value={man.interest} onChange={(x) => setMan({ ...man, interest: x })} prefix="₹" /></Field>
              {fixedHeads.map((h) => <Field key={h.head} label={h.head}><NumberInput value={fixed[h.head] ?? ''} onChange={(x) => setFixed({ ...fixed, [h.head]: x })} prefix="₹" /></Field>)}
            </div>
          </Section>
          <Section title="Bill summary">
            <div className="rounded-xl border border-line divide-y divide-line text-sm">
              <Row k="Value of work this bill" v={work} />
              {paLines.length > 0 && <Row k="Price adjustment" v={sum(paLines, (x) => x.amount)} />}
              <Row k="Gross" v={gross} bold />
              <Row k={`GST @ ${st.gstPct}%`} v={gst} />
              {ded.map((x) => <Row key={x.code} k={`Less: ${x.head}${x.pct ? ` @ ${x.pct}% on ${inr(x.base)}` : ''}${x.note ? ` (${x.note})` : ''}`} v={-x.amount} />)}
              <Row k="Net payable" v={net} bold />
            </div>
          </Section>
        </div>
      )}
    </Drawer>
  );
}
const Row = ({ k, v, bold }: { k: string; v: number; bold?: boolean }) => (
  <div className={cn('flex justify-between gap-4 px-3 py-1.5', bold && 'font-semibold bg-surface-2')}><span>{k}</span><span className="num">{inr(v)}</span></div>
);

function printInvoice(db: ReturnType<typeof useDB>, b: RaBill) {
  const site = db.sites.find((x) => x.id === b.siteId)!;
  const client = db.clients.find((c) => c.id === site.clientId);
  const office = client?.offices?.find((o) => o.id === site.officeId);
  const firm = db.firms.find((f) => f.id === b.firmId) || db.firms[0];
  const t = billTotals(b);
  const g = gstSplit(firm?.gstin || '', office?.gstin || client?.gstin || '', t.gst);
  printDocument({
    firmId: firm?.id,
    title: `Tax Invoice ${b.invoiceNo || '(draft)'}`,
    meta: [
      ['Invoice no.', b.invoiceNo || 'Not yet submitted'], ['Invoice date', date(b.submittedOn || b.date)],
      ['Supplier GSTIN', firm?.gstin || ''], ['Recipient', [office?.division, client?.name].filter(Boolean).join(', ')],
      ['Recipient GSTIN', office?.gstin || client?.gstin || '—'], ['Place of supply', (office?.gstin || client?.gstin || firm?.gstin || '').slice(0, 2) === '16' || !(office?.gstin || client?.gstin) ? 'Tripura (16)' : (office?.gstin || client?.gstin || '').slice(0, 2)],
      ['Work', site.name], ['Agreement', [site.agreementNo, site.agreementDate && date(site.agreementDate)].filter(Boolean).join(' dt. ') || site.workOrderNo],
      ['Bill', `${b.no}${b.kind === 'FINAL' ? ' (final)' : ''}`], ['SAC', '9954 — works contract service'],
    ],
    table: { title: 'Abstract', headers: ['Item', 'Description', 'Unit', 'Up to date', 'Previous', 'This bill', 'Rate', 'Amount'], rows: b.lines.filter((l) => l.thisQty !== 0).map((l) => { const it = db.boq.find((x) => x.id === l.boqItemId); return [it?.itemNo, it?.description.slice(0, 120), it?.unit, l.uptoQty, l.prevQty, l.thisQty, l.rate, Math.round(l.thisQty * l.rate)]; }), numeric: [3, 4, 5, 6, 7] },
    summary: [
      ['Value of work', inr(t.work)],
      ...(t.pa ? ([['Price adjustment', inr(t.pa)]] as Array<[string, string]>) : []),
      ['Taxable value', inr(t.gross)],
      ...(g.intra ? ([[`CGST @ ${b.gstPct / 2}%`, inr(g.cgst)], [`SGST @ ${b.gstPct / 2}%`, inr(g.sgst)]] as Array<[string, string]>) : ([[`IGST @ ${b.gstPct}%`, inr(g.igst)]] as Array<[string, string]>)),
      ['Invoice value', inr(t.gross + t.gst)],
      ...((b.actualDed || b.ded || []).map((x: any) => [`Less: ${dedHead(b, x.code)}`, inr(-x.amount)]) as Array<[string, string]>),
      ['Net receivable', inr(t.net)],
    ],
    footerNote: 'Tax is payable on this invoice by the supplier. Deductions shown are as made / expected by the department.',
  });
}

function RaView({ bill, onClose }: { bill: RaBill; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const b = db.raBills.find((x) => x.id === bill.id) || bill;
  const t = billTotals(b);
  const diff = deductionDiff(b);
  const site = db.sites.find((x) => x.id === b.siteId);
  const [pass, setPass] = useState(false);
  const [rcpt, setRcpt] = useState(false);
  const canEdit = s.can('contract', 'edit');
  return (
    <Drawer
      open
      onClose={onClose}
      title={b.no}
      subtitle={`${n.lk.site[b.siteId]?.name} · ${date(b.date)}`}
      width="max-w-4xl"
      footer={
        <>
          <Button icon={<Printer className="w-4 h-4" />} onClick={() => printInvoice(db, b)}>Tax invoice</Button>
          {b.status === 'DRAFT' && canEdit && <Button variant="primary" icon={<Send className="w-4 h-4" />} onClick={() => (update('raBills', b.id, { status: 'SUBMITTED', submittedOn: today() }, `${b.no} submitted`, 'RA bill'), toast.success('Bill submitted'))}>Submit</Button>}
          {b.status === 'SUBMITTED' && canEdit && <Button variant="primary" icon={<Stamp className="w-4 h-4" />} onClick={() => setPass(true)}>Mark passed</Button>}
          {(b.status === 'CERTIFIED' || b.status === 'PARTLY_PAID' || b.status === 'PAID') && canEdit && <Button onClick={() => setPass(true)}>Edit passing details</Button>}
          {(b.status === 'CERTIFIED' || b.status === 'PARTLY_PAID') && canEdit && <Button variant="primary" icon={<IndianRupee className="w-4 h-4" />} onClick={() => setRcpt(true)}>Record payment</Button>}
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex gap-2 flex-wrap items-center"><BillStatus s={b.status} />{b.kind === 'FINAL' && <Badge tone="violet">Final bill</Badge>}{b.invoiceNo && <Badge>Tax invoice {b.invoiceNo}</Badge>}<Badge tone="neutral">GST {b.gstPct}%</Badge></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3"><div className="text-[11px] text-muted">Gross</div><div className="font-bold"><Money v={t.gross} compact /></div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">GST</div><div className="font-bold"><Money v={t.gst} compact /></div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">Net receivable</div><div className="font-bold"><Money v={t.net} compact /></div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">Outstanding</div><div className={cn('font-bold', t.outstanding > 0 && 'text-warn')}><Money v={t.outstanding} compact /></div></Card>
        </div>
        <Section title="Tracking">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            {[['Bill date', b.date], ['Submitted', b.submittedOn], ['Passed', b.passedOn], ['Paid', b.status === 'PAID' ? b.receipts.at(-1)?.date : undefined]].map(([k, v]) => (
              <div key={k} className={cn('rounded-xl border px-3 py-2', v ? 'border-good/40 bg-good-soft/40' : 'border-line')}><div className="text-[11px] text-muted">{k}</div><div className="font-medium">{v ? date(v) : '—'}</div></div>
            ))}
          </div>
          {b.passedGross ? <p className="text-xs text-muted mt-2">Passed for gross {inr(b.passedGross)} (billed {inr(t.gross)}).</p> : null}
        </Section>
        <Section title="Abstract">
          <div className="rounded-xl border border-line overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-2 text-[10px] uppercase text-muted"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-2">Up to date</th><th className="text-right px-2">Previous</th><th className="text-right px-2">This bill</th><th className="text-right px-3">Amount</th></tr></thead>
              <tbody>
                {b.lines.map((l) => (
                  <tr key={l.boqItemId} className="border-t border-line"><td className="px-3 py-1.5"><span className="font-mono text-[11px] text-muted mr-1">{n.lk.boq[l.boqItemId]?.itemNo}</span>{n.lk.boq[l.boqItemId]?.description.slice(0, 80)}</td><td className="text-right px-2 num">{num(l.uptoQty, 3)}</td><td className="text-right px-2 num text-muted">{num(l.prevQty, 3)}</td><td className="text-right px-2 num font-medium">{num(l.thisQty, 3)}</td><td className="text-right px-3 num"><Money v={l.thisQty * l.rate} /></td></tr>
                ))}
                {(b.priceAdj || []).map((p) => <tr key={p.name} className="border-t border-line bg-surface-2"><td className="px-3 py-1.5" colSpan={4}>Price adjustment — {p.name} ({inr(p.basePrice)} → {inr(p.currentPrice)}{p.method === 'QUANTITY' ? ` × ${num(p.qty)}` : `, ${p.sharePct}% share`})</td><td className="text-right px-3 num"><Money v={p.amount} /></td></tr>)}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Deductions">
          <div className="rounded-xl border border-line overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-2 text-[10px] uppercase text-muted"><tr><th className="text-left px-3 py-2">Head</th><th className="text-right px-2">Expected</th><th className="text-right px-2">By division</th><th className="text-right px-3">Difference</th></tr></thead>
              <tbody>
                {[...new Set([...(b.ded || []).map((x) => x.code), ...(b.actualDed || []).map((x) => x.code)])].map((code) => {
                  const e = b.ded?.find((x) => x.code === code);
                  const a = b.actualDed?.find((x) => x.code === code);
                  const df = diff.find((x) => x.code === code);
                  return (
                    <tr key={code} className={cn('border-t border-line', df && 'bg-warn-soft/50')}><td className="px-3 py-1.5">{dedHead(b, code)}{e?.pct ? <span className="text-muted text-[11px]"> @ {e.pct}%</span> : null}{e?.note ? <div className="text-[11px] text-muted">{e.note}</div> : null}</td><td className="text-right px-2 num">{e ? inr(e.amount) : '—'}</td><td className="text-right px-2 num">{b.actualDed ? inr(a?.amount || 0) : '—'}</td><td className={cn('text-right px-3 num', df && 'text-warn font-semibold')}>{df ? `${df.diff > 0 ? '+' : ''}${inr(df.diff)}` : ''}</td></tr>
                  );
                })}
                {!b.ded && <tr className="border-t border-line"><td className="px-3 py-1.5" colSpan={4}>Older bill — total deductions <Money v={t.expected} /></td></tr>}
              </tbody>
            </table>
          </div>
          {diff.length > 0 && <p className="text-xs text-warn mt-2">The division's deductions differ from what the work profile expects. Check with the division or correct the profile.</p>}
        </Section>
        <Section title="Payments received">
          {b.receipts.length ? (
            <div className="rounded-xl border border-line divide-y divide-line">{b.receipts.map((r, i) => <div key={i} className="flex justify-between px-3 py-2 text-sm"><span>{date(r.date)} · <span className="font-mono text-xs">{r.utr}</span></span><b><Money v={r.amount} /></b></div>)}</div>
          ) : (
            <p className="text-sm text-muted">No payment received yet.</p>
          )}
        </Section>
        {b.kind === 'FINAL' && site && <SdRelease site={site} />}
      </div>
      {pass && <PassForm bill={b} onClose={() => setPass(false)} />}
      {rcpt && <ReceiptForm bill={b} outstanding={t.outstanding} onClose={() => setRcpt(false)} />}
    </Drawer>
  );
}

/** BIL-06: record the bill as passed by the division, with its actual deductions */
function PassForm({ bill, onClose }: { bill: RaBill; onClose: () => void }) {
  const [on, setOn] = useState(bill.passedOn || today());
  const [gross, setGross] = useState<number | ''>(bill.passedGross || '');
  const codes = [...new Set([...(bill.ded || []).map((d) => d.code), ...(bill.actualDed || []).map((d) => d.code)])];
  const [amts, setAmts] = useState<Record<string, number | ''>>(Object.fromEntries(codes.map((c) => [c, bill.actualDed?.find((d) => d.code === c)?.amount ?? bill.ded?.find((d) => d.code === c)?.amount ?? ''])));
  const [extra, setExtra] = useState<Array<{ head: string; amount: number | '' }>>([]);
  const save = () => {
    const actualDed = [...codes.map((c) => ({ code: c, amount: Number(amts[c]) || 0 })), ...extra.filter((x) => x.head.trim()).map((x) => ({ code: `OTH:${x.head.trim()}`, amount: Number(x.amount) || 0 }))].filter((x) => x.amount > 0);
    const patch: Record<string, unknown> = { passedOn: on, passedGross: gross === '' ? undefined : Number(gross), actualDed };
    if (bill.status === 'SUBMITTED') patch.status = 'CERTIFIED';
    update('raBills', bill.id, patch, `${bill.no} passed by the division`, 'RA bill');
    toast.success('Passing details saved');
    onClose();
  };
  return (
    <Modal open onClose={onClose} size="max-w-xl" title={`${bill.no} — passed by the division`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Passed on"><Input type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} /></Field>
          <Field label="Passed gross" hint="Only if the division cut quantities"><NumberInput value={gross} onChange={setGross} prefix="₹" /></Field>
        </div>
        <p className="text-xs text-muted">Deductions as made by the division (pre-filled with what was expected):</p>
        <div className="space-y-2">
          {codes.map((c) => <div key={c} className="grid grid-cols-2 gap-2 items-center"><span className="text-sm">{dedHead(bill, c)}</span><NumberInput value={amts[c] ?? ''} onChange={(x) => setAmts({ ...amts, [c]: x })} prefix="₹" /></div>)}
          {extra.map((x, i) => <div key={i} className="grid grid-cols-2 gap-2"><Input placeholder="Other head, e.g. Royalty" value={x.head} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, head: e.target.value } : y)))} /><NumberInput value={x.amount} onChange={(v) => setExtra(extra.map((y, j) => (j === i ? { ...y, amount: v } : y)))} prefix="₹" /></div>)}
          <Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setExtra([...extra, { head: '', amount: '' }])}>Another deduction</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReceiptForm({ bill, outstanding, onClose }: { bill: RaBill; outstanding: number; onClose: () => void }) {
  const [amt, setAmt] = useState<number | ''>(Math.round(outstanding));
  const [utr, setUtr] = useState('');
  const [d, setD] = useState(today());
  const save = () => {
    if (!amt || !utr) return toast.error('Amount and UTR / reference are required');
    update('raBills', bill.id, { receipts: [...bill.receipts, { date: d, amount: Number(amt), utr }] }, `${bill.no} payment ${inr(Number(amt))}`, 'RA bill');
    toast.success('Payment recorded');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Payment received from the department" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Amount" hint={`Outstanding ${inr(outstanding)}`}><NumberInput value={amt} onChange={setAmt} prefix="₹" /></Field>
        <Field label="UTR / cheque no."><Input value={utr} onChange={(e) => setUtr(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** BIL-10: completion, defect liability and the security deposit release letter */
export function SdRelease({ site }: { site: Site }) {
  const db = useDB();
  const s = useSession();
  const [cert, setCert] = useState({ no: site.completionCertNo || '', date: site.completionCertDate || '' });
  const sdHeld = sum(db.raBills.filter((b) => b.siteId === site.id && b.status !== 'DRAFT'), (b) => (b.actualDed || b.ded || []).filter((d) => d.code === 'SD').reduce((a, d) => a + d.amount, 0) || (!b.ded ? b.deductions.securityDeposit + b.deductions.retention : 0));
  const due = sdReleaseDue(site);
  const client = db.clients.find((c) => c.id === site.clientId);
  const office = client?.offices?.find((o) => o.id === site.officeId);
  const letter = () =>
    printLetter({
      firmId: site.firmId,
      ref: `${site.code}/SD`,
      date: date(today()),
      to: ['The Executive Engineer', office?.division || client?.name || '', office?.address || client?.address || ''].filter(Boolean),
      subject: `Release of security deposit — ${site.name}`,
      paragraphs: [
        `With reference to the above work under agreement no. ${site.agreementNo || site.workOrderNo || '—'}${site.agreementDate ? ` dated ${date(site.agreementDate)}` : ''}, the work was completed on ${site.actualCompletion ? date(site.actualCompletion) : '—'}${site.completionCertNo ? ` (completion certificate no. ${site.completionCertNo}${site.completionCertDate ? ` dated ${date(site.completionCertDate)}` : ''})` : ''}.`,
        `The defect liability period of ${site.dlpMonths || '—'} months ended on ${due ? date(due) : '—'}, and no defect is pending to our knowledge.`,
        `A security deposit of ${inr(sdHeld)} was deducted from our running account bills of this work. We request you kindly to release the security deposit at the earliest.`,
      ],
      enclosures: ['Copy of completion certificate', 'Statement of security deposit deducted'],
    });
  return (
    <Card>
      <CardHeader title="Completion and security deposit" subtitle={`Security deposit held ${inr(sdHeld)}${due ? ` · release due ${date(due)}` : ''}`} />
      <div className="px-5 pb-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Completion certificate no."><Input value={cert.no} onChange={(e) => setCert({ ...cert, no: e.target.value })} /></Field>
          <Field label="Certificate date"><Input type="date" value={cert.date} onChange={(e) => setCert({ ...cert, date: e.target.value })} /></Field>
        </div>
        {!site.actualCompletion && <p className="text-xs text-warn">Enter the actual completion date and defect liability period on the work (Masters › Works) to get the release date.</p>}
        <div className="flex flex-wrap gap-2">
          {s.can('masters', 'edit') && <Button onClick={() => (update('sites', site.id, { completionCertNo: cert.no || undefined, completionCertDate: cert.date || undefined }, `${site.short}: completion certificate`, 'Work'), toast.success('Saved'))}>Save certificate</Button>}
          <Button icon={<Printer className="w-4 h-4" />} onClick={letter}>Security deposit release letter</Button>
          {due && due <= today() && !site.sdReleasedOn && s.can('masters', 'edit') && <Button variant="primary" onClick={() => (update('sites', site.id, { sdReleasedOn: today(), stage: 'SECURITY_RELEASED' }, `${site.short}: security deposit released`, 'Work'), toast.success('Marked released'))}>Mark released</Button>}
          {site.sdReleasedOn && <Badge tone="good">Released {date(site.sdReleasedOn)}</Badge>}
        </div>
      </div>
    </Card>
  );
}

/* ================= Receivables (BIL-07) ================= */
export function ReceivablesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [by, setBy] = useState<'work' | 'office'>('work');
  const rows = useMemo(() => receivables(db, today()).filter((r) => s.seesSite(r.siteId)), [db, s]);
  const key = (r: (typeof rows)[number]) => (by === 'work' ? n.site(r.siteId) : r.office);
  const groups = Object.entries(groupBy(rows, key)).map(([k, l]) => ({ k, total: sum(l, (r) => r.outstanding), b0: sum(l.filter((r) => r.bucket === '0–30'), (r) => r.outstanding), b30: sum(l.filter((r) => r.bucket === '31–60'), (r) => r.outstanding), b60: sum(l.filter((r) => r.bucket === '61–90'), (r) => r.outstanding), b90: sum(l.filter((r) => r.bucket === '90+'), (r) => r.outstanding) })).sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Segmented value={by} onChange={setBy} options={[{ value: 'work', label: 'By work' }, { value: 'office', label: 'By division' }]} />
        <div className="flex-1" />
        <Badge tone="brand">Outstanding {inrCompact(sum(rows, (r) => r.outstanding))}</Badge>
      </div>
      <Card>
        <CardHeader title={`Ageing ${by === 'work' ? 'by work' : 'by division'}`} subtitle="Days since the bill was submitted" />
        <div className="px-4 pb-4">
          {groups.length ? <ColumnChart stacked data={groups.slice(0, 12).map((g) => ({ label: g.k.slice(0, 18), values: { b0: g.b0, b30: g.b30, b60: g.b60, b90: g.b90 } }))} series={[{ key: 'b0', label: '0–30' }, { key: 'b30', label: '31–60' }, { key: 'b60', label: '61–90' }, { key: 'b90', label: '90+' }]} format={inrCompact} height={200} /> : <p className="text-sm text-muted py-6 text-center">Nothing outstanding.</p>}
        </div>
      </Card>
      <DataTable
        title="Bills outstanding"
        rows={rows}
        rowKey={(r) => r.billId}
        columns={[
          { key: 'bill', header: 'Bill', primary: true, value: (r) => r.billNo, cell: (r) => <span className="font-mono text-[13px]">{r.billNo}</span> },
          { key: 'work', header: 'Work', value: (r) => n.site(r.siteId) },
          { key: 'office', header: 'Division', value: (r) => r.office, hideMobile: true },
          { key: 'date', header: 'Submitted', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'age', header: 'Age', align: 'right', value: (r) => r.age, cell: (r) => <Badge tone={r.age > 90 ? 'bad' : r.age > 45 ? 'warn' : 'neutral'}>{r.age} days</Badge> },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <div className="flex gap-1"><BillStatus s={r.status} />{r.diff && <Badge tone="warn">deductions differ</Badge>}</div> },
          { key: 'out', header: 'Outstanding', align: 'right', rate: true, value: (r) => Math.round(r.outstanding), cell: (r) => <b>{inrCompact(r.outstanding)}</b> },
        ]}
      />
    </div>
  );
}


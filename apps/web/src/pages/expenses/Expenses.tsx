import { useMemo, useState } from 'react';
import { CircleCheck, HandCoins, Plus, Receipt, Wallet } from 'lucide-react';
import { useDB, insert, update, nextNo } from '../../data/store';
import { useSession } from '../../data/session';
import { overheadAllocation, pettyCash } from '../../data/selectors';
import type { Expense, Overhead } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, PageHeader, Stat, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { AttachField, Combo, DateRangePicker, Field, Input, NumberInput, Select, Textarea } from '../../components/ui/fields';
import { Donut } from '../../components/ui/charts';
import { date, inr, inrCompact, monthLabel, today } from '../../lib/format';
import { groupBy, sum } from '../../lib/utils';
import { DateRuleNote, entryDateRule, Money, useAutoOpen, useModuleTab, useNames, useNewParam, useRange } from '../shared';

export default function Expenses() {
  const { tab, tabsEl } = useModuleTab('expenses');
  return (
    <div>
      <PageHeader title="Expenses & petty cash" subtitle="Every small site expense, with a bill photo, charged to a site and an expense head." tags={['EXP-01…07']} />
      {tabsEl}
      {tab === 'entries' && <EntriesTab />}
      {tab === 'petty-cash' && <PettyCashTab />}
      {tab === 'overheads' && <OverheadsTab />}
      {tab === 'register' && <RegisterTab />}
    </div>
  );
}

function EntriesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [view, setView] = useState<Expense | null>(null);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.expenses.filter((e) => s.seesSite(e.siteId) && (!siteId || e.siteId === siteId)).slice().reverse(), [db, s, siteId]);
  const head = (e: Expense) => n.lk.head[e.headId];
  return (
    <>
      <DataTable
        title="Site expenses"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setView}
        toolbar={s.can('expenses', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Add expense</Button>}
        columns={[
          { key: 'no', header: 'Voucher', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted md:hidden">{date(r.date)}</div></div> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date), hideMobile: true },
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'head', header: 'Head', value: (r) => `${head(r)?.head} › ${head(r)?.subHead}`, cell: (r) => <div><div className="text-[13px]">{head(r)?.subHead}</div><div className="text-[11px] text-muted">{head(r)?.head}</div></div> },
          { key: 'paid', header: 'Paid to', value: (r) => r.paidTo },
          { key: 'mode', header: 'Mode', value: (r) => r.mode, hideMobile: true },
          { key: 'bill', header: 'Bill', value: (r) => (r.photo ? 'Photo' : 'No bill'), cell: (r) => (r.photo ? <Badge tone="good">📷 {r.billNo}</Badge> : <Badge tone="warn">No bill</Badge>), hideMobile: true },
          { key: 'amount', header: 'Amount', align: 'right', rate: true, value: (r) => r.amount, cell: (r) => <b>{inr(r.amount)}</b> },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {form && <ExpenseForm onClose={() => setForm(false)} />}
      {view && (
        <Drawer open onClose={() => setView(null)} title={view.no} subtitle={`${n.site(view.siteId)} · ${date(view.date)}`}
          footer={view.status === 'PENDING' && s.can('approvals', 'approve') ? (
            <>
              <Button onClick={() => (update('expenses', view.id, { status: 'REJECTED' }, `${view.no} rejected`, 'Expense', undefined, 'REJECT'), setView(null))}>Reject</Button>
              <Button variant="success" onClick={() => (update('expenses', view.id, { status: 'APPROVED' }, `${view.no} approved`, 'Expense', undefined, 'APPROVE'), toast.success('Expense approved'), setView(null))}>Approve</Button>
            </>
          ) : undefined}>
          <div className="space-y-4">
            <StatusBadge status={view.status} />
            <div className="text-3xl font-bold"><Money v={view.amount} /></div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-[11px] text-muted uppercase">Head</div>{head(view)?.head} › {head(view)?.subHead}</div>
              <div><div className="text-[11px] text-muted uppercase">Paid to</div>{view.paidTo}</div>
              <div><div className="text-[11px] text-muted uppercase">Mode</div>{view.mode}</div>
              <div><div className="text-[11px] text-muted uppercase">Bill no.</div>{view.billNo || '—'}</div>
              <div><div className="text-[11px] text-muted uppercase">Entered by</div>{n.user(view.createdBy)}</div>
              <div><div className="text-[11px] text-muted uppercase">Remark</div>{view.remark || '—'}</div>
            </div>
            {view.photo && (
              <div className="rounded-2xl border border-line bg-surface-2 aspect-[4/3] flex flex-col items-center justify-center text-muted text-sm">
                <Receipt className="w-10 h-10 mb-2" />
                Bill photo · {view.billNo}
              </div>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const { siteId, sites } = useSiteFilter();
  const [d, setD] = useState(today());
  const [site, setSite] = useState(siteId || sites[0]?.id || '');
  const [headId, setHeadId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paidTo, setPaidTo] = useState('');
  const [mode, setMode] = useState('CASH');
  const [billNo, setBillNo] = useState('');
  const [remark, setRemark] = useState('');
  const [photos, setPhotos] = useState(0);
  const rule = entryDateRule(db, d, s.isAdmin);
  const limit = Math.min(db.settings.approvalLimits.expense, s.role.approvalLimit);
  const over = Number(amount) > limit && !s.isAdmin;
  const save = () => {
    if (rule.error) return toast.error(rule.error);
    if (!site || !headId || !amount || !paidTo) return toast.error('Site, head, amount and paid-to are required');
    const no = nextNo('EXP', d);
    const status = over || rule.needsApproval ? 'PENDING' : 'APPROVED';
    insert('expenses', { no, date: d, siteId: site, headId, amount: Number(amount), paidTo, mode, billNo, remark, photo: photos > 0, status } as any, `Expense ${no} ${inr(Number(amount))}`, 'Expense');
    toast.success(`${no} saved`, status === 'PENDING' ? `Above ${inr(limit)} — sent for approval (EXP-03)` : 'Charged to site cost');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Add expense" subtitle="EXP-02 · date, site, head, amount, paid to, mode, bill photo" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save expense</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date" required><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Site" required><Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.short }))} /></Field>
          <Field label="Expense head" required className="sm:col-span-2"><Combo value={headId} onChange={setHeadId} options={db.expenseHeads.map((h) => ({ value: h.id, label: `${h.head} › ${h.subHead}` }))} /></Field>
          <Field label="Amount" required hint={over ? undefined : `Up to ${inr(limit)} posts directly`}><NumberInput value={amount} onChange={setAmount} prefix="₹" /></Field>
          <Field label="Mode"><Select value={mode} onChange={setMode} options={[{ value: 'CASH', label: 'Cash (petty cash)' }, { value: 'UPI', label: 'UPI (petty cash)' }, { value: 'BANK', label: 'Bank (paid by HO)' }, { value: 'CHEQUE', label: 'Cheque' }]} /></Field>
          <Field label="Paid to" required><Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Shop / person" /></Field>
          <Field label="Bill no."><Input value={billNo} onChange={(e) => setBillNo(e.target.value)} /></Field>
        </div>
        <AttachField count={photos} onChange={setPhotos} label="Bill photo" />
        <Field label="Remark"><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
        <DateRuleNote date={d} />
        {over && <Callout tone="warn">Amount is above {inr(limit)} — it will go for approval and stays out of final cost until approved (APR-03).</Callout>}
      </div>
    </Drawer>
  );
}

function PettyCashTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId, sites } = useSiteFilter();
  const [site, setSite] = useState(siteId || sites[0]?.id || '');
  const [req, setReq] = useState<null | 'TOPUP_REQUEST' | 'IMPREST'>(null);
  const [amt, setAmt] = useState<number | ''>('');
  const [remark, setRemark] = useState('');
  const book = useMemo(() => pettyCash(db, site).slice().reverse(), [db, site]);
  const bal = book[0]?.balance || 0;
  const requests = db.imprests.filter((i) => i.siteId === site && i.kind === 'TOPUP_REQUEST');
  const monthSpend = sum(book.filter((b) => b.date.startsWith(today().slice(0, 7))), (b) => b.outAmt);
  const save = () => {
    if (!amt) return toast.error('Enter amount');
    const no = nextNo('IMP');
    insert('imprests', { no, date: today(), siteId: site, amount: Number(amt), kind: req, mode: 'BANK', remark: remark || (req === 'IMPREST' ? 'Imprest' : 'Top-up request'), status: req === 'IMPREST' ? 'APPROVED' : 'PENDING' } as any, `${req === 'IMPREST' ? 'Imprest' : 'Top-up request'} ${inr(Number(amt))}`, 'Petty cash');
    toast.success(req === 'IMPREST' ? 'Cash given to site' : 'Top-up requested', req === 'IMPREST' ? undefined : 'Owner will approve (EXP-04)');
    setReq(null);
    setAmt('');
    setRemark('');
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.short }))} className="w-56" />
        <div className="flex-1" />
        {s.can('expenses', 'add') && <Button icon={<HandCoins className="w-4 h-4" />} onClick={() => setReq('TOPUP_REQUEST')}>Request top-up</Button>}
        {s.can('expenses', 'approve') && s.showRates && <Button variant="primary" icon={<Wallet className="w-4 h-4" />} onClick={() => setReq('IMPREST')}>Give imprest</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
        <Stat label="Cash in hand" value={bal} format={inr} tone={bal < 20000 ? 'bad' : 'good'} icon={<Wallet className="w-[18px] h-[18px]" />} sub={bal < 20000 ? 'Running low — top-up advised' : 'Imprest balance (EXP-01)'} />
        <Stat label="Spent this month" value={monthSpend} format={inr} tone="warn" icon={<Receipt className="w-[18px] h-[18px]" />} />
        <Stat label="Top-up requests" value={requests.filter((r) => r.status === 'PENDING').length} tone="info" icon={<HandCoins className="w-[18px] h-[18px]" />} sub={`${requests.length} raised in total`} />
      </div>
      {requests.length > 0 && (
        <Card>
          <CardHeader title="Cash top-up requests" subtitle="EXP-04 · approved by the owner, recorded as a cash transfer" />
          <div className="px-4 pb-4 space-y-2">
            {requests.slice().reverse().map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line">
                <div>
                  <div className="text-sm font-medium">{r.no} · <Money v={r.amount} /></div>
                  <div className="text-[11px] text-muted">{date(r.date)} · {n.user(r.createdBy)} · {r.remark}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.status === 'PENDING' && s.can('approvals', 'approve') && (
                    <Button size="sm" variant="success" onClick={() => (update('imprests', r.id, { status: 'APPROVED' }, `${r.no} approved`, 'Petty cash', undefined, 'APPROVE'), toast.success('Top-up approved', 'Cash transferred to site'))}>Approve</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <DataTable
        title={`Petty cash book — ${n.site(site)}`}
        rows={book}
        rowKey={(r, i) => `${r.ref}-${i}`}
        columns={[
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'type', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.inAmt ? 'good' : 'neutral'}>{r.type}</Badge> },
          { key: 'ref', header: 'Voucher', primary: true, value: (r) => r.ref, cell: (r) => <span className="font-mono text-[13px]">{r.ref}</span> },
          { key: 'remark', header: 'Details', value: (r) => r.remark },
          { key: 'in', header: 'Received', align: 'right', value: (r) => r.inAmt, cell: (r) => (r.inAmt ? <span className="text-good">{inr(r.inAmt)}</span> : '') },
          { key: 'out', header: 'Paid', align: 'right', value: (r) => r.outAmt, cell: (r) => (r.outAmt ? inr(r.outAmt) : '') },
          { key: 'bal', header: 'Balance', align: 'right', value: (r) => r.balance, cell: (r) => <b>{inr(r.balance)}</b> },
        ]}
      />
      <Drawer open={!!req} onClose={() => setReq(null)} title={req === 'IMPREST' ? 'Give imprest to site' : 'Request cash top-up'} subtitle={n.site(site)} footer={<><Button onClick={() => setReq(null)}>Cancel</Button><Button variant="primary" onClick={save}>{req === 'IMPREST' ? 'Transfer' : 'Send request'}</Button></>}>
        <div className="space-y-4">
          <Field label="Amount" required><NumberInput value={amt} onChange={setAmt} prefix="₹" /></Field>
          <Field label="Purpose"><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
        </div>
      </Drawer>
    </div>
  );
}

function OverheadsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [form, setForm] = useState(false);
  const months = Array.from(new Set(db.overheads.map((o) => o.month))).sort().reverse();
  const [month, setMonth] = useState(months[0] || today().slice(0, 7));
  const rows = db.overheads.filter((o) => o.month === month);
  const basis = rows[0]?.basis || db.settings.overheadBasis;
  const alloc = overheadAllocation(db).filter((a) => a.month === month);
  const setBasis = (b: string) => rows.forEach((r) => update('overheads', r.id, { basis: b }, `Overhead basis for ${month} → ${b}`, 'Overhead'));
  const [head, setHead] = useState('');
  const [amt, setAmt] = useState<number | ''>('');
  const save = () => {
    if (!head || !amt) return toast.error('Head and amount required');
    insert('overheads', { month, head, amount: Number(amt), basis } as any, `Overhead ${head}`, 'Overhead');
    setForm(false);
    toast.success('Overhead added and allocated');
  };
  return (
    <div className="space-y-4">
      <Callout>Head-office overheads (rent, salaries, interest…) are allocated to sites by a chosen basis — equal share, % of contract value, % of billing, or manual (EXP-05).</Callout>
      <div className="flex flex-wrap gap-2">
        <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} className="w-40" />
        <Select value={basis} onChange={setBasis} options={[{ value: 'EQUAL', label: 'Equal share' }, { value: 'CONTRACT', label: '% of contract value' }, { value: 'BILLING', label: '% of billing' }]} className="w-56" />
        <div className="flex-1" />
        {s.can('expenses', 'add') && s.showRates && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Add overhead</Button>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataTable
          title={`HO overheads ${monthLabel(month)}`}
          rows={rows}
          rowKey={(r: Overhead) => r.id}
          searchable={false}
          columns={[
            { key: 'head', header: 'Head', primary: true, value: (r) => r.head },
            { key: 'amount', header: 'Amount', align: 'right', rate: true, value: (r) => r.amount, cell: (r) => inr(r.amount) },
          ]}
          totals={{ amount: inr(sum(rows, (r) => r.amount)), __export: { amount: sum(rows, (r) => r.amount) } }}
        />
        <Card>
          <CardHeader title="Allocation to sites" subtitle={`Basis: ${basis.toLowerCase()}`} />
          <div className="px-4 pb-4">
            <Donut segments={alloc.map((a) => ({ label: n.site(a.siteId), value: a.amount }))} format={inrCompact} center={<><div className="text-[11px] text-muted">Allocated</div><div className="font-bold">{inrCompact(sum(alloc, (a) => a.amount))}</div></>} />
          </div>
        </Card>
      </div>
      <Drawer open={form} onClose={() => setForm(false)} title="Add HO overhead" subtitle={monthLabel(month)} footer={<><Button onClick={() => setForm(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Head" required><Input value={head} onChange={(e) => setHead(e.target.value)} placeholder="e.g. Office electricity" /></Field>
          <Field label="Amount" required><NumberInput value={amt} onChange={setAmt} prefix="₹" /></Field>
        </div>
      </Drawer>
    </div>
  );
}

function RegisterTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [range, setRange] = useRange('mtd');
  const [by, setBy] = useState('head');
  const rows = useMemo(() => db.expenses.filter((e) => e.status === 'APPROVED' && s.seesSite(e.siteId) && (!siteId || e.siteId === siteId) && e.date >= range.from && e.date <= range.to), [db, s, siteId, range]);
  const grouped = useMemo(
    () =>
      Object.entries(groupBy(rows, (e) => (by === 'head' ? n.lk.head[e.headId]!.head : by === 'site' ? e.siteId : `${e.siteId}|${n.lk.head[e.headId]!.head}`))).map(([k, list]) => ({
        key: k,
        label: by === 'site' ? n.site(k) : by === 'head' ? k : `${n.site(k.split('|')[0])} › ${k.split('|')[1]}`,
        count: list.length,
        amount: sum(list, (e) => e.amount),
      })),
    [rows, by], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader title="By expense head" subtitle={`${date(range.from)} – ${date(range.to)}`} />
          <div className="px-4 pb-4">
            <Donut segments={Object.entries(groupBy(rows, (e) => n.lk.head[e.headId]!.head)).map(([h, l]) => ({ label: h, value: sum(l, (e) => e.amount) })).sort((a, b) => b.value - a.value).slice(0, 8)} format={inrCompact} center={<><div className="text-[11px] text-muted">Total</div><div className="font-bold">{inrCompact(sum(rows, (e) => e.amount))}</div></>} />
          </div>
        </Card>
        <div className="lg:col-span-2">
          <DataTable
            title="Expense register"
            subtitle={`${date(range.from)} to ${date(range.to)}`}
            rows={grouped}
            rowKey={(r) => r.key}
            initialSort={{ key: 'amount', dir: 'desc' }}
            toolbar={
              <>
                <Select value={by} onChange={setBy} className="w-44" options={[{ value: 'head', label: 'Head-wise' }, { value: 'site', label: 'Site-wise' }, { value: 'both', label: 'Site & head' }]} />
                <DateRangePicker value={range} onChange={setRange} />
              </>
            }
            columns={[
              { key: 'label', header: by === 'site' ? 'Site' : 'Head', primary: true, value: (r) => r.label },
              { key: 'count', header: 'Bills', align: 'right', value: (r) => r.count },
              { key: 'amount', header: 'Amount', align: 'right', rate: true, value: (r) => Math.round(r.amount), cell: (r) => <b>{inr(r.amount)}</b> },
            ]}
            totals={{ count: sum(grouped, (r) => r.count), amount: inr(sum(grouped, (r) => r.amount)), __export: { count: sum(grouped, (r) => r.count), amount: Math.round(sum(grouped, (r) => r.amount)) } }}
          />
        </div>
      </div>
    </div>
  );
}

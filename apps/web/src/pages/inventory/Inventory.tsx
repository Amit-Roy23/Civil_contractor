import { useMemo, useState } from 'react';
import { ArrowLeftRight, Ban, Boxes, CircleCheck, ClipboardList, Hammer, PackageCheck, Plus, Scale, Trash2, Truck, Undo2 } from 'lucide-react';
import { useDB, insert, update, decide, nextNo } from '../../data/store';
import { useSession } from '../../data/session';
import { itemLedger, lookup, materialsInTransit, stockRegister, storeValue, theoreticalVsActual, toolsBalance, lowStock, type TransitRow } from '../../data/selectors';
import { availability, avgRate, getLedger } from '../../data/ledger';
import type { ID, StockLine, StockTxn, StockTxnType } from '../../data/types';
import { useSiteFilter } from '../../components/layout/AppShell';
import { Badge, Button, Callout, Card, CardHeader, Drawer, KV, Modal, PageHeader, Section, Stat, StatusBadge, toast } from '../../components/ui/core';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Combo, DateRangePicker, Field, Input, NumberInput, Segmented, Select, Textarea, AttachField } from '../../components/ui/fields';
import { ColumnChart } from '../../components/ui/charts';
import { date, dateTime, inr, inrCompact, qty, today } from '../../lib/format';
import { cn, round, sum } from '../../lib/utils';
import { DateRuleNote, entryDateRule, LinesEditor, linesShort, materialOptions, Money, toBase, useAutoOpen, useModuleTab, useNames, useNewParam, useRange, useStoreOptions, type LineDraft } from '../shared';
import { navigate } from '../../lib/router';

const TYPE_LABEL: Record<StockTxnType, string> = {
  OPENING: 'Opening stock',
  ISSUE: 'Store issue / receipt',
  GRN: 'GRN (supplier)',
  PLANT_RECEIPT: 'Plant receipt',
  CONSUMPTION: 'Consumption',
  TRANSFER: 'Site transfer',
  RETURN: 'Return to store',
  WASTAGE: 'Wastage / damage',
  ADJUSTMENT: 'Stock adjustment',
};
const TYPE_TONE: Record<string, 'good' | 'info' | 'brand' | 'bad' | 'warn' | 'violet' | 'neutral'> = {
  OPENING: 'neutral', ISSUE: 'info', GRN: 'good', PLANT_RECEIPT: 'good', CONSUMPTION: 'brand', TRANSFER: 'violet', RETURN: 'info', WASTAGE: 'bad', ADJUSTMENT: 'warn',
};

/** default store for the active site filter */
function useDefaultStore() {
  const { siteId } = useSiteFilter();
  const opts = useStoreOptions();
  const db = useDB();
  const fromSite = siteId ? lookup(db).siteStore[siteId] : undefined;
  return fromSite || opts.find((o) => o.hint === 'Site store')?.value || opts[0]?.value || '';
}

export default function Inventory() {
  const { tab, tabsEl } = useModuleTab('inventory');
  return (
    <div>
      <PageHeader title="Site inventory" subtitle="Live stock at every site, store and plant — in quantity and value." tags={['MAT-01…18', 'STR-01']} />
      {tabsEl}
      {tab === 'stock' && <StockTab />}
      {tab === 'transactions' && <TransactionsTab />}
      {tab === 'ledger' && <LedgerTab />}
      {tab === 'transit' && <TransitTab />}
      {tab === 'variance' && <VarianceTab />}
      {tab === 'tools' && <ToolsTab />}
      {tab === 'daily' && <DailyTab />}
    </div>
  );
}

/* ================= Stock register ================= */
function StockTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const def = useDefaultStore();
  const [store, setStore] = useState(def);
  const [range, setRange] = useRange('mtd');
  const [ledgerOf, setLedgerOf] = useState<ID | null>(null);
  const storeOpts = useStoreOptions();
  const rows = useMemo(() => stockRegister(db, store, range), [db, store, range]);
  const value = storeValue(db, store);
  const lows = lowStock(db).filter((l) => l.storeId === store);
  const transit = materialsInTransit(db).filter((t) => t.toStoreId === store || (t.toSiteId && lookup(db).store[store]?.siteId === t.toSiteId));
  const u = (r: { materialId: ID }) => n.unit(r.materialId);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'material', header: 'Material', primary: true, value: (r) => n.mat(r.materialId), cell: (r) => <div><div className="font-medium">{n.mat(r.materialId)}</div><div className="text-[11px] text-muted">{n.lk.material[r.materialId]?.category}</div></div> },
    { key: 'opening', header: 'Opening', align: 'right', value: (r) => round(r.opening, 2), cell: (r) => qty(r.opening, u(r)) },
    { key: 'received', header: 'Received', align: 'right', value: (r) => round(r.received, 2), cell: (r) => <span className="text-good">{r.received ? `+${qty(r.received)}` : '—'}</span> },
    { key: 'consumed', header: 'Consumed', align: 'right', value: (r) => round(r.consumed, 2), cell: (r) => (r.consumed ? qty(r.consumed) : '—') },
    { key: 'transferred', header: 'Issued / transferred', align: 'right', value: (r) => round(r.transferred, 2), cell: (r) => (r.transferred ? qty(r.transferred) : '—'), hideMobile: true },
    { key: 'returned', header: 'Returned', align: 'right', value: (r) => round(r.returned, 2), cell: (r) => (r.returned ? qty(r.returned) : '—'), hideMobile: true },
    { key: 'wasted', header: 'Wasted', align: 'right', value: (r) => round(r.wasted, 2), cell: (r) => (r.wasted ? <span className="text-bad">{qty(r.wasted)}</span> : '—'), hideMobile: true },
    { key: 'adjusted', header: 'Adjusted', align: 'right', value: (r) => round(r.adjusted, 2), cell: (r) => (r.adjusted ? qty(r.adjusted) : '—'), hideMobile: true },
    { key: 'closing', header: 'Closing', align: 'right', value: (r) => round(r.closing, 2), cell: (r) => <span className="font-semibold">{qty(r.closing, u(r))}</span> },
    { key: 'closingValue', header: 'Closing value', align: 'right', rate: true, value: (r) => Math.round(r.closingValue), cell: (r) => inr(r.closingValue) },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
        <Stat label="Stock value" value={s.showRates ? value : rows.length} format={s.showRates ? inrCompact : (x) => `${Math.round(x)} items`} icon={<Boxes className="w-[18px] h-[18px]" />} tone="brand" sub={s.showRates ? `${rows.length} materials` : 'rates hidden'} />
        <Stat label="Consumed in period" value={s.showRates ? sum(rows, (r) => r.consumedValue) : sum(rows, (r) => (r.consumed ? 1 : 0))} format={s.showRates ? inrCompact : (x) => `${Math.round(x)} items`} icon={<ClipboardList className="w-[18px] h-[18px]" />} tone="info" />
        <Stat label="Below minimum" value={lows.length} format={(x) => `${Math.round(x)} items`} icon={<Scale className="w-[18px] h-[18px]" />} tone={lows.length ? 'bad' : 'good'} sub={lows.slice(0, 2).map((l) => n.mat(l.materialId)).join(', ') || 'All above minimum'} />
        <Stat label="In transit to here" value={transit.length} format={(x) => `${Math.round(x)} loads`} icon={<Truck className="w-[18px] h-[18px]" />} tone="violet" onClick={() => navigate('/inventory/transit')} sub="Awaiting receipt" />
      </div>
      <DataTable
        title={`Stock register — ${n.store(store)}`}
        subtitle={`${date(range.from)} to ${date(range.to)}`}
        rows={rows}
        columns={cols}
        rowKey={(r) => r.materialId}
        onRowClick={(r) => setLedgerOf(r.materialId)}
        initialSort={{ key: 'closingValue', dir: 'desc' }}
        toolbar={
          <>
            <Combo value={store} onChange={setStore} options={storeOpts} className="w-60" />
            <DateRangePicker value={range} onChange={setRange} />
          </>
        }
        totals={s.showRates ? { closingValue: inr(sum(rows, (r) => r.closingValue)), __export: { closingValue: Math.round(sum(rows, (r) => r.closingValue)) } } : undefined}
      />
      <LedgerDrawer storeId={store} materialId={ledgerOf} onClose={() => setLedgerOf(null)} />
    </div>
  );
}

function LedgerDrawer({ storeId, materialId, onClose }: { storeId: ID; materialId: ID | null; onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const rows = useMemo(() => (materialId ? itemLedger(db, storeId, materialId).slice().reverse() : []), [db, storeId, materialId]);
  if (!materialId) return null;
  const m = n.lk.material[materialId]!;
  const bal = rows[0];
  return (
    <Drawer open onClose={onClose} title={m.name} subtitle={`Item ledger · ${n.store(storeId)}`} width="max-w-3xl">
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card className="p-3">
          <div className="text-[11px] text-muted">Balance</div>
          <div className="text-lg font-bold">{qty(bal?.balance || 0, m.unit)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted">Avg rate</div>
          <div className="text-lg font-bold"><Money v={avgRate(db, storeId, materialId)} /></div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted">Value</div>
          <div className="text-lg font-bold"><Money v={bal?.balanceValue || 0} compact /></div>
        </Card>
      </div>
      <DataTable
        title={`Item ledger ${m.name} — ${n.store(storeId)}`}
        rows={rows}
        compact
        pageSize={25}
        rowKey={(r, i) => `${r.refId}-${i}`}
        columns={[
          { key: 'date', header: 'Date', primary: true, value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'kind', header: 'Type', value: (r) => r.kind },
          { key: 'ref', header: 'Ref', value: (r) => r.ref, cell: (r) => <span className="font-mono text-xs">{r.ref}</span> },
          { key: 'in', header: 'In', align: 'right', value: (r) => (r.qty > 0 ? round(r.qty, 3) : ''), cell: (r) => (r.qty > 0 ? <span className="text-good">+{qty(r.qty)}</span> : '') },
          { key: 'out', header: 'Out', align: 'right', value: (r) => (r.qty < 0 ? round(-r.qty, 3) : ''), cell: (r) => (r.qty < 0 ? qty(-r.qty) : '') },
          { key: 'rate', header: 'Rate', align: 'right', rate: true, value: (r) => round(r.rate, 2), cell: (r) => inr(r.rate, true) },
          { key: 'balance', header: 'Balance', align: 'right', value: (r) => r.balance, cell: (r) => <span className="font-semibold">{qty(r.balance)}</span> },
        ]}
      />
    </Drawer>
  );
}

/* ================= Transactions ================= */
type FormKind = 'CONSUMPTION' | 'TRANSFER' | 'RETURN' | 'WASTAGE' | 'ADJUSTMENT' | 'OPENING' | 'RECEIVE';

function TransactionsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [type, setType] = useState<string>('all');
  const [form, setForm] = useState<FormKind | null>(null);
  const [view, setView] = useState<StockTxn | null>(null);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, (v) => (v === 'RECEIVE' || v === 'ISSUE' ? navigate('/inventory/transit') : setForm(v as FormKind)), () => setNw(null));

  const rows = useMemo(() => {
    const lk = lookup(db);
    return db.stockTxns
      .filter((t) => (s.seesStore(t.fromStoreId) || s.seesStore(t.toStoreId)) && (t.fromStoreId ? s.seesStore(t.fromStoreId) || s.seesStore(t.toStoreId) : true))
      .filter((t) => !siteId || lk.store[t.fromStoreId || '']?.siteId === siteId || lk.store[t.toStoreId || '']?.siteId === siteId)
      .filter((t) => type === 'all' || t.type === type || (type === 'PENDING' && t.status === 'PENDING'))
      .slice()
      .reverse();
  }, [db, s, siteId, type]);

  const val = (t: StockTxn) => {
    const store = t.fromStoreId || t.toStoreId!;
    return sum(t.lines, (l) => Math.abs(l.qty) * (l.rate || avgRate(db, store, l.materialId)));
  };
  const cols: Column<StockTxn>[] = [
    { key: 'no', header: 'Voucher', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px] font-medium">{r.no}</div><div className="text-[11px] text-muted md:hidden">{date(r.date)}</div></div> },
    { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date), hideMobile: true },
    { key: 'type', header: 'Type', value: (r) => TYPE_LABEL[r.type], cell: (r) => <Badge tone={TYPE_TONE[r.type]}>{TYPE_LABEL[r.type]}</Badge> },
    { key: 'where', header: 'Store', value: (r) => `${n.store(r.fromStoreId)} ${n.store(r.toStoreId)}`, cell: (r) => <span className="text-[13px]">{r.fromStoreId && r.toStoreId ? `${n.store(r.fromStoreId)} → ${n.store(r.toStoreId)}` : n.store(r.fromStoreId || r.toStoreId)}{r.issueToVehicleId ? ` → ${n.veh(r.issueToVehicleId)}` : ''}</span> },
    { key: 'items', header: 'Items', value: (r) => r.lines.map((l) => n.mat(l.materialId)).join(', '), cell: (r) => <span className="text-[13px] text-fg-2 line-clamp-1">{r.lines.map((l) => `${n.mat(l.materialId)} ${qty(Math.abs(l.qty), n.unit(l.materialId))}`).join(', ')}</span> },
    { key: 'value', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(val(r)), cell: (r) => inr(val(r)) },
    { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
  ];
  const canAdd = s.can('inventory', 'add');
  const actions: Array<{ k: FormKind; label: string; icon: any }> = [
    { k: 'CONSUMPTION', label: 'Consumption', icon: ClipboardList },
    { k: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight },
    { k: 'RETURN', label: 'Return', icon: Undo2 },
    { k: 'WASTAGE', label: 'Wastage', icon: Trash2 },
    { k: 'ADJUSTMENT', label: 'Adjustment', icon: Scale },
  ];
  return (
    <div className="space-y-4">
      {canAdd && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 stagger">
          {actions.map((a) => {
            const I = a.icon;
            return (
              <button key={a.k} onClick={() => setForm(a.k)} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface border border-line hover:border-brand hover:shadow-card transition-all active:scale-[0.97]">
                <I className="w-5 h-5 text-brand-strong" />
                <span className="text-xs font-semibold">{a.label}</span>
              </button>
            );
          })}
          <button onClick={() => navigate('/inventory/transit')} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface border border-line hover:border-brand hover:shadow-card transition-all active:scale-[0.97]">
            <PackageCheck className="w-5 h-5 text-good" />
            <span className="text-xs font-semibold">Receive</span>
          </button>
        </div>
      )}
      <DataTable
        title="Stock vouchers"
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        onRowClick={setView}
        toolbar={
          <Select
            value={type}
            onChange={setType}
            className="w-48"
            options={[{ value: 'all', label: 'All types' }, { value: 'PENDING', label: 'Pending approval' }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]}
          />
        }
      />
      {form && <TxnForm kind={form} onClose={() => setForm(null)} />}
      {view && <TxnView txn={view} onClose={() => setView(null)} />}
    </div>
  );
}

function TxnForm({ kind, onClose }: { kind: FormKind; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const def = useDefaultStore();
  const lk = lookup(db);
  const siteStores = useStoreOptions(['SITE']);
  const anyStores = useStoreOptions(kind === 'ADJUSTMENT' || kind === 'WASTAGE' || kind === 'OPENING' ? ['CENTRAL', 'SITE', 'PLANT'] : ['SITE']);
  const allSiteStores = db.stores.filter((x) => x.type === 'SITE').map((x) => ({ value: x.id, label: x.name }));
  const [d, setD] = useState(today());
  const [from, setFrom] = useState(lk.store[def]?.type === 'SITE' || kind === 'ADJUSTMENT' || kind === 'WASTAGE' ? def : siteStores[0]?.value || '');
  const [to, setTo] = useState(kind === 'RETURN' ? 'cs' : '');
  const [boq, setBoq] = useState('');
  const [work, setWork] = useState('');
  const [reason, setReason] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [photos, setPhotos] = useState(0);
  const [lines, setLines] = useState<LineDraft[]>([{ materialId: '', qty: '', unit: '', rate: '' }]);
  const [adjMat, setAdjMat] = useState('');
  const [physical, setPhysical] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const site = lk.store[from]?.siteId;
  const boqOpts = db.boq.filter((b) => b.siteId === site).map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description}`, hint: `${qty(b.qty, b.unit)}` }));
  const rule = entryDateRule(db, d, s.isAdmin);
  const needsStock = kind !== 'OPENING' && kind !== 'ADJUSTMENT';
  const short = needsStock && linesShort(db, lines, from, d);
  const sysQty = adjMat ? availability(db, from, adjMat, d).onDate : 0;

  const titles: Record<FormKind, [string, string]> = {
    CONSUMPTION: ['Material consumption', 'MAT-04 · tag to BOQ item / work done so cost per item and theoretical-vs-actual work'],
    TRANSFER: ['Transfer to another site', 'MAT-05 · stock leaves your site only when the receiving site confirms'],
    RETURN: ['Return to central store', 'MAT-06 · unused material back to the godown'],
    WASTAGE: ['Wastage / damage / theft', 'MAT-07 · needs approval before it reduces stock'],
    ADJUSTMENT: ['Stock adjustment', 'MAT-08 · physical verification — system vs physical'],
    OPENING: ['Opening stock', 'MAT-09 · go-live / new financial year'],
    RECEIVE: ['Receive', ''],
  };

  const save = () => {
    if (rule.error) return toast.error(rule.error);
    if (!from) return toast.error('Choose a store');
    let txLines: StockLine[];
    if (kind === 'ADJUSTMENT') {
      if (!adjMat || physical === '') return toast.error('Choose material and enter physical quantity');
      const delta = round(Number(physical) - sysQty, 4);
      if (!delta) return toast.info('No difference to adjust');
      if (!reason) return toast.error('Reason is required');
      txLines = [{ materialId: adjMat, qty: delta, rate: 0, systemQty: sysQty, physicalQty: Number(physical) }];
    } else {
      const valid = lines.filter((l) => l.materialId && Number(l.qty) > 0);
      if (!valid.length) return toast.error('Add at least one material with quantity');
      if (short && !(s.isAdmin && db.settings.allowNegativeOverride)) return toast.error('Not enough stock', 'Stock can never go negative (MAT-10).');
      txLines = valid.map((l) => ({ materialId: l.materialId, qty: toBase(db, l), rate: kind === 'OPENING' ? Number(l.rate) || lk.material[l.materialId]!.stdRate : 0, enteredQty: Number(l.qty), enteredUnit: l.unit }));
    }
    if ((kind === 'TRANSFER' || kind === 'RETURN') && !to) return toast.error('Choose destination');
    if ((kind === 'WASTAGE') && !reason) return toast.error('Reason is required');
    setBusy(true);
    const value = sum(txLines, (l) => Math.abs(l.qty) * avgRate(db, from, l.materialId));
    let status: StockTxn['status'] = 'POSTED';
    if (kind === 'WASTAGE' || kind === 'ADJUSTMENT') status = 'PENDING';
    if (kind === 'TRANSFER' || kind === 'RETURN') status = 'IN_TRANSIT';
    if (rule.needsApproval) status = 'PENDING';
    if (kind === 'CONSUMPTION' && value > db.settings.approvalLimits.issue && !s.isAdmin) status = 'PENDING';
    const prefix = { CONSUMPTION: 'CON', TRANSFER: 'TRF', RETURN: 'RTN', WASTAGE: 'WST', ADJUSTMENT: 'ADJ', OPENING: 'OPN', RECEIVE: 'RCV' }[kind];
    const rec: Partial<StockTxn> = {
      no: nextNo(prefix, d),
      type: kind === 'RECEIVE' ? 'ISSUE' : kind,
      date: d,
      fromStoreId: kind === 'OPENING' ? undefined : from,
      toStoreId: kind === 'OPENING' ? from : kind === 'TRANSFER' || kind === 'RETURN' ? to : undefined,
      lines: txLines,
      status,
      boqItemId: boq || undefined,
      workDone: work || undefined,
      location: work || undefined,
      reason: reason || undefined,
      vehicleNo: vehicleNo || undefined,
      photos,
      remark: rule.needsApproval,
    };
    insert('stockTxns', rec as any, `${titles[kind][0]} ${rec.no}`, 'Stock voucher');
    setTimeout(() => {
      toast.success(`${rec.no} saved`, status === 'PENDING' ? 'Sent for approval' : status === 'IN_TRANSIT' ? 'In transit — receiver must confirm' : 'Stock updated');
      onClose();
    }, 200);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={titles[kind][0]}
      subtitle={titles[kind][1]}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!!rule.error} icon={<CircleCheck className="w-4 h-4" />}>
            Save entry
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date" required hint={`Back-dating allowed up to ${db.settings.backdateDays} days (MAT-14)`}>
            <Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} />
          </Field>
          <Field label={kind === 'TRANSFER' || kind === 'RETURN' ? 'From store' : 'Store'} required>
            <Combo value={from} onChange={(v) => (setFrom(v), setBoq(''))} options={kind === 'CONSUMPTION' || kind === 'TRANSFER' || kind === 'RETURN' ? siteStores : anyStores} />
          </Field>
          {kind === 'TRANSFER' && (
            <Field label="To site" required>
              <Combo value={to} onChange={setTo} options={allSiteStores.filter((x) => x.value !== from)} />
            </Field>
          )}
          {(kind === 'TRANSFER' || kind === 'RETURN') && (
            <Field label="Vehicle no.">
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="AS01-EC-1234" />
            </Field>
          )}
          {kind === 'CONSUMPTION' && (
            <>
              <Field label="BOQ item / work" hint="Links consumption to the BOQ for cost per item (CST-04)">
                <Combo value={boq} onChange={setBoq} options={boqOpts} placeholder="Select BOQ item" />
              </Field>
              <Field label="Work done / location">
                <Input value={work} onChange={(e) => setWork(e.target.value)} placeholder="Chainage 2+300 to 2+500, PCC" />
              </Field>
            </>
          )}
        </div>
        <DateRuleNote date={d} />
        {kind === 'ADJUSTMENT' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Material" required className="sm:col-span-3">
              <Combo value={adjMat} onChange={setAdjMat} options={materialOptions(db)} />
            </Field>
            <Field label="System quantity">
              <Input value={adjMat ? qty(sysQty, lk.material[adjMat]?.unit) : '—'} disabled />
            </Field>
            <Field label="Physical quantity" required>
              <NumberInput value={physical} onChange={setPhysical} suffix={lk.material[adjMat]?.unit} />
            </Field>
            <Field label="Difference">
              <Input value={physical === '' ? '—' : `${round(Number(physical) - sysQty, 3) > 0 ? '+' : ''}${qty(round(Number(physical) - sysQty, 3))}`} disabled className={cn(physical !== '' && Number(physical) < sysQty && 'text-bad')} />
            </Field>
          </div>
        ) : (
          <Section title="Materials">
            <LinesEditor lines={lines} onChange={setLines} storeId={from} date={d} checkStock={needsStock} withRate={kind === 'OPENING'} filter={kind === 'CONSUMPTION' ? (m) => !m.returnable : undefined} />
          </Section>
        )}
        {(kind === 'WASTAGE' || kind === 'ADJUSTMENT' || kind === 'RETURN') && (
          <Field label={kind === 'RETURN' ? 'Condition / remark' : 'Reason'} required={kind !== 'RETURN'}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'WASTAGE' ? 'e.g. 20 bags set due to rain' : 'e.g. Monthly physical count'} />
          </Field>
        )}
        <AttachField count={photos} onChange={setPhotos} label="Photos / challan (MAT-13)" />
        {kind === 'WASTAGE' && <Callout tone="warn">Wastage goes to the owner for approval and reduces stock only after it is approved.</Callout>}
      </div>
    </Drawer>
  );
}

function TxnView({ txn, onClose }: { txn: StockTxn; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const t = db.stockTxns.find((x) => x.id === txn.id) || txn;
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const store = t.fromStoreId || t.toStoreId!;
  const canReceive = t.status === 'IN_TRANSIT' && s.seesStore(t.toStoreId) && s.can('inventory', 'add');
  const canApprove = t.status === 'PENDING' && s.can('approvals', 'approve');
  const isPosted = t.status === 'POSTED' || t.status === 'APPROVED';
  const doCancel = () => {
    if (!reason) return toast.error('Reason is required (SEC-03)');
    if (t.type !== 'CONSUMPTION' && t.type !== 'WASTAGE' && t.type !== 'ADJUSTMENT' && t.toStoreId) {
      // reversing a receipt must not push the receiver negative
      const short = t.lines.some((l) => availability(db, t.toStoreId!, l.materialId, t.date).minAfter < l.qty - 1e-6);
      if (short) return toast.error('Cannot cancel', 'Material already used at the receiving store.');
    }
    update('stockTxns', t.id, { status: 'CANCELLED' }, `${t.no} cancelled`, 'Stock voucher', reason, 'CANCEL');
    toast.success(`${t.no} cancelled`, 'Reversal posted — no hard delete');
    setCancel(false);
    onClose();
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={t.no}
      subtitle={`${TYPE_LABEL[t.type]} · ${date(t.date)}`}
      footer={
        <>
          {isPosted && s.isAdmin && (
            <Button variant="ghost" icon={<Ban className="w-4 h-4" />} onClick={() => setCancel(true)}>
              Cancel voucher
            </Button>
          )}
          {canApprove && (
            <>
              <Button onClick={() => (decide('stockTxns', t.id, 'REJECTED', 'Rejected', t.no), toast.info('Rejected'), onClose())}>Reject</Button>
              <Button variant="success" onClick={() => (decide('stockTxns', t.id, 'APPROVED', 'Approved', t.no), toast.success('Approved'), onClose())}>
                Approve
              </Button>
            </>
          )}
          {canReceive && (
            <Button variant="primary" icon={<PackageCheck className="w-4 h-4" />} onClick={() => (update('stockTxns', t.id, { status: 'POSTED', receivedAt: today(), receivedBy: s.user.name }, `${t.no} received`, 'Stock voucher'), toast.success('Receipt confirmed', 'Stock moved to your store'), onClose())}>
              Confirm receipt
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <StatusBadge status={t.status} />
          <Badge tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Badge>
        </div>
        <KV
          items={[
            ['From', n.store(t.fromStoreId)],
            ['To', t.issueToVehicleId ? `Vehicle ${n.veh(t.issueToVehicleId)}` : n.store(t.toStoreId)],
            ['Supplier', t.supplierId ? n.sup(t.supplierId) : '—'],
            ['BOQ item', t.boqItemId ? `${n.lk.boq[t.boqItemId]?.itemNo} ${n.lk.boq[t.boqItemId]?.description}` : '—'],
            ['Work / location', t.workDone || t.location || '—'],
            ['Vehicle / challan', [t.vehicleNo, t.challanNo, t.weighbridgeSlip].filter(Boolean).join(' · ') || '—'],
            ['Reason / remark', t.reason || t.remark || t.condition || '—'],
            ['Entered by', `${n.user(t.createdBy)} · ${dateTime(t.createdAt)}`],
            ['Received', t.receivedAt ? `${date(t.receivedAt)}${t.receivedBy ? ` by ${t.receivedBy}` : ''}` : '—'],
            ['Attachments', t.photos ? `${t.photos} photo(s)` : '—'],
          ]}
        />
        <Section title="Lines">
          <div className="rounded-xl border border-line divide-y divide-line">
            {t.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div>
                  <div className="font-medium">{n.mat(l.materialId)}</div>
                  <div className="text-[11px] text-muted">
                    {l.enteredUnit && l.enteredUnit !== n.unit(l.materialId) ? `Entered ${l.enteredQty} ${l.enteredUnit} · ` : ''}
                    {l.orderedQty ? `Ordered ${qty(l.orderedQty)} · ` : ''}
                    {l.rejectedQty ? `Rejected ${qty(l.rejectedQty)} (${l.rejectReason}) · ` : ''}
                    {l.batchNo ? `Batch ${l.batchNo}` : ''}
                    {l.systemQty !== undefined ? `System ${qty(l.systemQty)} → physical ${qty(l.physicalQty)}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold num">{qty(l.qty, n.unit(l.materialId))}</div>
                  <div className="text-[11px] text-muted"><Money v={Math.abs(l.qty) * (l.rate || avgRate(db, store, l.materialId))} /></div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Modal
        open={cancel}
        onClose={() => setCancel(false)}
        title="Cancel voucher"
        footer={
          <>
            <Button onClick={() => setCancel(false)}>Keep</Button>
            <Button variant="danger" onClick={doCancel}>
              Cancel voucher
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2 mb-3">Posted entries are never deleted (SEC-03). Cancelling reverses the stock effect and is written to the audit log.</p>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </Drawer>
  );
}

/* ================= Item ledger ================= */
function LedgerTab() {
  const db = useDB();
  const def = useDefaultStore();
  const [store, setStore] = useState(def);
  const [mat, setMat] = useState('m01');
  const [range, setRange] = useRange('90d');
  const storeOpts = useStoreOptions();
  const n = useNames();
  const rows = useMemo(() => itemLedger(db, store, mat, range).slice().reverse(), [db, store, mat, range]);
  return (
    <DataTable
      title={`Item ledger — ${n.mat(mat)} @ ${n.store(store)}`}
      subtitle={`${date(range.from)} to ${date(range.to)}`}
      rows={rows}
      rowKey={(r, i) => `${r.refId}-${i}`}
      pageSize={20}
      toolbar={
        <>
          <Combo value={store} onChange={setStore} options={storeOpts} className="w-56" />
          <Combo value={mat} onChange={setMat} options={materialOptions(db)} className="w-56" />
          <DateRangePicker value={range} onChange={setRange} />
        </>
      }
      columns={[
        { key: 'date', header: 'Date', primary: true, value: (r) => r.date, cell: (r) => date(r.date) },
        { key: 'kind', header: 'Transaction', value: (r) => r.kind },
        { key: 'ref', header: 'Voucher', value: (r) => r.ref, cell: (r) => <span className="font-mono text-xs">{r.ref}</span> },
        { key: 'counter', header: 'From / to', value: (r) => n.store(r.counterStoreId), cell: (r) => (r.counterStoreId ? n.store(r.counterStoreId) : r.boqItemId ? n.lk.boq[r.boqItemId]?.description : '—'), hideMobile: true },
        { key: 'in', header: 'In', align: 'right', value: (r) => (r.qty > 0 ? round(r.qty, 3) : ''), cell: (r) => (r.qty > 0 ? <span className="text-good">+{qty(r.qty)}</span> : '') },
        { key: 'out', header: 'Out', align: 'right', value: (r) => (r.qty < 0 ? round(-r.qty, 3) : ''), cell: (r) => (r.qty < 0 ? qty(-r.qty) : '') },
        { key: 'rate', header: 'Rate', align: 'right', rate: true, value: (r) => round(r.rate, 2), cell: (r) => inr(r.rate, true) },
        { key: 'balance', header: 'Balance', align: 'right', value: (r) => r.balance, cell: (r) => <span className="font-semibold">{qty(r.balance, n.unit(mat))}</span> },
        { key: 'bv', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(r.balanceValue), cell: (r) => inr(r.balanceValue) },
      ]}
    />
  );
}

/* ================= In transit ================= */
function TransitTab() {
  const db = useDB();
  const s = useSession();
  const { siteId } = useSiteFilter();
  const [confirm, setConfirm] = useState<TransitRow | null>(null);
  const [recvQty, setRecvQty] = useState<number | ''>('');
  const rows = useMemo(() => materialsInTransit(db).filter((r) => (!r.toSiteId || s.seesSite(r.toSiteId)) && (!siteId || r.toSiteId === siteId)), [db, s, siteId]);
  const doConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'Plant dispatch') {
      const d = db.dispatches.find((x) => x.id === confirm.id)!;
      const q = recvQty === '' ? d.qty : Number(recvQty);
      const diffPct = ((d.qty - q) / d.qty) * 100;
      update('dispatches', d.id, { status: 'RECEIVED', receivedQty: q, receivedAt: new Date().toISOString() }, `${d.no} received at site`, 'Dispatch');
      if (Math.abs(diffPct) > db.settings.tolerance.dispatch) toast.warn('Quantity difference flagged', `${diffPct.toFixed(1)}% short vs dispatch slip (PLT-11)`);
      else toast.success('Receipt confirmed (MAT-03)');
    } else {
      update('stockTxns', confirm.id, { status: 'POSTED', receivedAt: today(), receivedBy: s.user.name }, `${confirm.no} received`, 'Stock voucher');
      toast.success('Receipt confirmed', 'Stock moved to your store');
    }
    setConfirm(null);
  };
  return (
    <>
      <DataTable
        title="Materials in transit"
        rows={rows}
        rowKey={(r) => r.id}
        empty={<div className="py-10 text-center text-sm text-muted">Nothing in transit — all receipts confirmed.</div>}
        columns={[
          { key: 'no', header: 'Document', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{r.kind}</div></div> },
          { key: 'date', header: 'Sent', value: (r) => r.date, cell: (r) => `${date(r.date)}${r.ageDays ? ` · ${r.ageDays}d` : ''}` },
          { key: 'from', header: 'From', value: (r) => r.fromName },
          { key: 'to', header: 'To', value: (r) => r.toName },
          { key: 'material', header: 'Material', value: (r) => r.material, cell: (r) => <span>{r.material} · <b>{qty(r.qty, r.unit)}</b></span> },
          { key: 'vehicle', header: 'Vehicle', value: (r) => r.vehicle, hideMobile: true },
          { key: 'act', header: '', sortable: false, cell: (r) => (s.can('inventory', 'add') || s.can('plant', 'add') ? <Button size="sm" variant="primary" onClick={(e) => (e.stopPropagation(), setConfirm(r), setRecvQty(r.qty))}>Confirm receipt</Button> : null) },
        ]}
      />
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Confirm receipt"
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="primary" onClick={doConfirm}>
              Confirm
            </Button>
          </>
        }
      >
        {confirm && (
          <div className="space-y-4">
            <KV cols={1} items={[['Document', confirm.no], ['Material', `${confirm.material} — ${qty(confirm.qty, confirm.unit)}`], ['From', confirm.fromName], ['Vehicle', confirm.vehicle]]} />
            {confirm.kind === 'Plant dispatch' && (
              <Field label="Quantity received (as per site weighbridge)" hint={`Differences beyond ${db.settings.tolerance.dispatch}% are flagged`}>
                <NumberInput value={recvQty} onChange={setRecvQty} suffix={confirm.unit} />
              </Field>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/* ================= Theoretical vs actual ================= */
function VarianceTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [range, setRange] = useRange('30d');
  const rows = useMemo(() => theoreticalVsActual(db, range, siteId || undefined).filter((r) => s.seesSite(r.siteId)), [db, range, siteId, s]);
  const chart = rows.filter((r) => r.theoretical > 0).slice(0, 12).map((r) => ({ label: `${n.lk.material[r.materialId]?.code}·${n.lk.site[r.siteId]?.code.split('-')[0]}`, values: { pct: round(Math.max(0, r.diffPct), 2) } }));
  return (
    <div className="space-y-4">
      <Callout>
        For every BOQ item with a recipe, the system works out the material that <b>should</b> have been used for the measured work, and compares it with material actually consumed against that item (MAT-16/17). Rows over tolerance raise an alert (MAT-18).
      </Callout>
      {chart.length > 0 && (
        <Card>
          <CardHeader title="Over-consumption by material (%)" subtitle="Top 12 — actual vs theoretical" />
          <div className="px-4 pb-4">
            <ColumnChart data={chart} series={[{ key: 'pct', label: 'Over-use %', color: 'var(--s2)' }]} height={200} format={(v) => `${v.toFixed(1)}%`} />
          </div>
        </Card>
      )}
      <DataTable
        title="Theoretical vs actual consumption"
        subtitle={`${date(range.from)} to ${date(range.to)}`}
        rows={rows}
        rowKey={(r) => `${r.siteId}-${r.materialId}`}
        rowClassName={(r) => (r.breach ? 'bg-bad-soft/40' : undefined)}
        toolbar={<DateRangePicker value={range} onChange={setRange} />}
        columns={[
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'mat', header: 'Material', primary: true, value: (r) => n.mat(r.materialId) },
          { key: 'theo', header: 'Theoretical', align: 'right', value: (r) => round(r.theoretical, 2), cell: (r) => qty(r.theoretical, n.unit(r.materialId)) },
          { key: 'act', header: 'Actual', align: 'right', value: (r) => round(r.actual, 2), cell: (r) => qty(r.actual, n.unit(r.materialId)) },
          { key: 'diff', header: 'Difference', align: 'right', value: (r) => round(r.diff, 2), cell: (r) => <span className={r.diff > 0 ? 'text-bad' : 'text-good'}>{r.diff > 0 ? '+' : ''}{qty(r.diff)}</span> },
          { key: 'pct', header: '%', align: 'right', value: (r) => round(r.diffPct, 2), cell: (r) => <span className={cn('font-semibold', r.breach ? 'text-bad' : '')}>{r.diffPct > 0 ? '+' : ''}{r.diffPct.toFixed(1)}%</span> },
          { key: 'val', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(r.diffValue), cell: (r) => inr(r.diffValue) },
          { key: 'tol', header: 'Tolerance', align: 'right', value: (r) => r.tolerance, cell: (r) => `±${r.tolerance}%`, hideMobile: true },
          { key: 'st', header: 'Status', value: (r) => (r.breach ? 'Over tolerance' : 'OK'), cell: (r) => (r.breach ? <Badge tone="bad">Over tolerance</Badge> : <Badge tone="good">Within limit</Badge>) },
        ]}
      />
    </div>
  );
}

/* ================= Tools & tackles ================= */
function ToolsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const rows = useMemo(() => toolsBalance(db).filter((r) => s.seesSite(r.siteId)), [db, s]);
  return (
    <div className="space-y-4">
      <Callout icon={<Hammer className="w-4 h-4" />}>Returnable items — shuttering plates, props, scaffolding — are tracked separately: issued to site, returned, lost or damaged, with the balance at each site (MAT-15).</Callout>
      <DataTable
        title="Tools & tackles balance"
        rows={rows}
        rowKey={(r) => `${r.siteId}-${r.materialId}`}
        columns={[
          { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
          { key: 'mat', header: 'Item', primary: true, value: (r) => n.mat(r.materialId) },
          { key: 'issued', header: 'Issued', align: 'right', value: (r) => r.issued },
          { key: 'returned', header: 'Returned', align: 'right', value: (r) => r.returned },
          { key: 'lost', header: 'Lost / damaged', align: 'right', value: (r) => r.lost, cell: (r) => (r.lost ? <span className="text-bad">{r.lost}</span> : '—') },
          { key: 'balance', header: 'At site', align: 'right', value: (r) => r.balance, cell: (r) => <b>{r.balance}</b> },
          { key: 'value', header: 'Value at site', align: 'right', rate: true, value: (r) => r.balance * (n.lk.material[r.materialId]?.stdRate || 0), cell: (r) => inr(r.balance * (n.lk.material[r.materialId]?.stdRate || 0)) },
        ]}
      />
    </div>
  );
}

/* ================= Daily material report ================= */
function DailyTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [d, setD] = useState(today());
  const rows = useMemo(() => {
    const L = getLedger(db);
    const map = new Map<string, { siteId: ID; materialId: ID; received: number; consumed: number; other: number; value: number }>();
    for (const m of L.movements) {
      if (m.date !== d || !m.siteId || m.kind === 'Opening') continue;
      if (!s.seesSite(m.siteId) || (siteId && m.siteId !== siteId)) continue;
      const k = `${m.siteId}|${m.materialId}`;
      const e = map.get(k) || { siteId: m.siteId, materialId: m.materialId, received: 0, consumed: 0, other: 0, value: 0 };
      if (m.qty > 0) e.received += m.qty;
      else if (m.kind === 'Consumption') (e.consumed -= m.qty), (e.value -= m.value);
      else e.other -= m.qty;
      map.set(k, e);
    }
    return [...map.values()];
  }, [db, d, siteId, s]);
  return (
    <DataTable
      title={`Daily material report — ${date(d)}`}
      rows={rows}
      rowKey={(r) => `${r.siteId}-${r.materialId}`}
      toolbar={<Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} className="w-44" />}
      empty={<div className="py-10 text-center text-sm text-muted">No material movement on this day.</div>}
      columns={[
        { key: 'site', header: 'Site', value: (r) => n.site(r.siteId) },
        { key: 'mat', header: 'Material', primary: true, value: (r) => n.mat(r.materialId) },
        { key: 'rec', header: 'Received', align: 'right', value: (r) => round(r.received, 2), cell: (r) => (r.received ? <span className="text-good">+{qty(r.received, n.unit(r.materialId))}</span> : '—') },
        { key: 'con', header: 'Consumed', align: 'right', value: (r) => round(r.consumed, 2), cell: (r) => (r.consumed ? qty(r.consumed, n.unit(r.materialId)) : '—') },
        { key: 'oth', header: 'Other out', align: 'right', value: (r) => round(r.other, 2), cell: (r) => (r.other ? qty(r.other) : '—') },
        { key: 'val', header: 'Consumed value', align: 'right', rate: true, value: (r) => Math.round(r.value), cell: (r) => inr(r.value) },
        { key: 'bal', header: 'Closing stock', align: 'right', value: (r) => round(availability(db, lookup(db).siteStore[r.siteId]!, r.materialId, d).onDate, 2), cell: (r) => qty(availability(db, lookup(db).siteStore[r.siteId]!, r.materialId, d).onDate, n.unit(r.materialId)) },
      ]}
    />
  );
}

export { Plus };

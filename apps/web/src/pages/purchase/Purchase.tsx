import { useMemo, useState } from 'react';
import { CircleCheck, FileText, PackageCheck, Plus, Printer, Send, ShoppingCart, Trophy, Truck, Wallet } from 'lucide-react';
import { useDB, insert, update, nextNo } from '../../data/store';
import { useSession } from '../../data/session';
import { lookup, lowStock, payablesAgeing, poStatus, poTaxable, poValue, stockAgeing, stockRegister, storeValue, supplierBalance, supplierLedger, threeWayMatch } from '../../data/selectors';
import { avgRate } from '../../data/ledger';
import type { ID, POLine, PurchaseInvoice, PurchaseOrder, Requisition, StockLine, StockTxn } from '../../data/types';
import { Badge, Button, Callout, Card, CardHeader, Drawer, KV, PageHeader, Section, Stat, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, DateRangePicker, Field, Input, NumberInput, Select, Textarea, AttachField } from '../../components/ui/fields';
import { ColumnChart } from '../../components/ui/charts';
import { addDays, date, inr, inrCompact, qty, today } from '../../lib/format';
import { printDocument, shareWhatsApp } from '../../lib/export';
import { cn, round, sum } from '../../lib/utils';
import { DateRuleNote, entryDateRule, LinesEditor, linesShort, materialOptions, Money, toBase, useAutoOpen, useModuleTab, useNames, useNewParam, useQueryParam, useRange, useStoreOptions, type LineDraft } from '../shared';
import { useSiteFilter } from '../../components/layout/AppShell';

export default function Purchase() {
  const { tab, tabsEl } = useModuleTab('purchase');
  return (
    <div>
      <PageHeader title="Central store & purchase" subtitle="Every unit received is matched to an order, an invoice and a payment." tags={['PUR-01…07', 'STR-01…05', 'SUP-01…03']} />
      {tabsEl}
      {tab === 'central' && <CentralTab />}
      {tab === 'requisitions' && <RequisitionsTab />}
      {tab === 'quotations' && <QuotationsTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'grn' && <GrnTab />}
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'debit-notes' && <DebitNotesTab />}
      {tab === 'suppliers' && <SupplierLedgerTab />}
      {tab === 'payables' && <PayablesTab />}
      {tab === 'register' && <RegisterTab />}
    </div>
  );
}

const supplierOpts = (db: ReturnType<typeof useDB>) => db.suppliers.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.name, hint: `${s.code} · ${s.materials}` }));

/* ================= Central store (STR) ================= */
function CentralTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [view, setView] = useState<'stock' | 'ageing' | 'issues'>('stock');
  const [issue, setIssue] = useState(false);
  const range = { from: addDays(today(), -30), to: today() };
  const reg = useMemo(() => stockRegister(db, 'cs', range), [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const lows = lowStock(db).filter((l) => l.storeId === 'cs');
  const ageing = useMemo(() => stockAgeing(db, 'cs'), [db]);
  const issues = useMemo(() => db.stockTxns.filter((t) => t.fromStoreId === 'cs' && t.type === 'ISSUE').slice().reverse(), [db]);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
        <Stat label="Central store value" value={s.showRates ? storeValue(db, 'cs') : reg.length} format={s.showRates ? inrCompact : (x) => `${Math.round(x)} items`} icon={<PackageCheck className="w-[18px] h-[18px]" />} tone="brand" />
        <Stat label="Reorder alerts" value={lows.length} format={(x) => `${Math.round(x)}`} icon={<ShoppingCart className="w-[18px] h-[18px]" />} tone={lows.length ? 'bad' : 'good'} sub="Below minimum level (STR-02)" />
        <Stat label="Issues (30 days)" value={issues.filter((t) => t.date >= range.from).length} icon={<Truck className="w-[18px] h-[18px]" />} tone="info" sub="To sites, plants & vehicles" />
        <Stat label="Slow-moving items" value={ageing.filter((a) => a.days > 90).length} icon={<FileText className="w-[18px] h-[18px]" />} tone="warn" sub="Not issued in 90+ days (STR-03)" />
      </div>
      {lows.length > 0 && (
        <Callout tone="warn">
          <b>Reorder now:</b> {lows.map((l) => `${n.mat(l.materialId)} (${qty(l.qty, n.unit(l.materialId))} left, reorder ${qty(l.reorder)})`).join(' · ')}
        </Callout>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={view} onChange={(v) => setView(v as typeof view)} className="w-56" options={[{ value: 'stock', label: 'Stock statement' }, { value: 'ageing', label: 'Stock ageing' }, { value: 'issues', label: 'Issue register' }]} />
        {s.can('inventory', 'add') && s.seesStore('cs') && (
          <Button variant="primary" icon={<Truck className="w-4 h-4" />} onClick={() => setIssue(true)}>
            Issue material
          </Button>
        )}
      </div>
      {view === 'stock' && (
        <DataTable
          title="Central store stock statement"
          rows={reg}
          rowKey={(r) => r.materialId}
          initialSort={{ key: 'value', dir: 'desc' }}
          rowClassName={(r) => (lows.some((l) => l.materialId === r.materialId) ? 'bg-bad-soft/40' : undefined)}
          columns={[
            { key: 'mat', header: 'Material', primary: true, value: (r) => n.mat(r.materialId) },
            { key: 'cat', header: 'Category', value: (r) => n.lk.material[r.materialId]?.category, hideMobile: true },
            { key: 'closing', header: 'In stock', align: 'right', value: (r) => round(r.closing, 2), cell: (r) => <b>{qty(r.closing, n.unit(r.materialId))}</b> },
            { key: 'min', header: 'Min level', align: 'right', value: (r) => n.lk.material[r.materialId]?.minStock || 0 },
            { key: 'reorder', header: 'Reorder qty', align: 'right', value: (r) => n.lk.material[r.materialId]?.reorderQty || 0, hideMobile: true },
            { key: 'avg', header: 'Avg rate', align: 'right', rate: true, value: (r) => round(avgRate(db, 'cs', r.materialId), 2), cell: (r) => inr(avgRate(db, 'cs', r.materialId), true) },
            { key: 'value', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(r.closingValue), cell: (r) => inr(r.closingValue) },
            { key: 'st', header: 'Status', value: (r) => (lows.some((l) => l.materialId === r.materialId) ? 'Reorder' : 'OK'), cell: (r) => (lows.some((l) => l.materialId === r.materialId) ? <Badge tone="bad">Reorder</Badge> : <Badge tone="good">OK</Badge>) },
          ]}
        />
      )}
      {view === 'ageing' && (
        <DataTable
          title="Central store — stock ageing"
          rows={ageing}
          rowKey={(r) => r.materialId}
          columns={[
            { key: 'mat', header: 'Material', primary: true, value: (r) => n.mat(r.materialId) },
            { key: 'qty', header: 'Quantity', align: 'right', value: (r) => round(r.qty, 2), cell: (r) => qty(r.qty, n.unit(r.materialId)) },
            { key: 'value', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(r.value), cell: (r) => inr(r.value) },
            { key: 'last', header: 'Last issued', value: (r) => r.lastIssue || '', cell: (r) => (r.lastIssue ? date(r.lastIssue) : 'Never in period') },
            { key: 'bucket', header: 'Not moved', value: (r) => r.bucket, cell: (r) => <Badge tone={r.days > 180 ? 'bad' : r.days > 90 ? 'warn' : 'good'}>{r.bucket}</Badge> },
          ]}
        />
      )}
      {view === 'issues' && (
        <DataTable
          title="Central store issue register"
          rows={issues}
          rowKey={(r) => r.id}
          columns={[
            { key: 'no', header: 'Issue slip', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
            { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
            { key: 'to', header: 'Issued to', value: (r) => (r.issueToVehicleId ? `Vehicle ${n.veh(r.issueToVehicleId)}` : n.store(r.toStoreId)) },
            { key: 'items', header: 'Items', value: (r) => r.lines.map((l) => `${n.mat(l.materialId)} ${l.qty}`).join(', ') },
            { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
      {issue && <IssueForm onClose={() => setIssue(false)} />}
    </div>
  );
}

function IssueForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const [d, setD] = useState(today());
  const [toKind, setToKind] = useState<'store' | 'vehicle'>('store');
  const [to, setTo] = useState('');
  const [veh, setVeh] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [remark, setRemark] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ materialId: '', qty: '', unit: '' }]);
  const stores = db.stores.filter((x) => x.type !== 'CENTRAL').map((x) => ({ value: x.id, label: x.name, hint: x.type === 'PLANT' ? 'Plant yard' : 'Site store' }));
  const rule = entryDateRule(db, d, s.isAdmin);
  const save = () => {
    if (rule.error) return toast.error(rule.error);
    const valid = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (!valid.length) return toast.error('Add materials');
    if (toKind === 'store' ? !to : !veh) return toast.error('Choose where the material goes');
    if (linesShort(db, valid, 'cs', d)) return toast.error('Not enough stock in central store (MAT-10)');
    const value = sum(valid, (l) => toBase(db, l) * avgRate(db, 'cs', l.materialId));
    const status: StockTxn['status'] = value > db.settings.approvalLimits.issue && !s.isAdmin ? 'PENDING' : toKind === 'vehicle' ? 'POSTED' : 'IN_TRANSIT';
    const no = nextNo('MIN', d);
    insert('stockTxns', { no, type: 'ISSUE', date: d, fromStoreId: 'cs', toStoreId: toKind === 'store' ? to : undefined, issueToVehicleId: toKind === 'vehicle' ? veh : undefined, lines: valid.map((l) => ({ materialId: l.materialId, qty: toBase(db, l), rate: 0, enteredQty: Number(l.qty), enteredUnit: l.unit })), vehicleNo, remark, status } as any, `Issue slip ${no}`, 'Stock voucher');
    toast.success(`${no} saved`, status === 'PENDING' ? `Value ${inr(value)} is above the ${inr(db.settings.approvalLimits.issue)} limit — sent for approval` : status === 'IN_TRANSIT' ? 'Site must confirm receipt (MAT-01)' : 'Posted to vehicle cost (STR-05)');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Issue from central store" subtitle="STR-01 · to a site, a plant, a vehicle (spares) or a department" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save issue slip</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date" required>
            <Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} />
          </Field>
          <Field label="Issue to">
            <Select value={toKind} onChange={(v) => setToKind(v as 'store' | 'vehicle')} options={[{ value: 'store', label: 'Site / plant store' }, { value: 'vehicle', label: 'Vehicle / machine (spares, lubricants)' }]} />
          </Field>
          {toKind === 'store' ? (
            <Field label="Destination store" required>
              <Combo value={to} onChange={setTo} options={stores} />
            </Field>
          ) : (
            <Field label="Vehicle / machine" required>
              <Combo value={veh} onChange={setVeh} options={db.vehicles.map((v) => ({ value: v.id, label: `${v.code} — ${v.regNo}`, hint: `${v.type} · ${v.make} ${v.model}` }))} />
            </Field>
          )}
          <Field label="Vehicle no. (transport)">
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="AS01-FC-1188" />
          </Field>
        </div>
        <DateRuleNote date={d} />
        <Section title="Materials">
          <LinesEditor lines={lines} onChange={setLines} storeId="cs" date={d} checkStock />
        </Section>
        <Field label="Remark">
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

/* ================= Requisitions (PUR-01) ================= */
function RequisitionsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [po, setPo] = useState<Requisition | null>(null);
  const rows = useMemo(() => db.requisitions.filter((r) => s.seesStore(r.storeId) && (!siteId || n.lk.store[r.storeId]?.siteId === siteId)).slice().reverse(), [db, s, siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <DataTable
        title="Material requisitions"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('purchase', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>New requisition</Button>}
        columns={[
          { key: 'no', header: 'Requisition', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'store', header: 'For', value: (r) => n.store(r.storeId) },
          { key: 'items', header: 'Items', value: (r) => r.lines.map((l) => `${n.mat(l.materialId)} ${qty(l.qty, n.unit(l.materialId))}`).join(', ') },
          { key: 'by', header: 'Required by', value: (r) => r.requiredBy, cell: (r) => date(r.requiredBy), hideMobile: true },
          { key: 'purpose', header: 'Purpose', value: (r) => r.purpose, hideMobile: true },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
          { key: 'act', header: '', sortable: false, cell: (r) => (r.status === 'APPROVED' && s.can('purchase', 'add') ? <Button size="sm" onClick={(e) => (e.stopPropagation(), setPo(r))}>Raise PO</Button> : null) },
        ]}
      />
      {form && <RequisitionForm onClose={() => setForm(false)} />}
      {po && <PoForm onClose={() => setPo(null)} fromReq={po} />}
    </>
  );
}

function RequisitionForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const opts = useStoreOptions();
  const [store, setStore] = useState(opts[0]?.value || '');
  const [by, setBy] = useState(addDays(today(), 7));
  const [purpose, setPurpose] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ materialId: '', qty: '', unit: '' }]);
  const save = () => {
    const valid = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (!store || !valid.length) return toast.error('Choose store and materials');
    const no = nextNo('REQ');
    insert('requisitions', { no, date: today(), storeId: store, requiredBy: by, purpose: purpose || 'Site requirement', lines: valid.map((l) => ({ materialId: l.materialId, qty: toBase(db, l) })), status: 'PENDING' } as any, `Requisition ${no}`, 'Requisition');
    toast.success(`${no} raised`, 'Sent to owner / manager for approval');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Material requisition" subtitle="PUR-01 · raised by a site, plant or store; approved by owner / manager" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Submit for approval</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="For store" required>
            <Combo value={store} onChange={setStore} options={opts} />
          </Field>
          <Field label="Required by" required>
            <Input type="date" value={by} min={today()} onChange={(e) => setBy(e.target.value)} />
          </Field>
          <Field label="Purpose" className="sm:col-span-2">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Slab casting, Block A 4th floor" />
          </Field>
        </div>
        <LinesEditor lines={lines} onChange={setLines} storeId={store} date={today()} />
      </div>
    </Drawer>
  );
}

/* ================= Quotation comparison (PUR-02) ================= */
function QuotationsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [form, setForm] = useState(false);
  const [po, setPo] = useState<{ supplierId: ID; materialId: ID; qty: number; rate: number } | null>(null);
  const rows = db.quotations.slice().reverse();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{s.can('purchase', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>New comparison</Button>}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
        {rows.slice(0, 12).map((qt) => {
          const low = Math.min(...qt.quotes.map((q) => q.rate));
          const m = n.lk.material[qt.materialId];
          return (
            <Card key={qt.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-muted">{qt.no} · {date(qt.date)}</div>
                  <div className="font-semibold mt-0.5">{m?.name}</div>
                  <div className="text-xs text-fg-2">{qty(qt.qty, m?.unit)}</div>
                </div>
                {qt.selectedSupplierId ? <Badge tone="good">Ordered</Badge> : <Badge tone="warn">Awaiting decision</Badge>}
              </div>
              <div className="mt-3 space-y-1.5">
                {qt.quotes
                  .slice()
                  .sort((a, b) => a.rate - b.rate)
                  .map((q) => (
                    <div key={q.supplierId} className={cn('flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm', q.rate === low ? 'bg-good-soft' : 'bg-surface-2')}>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-1.5">
                          {q.rate === low && <Trophy className="w-3.5 h-3.5 text-good shrink-0" />}
                          {n.sup(q.supplierId)}
                        </div>
                        <div className="text-[11px] text-muted">{q.deliveryDays} days · {q.terms}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold num"><Money v={q.rate} /></div>
                        {q.rate !== low && s.showRates && <div className="text-[10px] text-bad">+{(((q.rate - low) / low) * 100).toFixed(1)}%</div>}
                      </div>
                      {!qt.selectedSupplierId && s.can('purchase', 'add') && (
                        <Button size="sm" variant={q.rate === low ? 'primary' : 'secondary'} onClick={() => (update('quotations', qt.id, { selectedSupplierId: q.supplierId }, `${qt.no} supplier selected`, 'Quotation'), setPo({ supplierId: q.supplierId, materialId: qt.materialId, qty: qt.qty, rate: q.rate }))}>
                          Pick
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </Card>
          );
        })}
      </div>
      {form && <QuotationForm onClose={() => setForm(false)} />}
      {po && <PoForm onClose={() => setPo(null)} preset={po} />}
    </div>
  );
}

function QuotationForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [mat, setMat] = useState('');
  const [q, setQ] = useState<number | ''>('');
  const [quotes, setQuotes] = useState<Array<{ supplierId: string; rate: number | ''; deliveryDays: number | ''; terms: string }>>([{ supplierId: '', rate: '', deliveryDays: 3, terms: '30 days credit' }, { supplierId: '', rate: '', deliveryDays: 3, terms: '' }, { supplierId: '', rate: '', deliveryDays: 3, terms: '' }]);
  const valid = quotes.filter((x) => x.supplierId && Number(x.rate) > 0);
  const low = valid.length ? Math.min(...valid.map((x) => Number(x.rate))) : 0;
  const save = () => {
    if (!mat || !q || valid.length < 2) return toast.error('Material, quantity and at least 2 quotes needed');
    const no = nextNo('QTN');
    insert('quotations', { no, date: today(), materialId: mat, qty: Number(q), quotes: valid.map((x) => ({ supplierId: x.supplierId, rate: Number(x.rate), deliveryDays: Number(x.deliveryDays) || 0, terms: x.terms })) } as any, `Quotation comparison ${no}`, 'Quotation');
    toast.success('Comparison saved', 'Pick the supplier to raise a PO');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Quotation comparison" subtitle="PUR-02 · up to 5 supplier quotes; lowest rate is highlighted" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Material" required>
            <Combo value={mat} onChange={setMat} options={materialOptions(db)} />
          </Field>
          <Field label="Quantity" required>
            <NumberInput value={q} onChange={setQ} suffix={db.materials.find((m) => m.id === mat)?.unit} />
          </Field>
        </div>
        <Section title="Quotes">
          <div className="space-y-2">
            {quotes.map((x, i) => (
              <div key={i} className={cn('grid grid-cols-12 gap-2 p-2.5 rounded-xl border', Number(x.rate) === low && low > 0 ? 'border-good bg-good-soft/50' : 'border-line')}>
                <div className="col-span-12 sm:col-span-5">
                  <Combo value={x.supplierId} onChange={(v) => setQuotes(quotes.map((y, j) => (j === i ? { ...y, supplierId: v } : y)))} options={supplierOpts(db)} placeholder={`Supplier ${i + 1}`} />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <NumberInput value={x.rate} onChange={(v) => setQuotes(quotes.map((y, j) => (j === i ? { ...y, rate: v } : y)))} prefix="₹" placeholder="Rate" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <NumberInput value={x.deliveryDays} onChange={(v) => setQuotes(quotes.map((y, j) => (j === i ? { ...y, deliveryDays: v } : y)))} suffix="d" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input value={x.terms} onChange={(e) => setQuotes(quotes.map((y, j) => (j === i ? { ...y, terms: e.target.value } : y)))} placeholder="Terms" />
                </div>
              </div>
            ))}
            {quotes.length < 5 && (
              <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setQuotes([...quotes, { supplierId: '', rate: '', deliveryDays: 3, terms: '' }])}>
                Add quote
              </Button>
            )}
          </div>
        </Section>
      </div>
    </Drawer>
  );
}

/* ================= Purchase orders (PUR-03) ================= */
function printPO(db: ReturnType<typeof useDB>, po: PurchaseOrder) {
  const lk = lookup(db);
  const sup = lk.supplier[po.supplierId]!;
  const taxable = poTaxable(po.lines);
  const total = poValue(po.lines);
  const interstate = !sup.gstin.startsWith('18');
  printDocument({
    title: `Purchase Order ${po.no}`,
    meta: [
      ['PO date', date(po.date)],
      ['Supplier', sup.name],
      ['Supplier GSTIN', sup.gstin],
      ['Deliver to', lk.store[po.deliveryStoreId]?.name || ''],
      ['Delivery terms', po.deliveryTerms],
      ['Payment terms', po.paymentTerms],
    ],
    table: {
      title: 'Lines',
      headers: ['#', 'Material', 'HSN', 'Qty', 'Unit', 'Rate', 'GST %', 'Amount'],
      rows: po.lines.map((l, i) => [i + 1, lk.material[l.materialId]?.name, lk.material[l.materialId]?.hsn, l.qty, lk.material[l.materialId]?.unit, l.rate, l.gstPct, Math.round(l.qty * l.rate)]),
      numeric: [3, 5, 6, 7],
    },
    summary: [
      ['Taxable value', inr(taxable, true)],
      ...(interstate ? ([['IGST', inr(total - taxable, true)]] as Array<[string, string]>) : ([['CGST', inr((total - taxable) / 2, true)], ['SGST', inr((total - taxable) / 2, true)]] as Array<[string, string]>)),
      ['Total', inr(total, true)],
    ],
    footerNote: 'Please quote the PO number on every challan and invoice. Material subject to inspection and weighbridge check at site.',
  });
}

function OrdersTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const q = useQueryParam('q') || '';
  const [form, setForm] = useState(false);
  const [view, setView] = useState<PurchaseOrder | null>(null);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.pos.filter((p) => s.seesStore(p.deliveryStoreId) && (!siteId || n.lk.store[p.deliveryStoreId]?.siteId === siteId) && (!q || p.no === q)).slice().reverse(), [db, s, siteId, q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <DataTable
        title="Purchase orders"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setView}
        toolbar={s.can('purchase', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>New PO</Button>}
        columns={[
          { key: 'no', header: 'PO', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'sup', header: 'Supplier', value: (r) => n.sup(r.supplierId) },
          { key: 'to', header: 'Deliver to', value: (r) => n.store(r.deliveryStoreId), hideMobile: true },
          { key: 'items', header: 'Items', value: (r) => r.lines.map((l) => `${n.mat(l.materialId)} ${qty(l.qty, n.unit(l.materialId))}`).join(', ') },
          { key: 'value', header: 'Value', align: 'right', rate: true, value: (r) => Math.round(poValue(r.lines)), cell: (r) => inr(poValue(r.lines)) },
          { key: 'pending', header: 'Pending', align: 'right', value: (r) => round(poStatus(db, r.id).pendingQty, 2), cell: (r) => { const p = poStatus(db, r.id).pendingQty; return p > 0.01 ? <span className="text-warn font-medium">{qty(p)}</span> : '—'; } },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {form && <PoForm onClose={() => setForm(false)} />}
      {view && <PoView po={view} onClose={() => setView(null)} />}
    </>
  );
}

function PoForm({ onClose, fromReq, preset }: { onClose: () => void; fromReq?: Requisition; preset?: { supplierId: ID; materialId: ID; qty: number; rate: number } }) {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const [sup, setSup] = useState(preset?.supplierId || '');
  const [store, setStore] = useState(fromReq?.storeId || 'cs');
  const [delivery, setDelivery] = useState('FOR destination, unloading by supplier');
  const [payment, setPayment] = useState('30 days credit');
  const [lines, setLines] = useState<LineDraft[]>(
    fromReq ? fromReq.lines.map((l) => ({ materialId: l.materialId, qty: l.qty, unit: lk.material[l.materialId]!.unit, rate: lk.material[l.materialId]!.stdRate })) : preset ? [{ materialId: preset.materialId, qty: preset.qty, unit: lk.material[preset.materialId]!.unit, rate: preset.rate }] : [{ materialId: '', qty: '', unit: '', rate: '' }],
  );
  const stores = db.stores.map((x) => ({ value: x.id, label: x.name, hint: x.type }));
  const poLines: POLine[] = lines.filter((l) => l.materialId && Number(l.qty) > 0).map((l) => ({ materialId: l.materialId, qty: toBase(db, l), rate: Number(l.rate) || 0, gstPct: lk.material[l.materialId]!.gstPct }));
  const total = poValue(poLines);
  const needsApproval = total > db.settings.approvalLimits.po && !s.isAdmin;
  const save = (andPrint = false) => {
    if (!sup || !poLines.length) return toast.error('Supplier and lines are required');
    if (poLines.some((l) => !l.rate)) return toast.error('Enter rate for every line');
    const no = nextNo('PO');
    const po = insert('pos', { no, date: today(), supplierId: sup, deliveryStoreId: store, requisitionId: fromReq?.id, lines: poLines, deliveryTerms: delivery, paymentTerms: payment, status: needsApproval ? 'PENDING' : 'OPEN' } as any, `Purchase order ${no}`, 'Purchase order') as unknown as PurchaseOrder;
    if (fromReq) update('requisitions', fromReq.id, { status: 'ORDERED' }, `${fromReq.no} ordered`, 'Requisition');
    toast.success(`${no} created`, needsApproval ? `Above ${inr(db.settings.approvalLimits.po)} — sent for approval` : 'Ready to send to supplier');
    if (andPrint) printPO(db, po);
    onClose();
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title="New purchase order"
      subtitle="PUR-03 · supplier, items, GST, delivery location and terms"
      footer={
        <>
          <span className="mr-auto text-sm">
            Total <b className="num"><Money v={total} /></b>
          </span>
          <Button onClick={() => save(true)} icon={<Printer className="w-4 h-4" />}>Save & print</Button>
          <Button variant="primary" onClick={() => save()}>Save PO</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Supplier" required>
            <Combo value={sup} onChange={setSup} options={supplierOpts(db)} />
          </Field>
          <Field label="Deliver to" required hint="Central store, a site or a plant">
            <Combo value={store} onChange={setStore} options={stores} />
          </Field>
          <Field label="Delivery terms">
            <Input value={delivery} onChange={(e) => setDelivery(e.target.value)} />
          </Field>
          <Field label="Payment terms">
            <Input value={payment} onChange={(e) => setPayment(e.target.value)} />
          </Field>
        </div>
        <Section title="Lines">
          <LinesEditor lines={lines} onChange={setLines} date={today()} withRate />
        </Section>
        {needsApproval && <Callout tone="warn">PO value is above {inr(db.settings.approvalLimits.po)} — it will go to the owner for approval (APR-01).</Callout>}
      </div>
    </Drawer>
  );
}

function PoView({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const st = poStatus(db, po.id);
  const grns = db.stockTxns.filter((t) => t.type === 'GRN' && t.poId === po.id);
  const [grn, setGrn] = useState(false);
  const s = useSession();
  const msg = `Purchase Order ${po.no} from ${db.company.name}\n${po.lines.map((l) => `• ${n.mat(l.materialId)}: ${l.qty} ${n.unit(l.materialId)} @ ₹${l.rate}`).join('\n')}\nDeliver to: ${n.store(po.deliveryStoreId)}\nTotal: ${inr(poValue(po.lines))} incl. GST`;
  return (
    <Drawer
      open
      onClose={onClose}
      title={po.no}
      subtitle={`${n.sup(po.supplierId)} · ${date(po.date)}`}
      footer={
        <>
          <Button icon={<Send className="w-4 h-4" />} onClick={() => shareWhatsApp(msg)}>WhatsApp</Button>
          <Button icon={<Printer className="w-4 h-4" />} onClick={() => printPO(db, po)}>Print / PDF</Button>
          {!st.fullyReceived && po.status !== 'PENDING' && s.can('purchase', 'add') && (
            <Button variant="primary" icon={<PackageCheck className="w-4 h-4" />} onClick={() => setGrn(true)}>Receive (GRN)</Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex gap-2">
          <StatusBadge status={po.status} />
          {st.fullyReceived ? <Badge tone="good">Fully received</Badge> : <Badge tone="warn">Pending {qty(st.pendingQty)}</Badge>}
        </div>
        <KV items={[['Deliver to', n.store(po.deliveryStoreId)], ['Delivery terms', po.deliveryTerms], ['Payment terms', po.paymentTerms], ['Value incl. GST', <Money key="v" v={poValue(po.lines)} />]]} />
        <Section title="Order vs received (PUR-04)">
          <div className="space-y-3">
            {st.lines.map((l) => (
              <div key={l.materialId} className="rounded-xl border border-line p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{n.mat(l.materialId)}</span>
                  <span className="num">
                    {qty(l.received)} / {qty(l.qty, n.unit(l.materialId))}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 mt-2 overflow-hidden">
                  <div className="h-full bg-good rounded-full bar-grow" style={{ width: `${Math.min(100, (l.received / l.qty) * 100)}%` }} />
                </div>
                <div className="text-[11px] text-muted mt-1">
                  Rate <Money v={l.rate} /> · GST {l.gstPct}% · pending {qty(l.pending)}
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="GRNs against this PO">
          {grns.length ? (
            <div className="rounded-xl border border-line divide-y divide-line">
              {grns.map((g) => (
                <div key={g.id} className="px-3 py-2 text-sm flex justify-between">
                  <span className="font-mono">{g.no}</span>
                  <span className="text-muted">{date(g.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No deliveries yet.</p>
          )}
        </Section>
      </div>
      {grn && <GrnForm onClose={() => (setGrn(false), onClose())} po={po} />}
    </Drawer>
  );
}

/* ================= GRN (PUR-04 / MAT-02) ================= */
function GrnTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [form, setForm] = useState(false);
  const [nw, setNw] = useNewParam();
  useAutoOpen(nw, () => setForm(true), () => setNw(null));
  const rows = useMemo(() => db.stockTxns.filter((t) => t.type === 'GRN' && s.seesStore(t.toStoreId) && (!siteId || n.lk.store[t.toStoreId!]?.siteId === siteId)).slice().reverse(), [db, s, siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <DataTable
        title="Goods receipt notes"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('purchase', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>New GRN</Button>}
        columns={[
          { key: 'no', header: 'GRN', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'sup', header: 'Supplier', value: (r) => n.sup(r.supplierId) },
          { key: 'store', header: 'Received at', value: (r) => n.store(r.toStoreId) },
          { key: 'items', header: 'Accepted', value: (r) => r.lines.map((l) => `${n.mat(l.materialId)} ${qty(l.qty, n.unit(l.materialId))}`).join(', ') },
          { key: 'rej', header: 'Rejected', value: (r) => r.lines.map((l) => l.rejectedQty || 0).join(), cell: (r) => { const rj = r.lines.filter((l) => l.rejectedQty); return rj.length ? <Badge tone="bad">{rj.map((l) => `${qty(l.rejectedQty)} ${n.unit(l.materialId)}`).join(', ')}</Badge> : '—'; } },
          { key: 'veh', header: 'Vehicle / challan', value: (r) => `${r.vehicleNo} ${r.challanNo}`, cell: (r) => <span className="text-xs text-fg-2">{r.vehicleNo} · {r.challanNo}</span>, hideMobile: true },
          { key: 'po', header: 'PO', value: (r) => (r.poId ? n.lk.po[r.poId]?.no : ''), cell: (r) => <span className="font-mono text-xs">{r.poId ? n.lk.po[r.poId]?.no : 'Direct'}</span>, hideMobile: true },
        ]}
      />
      {form && <GrnForm onClose={() => setForm(false)} />}
    </>
  );
}

function GrnForm({ onClose, po: presetPo }: { onClose: () => void; po?: PurchaseOrder }) {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const openPos = db.pos.filter((p) => (p.status === 'OPEN' || p.status === 'PARTIAL') && s.seesStore(p.deliveryStoreId));
  const [poId, setPoId] = useState(presetPo?.id || '');
  const po = lk.po[poId];
  const st = po ? poStatus(db, po.id) : null;
  const [d, setD] = useState(today());
  const [rows, setRows] = useState<Array<{ materialId: string; ordered: number; received: number | ''; rejected: number | ''; reason: string; batch: string }>>(() => (st ? st.lines.filter((l) => l.pending > 0).map((l) => ({ materialId: l.materialId, ordered: l.pending, received: l.pending, rejected: '', reason: '', batch: '' })) : []));
  const [challan, setChallan] = useState('');
  const [veh, setVeh] = useState('');
  const [wb, setWb] = useState('');
  const [photos, setPhotos] = useState(0);
  const pickPo = (id: string) => {
    setPoId(id);
    const p = poStatus(db, id);
    setRows(p.lines.filter((l) => l.pending > 0).map((l) => ({ materialId: l.materialId, ordered: l.pending, received: l.pending, rejected: '', reason: '', batch: '' })));
  };
  const rule = entryDateRule(db, d, s.isAdmin);
  const save = () => {
    if (!po) return toast.error('Choose the purchase order');
    if (rule.error) return toast.error(rule.error);
    const lines: StockLine[] = rows
      .filter((r) => Number(r.received) > 0)
      .map((r) => {
        const pl = po.lines.find((l) => l.materialId === r.materialId)!;
        return { materialId: r.materialId, qty: round(Number(r.received) - Number(r.rejected || 0), 4), rate: pl.rate, orderedQty: r.ordered, rejectedQty: Number(r.rejected) || undefined, rejectReason: r.reason || undefined, batchNo: r.batch || undefined };
      });
    if (!lines.length) return toast.error('Enter received quantity');
    if (lines.some((l) => l.rejectedQty && !l.rejectReason)) return toast.error('Give a reason for rejected quantity');
    const no = nextNo('GRN', d);
    insert('stockTxns', { no, type: 'GRN', date: d, toStoreId: po.deliveryStoreId, supplierId: po.supplierId, poId: po.id, challanNo: challan, vehicleNo: veh, weighbridgeSlip: wb, lines, photos, receivedBy: s.user.name, status: rule.needsApproval ? 'PENDING' : 'POSTED' } as any, `GRN ${no}`, 'GRN');
    const remaining = st!.lines.reduce((x, l) => x + l.pending, 0) - rows.reduce((x, r) => x + Number(r.received || 0), 0);
    update('pos', po.id, { status: remaining > 0.01 ? 'PARTIAL' : 'CLOSED' }, `${po.no} ${remaining > 0.01 ? 'partly' : 'fully'} received`, 'Purchase order');
    const rejected = lines.filter((l) => l.rejectedQty);
    for (const l of rejected) insert('debitNotes', { no: nextNo('DN', d), date: d, supplierId: po.supplierId, materialId: l.materialId, qty: l.rejectedQty!, rate: l.rate, reason: l.rejectReason! } as any, `Debit note for rejected ${lk.material[l.materialId]?.name}`, 'Debit note');
    toast.success(`${no} posted`, rejected.length ? `Debit note raised for rejected quantity (PUR-07)` : remaining > 0.01 ? 'Partial delivery — PO stays open' : 'PO fully received');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Goods receipt (GRN)" subtitle="PUR-04 / MAT-02 · ordered vs received vs accepted, rejected qty with reason" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<PackageCheck className="w-4 h-4" />}>Post GRN</Button></>} width="max-w-3xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Purchase order" required>
            <Combo value={poId} onChange={pickPo} options={openPos.map((p) => ({ value: p.id, label: `${p.no} — ${lk.supplier[p.supplierId]?.name}`, hint: `${lk.store[p.deliveryStoreId]?.name} · ${p.lines.map((l) => lk.material[l.materialId]?.name).join(', ')}` }))} />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} />
          </Field>
          <Field label="Challan / invoice no.">
            <Input value={challan} onChange={(e) => setChallan(e.target.value)} />
          </Field>
          <Field label="Vehicle no.">
            <Input value={veh} onChange={(e) => setVeh(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Weighbridge slip">
            <Input value={wb} onChange={(e) => setWb(e.target.value)} placeholder="WB-123456" />
          </Field>
          <AttachField count={photos} onChange={setPhotos} label="Photos / challan scan" />
        </div>
        <DateRuleNote date={d} />
        {po && (
          <Section title={`Receive against ${po.no} → ${lk.store[po.deliveryStoreId]?.name}`}>
            <div className="space-y-3">
              {rows.map((r, i) => {
                const m = lk.material[r.materialId]!;
                const set = (p: Partial<typeof r>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={r.materialId} className="rounded-xl border border-line p-3 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{m.name}</span>
                      <span className="text-muted">Pending {qty(r.ordered, m.unit)}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Field label="Received">
                        <NumberInput value={r.received} onChange={(v) => set({ received: v })} suffix={m.unit} />
                      </Field>
                      <Field label="Rejected">
                        <NumberInput value={r.rejected} onChange={(v) => set({ rejected: v })} suffix={m.unit} />
                      </Field>
                      <Field label="Accepted">
                        <Input disabled value={qty(Number(r.received || 0) - Number(r.rejected || 0))} />
                      </Field>
                      {m.batchTracked ? (
                        <Field label="Batch / lot">
                          <Input value={r.batch} onChange={(e) => set({ batch: e.target.value })} placeholder="Week / heat no." />
                        </Field>
                      ) : (
                        <div />
                      )}
                    </div>
                    {Number(r.rejected) > 0 && (
                      <Field label="Rejection reason" required>
                        <Input value={r.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="e.g. 12 bags torn" />
                      </Field>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </Drawer>
  );
}

/* ================= Invoices (PUR-05) ================= */
function InvoicesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [form, setForm] = useState(false);
  const rows = useMemo(() => db.invoices.slice().reverse(), [db]);
  return (
    <>
      <DataTable
        title="Purchase invoices"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('purchase', 'add') && s.showRates && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>Book invoice</Button>}
        columns={[
          { key: 'no', header: 'Voucher', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">Supplier inv. {r.supplierInvoiceNo}</div></div> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'sup', header: 'Supplier', value: (r) => n.sup(r.supplierId) },
          { key: 'po', header: 'PO / GRN', value: (r) => (r.poId ? n.lk.po[r.poId]?.no : ''), cell: (r) => <span className="text-xs font-mono">{r.poId ? n.lk.po[r.poId]?.no : '—'} · {r.grnIds.length} GRN</span>, hideMobile: true },
          { key: 'value', header: 'Amount', align: 'right', rate: true, value: (r) => Math.round(poValue(r.lines)), cell: (r) => inr(poValue(r.lines)) },
          { key: 'due', header: 'Due', value: (r) => r.dueDate, cell: (r) => <span className={r.dueDate < today() ? 'text-bad' : ''}>{date(r.dueDate)}</span> },
          { key: 'match', header: '3-way match', value: (r) => (threeWayMatch(db, r).ok ? 'Matched' : 'Mismatch'), cell: (r) => { const m = threeWayMatch(db, r); return m.ok ? <Badge tone="good">Matched</Badge> : <span title={m.issues.join('\n')}><Badge tone="bad">{m.issues.length} difference{m.issues.length > 1 ? 's' : ''}</Badge></span>; } },
        ]}
      />
      {form && <InvoiceForm onClose={() => setForm(false)} />}
    </>
  );
}

function InvoiceForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const lk = lookup(db);
  const invoiced = new Set(db.invoices.flatMap((i) => i.grnIds));
  const grns = db.stockTxns.filter((t) => t.type === 'GRN' && !invoiced.has(t.id) && t.status === 'POSTED');
  const [grnId, setGrnId] = useState('');
  const g = grns.find((x) => x.id === grnId);
  const [supInv, setSupInv] = useState('');
  const [d, setD] = useState(today());
  const [rates, setRates] = useState<Record<string, number | ''>>({});
  const [qtys, setQtys] = useState<Record<string, number | ''>>({});
  const pick = (id: string) => {
    setGrnId(id);
    const t = grns.find((x) => x.id === id)!;
    setRates(Object.fromEntries(t.lines.map((l) => [l.materialId, l.rate])));
    setQtys(Object.fromEntries(t.lines.map((l) => [l.materialId, l.qty])));
  };
  const draft: PurchaseInvoice | null = g
    ? { id: 'x', createdAt: '', createdBy: '', no: '', supplierInvoiceNo: supInv, date: d, supplierId: g.supplierId!, poId: g.poId, grnIds: [g.id], storeId: g.toStoreId!, lines: g.lines.map((l) => ({ materialId: l.materialId, qty: Number(qtys[l.materialId] ?? l.qty), rate: Number(rates[l.materialId] ?? l.rate), gstPct: lk.material[l.materialId]!.gstPct })), dueDate: addDays(d, lk.supplier[g.supplierId!]?.creditDays || 30) }
    : null;
  const match = draft ? threeWayMatch(db, draft) : null;
  const save = () => {
    if (!draft || !supInv) return toast.error('Choose GRN and enter supplier invoice no.');
    const no = nextNo('PINV', d);
    insert('invoices', { ...draft, id: undefined, createdAt: undefined, createdBy: undefined, no } as any, `Purchase invoice ${no}`, 'Purchase invoice');
    toast[match?.ok ? 'success' : 'warn'](`${no} booked`, match?.ok ? '3-way match OK' : `Flagged: ${match?.issues.join('; ')}`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Book purchase invoice" subtitle="PUR-05 · matched to PO and GRN; differences in qty or rate are flagged" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Book invoice</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="GRN" required>
            <Combo value={grnId} onChange={pick} options={grns.map((t) => ({ value: t.id, label: `${t.no} — ${lk.supplier[t.supplierId!]?.name}`, hint: t.lines.map((l) => lk.material[l.materialId]?.name).join(', ') }))} />
          </Field>
          <Field label="Supplier invoice no." required>
            <Input value={supInv} onChange={(e) => setSupInv(e.target.value)} />
          </Field>
          <Field label="Invoice date">
            <Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} />
          </Field>
        </div>
        {g && (
          <Section title="As per supplier invoice">
            <div className="space-y-2">
              {g.lines.map((l) => (
                <div key={l.materialId} className="grid grid-cols-12 gap-2 items-end rounded-xl border border-line p-3">
                  <div className="col-span-12 sm:col-span-4 text-sm font-medium">{lk.material[l.materialId]?.name}<div className="text-[11px] text-muted">GRN accepted {qty(l.qty)} @ ₹{l.rate}</div></div>
                  <Field label="Billed qty" className="col-span-6 sm:col-span-4"><NumberInput value={qtys[l.materialId] ?? ''} onChange={(v) => setQtys({ ...qtys, [l.materialId]: v })} /></Field>
                  <Field label="Billed rate" className="col-span-6 sm:col-span-4"><NumberInput value={rates[l.materialId] ?? ''} onChange={(v) => setRates({ ...rates, [l.materialId]: v })} prefix="₹" /></Field>
                </div>
              ))}
            </div>
          </Section>
        )}
        {match && (match.ok ? <Callout tone="good">PO, GRN and invoice agree.</Callout> : <Callout tone="bad">{match.issues.map((i) => <div key={i}>{i}</div>)}</Callout>)}
        {draft && <div className="text-right text-sm">Invoice total <b className="num">{inr(poValue(draft.lines))}</b> · due {date(draft.dueDate)}</div>}
      </div>
    </Drawer>
  );
}

/* ================= Payments (PUR-06) ================= */
function PaymentsTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [form, setForm] = useState(false);
  const rows = useMemo(() => db.payments.slice().reverse(), [db]);
  const party = (r: (typeof rows)[number]) => (r.partyType === 'SUPPLIER' ? n.sup(r.partyId) : r.partyType === 'SUBCON' ? n.lk.subcon[r.partyId]?.name : n.lk.worker[r.partyId]?.name);
  return (
    <>
      <DataTable
        title="Payments"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('purchase', 'add') && s.showRates && <Button variant="primary" icon={<Wallet className="w-4 h-4" />} onClick={() => setForm(true)}>Record payment</Button>}
        columns={[
          { key: 'no', header: 'Voucher', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'party', header: 'Paid to', value: (r) => party(r) },
          { key: 'kind', header: 'Type', value: (r) => r.kind, cell: (r) => <Badge tone={r.kind === 'ADVANCE' ? 'violet' : r.kind === 'PART' ? 'warn' : 'good'}>{r.kind.toLowerCase()}</Badge> },
          { key: 'mode', header: 'Mode', value: (r) => r.mode, hideMobile: true },
          { key: 'ref', header: 'Ref / UTR', value: (r) => r.ref, hideMobile: true },
          { key: 'tds', header: 'TDS', align: 'right', rate: true, value: (r) => r.tds, cell: (r) => (r.tds ? inr(r.tds) : '—') },
          { key: 'amount', header: 'Amount', align: 'right', rate: true, value: (r) => r.amount, cell: (r) => <b>{inr(r.amount)}</b> },
        ]}
      />
      {form && <PaymentForm onClose={() => setForm(false)} />}
    </>
  );
}

function PaymentForm({ onClose, supplierId }: { onClose: () => void; supplierId?: string }) {
  const db = useDB();
  const [sup, setSup] = useState(supplierId || '');
  const [amount, setAmount] = useState<number | ''>('');
  const [tdsPct, setTdsPct] = useState<number | ''>(0);
  const [mode, setMode] = useState('BANK');
  const [kind, setKind] = useState('PART');
  const [ref, setRef] = useState('');
  const [d, setD] = useState(today());
  const bal = sup ? supplierBalance(db, sup) : 0;
  const tds = Math.round((Number(amount || 0) * Number(tdsPct || 0)) / 100);
  const save = () => {
    if (!sup || !amount) return toast.error('Supplier and amount required');
    const no = nextNo('PAY', d);
    insert('payments', { no, date: d, partyType: 'SUPPLIER', partyId: sup, amount: Number(amount) - tds, tds, mode, ref, kind, remark: '' } as any, `Payment ${no} — ${inr(Number(amount))}`, 'Payment');
    toast.success(`${no} recorded`, `${inr(Number(amount) - tds)} paid · TDS ${inr(tds)}`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Record payment" subtitle="PUR-06 · full / part / advance; bank, cheque, UPI or cash; TDS if applicable" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save payment</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Supplier" required className="sm:col-span-2" hint={sup ? `Balance payable ${inr(bal)}` : undefined}>
          <Combo value={sup} onChange={setSup} options={supplierOpts(db)} />
        </Field>
        <Field label="Date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Type"><Select value={kind} onChange={setKind} options={[{ value: 'FULL', label: 'Full' }, { value: 'PART', label: 'Part' }, { value: 'ADVANCE', label: 'Advance' }]} /></Field>
        <Field label="Gross amount" required><NumberInput value={amount} onChange={setAmount} prefix="₹" /></Field>
        <Field label="TDS %" hint={tds ? `TDS ${inr(tds)} · net ${inr(Number(amount) - tds)}` : 'e.g. 0.1 (194Q) or 1/2 (194C)'}><NumberInput value={tdsPct} onChange={setTdsPct} suffix="%" /></Field>
        <Field label="Mode"><Select value={mode} onChange={setMode} options={['BANK', 'CHEQUE', 'UPI', 'CASH'].map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Reference / UTR / cheque no."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

/* ================= Debit notes (PUR-07) ================= */
function DebitNotesTab() {
  const db = useDB();
  const n = useNames();
  const s = useSession();
  const [form, setForm] = useState(false);
  return (
    <>
      <DataTable
        title="Purchase returns / debit notes"
        rows={db.debitNotes.slice().reverse()}
        rowKey={(r) => r.id}
        toolbar={s.can('purchase', 'add') && s.showRates && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setForm(true)}>New debit note</Button>}
        columns={[
          { key: 'no', header: 'Debit note', primary: true, value: (r) => r.no, cell: (r) => <span className="font-mono text-[13px]">{r.no}</span> },
          { key: 'date', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'sup', header: 'Supplier', value: (r) => n.sup(r.supplierId) },
          { key: 'mat', header: 'Material', value: (r) => `${n.mat(r.materialId)} ${qty(r.qty, n.unit(r.materialId))}` },
          { key: 'reason', header: 'Reason', value: (r) => r.reason },
          { key: 'amt', header: 'Amount', align: 'right', rate: true, value: (r) => Math.round(r.qty * r.rate), cell: (r) => inr(r.qty * r.rate) },
        ]}
      />
      {form && <DebitNoteForm onClose={() => setForm(false)} />}
    </>
  );
}
function DebitNoteForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [sup, setSup] = useState('');
  const [mat, setMat] = useState('');
  const [q, setQ] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const save = () => {
    if (!sup || !mat || !q || !rate || !reason) return toast.error('All fields are required');
    insert('debitNotes', { no: nextNo('DN'), date: today(), supplierId: sup, materialId: mat, qty: Number(q), rate: Number(rate), reason } as any, 'Debit note', 'Debit note');
    toast.success('Debit note created');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Debit note" subtitle="PUR-07 · for rejected or excess material" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Supplier" required className="sm:col-span-2"><Combo value={sup} onChange={setSup} options={supplierOpts(db)} /></Field>
        <Field label="Material" required className="sm:col-span-2"><Combo value={mat} onChange={(v) => (setMat(v), setRate(db.materials.find((m) => m.id === v)?.stdRate || ''))} options={materialOptions(db)} /></Field>
        <Field label="Quantity" required><NumberInput value={q} onChange={setQ} /></Field>
        <Field label="Rate" required><NumberInput value={rate} onChange={setRate} prefix="₹" /></Field>
        <Field label="Reason" required className="sm:col-span-2"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

/* ================= Supplier ledger (SUP-01) ================= */
function SupplierLedgerTab() {
  const db = useDB();
  const s = useSession();
  const q = useQueryParam('s');
  const [sup, setSup] = useState(q || 'sp01');
  const [pay, setPay] = useState(false);
  const rows = useMemo(() => supplierLedger(db, sup).slice().reverse(), [db, sup]);
  const bal = rows[0]?.balance || 0;
  const sp = db.suppliers.find((x) => x.id === sup)!;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="flex-1 max-w-md">
            <Combo value={sup} onChange={setSup} options={supplierOpts(db)} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-[11px] text-muted">GSTIN</div><div className="font-mono text-xs">{sp.gstin}</div></div>
            <div><div className="text-[11px] text-muted">Credit days</div><div className="font-semibold">{sp.creditDays}</div></div>
            <div><div className="text-[11px] text-muted">Balance payable</div><div className={cn('font-bold', bal > 0 ? 'text-bad' : 'text-good')}><Money v={bal} /></div></div>
          </div>
          {s.can('purchase', 'add') && s.showRates && <Button variant="primary" onClick={() => setPay(true)} icon={<Wallet className="w-4 h-4" />}>Pay</Button>}
        </div>
      </Card>
      <DataTable
        title={`Supplier ledger — ${sp.name}`}
        rows={rows}
        rowKey={(r, i) => `${r.ref}-${i}`}
        pageSize={20}
        columns={[
          { key: 'date', header: 'Date', primary: true, value: (r) => r.date, cell: (r) => (r.date ? date(r.date) : '—') },
          { key: 'type', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.type === 'Payment' || r.type === 'Advance' ? 'good' : r.type === 'Debit note' ? 'warn' : 'neutral'}>{r.type}</Badge> },
          { key: 'ref', header: 'Reference', value: (r) => r.ref },
          { key: 'debit', header: 'Debit (paid)', align: 'right', rate: true, value: (r) => r.debit, cell: (r) => (r.debit ? inr(r.debit) : '') },
          { key: 'credit', header: 'Credit (billed)', align: 'right', rate: true, value: (r) => r.credit, cell: (r) => (r.credit ? inr(r.credit) : '') },
          { key: 'balance', header: 'Balance', align: 'right', rate: true, value: (r) => r.balance, cell: (r) => <b>{inr(r.balance)}</b> },
        ]}
      />
      {pay && <PaymentForm onClose={() => setPay(false)} supplierId={sup} />}
    </div>
  );
}

/* ================= Payables ageing (SUP-02) ================= */
function PayablesTab() {
  const db = useDB();
  const n = useNames();
  const rows = useMemo(() => payablesAgeing(db), [db]);
  const tot = { b0: sum(rows, (r) => r.b0), b30: sum(rows, (r) => r.b30), b60: sum(rows, (r) => r.b60), b90: sum(rows, (r) => r.b90) };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <Stat label="0–30 days" value={tot.b0} format={inrCompact} tone="good" />
        <Stat label="31–60 days" value={tot.b30} format={inrCompact} tone="info" />
        <Stat label="61–90 days" value={tot.b60} format={inrCompact} tone="warn" />
        <Stat label="90+ days" value={tot.b90} format={inrCompact} tone="bad" />
      </div>
      <Card>
        <CardHeader title="Outstanding by supplier" subtitle="Stacked by age bucket" />
        <div className="px-4 pb-4">
          <ColumnChart
            stacked
            height={220}
            format={inrCompact}
            data={rows.slice(0, 10).map((r) => ({ label: n.lk.supplier[r.supplierId]?.code || '', values: { b0: r.b0, b30: r.b30, b60: r.b60, b90: r.b90 } }))}
            series={[{ key: 'b0', label: '0–30' }, { key: 'b30', label: '31–60' }, { key: 'b60', label: '61–90' }, { key: 'b90', label: '90+' }]}
          />
        </div>
      </Card>
      <DataTable
        title="Payables ageing"
        rows={rows}
        rowKey={(r) => r.supplierId}
        columns={[
          { key: 'sup', header: 'Supplier', primary: true, value: (r) => n.sup(r.supplierId) },
          { key: 'b0', header: '0–30', align: 'right', rate: true, value: (r) => Math.round(r.b0), cell: (r) => inr(r.b0) },
          { key: 'b30', header: '31–60', align: 'right', rate: true, value: (r) => Math.round(r.b30), cell: (r) => inr(r.b30) },
          { key: 'b60', header: '61–90', align: 'right', rate: true, value: (r) => Math.round(r.b60), cell: (r) => inr(r.b60) },
          { key: 'b90', header: '90+', align: 'right', rate: true, value: (r) => Math.round(r.b90), cell: (r) => inr(r.b90) },
          { key: 'overdue', header: 'Overdue', align: 'right', rate: true, value: (r) => Math.round(r.overdue), cell: (r) => (r.overdue > 0 ? <span className="text-bad font-semibold">{inr(r.overdue)}</span> : '—') },
          { key: 'total', header: 'Total', align: 'right', rate: true, value: (r) => Math.round(r.total), cell: (r) => <b>{inr(r.total)}</b> },
        ]}
        totals={{ total: inr(sum(rows, (r) => r.total)), overdue: inr(sum(rows, (r) => r.overdue)), __export: { total: Math.round(sum(rows, (r) => r.total)), overdue: Math.round(sum(rows, (r) => r.overdue)) } }}
      />
    </div>
  );
}

/* ================= Purchase register with GST (SUP-03) ================= */
function RegisterTab() {
  const db = useDB();
  const n = useNames();
  const [range, setRange] = useRange('mtd');
  const [by, setBy] = useState('invoice');
  const rows = useMemo(
    () =>
      db.invoices
        .filter((i) => i.date >= range.from && i.date <= range.to)
        .flatMap((i) =>
          i.lines.map((l, k) => {
            const sup = n.lk.supplier[i.supplierId]!;
            const taxable = l.qty * l.rate;
            const gst = (taxable * l.gstPct) / 100;
            const inter = !sup.gstin.startsWith('18');
            return { id: `${i.id}-${k}`, date: i.date, no: i.no, supInv: i.supplierInvoiceNo, supplier: sup.name, gstin: sup.gstin, site: n.lk.store[i.storeId]?.siteId ? n.site(n.lk.store[i.storeId]!.siteId) : n.store(i.storeId), material: n.mat(l.materialId), hsn: n.lk.material[l.materialId]?.hsn || '', qty: l.qty, taxable, rate: l.gstPct, cgst: inter ? 0 : gst / 2, sgst: inter ? 0 : gst / 2, igst: inter ? gst : 0, total: taxable + gst };
          }),
        ),
    [db, range], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const grouped = useMemo(() => {
    if (by === 'invoice') return rows;
    const key = by === 'site' ? 'site' : by === 'material' ? 'material' : 'supplier';
    const m = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const k = (r as any)[key];
      const e = m.get(k) || { ...r, id: k, no: '', supInv: '', date: '', qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      e.taxable += r.taxable;
      e.cgst += r.cgst;
      e.sgst += r.sgst;
      e.igst += r.igst;
      e.total += r.total;
      m.set(k, e);
    }
    return [...m.values()];
  }, [rows, by]);
  return (
    <DataTable
      title="Purchase register (GST)"
      subtitle={`${date(range.from)} to ${date(range.to)} · for GSTR-2B reconciliation`}
      rows={grouped}
      rowKey={(r) => r.id}
      toolbar={
        <>
          <Select value={by} onChange={setBy} className="w-44" options={[{ value: 'invoice', label: 'Invoice-wise' }, { value: 'site', label: 'Site-wise' }, { value: 'material', label: 'Material-wise' }, { value: 'supplier', label: 'Supplier-wise' }]} />
          <DateRangePicker value={range} onChange={setRange} />
        </>
      }
      columns={[
        ...(by === 'invoice'
          ? [
              { key: 'date', header: 'Date', value: (r: any) => r.date, cell: (r: any) => date(r.date) },
              { key: 'no', header: 'Invoice', primary: true, value: (r: any) => `${r.no} / ${r.supInv}` },
              { key: 'supplier', header: 'Supplier', value: (r: any) => r.supplier },
              { key: 'gstin', header: 'GSTIN', value: (r: any) => r.gstin, hideMobile: true },
              { key: 'material', header: 'Material', value: (r: any) => r.material },
              { key: 'hsn', header: 'HSN', value: (r: any) => r.hsn, hideMobile: true },
            ]
          : [{ key: by, header: by[0]!.toUpperCase() + by.slice(1), primary: true, value: (r: any) => r[by] }]),
        { key: 'taxable', header: 'Taxable', align: 'right' as const, rate: true, value: (r: any) => Math.round(r.taxable), cell: (r: any) => inr(r.taxable) },
        { key: 'cgst', header: 'CGST', align: 'right' as const, rate: true, value: (r: any) => Math.round(r.cgst), cell: (r: any) => inr(r.cgst) },
        { key: 'sgst', header: 'SGST', align: 'right' as const, rate: true, value: (r: any) => Math.round(r.sgst), cell: (r: any) => inr(r.sgst) },
        { key: 'igst', header: 'IGST', align: 'right' as const, rate: true, value: (r: any) => Math.round(r.igst), cell: (r: any) => inr(r.igst) },
        { key: 'total', header: 'Total', align: 'right' as const, rate: true, value: (r: any) => Math.round(r.total), cell: (r: any) => <b>{inr(r.total)}</b> },
      ]}
      totals={{ taxable: inr(sum(grouped, (r) => r.taxable)), total: inr(sum(grouped, (r) => r.total)), __export: { taxable: Math.round(sum(grouped, (r) => r.taxable)), total: Math.round(sum(grouped, (r) => r.total)) } }}
    />
  );
}

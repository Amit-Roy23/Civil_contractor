import { useMemo, useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { gstSplit } from '@civil/domain/billing';
import { ewayRow, salesTotals } from '@civil/domain/ops';
import { listParties, partyItemLedger, partyItemSummary, type PartyItem } from '@civil/domain/partyledger';
import { useDB, runCommand } from '../../data/store';
import { useSession } from '../../data/session';
import { availability } from '../../data/ledger';
import type { SalesInvoice } from '../../data/types';
import { Badge, Button, Callout, Card, Drawer, KV, Section, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, DateRangePicker, Field, Input, NumberInput, Segmented, Select } from '../../components/ui/fields';
import { downloadXlsx } from '../../lib/export';
import { date, inr, num, qty, today } from '../../lib/format';
import { cn, round, sum } from '../../lib/utils';
import { SalesInvoiceView } from '../plant/PlantOps';
import { useNames, useRange } from '../shared';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ================= Sale of goods from any store ================= */
export function GoodsSalesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [range, setRange] = useRange('30d');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<SalesInvoice | null>(null);
  const rows = useMemo(() => db.salesInvoices.filter((i) => i.kind === 'GOODS' && i.date >= range.from && i.date <= range.to).slice().reverse(), [db, range]);
  if (!s.showRates) return <Callout>Your role cannot see sales.</Callout>;
  const live = rows.filter((r) => r.status !== 'CANCELLED');
  return (
    <div className="space-y-4">
      <Callout>Goods sold to outside parties from any store or site — aggregates, cement, steel, bitumen, scrap. The goods leave the store at average cost on the invoice date. Hot mix sold from the plant is invoiced in Plants › Outside sales; both use your firm's one GST invoice series.</Callout>
      <DataTable
        title="Sale of goods — tax invoices"
        subtitle={`${date(range.from)} to ${date(range.to)}`}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setOpen}
        rowClassName={(r) => (r.status === 'CANCELLED' ? 'opacity-50' : undefined)}
        toolbar={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <Button
              onClick={() => {
                const e = live.map((i) => ewayRow(db, i));
                downloadXlsx({ title: 'E-way bill data (goods)', headers: ['Doc no', 'Doc date', 'Supplier GSTIN', 'Dispatch from', 'Recipient GSTIN', 'Recipient', 'Ship to', 'HSN', 'Product', 'Qty', 'Unit', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Vehicle no', 'Distance km', 'Transporter', 'Transporter ID'], rows: e.map((r) => [r.docNo, r.docDate, r.supplierGstin, r.dispatchFrom, r.recipientGstin, r.recipient, r.shipTo, r.hsn, r.product, r.qty, r.unit, r.taxable, r.cgst, r.sgst, r.igst, r.total, r.vehicleNo, r.distanceKm, r.transporter, r.transporterId]) });
              }}
            >
              E-way bill Excel
            </Button>
            {s.can('purchase', 'add') && <Button variant="primary" icon={<Receipt className="w-4 h-4" />} onClick={() => setForm(true)}>New sale invoice</Button>}
          </>
        }
        totals={{ taxable: inr(sum(live, (r) => salesTotals(db, r).taxable)), total: inr(sum(live, (r) => salesTotals(db, r).total)), out: inr(sum(live, (r) => salesTotals(db, r).outstanding)) }}
        columns={[
          { key: 'no', header: 'Invoice', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{date(r.date)} · {n.store(r.storeId)}</div></div> },
          { key: 'b', header: 'Buyer', value: (r) => n.client(r.buyerId) },
          { key: 'i', header: 'Goods', value: (r) => r.lines.map((l) => `${l.description} ${l.qty} ${l.unit}`).join(', '), cell: (r) => <span className="text-[13px]">{r.lines.map((l) => `${l.description} ${num(l.qty, 2)} ${l.unit}`).join(' · ')}</span> },
          { key: 'taxable', header: 'Taxable', align: 'right', rate: true, value: (r) => salesTotals(db, r).taxable, cell: (r) => inr(salesTotals(db, r).taxable), hideMobile: true },
          { key: 'total', header: 'Total', align: 'right', rate: true, value: (r) => salesTotals(db, r).total, cell: (r) => <b>{inr(salesTotals(db, r).total)}</b> },
          { key: 'out', header: 'Outstanding', align: 'right', rate: true, value: (r) => (r.status === 'CANCELLED' ? 0 : salesTotals(db, r).outstanding), cell: (r) => (r.status === 'CANCELLED' ? '—' : inr(salesTotals(db, r).outstanding)) },
          { key: 'st', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {form && <GoodsSaleForm onClose={() => setForm(false)} />}
      {open && <SalesInvoiceView inv={db.salesInvoices.find((x) => x.id === open.id) || open} onClose={() => setOpen(null)} />}
    </div>
  );
}

type Line = { materialId: string; qty: number | ''; rate: number | ''; gstPct: number | '' };

function GoodsSaleForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const stores = db.stores.filter((x) => x.active !== false && s.seesStore(x.id));
  const [storeId, setStoreId] = useState(stores.find((x) => x.type === 'CENTRAL')?.id || stores[0]?.id || '');
  const [buyerId, setBuyerId] = useState('');
  const [d, setD] = useState(today());
  const [firmId, setFirmId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ materialId: '', qty: '', rate: '', gstPct: '' }]);
  const [eway, setEway] = useState({ vehicleNo: '', distanceKm: 0, transporter: '', transporterId: '', ewbNo: '' });
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const store = n.lk.store[storeId];
  const site = store?.siteId ? n.lk.site[store.siteId] : undefined;
  const defaultFirm = site?.firmId || (store?.plantId ? n.lk.plant[store.plantId]?.firmId : undefined) || db.firms[0]?.id;
  const firm = db.firms.find((f) => f.id === (firmId || defaultFirm));
  const buyer = n.lk.client[buyerId];
  // stock on the date, less what earlier lines of this invoice already take
  const stockOf = (materialId: string, upto: number) => round(availability(db, storeId, materialId, d).onDate - sum(lines.slice(0, upto).filter((l) => l.materialId === materialId), (l) => Number(l.qty) || 0), 3);
  const inStock = db.materials.filter((m) => storeId && availability(db, storeId, m.id, d).onDate > 0.0005);
  const calc = lines.map((l) => {
    const m = n.lk.material[l.materialId];
    const gstPct = l.gstPct === '' ? m?.gstPct ?? 18 : Number(l.gstPct);
    const taxable = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    return { m, gstPct, taxable, gst: (taxable * gstPct) / 100 };
  });
  const taxable = sum(calc, (c) => c.taxable);
  const gst = sum(calc, (c) => c.gst);
  const split = gstSplit(firm?.gstin || '', buyer?.gstin || '', gst);
  const set = (i: number, p: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    if (!buyerId) return toast.error('Choose the buyer');
    const ls = lines.filter((l) => l.materialId);
    if (!ls.length) return toast.error('Add the goods sold');
    for (const [i, l] of ls.entries()) {
      if (!Number(l.qty) || !Number(l.rate)) return toast.error(`Line ${i + 1}: quantity and rate are required`);
      if (Number(l.qty) > stockOf(l.materialId, lines.indexOf(l)) + 1e-6) return toast.error(`Line ${i + 1}: more than the stock of ${n.mat(l.materialId)}`);
      if (!n.lk.material[l.materialId]?.hsn) return toast.error(`${n.mat(l.materialId)} has no HSN code — set it in Masters › Materials`);
    }
    setBusy(true);
    try {
      const rec = await runCommand({ kind: 'insert', coll: 'salesInvoices', rec: { kind: 'GOODS', date: d, buyerId, storeId, firmId: firmId || undefined, no: '', dispatchIds: [], receipts: [], status: 'ISSUED', remarks, eway, lines: ls.map((l) => ({ materialId: l.materialId, qty: Number(l.qty), rate: Number(l.rate), ...(l.gstPct === '' ? {} : { gstPct: Number(l.gstPct) }) })) } } as any, 'Sale invoice');
      toast.success(`Invoice ${rec?.no || ''} issued`, 'Goods taken out of stock');
      onClose();
    } catch (e) {
      toast.error('Invoice not saved', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title="Sale of goods — tax invoice" subtitle="Goods leave the chosen store on the invoice date; GST is CGST + SGST within Tripura, IGST outside" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy}>Issue invoice</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Sold from store" required><Select value={storeId} onChange={(v) => (setStoreId(v), setLines([{ materialId: '', qty: '', rate: '', gstPct: '' }]))} options={stores.map((x) => ({ value: x.id, label: x.name }))} /></Field>
          <Field label="Buyer" required hint="Add buyers in Masters › Clients (type: buyer)"><Combo value={buyerId} onChange={setBuyerId} options={db.clients.filter((c) => c.active !== false).map((c) => ({ value: c.id, label: c.name, hint: c.gstin || 'unregistered' }))} /></Field>
          <Field label="Invoice date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value || today())} /></Field>
          {db.firms.length > 1 ? <Field label="Billing firm"><Select value={firmId || defaultFirm || ''} onChange={setFirmId} options={db.firms.map((f) => ({ value: f.id, label: f.tradeName || f.legalName }))} /></Field> : <Field label="Billing firm"><Input disabled value={firm?.tradeName || firm?.legalName || ''} /></Field>}
        </div>
        <Section title="Goods" action={<Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setLines([...lines, { materialId: '', qty: '', rate: '', gstPct: '' }])}>Add line</Button>}>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const m = n.lk.material[l.materialId];
              const st = l.materialId ? stockOf(l.materialId, i) : 0;
              return (
                <div key={i} data-line className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end rounded-xl border border-line p-2">
                  <Field label={`Item ${i + 1}`} className="col-span-2 sm:col-span-4" hint={l.materialId ? `${qty(st, m?.unit)} in stock · HSN ${m?.hsn || 'not set'}` : undefined}>
                    <Combo value={l.materialId} onChange={(v) => set(i, { materialId: v, gstPct: '' })} options={inStock.map((x) => ({ value: x.id, label: x.name, hint: `${qty(availability(db, storeId, x.id, d).onDate, x.unit)}` }))} />
                  </Field>
                  <Field label="Qty" className="sm:col-span-2"><NumberInput value={l.qty} onChange={(v) => set(i, { qty: v })} suffix={m?.unit} /></Field>
                  <Field label="Rate (excl. GST)" className="sm:col-span-3"><NumberInput value={l.rate} onChange={(v) => set(i, { rate: v })} prefix="₹" /></Field>
                  <Field label="GST %" className="sm:col-span-2"><Select value={l.gstPct === '' ? '' : String(l.gstPct)} onChange={(v) => set(i, { gstPct: v === '' ? '' : Number(v) })} options={[{ value: '', label: `${m?.gstPct ?? 18}% (item)` }, ...[0, 5, 12, 18, 28].map((x) => ({ value: String(x), label: `${x}%` }))]} /></Field>
                  <div className="sm:col-span-1 flex justify-end">{lines.length > 1 && <Button size="sm" variant="ghost" aria-label="Remove line" icon={<Trash2 className="w-4 h-4" />} onClick={() => setLines(lines.filter((_, j) => j !== i))} />}</div>
                  {l.materialId && Number(l.qty) > st + 1e-6 && <p className="col-span-2 sm:col-span-12 text-xs text-bad">Only {qty(st, m?.unit)} in this store on {date(d)}.</p>}
                </div>
              );
            })}
          </div>
        </Section>
        <Section title="Transport / e-way bill">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Vehicle no."><Input value={eway.vehicleNo} onChange={(e) => setEway({ ...eway, vehicleNo: e.target.value.toUpperCase() })} /></Field>
            <Field label="Distance"><NumberInput value={eway.distanceKm || ''} onChange={(v) => setEway({ ...eway, distanceKm: Number(v) || 0 })} suffix="km" /></Field>
            <Field label="Transporter"><Input value={eway.transporter} onChange={(e) => setEway({ ...eway, transporter: e.target.value })} /></Field>
            <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
          </div>
          {taxable + gst > 50000 && <p className="text-xs text-warn mt-2">Invoice value is above ₹50,000 — an e-way bill is needed before the goods move.</p>}
        </Section>
        {taxable > 0 && (
          <Card className="p-4">
            <KV cols={2} items={[['Taxable value', inr(round(taxable, 2))], ...(split.igst ? [['IGST', inr(split.igst)] as [string, string]] : [['CGST', inr(split.cgst)] as [string, string], ['SGST', inr(split.sgst)] as [string, string]]), ['Invoice total (rounded)', <b key="t">{inr(Math.round(taxable + gst))}</b>]]} />
            <p className="text-xs text-muted mt-2">Final figures and the invoice number are set by the server when the invoice is issued.</p>
          </Card>
        )}
      </div>
    </Drawer>
  );
}

/* ================= Party-wise item-wise ledger ================= */
export function PartyItemsTab() {
  const db = useDB();
  const s = useSession();
  const parties = useMemo(() => listParties(db), [db]);
  const [range, setRange] = useRange('fy');
  const [view, setView] = useState<'party' | 'summary'>('party');
  const [key, setKey] = useState('');
  const [side, setSide] = useState<'ALL' | 'PURCHASE' | 'SALE'>('ALL');
  const [mat, setMat] = useState('');
  const ledger = useMemo(() => (key ? partyItemLedger(db, key, { from: range.from, to: range.to, materialId: mat || undefined }) : null), [db, key, range, mat]);
  const summary = useMemo(() => (view === 'summary' ? partyItemSummary(db, { from: range.from, to: range.to, side, materialId: mat || undefined }) : []), [db, view, range, side, mat]);
  if (!s.showRates) return <Callout>Your role cannot see party ledgers.</Callout>;
  const exportLedger = () => {
    if (!ledger) return;
    downloadXlsx({
      title: `Party item ledger — ${ledger.party.name}`,
      subtitle: `${date(ledger.from)} to ${date(ledger.to)}${ledger.party.gstin ? ` · GSTIN ${ledger.party.gstin}` : ''}`,
      headers: ['Item', 'Date', 'Voucher', 'Ref', 'In qty', 'Out qty', 'Unit', 'Rate', 'Taxable', 'GST %', 'GST', 'Total', 'Net qty (in − out)'],
      numeric: [4, 5, 7, 8, 9, 10, 11, 12],
      rows: ledger.items.flatMap((i) => [
        [i.name, '', 'Opening', '', i.opening.qty > 0 ? i.opening.qty : '', i.opening.qty < 0 ? -i.opening.qty : '', i.unit, '', '', '', '', '', i.opening.qty],
        ...i.rows.map((r) => [i.name, r.date, r.voucher, r.ref, r.inQty || '', r.outQty || '', i.unit, r.rate, r.taxable, r.gstPct, r.gst, r.total, r.balanceQty]),
        [i.name, '', 'Closing', '', '', '', i.unit, '', '', '', '', '', i.closingQty],
      ]),
    });
  };
  const mats = db.materials.map((m) => ({ value: m.id, label: m.name }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Segmented value={view} onChange={setView} options={[{ value: 'party', label: 'One party, item by item' }, { value: 'summary', label: 'All parties × items' }]} />
        {view === 'party' && <Combo value={key} onChange={setKey} placeholder="Choose party" className="w-72" options={parties.map((p) => ({ value: p.key, label: p.name, hint: `${p.roles.join(' & ')}${p.gstin ? ` · ${p.gstin}` : ''}` }))} />}
        {view === 'summary' && <Segmented value={side} onChange={setSide} options={[{ value: 'ALL', label: 'Bought & sold' }, { value: 'PURCHASE', label: 'Bought' }, { value: 'SALE', label: 'Sold' }]} />}
        <Combo value={mat} onChange={setMat} placeholder="All items" className="w-52" options={[{ value: '', label: 'All items' }, ...mats]} />
        <DateRangePicker value={range} onChange={setRange} />
        {view === 'party' && ledger && <Button onClick={exportLedger}>Excel</Button>}
      </div>

      {view === 'party' && !ledger && <Callout>Choose a party. A supplier and a buyer with the same GSTIN are one party, so goods bought from and sold to the same firm show together.</Callout>}
      {view === 'party' && ledger && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-lg">{ledger.party.name}</div>
                <div className="text-xs text-muted">{ledger.party.roles.join(' & ')}{ledger.party.gstin ? ` · GSTIN ${ledger.party.gstin}` : ' · unregistered'} · {date(ledger.from)} to {date(ledger.to)}</div>
              </div>
              <div className="flex flex-wrap gap-2">{ledger.party.supplierIds.length > 0 && <Badge tone="info">Supplier</Badge>}{ledger.party.clientIds.length > 0 && <Badge tone="violet">Buyer / client</Badge>}</div>
            </div>
            <div className="mt-3">
              <KV cols={3} items={[
                ['Purchases (net of returns, before GST)', inr(ledger.totals.purchase - ledger.totals.returns)],
                ['Sales (before GST)', inr(ledger.totals.sales)],
                ['GST: input / output', `${inr(ledger.totals.purchaseGst)} / ${inr(ledger.totals.salesGst)}`],
                ['We owe the party (today)', inr(ledger.money.payable)],
                ['Party owes us (today)', inr(ledger.money.receivable)],
                ['Net', <b key="n" className={ledger.money.net >= 0 ? 'text-good' : 'text-bad'}>{ledger.money.net >= 0 ? `${inr(ledger.money.net)} receivable` : `${inr(-ledger.money.net)} payable`}</b>],
              ]} />
            </div>
          </Card>
          {!ledger.items.length && <Callout>No goods bought from or sold to this party up to {date(ledger.to)}.</Callout>}
          {ledger.items.map((i) => <ItemBlock key={i.materialId} item={i} />)}
          <p className="text-xs text-muted">Purchases are from purchase bills; returns from debit notes; sales from tax invoices (hot mix and goods). Payments and receipts are kept party-wise in the supplier ledger and buyer ledger, not split by item.</p>
        </>
      )}

      {view === 'summary' && (
        <DataTable
          title="Party-wise item-wise summary"
          subtitle={`${date(range.from)} to ${date(range.to)} · click a row to open that party's ledger`}
          rows={summary}
          rowKey={(r) => `${r.partyKey}|${r.materialId}`}
          onRowClick={(r) => (setKey(r.partyKey), setMat(r.materialId), setView('party'))}
          pageSize={30}
          totals={{ pv: inr(sum(summary, (r) => r.purchaseValue)), sv: inr(sum(summary, (r) => r.saleValue)) }}
          columns={[
            { key: 'p', header: 'Party', primary: true, value: (r) => r.party, cell: (r) => <div>{r.party}<div className="text-[11px] text-muted">{r.roles}{r.gstin ? ` · ${r.gstin}` : ''}</div></div> },
            { key: 'i', header: 'Item', value: (r) => r.item },
            { key: 'pq', header: 'Bought', align: 'right', value: (r) => r.purchasedQty, cell: (r) => (r.purchasedQty ? qty(r.purchasedQty, r.unit) : '—') },
            { key: 'rq', header: 'Returned', align: 'right', value: (r) => r.returnedQty, cell: (r) => (r.returnedQty ? qty(r.returnedQty, r.unit) : '—'), hideMobile: true },
            { key: 'pv', header: 'Purchase value', align: 'right', value: (r) => r.purchaseValue, cell: (r) => (r.purchaseValue ? inr(r.purchaseValue) : '—') },
            { key: 'pr', header: 'Avg buy rate', align: 'right', value: (r) => r.purchaseAvgRate, cell: (r) => (r.purchaseAvgRate ? inr(r.purchaseAvgRate) : '—'), hideMobile: true },
            { key: 'sq', header: 'Sold', align: 'right', value: (r) => r.soldQty, cell: (r) => (r.soldQty ? qty(r.soldQty, r.unit) : '—') },
            { key: 'sv', header: 'Sale value', align: 'right', value: (r) => r.saleValue, cell: (r) => (r.saleValue ? inr(r.saleValue) : '—') },
            { key: 'sr', header: 'Avg sale rate', align: 'right', value: (r) => r.saleAvgRate, cell: (r) => (r.saleAvgRate ? inr(r.saleAvgRate) : '—'), hideMobile: true },
            { key: 'pend', header: 'Pending', value: (r) => `${r.unbilledQty} ${r.notInvoicedQty}`, cell: (r) => <span className="text-[12px]">{r.unbilledQty > 0 && <Badge tone="warn">{qty(r.unbilledQty, r.unit)} received, not billed</Badge>}{r.notInvoicedQty > 0 && <Badge tone="warn" className="ml-1">{qty(r.notInvoicedQty, r.unit)} delivered, not invoiced</Badge>}</span>, hideMobile: true },
          ]}
        />
      )}
    </div>
  );
}

function ItemBlock({ item: i }: { item: PartyItem }) {
  const facts = [
        i.purchased.qty ? `Bought ${qty(i.purchased.qty, i.unit)} @ avg ${inr(i.purchased.avgRate)} (last ${inr(i.purchased.lastRate)})` : '',
        i.returned.qty ? `returned ${qty(i.returned.qty, i.unit)}` : '',
        i.sold.qty ? `Sold ${qty(i.sold.qty, i.unit)} @ avg ${inr(i.sold.avgRate)} (last ${inr(i.sold.lastRate)})` : '',
        i.unbilledQty ? `${qty(i.unbilledQty, i.unit)} received on GRN, not billed yet` : '',
        i.notInvoicedQty ? `${qty(i.notInvoicedQty, i.unit)} delivered, not invoiced yet` : '',
  ].filter(Boolean);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <h3 className="font-semibold text-[15px]">{i.name}</h3>
        <span className="text-xs text-muted">{i.unit}</span>
        {facts.map((f) => <span key={f} className={cn('text-xs', /not (billed|invoiced)/.test(f) ? 'text-warn' : 'text-fg-2')}>{f}</span>)}
      </div>
    <DataTable
      title={`${i.name} (${i.unit})`}
      subtitle={facts.join(' · ')}
      rows={[{ kind: 'open' as const }, ...i.rows.map((r) => ({ kind: 'row' as const, r })), { kind: 'close' as const }]}
      rowKey={(x, k) => (x.kind === 'row' ? `${x.r.refId}-${k}` : x.kind)}
      searchable={false}
      exportable={false}
      pageSize={50}
      rowClassName={(x) => (x.kind !== 'row' ? 'bg-surface-2 font-medium' : undefined)}
      columns={[
        { key: 'd', header: 'Date', value: (x) => (x.kind === 'row' ? x.r.date : ''), cell: (x) => (x.kind === 'row' ? date(x.r.date) : x.kind === 'open' ? 'Opening' : 'Closing') },
        { key: 'v', header: 'Voucher', primary: true, value: (x) => (x.kind === 'row' ? x.r.voucher : ''), cell: (x) => (x.kind === 'row' ? <div><Badge tone={x.r.voucher === 'Sale' ? 'violet' : x.r.voucher === 'Purchase' ? 'info' : 'warn'}>{x.r.voucher}</Badge><div className="text-[11px] text-muted font-mono mt-0.5">{x.r.ref}</div></div> : '') },
        { key: 'in', header: 'In', align: 'right', value: (x) => (x.kind === 'row' ? x.r.inQty : ''), cell: (x) => (x.kind === 'row' && x.r.inQty ? <span className="text-good">+{num(x.r.inQty, 3)}</span> : '') },
        { key: 'out', header: 'Out', align: 'right', value: (x) => (x.kind === 'row' ? x.r.outQty : ''), cell: (x) => (x.kind === 'row' && x.r.outQty ? num(x.r.outQty, 3) : '') },
        { key: 'rate', header: 'Rate', align: 'right', value: (x) => (x.kind === 'row' ? x.r.rate : ''), cell: (x) => (x.kind === 'row' ? inr(x.r.rate) : '') },
        { key: 'tx', header: 'Taxable', align: 'right', value: (x) => (x.kind === 'row' ? x.r.taxable : ''), cell: (x) => (x.kind === 'row' ? inr(x.r.taxable) : x.kind === 'open' ? <span className="text-[12px] text-muted">{i.opening.purchaseValue ? `bought ${inr(i.opening.purchaseValue)}` : ''}{i.opening.saleValue ? ` sold ${inr(i.opening.saleValue)}` : ''}</span> : '') },
        { key: 'gst', header: 'GST', align: 'right', value: (x) => (x.kind === 'row' ? x.r.gst : ''), cell: (x) => (x.kind === 'row' ? <span>{inr(x.r.gst)} <span className="text-[11px] text-muted">{x.r.gstPct}%</span></span> : ''), hideMobile: true },
        { key: 'tot', header: 'Total', align: 'right', value: (x) => (x.kind === 'row' ? x.r.total : ''), cell: (x) => (x.kind === 'row' ? inr(x.r.total) : '') },
        { key: 'bal', header: 'Net qty (in − out)', align: 'right', value: (x) => (x.kind === 'row' ? x.r.balanceQty : x.kind === 'open' ? i.opening.qty : i.closingQty), cell: (x) => <b>{num(x.kind === 'row' ? x.r.balanceQty : x.kind === 'open' ? i.opening.qty : i.closingQty, 3)} {i.unit}</b> },
      ]}
    />
    </section>
  );
}

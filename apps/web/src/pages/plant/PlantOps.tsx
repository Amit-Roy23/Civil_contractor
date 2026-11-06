import { useMemo, useState } from 'react';
import { Droplets, FileText, FlaskConical, Landmark, Printer, Receipt, Wrench } from 'lucide-react';
import { costPerMt, dipRows, ewayRow, loanInterestIn, loanSchedule, plantDay, salesTotals, buyerLedger, sgstOnSales } from '@civil/domain/ops';
import { useDB, insert, update, runCommand } from '../../data/store';
import { useSession } from '../../data/session';
import type { Loan, SalesInvoice, SubsidyClaim, TankDip } from '../../data/types';
import { Badge, Button, Callout, Card, Drawer, KV, Section, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, Field, Input, NumberInput, Segmented, Select, Toggle } from '../../components/ui/fields';
import { downloadXlsx, printDocument } from '../../lib/export';
import { date, inr, monthLabel, monthOf, num, qty, today } from '../../lib/format';
import { round, sum } from '../../lib/utils';
import { useNames } from '../shared';

function usePlants() {
  const db = useDB();
  const s = useSession();
  return db.plants.filter((p) => s.allSites || s.plantIds.includes(p.id));
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ================= Tanks & dips (Query 3 rule 2, acceptance test 1) ================= */
export function TanksTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const plants = usePlants();
  const [plantId, setPlantId] = useState(plants[0]?.id || '');
  const [day, setDay] = useState(today());
  const [form, setForm] = useState(false);
  const [edit, setEdit] = useState<TankDip | null>(null);
  const plant = n.lk.plant[plantId];
  const rows = useMemo(() => (plant ? plantDay(db, plant.id, day) : []), [db, plant, day]);
  const dips = useMemo(() => (plant ? dipRows(db, { storeId: plant.storeId }).slice(0, 60) : []), [db, plant]);
  if (!plant) return <Callout>No plant is in your access.</Callout>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={plantId} onChange={setPlantId} options={plants.map((p) => ({ value: p.id, label: p.name }))} className="w-44" />
        <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} className="w-40" />
        <div className="flex-1" />
        {s.can('inventory', 'add') && <Button variant="primary" icon={<Droplets className="w-4 h-4" />} onClick={() => setForm(true)}>Enter dip</Button>}
      </div>
      <DataTable
        title={`Day reconciliation — ${plant.name}, ${date(day)}`}
        subtitle="Opening + received + produced − used in production − dispatched − other issues = book closing, against the tank dip"
        rows={rows}
        rowKey={(r) => r.materialId}
        searchable={false}
        rowClassName={(r) => (r.diff !== undefined && Math.abs(r.diff) > 0.001 ? 'bg-warn-soft/40' : undefined)}
        columns={[
          { key: 'm', header: 'Material', primary: true, value: (r) => n.mat(r.materialId) },
          { key: 'o', header: 'Opening', align: 'right', value: (r) => r.opening, cell: (r) => qty(r.opening, r.unit) },
          { key: 'r', header: 'Received', align: 'right', value: (r) => r.received, cell: (r) => (r.received ? qty(r.received) : '—') },
          { key: 'p', header: 'Produced', align: 'right', value: (r) => r.produced, cell: (r) => (r.produced ? qty(r.produced) : '—'), hideMobile: true },
          { key: 'u', header: 'Used in mix', align: 'right', value: (r) => r.used, cell: (r) => (r.used ? qty(r.used) : '—') },
          { key: 'd', header: 'Dispatched', align: 'right', value: (r) => r.dispatched, cell: (r) => (r.dispatched ? qty(r.dispatched) : '—'), hideMobile: true },
          { key: 'x', header: 'Other out', align: 'right', value: (r) => r.otherOut, cell: (r) => (Math.abs(r.otherOut) > 0.0005 ? qty(r.otherOut) : '—'), hideMobile: true },
          { key: 'c', header: 'Book closing', align: 'right', value: (r) => r.closing, cell: (r) => <b>{qty(r.closing, r.unit)}</b> },
          { key: 'dip', header: 'Dip', align: 'right', value: (r) => r.dip ?? '', cell: (r) => (r.dip === undefined ? <span className="text-muted">not taken</span> : qty(r.dip)) },
          { key: 'diff', header: 'Difference', align: 'right', value: (r) => r.diff ?? '', cell: (r) => (r.diff === undefined ? '—' : Math.abs(r.diff) < 0.001 ? <Badge tone="good">Matches</Badge> : <span className="text-bad font-semibold">{r.diff > 0 ? '+' : ''}{qty(r.diff)}</span>) },
        ]}
      />
      <DataTable
        title="Dip register"
        subtitle="Tap a dip to correct it"
        rows={dips}
        rowKey={(r) => r.dip.id}
        onRowClick={s.can('inventory', 'edit') ? (r) => setEdit(r.dip) : undefined}
        columns={[
          { key: 'd', header: 'Date', value: (r) => r.dip.date, cell: (r) => date(r.dip.date) },
          { key: 'loc', header: 'Tank / location', primary: true, value: (r) => r.dip.location || '—' },
          { key: 'm', header: 'Material', value: (r) => n.mat(r.dip.materialId) },
          { key: 'rd', header: 'Reading', align: 'right', value: (r) => r.dip.reading ?? '', hideMobile: true },
          { key: 'q', header: 'Dip qty', align: 'right', value: (r) => r.dip.qty, cell: (r) => qty(r.dip.qty, n.unit(r.dip.materialId)) },
          { key: 'b', header: 'Book', align: 'right', value: (r) => r.book, cell: (r) => qty(r.book) },
          { key: 'df', header: 'Diff %', align: 'right', value: (r) => r.pct, cell: (r) => <span className={r.ok ? 'text-good' : 'text-bad font-semibold'}>{r.pct}%</span> },
          { key: 'rm', header: 'Remarks', value: (r) => r.dip.remarks, hideMobile: true },
        ]}
      />
      {form && <DipForm storeId={plant.storeId} defaultDate={day} onClose={() => setForm(false)} />}
      {edit && <DipForm storeId={plant.storeId} dip={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

export function DipForm({ storeId, defaultDate, dip, onClose }: { storeId: string; defaultDate?: string; dip?: TankDip; onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const store = n.lk.store[storeId];
  const locs = store?.locations || [];
  const [loc, setLoc] = useState(dip ? dip.location : locs[0]?.name || '');
  const [mat, setMat] = useState(dip ? dip.materialId : locs[0]?.materialId || '');
  const [d, setD] = useState(dip?.date || defaultDate || today());
  const [reading, setReading] = useState<number | ''>(dip?.reading ?? '');
  const [q, setQ] = useState<number | ''>(dip?.qty ?? '');
  const [remarks, setRemarks] = useState(dip?.remarks || '');
  const pickLoc = (v: string) => {
    setLoc(v);
    const l = locs.find((x) => x.name === v);
    if (l) setMat(l.materialId);
  };
  const save = () => {
    if (!mat || q === '') return toast.error('Material and dip quantity are required');
    if (dip) {
      update('tankDips', dip.id, { reading: reading === '' ? undefined : Number(reading), qty: Number(q), remarks }, `Dip ${dip.location || n.mat(mat)} ${d} corrected`, 'Tank dip');
      toast.success('Dip corrected');
      return onClose();
    }
    if (db.tankDips.some((x) => x.storeId === storeId && x.materialId === mat && x.location === loc && x.date === d)) return toast.error('A dip for this tank and date is already entered');
    insert('tankDips', { date: d, storeId, materialId: mat, location: loc, reading: reading === '' ? undefined : Number(reading), qty: Number(q), remarks } as any, `Dip ${loc || n.mat(mat)} ${d}`, 'Tank dip');
    toast.success('Dip saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Tank / stockpile dip" subtitle={store?.name} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save dip</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {locs.length > 0 ? (
          <Field label="Tank / location"><Select value={loc} onChange={pickLoc} options={locs.map((l) => ({ value: l.name, label: `${l.name} (${n.mat(l.materialId)}, ${num(l.capacity)} ${l.unit})` }))} /></Field>
        ) : (
          <Field label="Tank / location" hint="Add tanks on the store in Masters"><Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Bitumen tank 1" /></Field>
        )}
        <Field label="Material" required><Combo value={mat} onChange={setMat} options={db.materials.filter((m) => m.kind !== 'OUTPUT' || m.category === 'Bitumen').map((m) => ({ value: m.id, label: m.name, hint: m.unit }))} /></Field>
        <Field label="Date"><Input type="date" value={d} max={today()} disabled={!!dip} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Dip reading" hint="cm / m as read, for the record"><NumberInput value={reading} onChange={setReading} /></Field>
        <Field label="Quantity by dip chart" required><NumberInput value={q} onChange={setQ} suffix={n.unit(mat)} /></Field>
        <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

/* ================= HMP-04: outside sales, GST invoice, e-way, buyer ledger ================= */
export function SalesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const plants = usePlants();
  const [view, setView] = useState<'invoices' | 'pending' | 'ledger'>('invoices');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<SalesInvoice | null>(null);
  const [buyer, setBuyer] = useState('');
  const invoices = db.salesInvoices.filter((i) => plants.some((p) => p.id === i.plantId)).slice().reverse();
  const pending = db.dispatches.filter((d) => plants.some((p) => p.id === d.plantId) && !d.siteId && !d.toPlantId && !d.salesInvoiceId && d.status !== 'RETURNED');
  const buyers = db.clients.filter((c) => c.active !== false);
  if (!s.showRates) return <Callout>Your role cannot see sales.</Callout>;
  const ledger = buyer ? buyerLedger(db, buyer) : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Segmented value={view} onChange={setView} options={[{ value: 'invoices', label: 'Tax invoices' }, { value: 'pending', label: `Loads not invoiced (${pending.length})` }, { value: 'ledger', label: 'Buyer ledger' }]} />
        <div className="flex-1" />
        {view === 'invoices' && (
          <Button
            icon={<FileText className="w-4 h-4" />}
            onClick={() => {
              const rows = invoices.filter((i) => i.status !== 'CANCELLED').map((i) => ewayRow(db, i));
              downloadXlsx({ title: 'E-way bill data', headers: ['Doc no', 'Doc date', 'Supplier GSTIN', 'Dispatch from', 'Recipient GSTIN', 'Recipient', 'Ship to', 'HSN', 'Product', 'Qty', 'Unit', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Vehicle no', 'Distance km', 'Transporter', 'Transporter ID'], rows: rows.map((r) => [r.docNo, r.docDate, r.supplierGstin, r.dispatchFrom, r.recipientGstin, r.recipient, r.shipTo, r.hsn, r.product, r.qty, r.unit, r.taxable, r.cgst, r.sgst, r.igst, r.total, r.vehicleNo, r.distanceKm, r.transporter, r.transporterId]) });
            }}
          >
            E-way bill Excel
          </Button>
        )}
        {s.can('plant', 'add') && <Button variant="primary" icon={<Receipt className="w-4 h-4" />} onClick={() => setForm(true)}>New tax invoice</Button>}
      </div>
      {view === 'invoices' && (
        <DataTable
          title="Sales tax invoices"
          rows={invoices}
          rowKey={(r) => r.id}
          onRowClick={setOpen}
          columns={[
            { key: 'no', header: 'Invoice', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{date(r.date)}</div></div> },
            { key: 'b', header: 'Buyer', value: (r) => n.client(r.buyerId) },
            { key: 'q', header: 'Qty', align: 'right', value: (r) => sum(r.lines, (l) => l.qty), cell: (r) => qty(sum(r.lines, (l) => l.qty), r.lines[0]?.unit) },
            { key: 't', header: 'Total', align: 'right', rate: true, value: (r) => salesTotals(db, r).total, cell: (r) => inr(salesTotals(db, r).total) },
            { key: 'o', header: 'Outstanding', align: 'right', rate: true, value: (r) => (r.status === 'CANCELLED' ? 0 : salesTotals(db, r).outstanding), cell: (r) => (r.status === 'CANCELLED' ? '—' : inr(salesTotals(db, r).outstanding)) },
            { key: 'st', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
      {view === 'pending' && (
        <DataTable
          title="Sale loads waiting for an invoice"
          rows={pending}
          rowKey={(r) => r.id}
          columns={[
            { key: 'no', header: 'Slip', primary: true, value: (r) => r.no },
            { key: 'd', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
            { key: 'b', header: 'Buyer', value: (r) => (r.buyerId ? n.client(r.buyerId) : r.customer) },
            { key: 'p', header: 'Product', value: (r) => n.mat(r.productId) },
            { key: 'q', header: 'Qty', align: 'right', value: (r) => r.receivedQty ?? r.qty, cell: (r) => qty(r.receivedQty ?? r.qty, n.unit(r.productId)) },
            { key: 'st', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
      {view === 'ledger' && (
        <DataTable
          title="Buyer ledger"
          rows={ledger}
          rowKey={(_, i) => String(i)}
          toolbar={<Select value={buyer} onChange={setBuyer} placeholder="Choose buyer" options={buyers.map((c) => ({ value: c.id, label: c.name }))} className="w-56" />}
          empty={<p className="p-6 text-sm text-muted">Choose a buyer.</p>}
          columns={[
            { key: 'd', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
            { key: 'r', header: 'Reference', primary: true, value: (r) => r.ref },
            { key: 'dr', header: 'Debit', align: 'right', value: (r) => r.debit, cell: (r) => (r.debit ? inr(r.debit) : '') },
            { key: 'cr', header: 'Credit', align: 'right', value: (r) => r.credit, cell: (r) => (r.credit ? inr(r.credit) : '') },
            { key: 'b', header: 'Balance', align: 'right', value: (r) => r.balance, cell: (r) => <b>{inr(r.balance)}</b> },
          ]}
        />
      )}
      {form && <SalesInvoiceForm onClose={() => setForm(false)} />}
      {open && <SalesInvoiceView inv={db.salesInvoices.find((x) => x.id === open.id) || open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SalesInvoiceForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const n = useNames();
  const plants = usePlants();
  const [plantId, setPlantId] = useState(plants[0]?.id || '');
  const [buyerId, setBuyerId] = useState('');
  const [d, setD] = useState(today());
  const [picked, setPicked] = useState<string[]>([]);
  const [rates, setRates] = useState<Record<string, number | ''>>({});
  const [eway, setEway] = useState({ vehicleNo: '', distanceKm: 0, transporter: '', transporterId: '', ewbNo: '' });
  const [busy, setBusy] = useState(false);
  const buyer = n.lk.client[buyerId];
  const loads = db.dispatches.filter((x) => x.plantId === plantId && !x.siteId && !x.toPlantId && !x.salesInvoiceId && x.status === 'RECEIVED' && buyer && (x.buyerId === buyerId || (!x.buyerId && x.customer === buyer.name)) && x.date <= d);
  const chosen = loads.filter((x) => picked.includes(x.id));
  const products = [...new Set(chosen.map((x) => x.productId))];
  const taxable = sum(products, (p) => sum(chosen.filter((x) => x.productId === p), (x) => x.receivedQty ?? x.qty) * Number(rates[p] || chosen.find((x) => x.productId === p && x.saleRate)?.saleRate || 0));
  const save = async () => {
    if (!buyerId || !chosen.length) return toast.error('Choose the buyer and the loads');
    setBusy(true);
    try {
      const firstVeh = n.lk.vehicle[chosen[0]!.vehicleId];
      const rec = await runCommand({ kind: 'insert', coll: 'salesInvoices', rec: { date: d, buyerId, plantId, dispatchIds: picked, no: '', lines: [], status: 'ISSUED', receipts: [], remarks: '', eway: { ...eway, vehicleNo: eway.vehicleNo || firstVeh?.regNo || '' }, rates: Object.fromEntries(Object.entries(rates).filter(([, v]) => v !== '')) } } as any, 'Sales invoice');
      toast.success(`Invoice ${rec?.no || ''} issued`);
      onClose();
    } catch (e) {
      toast.error('Invoice not saved', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title="Sales tax invoice" subtitle="Hot mix / products sold to an outside buyer — HSN, GST, e-way bill" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy}>Issue invoice</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Plant"><Select value={plantId} onChange={(v) => (setPlantId(v), setPicked([]))} options={plants.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Buyer" required hint="Buyers are kept in Masters → Clients"><Combo value={buyerId} onChange={(v) => (setBuyerId(v), setPicked([]))} options={db.clients.filter((c) => c.active !== false).map((c) => ({ value: c.id, label: c.name, hint: c.gstin || 'unregistered' }))} /></Field>
          <Field label="Invoice date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
        </div>
        <Section title="Delivered loads">
          {!buyer ? <p className="text-sm text-muted">Choose the buyer.</p> : !loads.length ? <p className="text-sm text-muted">No delivered loads for this buyer waiting for an invoice.</p> : (
            <div className="space-y-1">
              {loads.map((x) => (
                <label key={x.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2 text-sm">
                  <input type="checkbox" checked={picked.includes(x.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.id] : picked.filter((y) => y !== x.id))} />
                  <span className="font-mono text-[12px]">{x.no}</span>
                  <span>{date(x.date)}</span>
                  <span className="flex-1">{n.mat(x.productId)}</span>
                  <b>{qty(x.receivedQty ?? x.qty, n.unit(x.productId))}</b>
                </label>
              ))}
              <button className="text-xs text-brand mt-1" onClick={() => setPicked(loads.map((x) => x.id))}>Select all</button>
            </div>
          )}
        </Section>
        {products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((p) => (
              <Field key={p} label={`Rate — ${n.mat(p)} (excl. GST)`} hint={`HSN ${n.lk.material[p]?.hsn || '2715'} · GST ${n.lk.material[p]?.gstPct ?? 18}%`}>
                <NumberInput value={rates[p] ?? chosen.find((x) => x.productId === p && x.saleRate)?.saleRate ?? ''} onChange={(v) => setRates({ ...rates, [p]: v })} prefix="₹" suffix={`/${n.unit(p)}`} />
              </Field>
            ))}
          </div>
        )}
        <Section title="E-way bill">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Vehicle no." hint="Blank = first load's vehicle"><Input value={eway.vehicleNo} onChange={(e) => setEway({ ...eway, vehicleNo: e.target.value })} /></Field>
            <Field label="Distance"><NumberInput value={eway.distanceKm || ''} onChange={(v) => setEway({ ...eway, distanceKm: Number(v) || 0 })} suffix="km" /></Field>
            <Field label="Transporter"><Input value={eway.transporter} onChange={(e) => setEway({ ...eway, transporter: e.target.value })} /></Field>
            <Field label="E-way bill no."><Input value={eway.ewbNo} onChange={(e) => setEway({ ...eway, ewbNo: e.target.value })} placeholder="after generating on the portal" /></Field>
          </div>
        </Section>
        {taxable > 0 && <Callout>Taxable value {inr(taxable)} — GST is worked out by the server from the firm and buyer state codes.</Callout>}
      </div>
    </Drawer>
  );
}

export function SalesInvoiceView({ inv, onClose }: { inv: SalesInvoice; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const t = salesTotals(db, inv);
  const buyer = n.lk.client[inv.buyerId];
  const [amt, setAmt] = useState<number | ''>('');
  const [rd, setRd] = useState(today());
  const [utr, setUtr] = useState('');
  const [ewb, setEwb] = useState(inv.eway.ewbNo);
  const print = () =>
    printDocument({
      title: 'TAX INVOICE',
      firmId: inv.firmId,
      meta: [['Invoice no.', inv.no], ['Date', date(inv.date)], ['Buyer', buyer?.name || ''], ['Buyer GSTIN', buyer?.gstin || 'Unregistered'], ['Address', buyer?.address || ''], ['Place of supply', buyer?.gstin ? `State ${buyer.gstin.slice(0, 2)}` : 'Tripura (16)'], ['Vehicle', inv.eway.vehicleNo], ['E-way bill', inv.eway.ewbNo || '—'], inv.kind === 'GOODS' ? ['Dispatched from', n.store(inv.storeId)] : ['Loads', inv.dispatchIds.map((id) => db.dispatches.find((d) => d.id === id)?.no).join(', ')], ['Amount in words', rupeesInWords(t.total)]],
      table: { title: 'Lines', headers: ['Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Taxable value', 'GST %', 'GST'], numeric: [2, 4, 5, 6, 7], rows: inv.lines.map((l) => [l.description, l.hsn, l.qty, l.unit, l.rate.toFixed(2), (l.qty * l.rate).toFixed(2), l.gstPct, ((l.qty * l.rate * l.gstPct) / 100).toFixed(2)]) },
      summary: [['Taxable value', inr(t.taxable)], ...(t.igst ? [['IGST', inr(t.igst)] as [string, string]] : [['CGST', inr(t.cgst)] as [string, string], ['SGST', inr(t.sgst)] as [string, string]]), ['Invoice total (rounded)', inr(t.total)]],
      footerNote: 'Certified that the particulars given above are true and correct.',
    });
  const addReceipt = () => {
    if (!amt) return toast.error('Amount is required');
    update('salesInvoices', inv.id, { receipts: [...inv.receipts, { date: rd, amount: Number(amt), utr }] }, `Receipt on ${inv.no}`, 'Sales invoice');
    setAmt('');
    setUtr('');
    toast.success('Receipt recorded');
  };
  const cancel = () => {
    const why = window.prompt('Reason for cancelling this invoice');
    if (!why) return;
    update('salesInvoices', inv.id, { status: 'CANCELLED' }, `Cancel ${inv.no}`, 'Sales invoice', why, 'CANCEL');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={inv.no} subtitle={`${buyer?.name || ''} · ${date(inv.date)}`} footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" icon={<Printer className="w-4 h-4" />} onClick={print}>Print tax invoice</Button></>}>
      <div className="space-y-4">
        <KV items={[['Taxable', inr(t.taxable)], [t.igst ? 'IGST' : 'CGST + SGST', t.igst ? inr(t.igst) : `${inr(t.cgst)} + ${inr(t.sgst)}`], ['Total', <b key="t">{inr(t.total)}</b>], ['Received', inr(t.received)], ['Outstanding', inr(t.outstanding)], ['Status', <StatusBadge key="s" status={inv.status} />]]} />
        {inv.lines.map((l) => <div key={l.productId} className="text-sm">{l.description} · HSN {l.hsn} · {qty(l.qty, l.unit)} × {inr(l.rate)} · GST {l.gstPct}%</div>)}
        {inv.status !== 'CANCELLED' && s.can(inv.kind === 'GOODS' ? 'purchase' : 'plant', 'edit') && (
          <>
            <Section title="E-way bill no.">
              <div className="flex gap-2"><Input value={ewb} onChange={(e) => setEwb(e.target.value)} /><Button onClick={() => (update('salesInvoices', inv.id, { eway: { ...inv.eway, ewbNo: ewb, ewbDate: today() } }, `E-way ${inv.no}`, 'Sales invoice'), toast.success('Saved'))}>Save</Button></div>
            </Section>
            {t.outstanding > 0 && (
              <Section title="Record receipt">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Date"><Input type="date" value={rd} max={today()} onChange={(e) => setRd(e.target.value)} /></Field>
                  <Field label="Amount"><NumberInput value={amt} onChange={setAmt} prefix="₹" /></Field>
                  <Field label="UTR / cheque"><Input value={utr} onChange={(e) => setUtr(e.target.value)} /></Field>
                </div>
                <Button className="mt-3" onClick={addReceipt}>Add receipt</Button>
              </Section>
            )}
            {inv.receipts.length > 0 && <Section title="Receipts">{inv.receipts.map((r, i) => <div key={i} className="text-sm">{date(r.date)} · {inr(r.amount)} · {r.utr}</div>)}</Section>}
            {s.isAdmin && !inv.receipts.length && <Button variant="ghost" className="text-bad" onClick={cancel}>Cancel invoice</Button>}
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ================= HMP-06: lab tests at the plant ================= */
export function LabTab({ scope }: { scope: 'plant' | 'site' }) {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [form, setForm] = useState(false);
  const rows = db.labTests.filter((t) => (scope === 'plant' ? !!t.plantId : !!t.siteId)).slice().reverse();
  return (
    <div className="space-y-4">
      <DataTable
        title={scope === 'plant' ? 'Plant lab register (Marshall, extraction, gradation)' : 'Site quality tests (cubes, FDD, density)'}
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can(scope === 'plant' ? 'plant' : 'contract', 'add') && <Button variant="primary" icon={<FlaskConical className="w-4 h-4" />} onClick={() => setForm(true)}>Add test</Button>}
        columns={[
          { key: 'd', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 'k', header: 'Test', primary: true, value: (r) => r.kind, cell: (r) => <div>{r.kind.replace('_', ' ').toLowerCase()}<div className="text-[11px] text-muted">{r.plantId ? n.plant(r.plantId) : n.site(r.siteId)}{r.lot ? ` · lot ${r.lot}` : ''}</div></div> },
          { key: 'res', header: 'Results', value: (r) => Object.entries(r.results).map(([k, v]) => `${k} ${v}`).join(', '), cell: (r) => <span className="text-[13px]">{r.cube ? `${r.cube.grade} cast ${date(r.cube.castDate)} · 7d ${r.cube.d7 ?? '—'} · 28d ${r.cube.d28 ?? '—'} N/mm²` : Object.entries(r.results).map(([k, v]) => `${k} ${v}`).join(', ')}</span> },
          { key: 'lab', header: 'Lab', value: (r) => r.lab, cell: (r) => <span>{r.lab}{r.nabl && <Badge tone="info" className="ml-1">NABL</Badge>}</span>, hideMobile: true },
          { key: 'p', header: 'Result', value: (r) => (r.pass === undefined ? '' : r.pass ? 'Pass' : 'Fail'), cell: (r) => (r.pass === undefined ? <Badge>Pending</Badge> : r.pass ? <Badge tone="good">Pass</Badge> : <Badge tone="bad">Fail</Badge>) },
        ]}
      />
      {form && <LabForm scope={scope} onClose={() => setForm(false)} />}
    </div>
  );
}

const RESULT_FIELDS: Record<string, string[]> = {
  MARSHALL: ['Stability kN', 'Flow mm', 'Air voids %', 'VMA %', 'Density g/cc'],
  BITUMEN_CONTENT: ['Bitumen %'],
  GRADATION: ['Passing 26.5', 'Passing 13.2', 'Passing 4.75', 'Passing 0.075'],
  DENSITY: ['Field density g/cc', 'Compaction %'],
  FDD: ['Dry density g/cc', 'Compaction %'],
  SOIL: ['MDD g/cc', 'OMC %', 'CBR %'],
  OTHER: ['Value'],
};

function LabForm({ scope, onClose }: { scope: 'plant' | 'site'; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const plants = usePlants();
  const [kind, setKind] = useState<string>(scope === 'plant' ? 'MARSHALL' : 'CUBE');
  const [plantId, setPlantId] = useState(plants[0]?.id || '');
  const [siteId, setSiteId] = useState(db.sites.find((x) => s.seesSite(x.id) && !(x as any).outOfScope)?.id || '');
  const [d, setD] = useState(today());
  const [lot, setLot] = useState('');
  const [lab, setLab] = useState('');
  const [nabl, setNabl] = useState(false);
  const [reportNo, setReportNo] = useState('');
  const [res, setRes] = useState<Record<string, number | ''>>({});
  const [cube, setCube] = useState<{ castDate: string; grade: string; nos: number; d7: number | ''; d28: number | '' }>({ castDate: today(), grade: 'M25', nos: 3, d7: '', d28: '' });
  const [pass, setPass] = useState<'' | 'Y' | 'N'>('');
  const [boq, setBoq] = useState('');
  const [remarks, setRemarks] = useState('');
  const save = () => {
    const results = Object.fromEntries(Object.entries(res).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    insert('labTests', { date: d, kind, plantId: scope === 'plant' ? plantId : undefined, siteId: scope === 'site' ? siteId : undefined, boqItemId: boq || undefined, lot, sampleRef: '', lab, nabl, reportNo, results, cube: kind === 'CUBE' ? { castDate: cube.castDate, grade: cube.grade, nos: cube.nos, d7: cube.d7 === '' ? undefined : Number(cube.d7), d28: cube.d28 === '' ? undefined : Number(cube.d28) } : undefined, pass: pass === '' ? undefined : pass === 'Y', remarks } as any, `Lab test ${kind}`, 'Lab test');
    toast.success('Test saved');
    onClose();
  };
  const kinds = scope === 'plant' ? ['MARSHALL', 'BITUMEN_CONTENT', 'GRADATION', 'OTHER'] : ['CUBE', 'FDD', 'DENSITY', 'SOIL', 'OTHER'];
  return (
    <Drawer open onClose={onClose} title="Quality test" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Test"><Select value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: k.replace('_', ' ').toLowerCase() }))} /></Field>
          {scope === 'plant' ? <Field label="Plant"><Select value={plantId} onChange={setPlantId} options={plants.map((p) => ({ value: p.id, label: p.name }))} /></Field> : <Field label="Work"><Select value={siteId} onChange={setSiteId} options={db.sites.filter((x) => s.seesSite(x.id) && !(x as any).outOfScope).map((x) => ({ value: x.id, label: x.short || x.name }))} /></Field>}
          <Field label="Test date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label={scope === 'plant' ? 'Lot no.' : 'Location / pour'}><Input value={lot} onChange={(e) => setLot(e.target.value)} /></Field>
          {scope === 'site' && <Field label="BOQ item"><Select value={boq} onChange={setBoq} placeholder="—" options={db.boq.filter((b) => b.siteId === siteId).map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description.slice(0, 40)}` }))} /></Field>}
          <Field label="Laboratory"><Input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Own lab / PWD lab / NABL lab" /></Field>
          <Field label="Report no."><Input value={reportNo} onChange={(e) => setReportNo(e.target.value)} /></Field>
          <Toggle checked={nabl} onChange={setNabl} label="NABL accredited lab" />
        </div>
        {kind === 'CUBE' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Cast date"><Input type="date" value={cube.castDate} max={today()} onChange={(e) => setCube({ ...cube, castDate: e.target.value })} /></Field>
            <Field label="Grade"><Input value={cube.grade} onChange={(e) => setCube({ ...cube, grade: e.target.value })} /></Field>
            <Field label="No. of cubes"><NumberInput value={cube.nos} onChange={(v) => setCube({ ...cube, nos: Number(v) || 1 })} /></Field>
            <Field label="7-day strength"><NumberInput value={cube.d7} onChange={(v) => setCube({ ...cube, d7: v })} suffix="N/mm²" /></Field>
            <Field label="28-day strength"><NumberInput value={cube.d28} onChange={(v) => setCube({ ...cube, d28: v })} suffix="N/mm²" /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {(RESULT_FIELDS[kind] || []).map((k) => <Field key={k} label={k}><NumberInput value={res[k] ?? ''} onChange={(v) => setRes({ ...res, [k]: v })} /></Field>)}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Result"><Select value={pass} onChange={(v) => setPass(v as any)} options={[{ value: '', label: 'Pending' }, { value: 'Y', label: 'Pass' }, { value: 'N', label: 'Fail' }]} /></Field>
          <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        </div>
      </div>
    </Drawer>
  );
}

/* ================= HMP-07: plant maintenance job cards ================= */
export function PlantMaintTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const plants = usePlants();
  const [form, setForm] = useState(false);
  const rows = db.jobCards.filter((j) => j.plantId && plants.some((p) => p.id === j.plantId)).slice().reverse();
  return (
    <div className="space-y-4">
      <DataTable
        title="Plant maintenance — job cards"
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={s.can('plant', 'add') && <Button variant="primary" icon={<Wrench className="w-4 h-4" />} onClick={() => setForm(true)}>Job card</Button>}
        columns={[
          { key: 'no', header: 'Job card', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{date(r.date)}</div></div> },
          { key: 'p', header: 'Plant / equipment', value: (r) => `${n.plant(r.plantId)} ${r.equipment || ''}`, cell: (r) => <div>{n.plant(r.plantId)}<div className="text-[11px] text-muted">{r.equipment}</div></div> },
          { key: 't', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.type === 'BREAKDOWN' ? 'bad' : 'neutral'}>{r.type.toLowerCase()}</Badge> },
          { key: 'c', header: 'Complaint / work done', value: (r) => `${r.complaint} ${r.workDone}`, cell: (r) => <div className="text-[13px]">{r.complaint}<div className="text-muted">{r.workDone}</div></div>, hideMobile: true },
          { key: 'dt', header: 'Downtime', align: 'right', value: (r) => r.downtimeHours, cell: (r) => `${num(r.downtimeHours)} h` },
          { key: 'cost', header: 'Cost', align: 'right', rate: true, value: (r) => r.sparesCost + r.labourCost, cell: (r) => inr(r.sparesCost + r.labourCost) },
          { key: 'st', header: 'Status', value: (r) => (r.closed ? 'Closed' : 'Open'), cell: (r) => (r.closed ? <Badge tone="good">Closed</Badge> : <Button size="sm" onClick={() => update('jobCards', r.id, { closed: true }, `Close ${r.no}`, 'Job card')}>Close</Button>) },
        ]}
      />
      {form && <PlantJobForm onClose={() => setForm(false)} />}
    </div>
  );
}

function PlantJobForm({ onClose }: { onClose: () => void }) {
  const plants = usePlants();
  const [f, setF] = useState({ plantId: plants[0]?.id || '', equipment: '', type: 'BREAKDOWN', complaint: '', workDone: '', sparesCost: '' as number | '', labourCost: '' as number | '', downtimeHours: '' as number | '', date: today() });
  const save = () => {
    if (!f.plantId || !f.complaint) return toast.error('Plant and complaint are required');
    insert('jobCards', { no: '', date: f.date, plantId: f.plantId, equipment: f.equipment, type: f.type, complaint: f.complaint, workDone: f.workDone, sparesCost: Number(f.sparesCost) || 0, labourCost: Number(f.labourCost) || 0, downtimeHours: Number(f.downtimeHours) || 0, meterAt: 0, closed: false } as any, 'Plant job card', 'Job card');
    toast.success('Job card saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Plant job card" subtitle="burner, drum, bag filter, DG, conveyor, weigh hopper …" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Plant"><Select value={f.plantId} onChange={(v) => setF({ ...f, plantId: v })} options={plants.map((p) => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Equipment"><Input value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} placeholder="Burner / DG set / bag filter" /></Field>
        <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: 'BREAKDOWN', label: 'Breakdown' }, { value: 'SERVICE', label: 'Scheduled service' }, { value: 'REPAIR', label: 'Repair' }]} /></Field>
        <Field label="Date"><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Complaint" required className="sm:col-span-2"><Input value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} /></Field>
        <Field label="Work done" className="sm:col-span-2"><Input value={f.workDone} onChange={(e) => setF({ ...f, workDone: e.target.value })} /></Field>
        <Field label="Spares cost"><NumberInput value={f.sparesCost} onChange={(v) => setF({ ...f, sparesCost: v })} prefix="₹" /></Field>
        <Field label="Labour cost"><NumberInput value={f.labourCost} onChange={(v) => setF({ ...f, labourCost: v })} prefix="₹" /></Field>
        <Field label="Downtime"><NumberInput value={f.downtimeHours} onChange={(v) => setF({ ...f, downtimeHours: v })} suffix="h" /></Field>
      </div>
    </Drawer>
  );
}

/* ================= HMP-05: cost per MT by mix ================= */
export function CostByMix() {
  const db = useDB();
  const n = useNames();
  const plants = usePlants();
  const months = [...new Set(db.production.map((p) => monthOf(p.date)))].sort().reverse();
  const [plantId, setPlantId] = useState(plants[0]?.id || '');
  const [month, setMonth] = useState(months[0] || monthOf(today()));
  const rows = useMemo(() => (plantId ? costPerMt(db, plantId, month) : []), [db, plantId, month]);
  return (
    <DataTable
      title="Cost per MT by mix"
      subtitle="Material + burner / DG fuel from the store at average cost; labour, power, repairs, depreciation, interest and overheads shared by tonnes"
      rows={rows}
      rowKey={(r) => r.productId}
      searchable={false}
      toolbar={<><Select value={plantId} onChange={setPlantId} options={plants.map((p) => ({ value: p.id, label: p.name }))} className="w-40" /><Select value={month} onChange={setMonth} options={(months.length ? months : [month]).map((m) => ({ value: m, label: monthLabel(m) }))} className="w-36" /></>}
      columns={[
        { key: 'p', header: 'Mix', primary: true, value: (r) => n.mat(r.productId) },
        { key: 'q', header: 'Produced', align: 'right', value: (r) => r.qty, cell: (r) => qty(r.qty, n.unit(r.productId)) },
        ...(['material', 'fuel', 'labour', 'power', 'repairs', 'depreciation', 'interest', 'overhead'] as const).map((k) => ({ key: k, header: k[0]!.toUpperCase() + k.slice(1), align: 'right' as const, rate: true, hideMobile: k !== 'material', value: (r: (typeof rows)[number]) => r.perMt[k] || 0, cell: (r: (typeof rows)[number]) => inr(r.perMt[k] || 0) })),
        { key: 'c', header: 'Cost / MT', align: 'right', rate: true, value: (r) => r.costPerMt, cell: (r) => <b>{inr(r.costPerMt)}</b> },
      ]}
    />
  );
}

/* ================= HMP-08: TIIPIS subsidy claims and loans ================= */
export function SubsidyTab() {
  const db = useDB();
  const s = useSession();
  const [loanForm, setLoanForm] = useState(false);
  const [claimForm, setClaimForm] = useState<SubsidyClaim['kind'] | null>(null);
  const [sched, setSched] = useState<Loan | null>(null);
  if (!s.showRates) return <Callout>Your role cannot see loans and subsidy.</Callout>;
  const month = monthOf(today());
  return (
    <div className="space-y-4">
      <Callout>TIIPIS: SGST paid in cash on outside sales of hot mix, and interest subsidy on the plant term loan, are claimed month by month. The app works out the SGST on sales and the loan interest; enter the cash SGST from GSTR-3B.</Callout>
      <DataTable
        title="Subsidy claims"
        rows={db.subsidyClaims.slice().reverse()}
        rowKey={(r) => r.id}
        toolbar={s.can('expenses', 'add') && <><Button onClick={() => setClaimForm('SGST')}>SGST claim</Button><Button onClick={() => setClaimForm('INTEREST')}>Interest claim</Button></>}
        columns={[
          { key: 'm', header: 'Month', primary: true, value: (r) => r.month, cell: (r) => monthLabel(r.month) },
          { key: 'k', header: 'Claim', value: (r) => r.kind, cell: (r) => (r.kind === 'SGST' ? 'SGST reimbursement' : 'Interest subsidy') },
          { key: 'b', header: 'Worked out', align: 'right', value: (r) => r.base, cell: (r) => inr(r.base) },
          { key: 'cp', header: 'Cash paid (3B)', align: 'right', value: (r) => r.cashPaid, cell: (r) => (r.kind === 'SGST' ? inr(r.cashPaid) : '—'), hideMobile: true },
          { key: 'c', header: 'Claimed', align: 'right', value: (r) => r.claimAmount, cell: (r) => <b>{inr(r.claimAmount)}</b> },
          { key: 'f', header: 'Filed', value: (r) => r.filedOn || '', cell: (r) => (r.filedOn ? date(r.filedOn) : <Button size="sm" onClick={() => update('subsidyClaims', r.id, { filedOn: today() }, 'Claim filed', 'Subsidy claim')}>Mark filed</Button>) },
          { key: 'r', header: 'Received', align: 'right', value: (r) => r.receivedAmount ?? '', cell: (r) => (r.receivedOn ? `${inr(r.receivedAmount || 0)} on ${date(r.receivedOn)}` : r.filedOn ? <Button size="sm" onClick={() => { const a = Number(window.prompt('Amount received', String(r.claimAmount))); if (a) update('subsidyClaims', r.id, { receivedOn: today(), receivedAmount: a }, 'Claim received', 'Subsidy claim'); }}>Received</Button> : '—') },
        ]}
      />
      <DataTable
        title="Loans"
        rows={db.loans}
        rowKey={(r) => r.id}
        onRowClick={setSched}
        toolbar={s.can('expenses', 'add') && <Button variant="primary" icon={<Landmark className="w-4 h-4" />} onClick={() => setLoanForm(true)}>Add loan</Button>}
        columns={[
          { key: 'l', header: 'Lender', primary: true, value: (r) => r.lender, cell: (r) => <div>{r.lender}<div className="text-[11px] text-muted">{r.purpose} {r.sanctionNo}</div></div> },
          { key: 'a', header: 'Amount', align: 'right', value: (r) => r.amount, cell: (r) => inr(r.amount) },
          { key: 'r', header: 'Rate', align: 'right', value: (r) => r.ratePct, cell: (r) => `${r.ratePct}%` },
          { key: 't', header: 'Tenure', align: 'right', value: (r) => r.tenureMonths, cell: (r) => `${r.tenureMonths} m${r.moratoriumMonths ? ` (${r.moratoriumMonths} m moratorium)` : ''}`, hideMobile: true },
          { key: 'e', header: 'EMI', align: 'right', value: (r) => loanSchedule(r).find((x) => x.principal > 0)?.emi || 0, cell: (r) => inr(loanSchedule(r).find((x) => x.principal > 0)?.emi || 0) },
          { key: 'i', header: `Interest ${monthLabel(month)}`, align: 'right', value: (r) => loanInterestIn(r, month), cell: (r) => inr(loanInterestIn(r, month)) },
          { key: 'o', header: 'Outstanding', align: 'right', value: (r) => loanSchedule(r).filter((x) => x.date <= today()).at(-1)?.closing ?? r.amount, cell: (r) => inr(loanSchedule(r).filter((x) => x.date <= today()).at(-1)?.closing ?? r.amount) },
        ]}
      />
      {loanForm && <LoanForm onClose={() => setLoanForm(false)} />}
      {claimForm && <ClaimForm kind={claimForm} onClose={() => setClaimForm(null)} />}
      {sched && (
        <Drawer open onClose={() => setSched(null)} title={`EMI schedule — ${sched.lender}`} width="max-w-3xl" footer={<Button onClick={() => setSched(null)}>Close</Button>}>
          <DataTable
            title={`EMI schedule ${sched.lender}`}
            rows={loanSchedule(sched)}
            rowKey={(r) => String(r.no)}
            pageSize={24}
            searchable={false}
            columns={[
              { key: 'n', header: '#', value: (r) => r.no },
              { key: 'd', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
              { key: 'o', header: 'Opening', align: 'right', value: (r) => r.opening, cell: (r) => inr(r.opening) },
              { key: 'e', header: 'EMI', align: 'right', value: (r) => r.emi, cell: (r) => inr(r.emi) },
              { key: 'i', header: 'Interest', align: 'right', value: (r) => r.interest, cell: (r) => inr(r.interest) },
              { key: 'p', header: 'Principal', align: 'right', value: (r) => r.principal, cell: (r) => inr(r.principal) },
              { key: 'c', header: 'Closing', align: 'right', value: (r) => r.closing, cell: (r) => inr(r.closing) },
            ]}
          />
        </Drawer>
      )}
    </div>
  );
}

function LoanForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState({ lender: 'NEDFi', kind: 'TERM', purpose: 'Hot mix plant', sanctionNo: '', sanctionDate: '', amount: '' as number | '', ratePct: '' as number | '', startDate: today(), tenureMonths: 60 as number | '', moratoriumMonths: 0 as number | '', subsidyPct: 0 as number | '', plantId: '', vehicleId: '' });
  const save = () => {
    if (!f.amount || !f.tenureMonths) return toast.error('Amount and tenure are required');
    insert('loans', { ...f, amount: Number(f.amount), ratePct: Number(f.ratePct) || 0, tenureMonths: Number(f.tenureMonths), moratoriumMonths: Number(f.moratoriumMonths) || 0, subsidyPct: Number(f.subsidyPct) || 0, sanctionDate: f.sanctionDate || undefined, plantId: f.plantId || undefined, vehicleId: f.vehicleId || undefined } as any, `Loan ${f.lender}`, 'Loan');
    toast.success('Loan saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Loan" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Lender"><Input value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'TERM', label: 'Term loan' }, { value: 'VEHICLE', label: 'Vehicle / machine loan' }, { value: 'OTHER', label: 'Other' }]} /></Field>
        <Field label="Purpose"><Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
        <Field label="Sanction no."><Input value={f.sanctionNo} onChange={(e) => setF({ ...f, sanctionNo: e.target.value })} /></Field>
        <Field label="Amount" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} prefix="₹" /></Field>
        <Field label="Interest rate"><NumberInput value={f.ratePct} onChange={(v) => setF({ ...f, ratePct: v })} suffix="% p.a." /></Field>
        <Field label="First EMI date"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="Tenure" required><NumberInput value={f.tenureMonths} onChange={(v) => setF({ ...f, tenureMonths: v })} suffix="months" /></Field>
        <Field label="Moratorium (interest only)"><NumberInput value={f.moratoriumMonths} onChange={(v) => setF({ ...f, moratoriumMonths: v })} suffix="months" /></Field>
        <Field label="Interest subsidy"><NumberInput value={f.subsidyPct} onChange={(v) => setF({ ...f, subsidyPct: v })} suffix="% of interest" /></Field>
        <Field label="Plant"><Select value={f.plantId} onChange={(v) => setF({ ...f, plantId: v })} placeholder="—" options={db.plants.map((p) => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Vehicle"><Select value={f.vehicleId} onChange={(v) => setF({ ...f, vehicleId: v })} placeholder="—" options={db.vehicles.map((v) => ({ value: v.id, label: v.regNo || v.model }))} /></Field>
      </div>
    </Drawer>
  );
}

function ClaimForm({ kind, onClose }: { kind: SubsidyClaim['kind']; onClose: () => void }) {
  const db = useDB();
  const [month, setMonth] = useState(monthOf(today()));
  const [loanId, setLoanId] = useState(db.loans.find((l) => l.subsidyPct > 0)?.id || db.loans[0]?.id || '');
  const [cash, setCash] = useState<number | ''>('');
  const [ref, setRef] = useState('');
  const loan = db.loans.find((l) => l.id === loanId);
  const base = kind === 'SGST' ? sgstOnSales(db, month) : loan ? loanInterestIn(loan, month) : 0;
  // SGST: the lower of SGST on outside sales and the SGST actually paid in cash; interest: subsidy % of the interest
  const claim = kind === 'SGST' ? round(Math.min(base, cash === '' ? base : Number(cash)), 2) : round((base * (loan?.subsidyPct || 0)) / 100, 2);
  const save = () => {
    if (!claim) return toast.error('Nothing to claim for this month');
    insert('subsidyClaims', { kind, month, base, cashPaid: Number(cash) || 0, claimAmount: claim, loanId: kind === 'INTEREST' ? loanId : undefined, claimRef: ref, remarks: '' } as any, `${kind} claim ${month}`, 'Subsidy claim');
    toast.success('Claim saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={kind === 'SGST' ? 'SGST reimbursement claim' : 'Interest subsidy claim'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save claim</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          {kind === 'SGST' ? <Field label="SGST paid in cash (GSTR-3B)"><NumberInput value={cash} onChange={setCash} prefix="₹" /></Field> : <Field label="Loan"><Select value={loanId} onChange={setLoanId} options={db.loans.map((l) => ({ value: l.id, label: `${l.lender} ${l.purpose}` }))} /></Field>}
          <Field label="Claim ref."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </div>
        <Card className="p-4"><KV items={[[kind === 'SGST' ? 'SGST on outside sales' : 'Interest in month', inr(base)], ['Claim', <b key="c">{inr(claim)}</b>]]} /></Card>
      </div>
    </Drawer>
  );
}


/** Indian numbering in words, for the tax invoice (e.g. 1,86,558 → One Lakh Eighty Six Thousand Five Hundred Fifty Eight) */
export function rupeesInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x]! : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ''}`);
  const three = (x: number) => `${x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' : ''}` : ''}${x % 100 ? two(x % 100) : ''}`;
  let n = Math.round(Math.abs(amount));
  if (!n) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `Rupees ${parts.join(' ')} Only`;
}

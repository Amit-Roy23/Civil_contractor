import { useState } from 'react';
import { Printer, Receipt } from 'lucide-react';
import { vehicleName } from '@civil/domain/works';
import { useDB, insert, update } from '../../data/store';
import { useSession } from '../../data/session';
import type { HireOut } from '../../data/types';
import { Button, Callout, Drawer, KV, Section, StatusBadge, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Combo, Field, Input, NumberInput, Select } from '../../components/ui/fields';
import { printDocument } from '../../lib/export';
import { date, inr, num, today } from '../../lib/format';
import { round, sum } from '../../lib/utils';
import { useNames } from '../shared';

const total = (h: HireOut) => Math.round(h.units * h.rate * (1 + h.gstPct / 100));
const BASIS: Record<HireOut['basis'], string> = { HOUR: 'hour', DAY: 'day', MONTH: 'month', TRIP: 'trip', KM: 'km' };

/** FLT-04: own machines hired out to other parties, with a hire bill and receipts */
export function HireOutTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<HireOut | null>(null);
  if (!s.showRates) return <Callout>Your role cannot see hire bills.</Callout>;
  const rows = db.hireOuts.slice().reverse();
  return (
    <div className="space-y-4">
      <DataTable
        title="Own machines hired out — bills"
        subtitle="Logbook days marked 'hired out' carry no cost to any work"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setOpen}
        toolbar={s.can('fleet', 'add') && <Button variant="primary" icon={<Receipt className="w-4 h-4" />} onClick={() => setForm(true)}>Hire-out bill</Button>}
        totals={{ t: inr(sum(rows, total)) }}
        columns={[
          { key: 'no', header: 'Bill', primary: true, value: (r) => r.no, cell: (r) => <div><div className="font-mono text-[13px]">{r.no}</div><div className="text-[11px] text-muted">{date(r.date)}</div></div> },
          { key: 'v', header: 'Machine', value: (r) => n.veh(r.vehicleId) },
          { key: 'p', header: 'Party', value: (r) => r.party },
          { key: 'per', header: 'Period', value: (r) => r.from, cell: (r) => `${date(r.from)} – ${date(r.to)}`, hideMobile: true },
          { key: 'u', header: 'Units', align: 'right', value: (r) => r.units, cell: (r) => `${num(r.units)} ${BASIS[r.basis]} × ${inr(r.rate)}` },
          { key: 't', header: 'Total with GST', align: 'right', value: (r) => total(r), cell: (r) => <b>{inr(total(r))}</b> },
          { key: 'st', header: 'Status', value: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {form && <HireOutForm onClose={() => setForm(false)} />}
      {open && <HireOutView h={db.hireOuts.find((x) => x.id === open.id) || open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function HireOutForm({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const own = db.vehicles.filter((v) => v.ownership !== 'HIRED');
  const [f, setF] = useState({ vehicleId: '', party: '', clientId: '', from: today(), to: today(), basis: 'HOUR' as HireOut['basis'], units: '' as number | '', rate: '' as number | '', gstPct: 18 as number | '', remarks: '' });
  // units from logbook days marked hired out in the period
  const logged = db.logs.filter((l) => l.vehicleId === f.vehicleId && l.hiredOut && l.date >= f.from && l.date <= f.to);
  const fromLogs = f.basis === 'HOUR' ? round(sum(logged, (l) => (l.closeHr ?? 0) - (l.openHr ?? 0)), 1) : f.basis === 'KM' ? round(sum(logged, (l) => (l.closeKm ?? 0) - (l.openKm ?? 0)), 1) : f.basis === 'DAY' ? logged.length : f.basis === 'TRIP' ? sum(logged, (l) => l.trips) : 0;
  const save = () => {
    const party = f.party || db.clients.find((c) => c.id === f.clientId)?.name || '';
    if (!f.vehicleId || !party || !f.units || !f.rate) return toast.error('Machine, party, units and rate are required');
    insert('hireOuts', { no: '', date: today(), vehicleId: f.vehicleId, party, clientId: f.clientId || undefined, from: f.from, to: f.to, basis: f.basis, units: Number(f.units), rate: Number(f.rate), gstPct: Number(f.gstPct) || 0, receipts: [], status: 'BILLED', remarks: f.remarks } as any, `Hire-out bill ${party}`, 'Hire-out');
    toast.success('Hire-out bill saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title="Hire-out bill" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save bill</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Machine" required><Combo value={f.vehicleId} onChange={(v) => setF({ ...f, vehicleId: v })} options={own.map((v) => ({ value: v.id, label: vehicleName(v), hint: v.type }))} /></Field>
        <Field label="Party (from clients)"><Select value={f.clientId} onChange={(v) => setF({ ...f, clientId: v })} placeholder="—" options={db.clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Or party name"><Input value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} /></Field>
        <Field label="Basis"><Select value={f.basis} onChange={(v) => setF({ ...f, basis: v as HireOut['basis'] })} options={Object.entries(BASIS).map(([k, v]) => ({ value: k, label: `Per ${v}` }))} /></Field>
        <Field label="From"><Input type="date" value={f.from} max={today()} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={f.to} max={today()} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Units" required hint={logged.length ? <button className="text-brand" onClick={() => setF({ ...f, units: fromLogs })}>Logbook: {num(fromLogs)} — use</button> : 'No hired-out logbook days in the period'}><NumberInput value={f.units} onChange={(v) => setF({ ...f, units: v })} /></Field>
        <Field label="Rate" required><NumberInput value={f.rate} onChange={(v) => setF({ ...f, rate: v })} prefix="₹" /></Field>
        <Field label="GST"><NumberInput value={f.gstPct} onChange={(v) => setF({ ...f, gstPct: v })} suffix="%" /></Field>
        <Field label="Remarks"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}

function HireOutView({ h, onClose }: { h: HireOut; onClose: () => void }) {
  const s = useSession();
  const n = useNames();
  const [amt, setAmt] = useState<number | ''>('');
  const [utr, setUtr] = useState('');
  const got = sum(h.receipts, (r) => r.amount);
  const taxable = h.units * h.rate;
  const print = () =>
    printDocument({
      title: 'TAX INVOICE — MACHINE HIRE',
      meta: [['Bill no.', h.no], ['Date', date(h.date)], ['Party', h.party], ['Machine', n.veh(h.vehicleId)], ['Period', `${date(h.from)} to ${date(h.to)}`]],
      table: { title: 'Hire', headers: ['Description', 'SAC', 'Units', 'Rate', 'Amount'], numeric: [2, 3, 4], rows: [[`Hire of ${n.veh(h.vehicleId)} per ${BASIS[h.basis]}`, '997313', h.units, h.rate.toFixed(2), taxable.toFixed(2)]] },
      summary: [['Taxable value', inr(taxable)], [`GST ${h.gstPct}%`, inr((taxable * h.gstPct) / 100)], ['Total', inr(total(h))]],
    });
  return (
    <Drawer open onClose={onClose} title={h.no} subtitle={h.party} footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" icon={<Printer className="w-4 h-4" />} onClick={print}>Print bill</Button></>}>
      <div className="space-y-4">
        <KV items={[['Total', inr(total(h))], ['Received', inr(got)], ['Outstanding', inr(Math.max(0, total(h) - got))], ['Status', <StatusBadge key="s" status={h.status} />]]} />
        {h.status !== 'PAID' && s.can('fleet', 'edit') && (
          <Section title="Record receipt">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount"><NumberInput value={amt} onChange={setAmt} prefix="₹" /></Field>
              <Field label="UTR / cheque"><Input value={utr} onChange={(e) => setUtr(e.target.value)} /></Field>
            </div>
            <Button className="mt-3" onClick={() => { if (!amt) return toast.error('Amount is required'); update('hireOuts', h.id, { receipts: [...h.receipts, { date: today(), amount: Number(amt), utr }] }, `Receipt ${h.no}`, 'Hire-out'); setAmt(''); setUtr(''); toast.success('Receipt recorded'); }}>Add receipt</Button>
          </Section>
        )}
        {h.receipts.map((r, i) => <div key={i} className="text-sm">{date(r.date)} · {inr(r.amount)} · {r.utr}</div>)}
      </div>
    </Drawer>
  );
}

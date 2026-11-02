import { useMemo, useState } from 'react';
import { Download, Printer, ShieldCheck } from 'lucide-react';
import { bankFile, ecrFile, esicRows, halfYearly, licences, minWageBreaches, musterRoll, wageRegister } from '@civil/domain/labourreg';
import { subconVsBilled } from '@civil/domain/ops';
import { useDB, insert, updateSettings } from '../../data/store';
import { useSession } from '../../data/session';
import type { Trade } from '../../data/types';
import { Badge, Button, Callout, Card, CardHeader, Drawer, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, NumberInput, Segmented, Select } from '../../components/ui/fields';
import { downloadXlsx, printDocument, printTable, saveBlob } from '../../lib/export';
import { date, inr, monthLabel, monthOf, num, today } from '../../lib/format';
import { sum } from '../../lib/utils';
import { useNames } from '../shared';

const TRADES: Trade[] = ['Mason', 'Helper', 'Carpenter', 'Bar Bender', 'Operator', 'Driver', 'Electrician', 'Supervisor'];

function useWorks() {
  const db = useDB();
  const s = useSession();
  return db.sites.filter((x) => s.seesSite(x.id) && !(x as any).outOfScope);
}

/* ================= LAB-02..04: muster roll, wage register, slips, bank, ECR, ESIC ================= */
export function RegistersTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const works = useWorks();
  const [siteId, setSiteId] = useState(works[0]?.id || '');
  const [month, setMonth] = useState(monthOf(today()));
  const [view0, setView] = useState<'muster' | 'wages' | 'files' | 'half'>('muster');
  const view = s.showRates ? view0 : 'muster';
  const muster = useMemo(() => musterRoll(db, siteId || undefined, month), [db, siteId, month]);
  const wages = useMemo(() => wageRegister(db, siteId || undefined, month), [db, siteId, month]);
  const work = n.lk.site[siteId];
  const firm = db.firms.find((f) => f.id === work?.firmId) || db.firms[0];
  const days = muster[0]?.days.length || new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const head = `${firm?.legalName || db.company.name} · ${work?.name || 'All works'} · ${monthLabel(month)}`;
  const year = Number(month.slice(0, 4));
  const [half, setHalf] = useState<'1' | '2'>(Number(month.slice(5, 7)) <= 6 ? '1' : '2');
  const hy = useMemo(() => (view === 'half' ? halfYearly(db, year, half === '1' ? 1 : 2) : []), [db, view, year, half]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={siteId} onChange={setSiteId} options={[{ value: '', label: 'All works' }, ...works.map((w) => ({ value: w.id, label: w.short || w.name }))]} className="w-48" />
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || monthOf(today()))} className="w-40" />
        <Segmented value={view} onChange={setView} options={[{ value: 'muster', label: 'Muster roll (Form XVI)' }, ...(s.showRates ? [{ value: 'wages' as const, label: 'Wage register (Form XVII)' }, { value: 'files' as const, label: 'Bank / EPF / ESIC files' }, { value: 'half' as const, label: 'Half-yearly return' }] : [])]} />
      </div>
      {view === 'muster' && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between p-3">
            <div className="font-semibold text-sm">Muster roll — {head}</div>
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => printTable({ title: 'Form XVI — Muster roll', subtitle: head, headers: ['Code', 'Name', 'Father', 'Trade', ...Array.from({ length: days }, (_, i) => String(i + 1)), 'P', 'H', 'A', 'OT h'], rows: muster.map((m) => [m.worker.code, m.worker.name, m.worker.fatherName || '', m.worker.trade, ...m.days, m.present, m.half, m.absent, m.otHours]) })}>Print</Button>
          </div>
          <table className="text-[11px] min-w-full">
            <thead>
              <tr className="text-muted">
                <th className="text-left px-2 py-1 sticky left-0 bg-surface">Worker</th>
                {Array.from({ length: days }, (_, i) => <th key={i} className="px-1">{i + 1}</th>)}
                <th className="px-2">P</th><th className="px-2">H</th><th className="px-2">A</th><th className="px-2">OT</th>
              </tr>
            </thead>
            <tbody>
              {muster.map((m) => (
                <tr key={m.worker.id} className="border-t border-line">
                  <td className="px-2 py-1 whitespace-nowrap sticky left-0 bg-surface">{m.worker.name}<span className="text-muted"> · {m.worker.trade}</span></td>
                  {m.days.map((d, i) => <td key={i} className={d === 'A' ? 'text-bad text-center' : d === 'H' ? 'text-warn text-center' : 'text-center'}>{d || '·'}</td>)}
                  <td className="px-2 text-center font-semibold">{m.present}</td><td className="px-2 text-center">{m.half}</td><td className="px-2 text-center">{m.absent}</td><td className="px-2 text-center">{m.otHours}</td>
                </tr>
              ))}
              {!muster.length && <tr><td className="p-6 text-muted" colSpan={days + 5}>No own workers on the rolls for this month.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {view === 'wages' && (
        <DataTable
          title={`Form XVII — Register of wages, ${head}`}
          rows={wages}
          rowKey={(r) => r.workerId}
          pageSize={50}
          toolbar={<Button icon={<Printer className="w-4 h-4" />} onClick={() => printSlips(wages, head, firm?.id)}>Wage slips</Button>}
          totals={{ basic: inr(sum(wages, (r) => r.basic)), gross: inr(sum(wages, (r) => r.gross)), pf: inr(sum(wages, (r) => r.pf)), esi: inr(sum(wages, (r) => r.esi)), net: inr(sum(wages, (r) => r.net)) }}
          columns={[
            { key: 'name', header: 'Worker', primary: true, value: (r) => r.name, cell: (r) => <div>{r.name}<div className="text-[11px] text-muted">{r.code} · {r.trade} · {inr(r.rate)}/day</div></div> },
            { key: 'days', header: 'Days', align: 'right', value: (r) => r.paidDays },
            { key: 'ot', header: 'OT h', align: 'right', value: (r) => r.otHours, hideMobile: true },
            { key: 'basic', header: 'Basic', align: 'right', value: (r) => r.basic, cell: (r) => inr(r.basic) },
            { key: 'otp', header: 'OT pay', align: 'right', value: (r) => r.otPay, cell: (r) => inr(r.otPay), hideMobile: true },
            { key: 'gross', header: 'Gross', align: 'right', value: (r) => r.gross, cell: (r) => inr(r.gross) },
            { key: 'pf', header: 'EPF 12%', align: 'right', value: (r) => r.pf, cell: (r) => inr(r.pf) },
            { key: 'esi', header: 'ESI 0.75%', align: 'right', value: (r) => r.esi, cell: (r) => inr(r.esi) },
            { key: 'adv', header: 'Advance', align: 'right', value: (r) => r.advance, cell: (r) => inr(r.advance) },
            { key: 'net', header: 'Net paid', align: 'right', value: (r) => r.net, cell: (r) => <b>{inr(r.net)}</b> },
            { key: 'er', header: 'Employer EPS / EPF / ESI', align: 'right', value: (r) => r.eps + r.erPf + r.esiEr, cell: (r) => <span className="text-[12px]">{inr(r.eps)} / {inr(r.erPf)} / {inr(r.esiEr)}</span>, hideMobile: true },
          ]}
        />
      )}
      {view === 'files' && <StatFiles siteId={siteId} month={month} head={head} />}
      {view === 'half' && (
        <DataTable
          title={`Half-yearly return data (SWAAGAT / CLRA Form XXIV) — ${half === '1' ? 'Jan–Jun' : 'Jul–Dec'} ${year}`}
          rows={hy}
          rowKey={(r) => r.siteId}
          toolbar={<Segmented value={half} onChange={setHalf} options={[{ value: '1', label: 'Jan–Jun' }, { value: '2', label: 'Jul–Dec' }]} />}
          columns={[
            { key: 'w', header: 'Work', primary: true, value: (r) => r.work },
            { key: 'd', header: 'Days worked', align: 'right', value: (r) => r.daysWorked },
            { key: 'mx', header: 'Max on any day', align: 'right', value: (r) => r.maxOnAnyDay },
            { key: 'm', header: 'Men', align: 'right', value: (r) => r.men },
            { key: 'f', header: 'Women', align: 'right', value: (r) => r.women },
            { key: 'md', header: 'Man-days', align: 'right', value: (r) => r.manDays },
            { key: 'wg', header: 'Wages paid (own)', align: 'right', value: (r) => r.wages, cell: (r) => inr(r.wages) },
          ]}
        />
      )}
    </div>
  );
}

function printSlips(rows: ReturnType<typeof wageRegister>, head: string, firmId?: string) {
  if (!rows.length) return toast.error('No workers this month');
  printDocument({
    title: 'Wage slips (Form XIX)',
    firmId,
    meta: [['Period', head]],
    table: { title: 'Slips', headers: ['Worker', 'UAN / ESIC', 'Days', 'OT h', 'Basic', 'OT', 'Gross', 'EPF', 'ESI', 'Advance', 'Net', 'Signature / thumb'], numeric: [2, 3, 4, 5, 6, 7, 8, 9, 10], rows: rows.map((r) => [`${r.name} (${r.code})`, [r.uan, r.esicNo].filter(Boolean).join(' / '), r.paidDays, r.otHours, r.basic, r.otPay, r.gross, r.pf, r.esi, r.advance, r.net, '']) },
  });
}

function StatFiles({ siteId, month, head }: { siteId: string; month: string; head: string }) {
  const db = useDB();
  const ecr = ecrFile(db, siteId || undefined, month);
  const esic = esicRows(db, siteId || undefined, month);
  const bank = bankFile(db, siteId || undefined, month);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-4 space-y-3">
        <CardHeader title="EPFO ECR 2.0" subtitle={`${ecr.lines} members · wages ${inr(ecr.totals.wages)}`} />
        <div className="text-sm space-y-1">
          <div>Employee EPF: <b>{inr(ecr.totals.pf)}</b></div>
          <div>EPS 8.33%: <b>{inr(ecr.totals.eps)}</b> · Employer EPF: <b>{inr(ecr.totals.erPf)}</b></div>
        </div>
        {ecr.errors.length > 0 && <Callout tone="warn">{ecr.errors.join('; ')}</Callout>}
        <Button icon={<Download className="w-4 h-4" />} disabled={!ecr.lines} onClick={() => saveBlob(new Blob([ecr.text], { type: 'text/plain' }), `ECR_${month}.txt`)}>Download ECR .txt</Button>
        <p className="text-xs text-muted">Upload on the EPFO unified portal → ECR upload. Format: UAN#~#name#~#gross#~#EPF wages#~#EPS wages#~#EDLI wages#~#EE#~#EPS#~#ER#~#NCP days#~#refund.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <CardHeader title="ESIC monthly contribution" subtitle={`${esic.length} insured persons`} />
        <div className="text-sm">Employee {inr(sum(esic, (r) => r.ee))} · Employer {inr(sum(esic, (r) => r.er))}</div>
        <Button icon={<Download className="w-4 h-4" />} disabled={!esic.length} onClick={() => downloadXlsx({ title: `ESIC ${month}`, headers: ['IP Number', 'IP Name', 'No of Days', 'Total Monthly Wages', 'Reason Code', 'Last Working Day'], rows: esic.map((r) => [r.ipNo, r.name, r.days, r.wages, r.reason === 'No work' ? 1 : r.reason ? 2 : 0, '']) })}>ESIC Excel</Button>
        <p className="text-xs text-muted">Matches the ESIC portal's monthly contribution upload sheet.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <CardHeader title="Bank payment file" subtitle={`${bank.rows.length} transfers · ${inr(sum(bank.rows, (r) => r.amount))}`} />
        {bank.missing.length > 0 && <Callout tone="warn">No bank account / IFSC: {bank.missing.join(', ')} — pay these by cash or UPI.</Callout>}
        <Button icon={<Download className="w-4 h-4" />} disabled={!bank.rows.length} onClick={() => downloadXlsx({ title: `Wages bank file ${month}`, subtitle: head, headers: ['Beneficiary name', 'Account no', 'IFSC', 'Amount', 'Narration'], rows: bank.rows.map((r) => [r.name, r.account, r.ifsc, r.amount, r.narration]) })}>Bank Excel</Button>
      </Card>
    </div>
  );
}

/* ================= LAB-05 / LAB-06: minimum wages and licences ================= */
export function ComplianceExtra() {
  const db = useDB();
  const s = useSession();
  const breaches = minWageBreaches(db);
  const lic = licences(db, today());
  const [mw, setMw] = useState<Record<string, number | ''>>(() => ({ ...(db.settings.minWages || {}) }));
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardHeader title="Minimum wages (Tripura notification)" subtitle="Per day, by trade. Workers paid below the rate are flagged here and in Alerts." />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {TRADES.map((t) => <Field key={t} label={t}><NumberInput value={mw[t] ?? ''} onChange={(v) => setMw({ ...mw, [t]: v })} prefix="₹" disabled={!s.isAdmin} /></Field>)}
        </div>
        {s.isAdmin && <Button className="mt-3" onClick={() => (updateSettings({ minWages: Object.fromEntries(Object.entries(mw).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) } as any, 'Minimum wages updated'), toast.success('Minimum wages saved'))}>Save minimum wages</Button>}
        {breaches.length > 0 ? <Callout tone="bad" className="mt-3">Below minimum wage: {breaches.map((b) => `${b.worker.name} (${b.worker.trade}) ₹${b.worker.wageRate} vs ₹${b.min}`).join('; ')}</Callout> : <p className="text-sm text-good mt-3">No worker is below the minimum wage.</p>}
      </Card>
      <DataTable
        title="Labour licences (own CLRA licence and contractors')"
        rows={lic}
        rowKey={(r) => r.kind + r.id}
        columns={[
          { key: 'w', header: 'Holder', primary: true, value: (r) => r.who, cell: (r) => <div>{r.who}<div className="text-[11px] text-muted">{r.kind === 'OWN' ? 'Own firm' : 'Contractor'}</div></div> },
          { key: 'n', header: 'Licence no.', value: (r) => r.no || '—' },
          { key: 'v', header: 'Valid to', value: (r) => r.validTo, cell: (r) => date(r.validTo) },
          { key: 'd', header: 'Status', value: (r) => r.days, cell: (r) => (r.days < 0 ? <Badge tone="bad">Expired</Badge> : r.days <= 30 ? <Badge tone="warn">{r.days} days</Badge> : <Badge tone="good">Valid</Badge>) },
        ]}
      />
    </div>
  );
}

/* ================= LAB-07: safety — PPE, toolbox talks, accidents ================= */
export function SafetyTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [kind, setKind] = useState<'PPE' | 'TOOLBOX' | 'ACCIDENT'>('TOOLBOX');
  const [form, setForm] = useState(false);
  const rows = db.safety.filter((r) => r.kind === kind && s.seesSite(r.siteId)).slice().reverse();
  return (
    <div className="space-y-4">
      <DataTable
        title={kind === 'PPE' ? 'PPE issue register' : kind === 'TOOLBOX' ? 'Toolbox talks' : 'Accident / near-miss register'}
        rows={rows}
        rowKey={(r) => r.id}
        toolbar={<><Segmented value={kind} onChange={setKind} options={[{ value: 'TOOLBOX', label: 'Toolbox talks' }, { value: 'PPE', label: 'PPE issue' }, { value: 'ACCIDENT', label: 'Accidents' }]} />{s.can('labour', 'add') && <Button variant="primary" icon={<ShieldCheck className="w-4 h-4" />} onClick={() => setForm(true)}>Add</Button>}</>}
        columns={[
          { key: 'd', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
          { key: 's', header: 'Work', value: (r) => n.site(r.siteId) },
          { key: 'x', header: kind === 'PPE' ? 'Item' : kind === 'TOOLBOX' ? 'Topic' : 'Person / injury', primary: true, value: (r) => r.item || r.topic || `${r.person} ${r.injury}`, cell: (r) => (kind === 'ACCIDENT' ? <div>{r.person}<div className="text-[11px] text-muted">{r.injury}</div></div> : r.item || r.topic) },
          { key: 'q', header: kind === 'PPE' ? 'Qty / to' : kind === 'TOOLBOX' ? 'Attendees' : 'Severity', value: (r) => r.qty ?? r.attendees ?? r.severity ?? '', cell: (r) => (kind === 'PPE' ? `${num(r.qty || 0)}${r.workerId ? ` · ${db.workers.find((w) => w.id === r.workerId)?.name || ''}` : ''}` : kind === 'TOOLBOX' ? num(r.attendees || 0) : <Badge tone={r.severity === 'NEAR_MISS' ? 'warn' : 'bad'}>{(r.severity || '').replace('_', ' ').toLowerCase()}</Badge>) },
          { key: 'r', header: 'Remarks / action', value: (r) => r.action || r.remarks, hideMobile: true },
        ]}
      />
      {form && <SafetyForm kind={kind} onClose={() => setForm(false)} />}
    </div>
  );
}

function SafetyForm({ kind, onClose }: { kind: 'PPE' | 'TOOLBOX' | 'ACCIDENT'; onClose: () => void }) {
  const db = useDB();
  const works = useWorks();
  const [f, setF] = useState({ siteId: works[0]?.id || '', date: today(), workerId: '', item: 'Helmet', qty: 1 as number | '', topic: '', attendees: '' as number | '', person: '', injury: '', severity: 'MINOR', action: '', reportedTo: '', remarks: '' });
  const save = () => {
    const rec: Record<string, unknown> = { kind, siteId: f.siteId, date: f.date, remarks: f.remarks };
    if (kind === 'PPE') Object.assign(rec, { item: f.item, qty: Number(f.qty) || 0, workerId: f.workerId || undefined });
    if (kind === 'TOOLBOX') Object.assign(rec, { topic: f.topic, attendees: Number(f.attendees) || 0 });
    if (kind === 'ACCIDENT') Object.assign(rec, { person: f.person, injury: f.injury, severity: f.severity, action: f.action, reportedTo: f.reportedTo, workerId: f.workerId || undefined });
    if (kind === 'TOOLBOX' && !f.topic) return toast.error('Topic is required');
    if (kind === 'ACCIDENT' && (!f.person || !f.injury)) return toast.error('Name and injury are required');
    insert('safety', rec as any, `Safety ${kind.toLowerCase()}`, 'Safety');
    toast.success('Saved');
    onClose();
  };
  const workers = db.workers.filter((w) => w.active !== false && (!f.siteId || w.siteId === f.siteId));
  return (
    <Drawer open onClose={onClose} title={kind === 'PPE' ? 'PPE issue' : kind === 'TOOLBOX' ? 'Toolbox talk' : 'Accident / near miss'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Work"><Select value={f.siteId} onChange={(v) => setF({ ...f, siteId: v })} options={works.map((w) => ({ value: w.id, label: w.short || w.name }))} /></Field>
        <Field label="Date"><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        {kind === 'PPE' && (
          <>
            <Field label="Item"><Select value={f.item} onChange={(v) => setF({ ...f, item: v })} options={['Helmet', 'Safety shoes', 'Reflective jacket', 'Gloves', 'Goggles', 'Mask', 'Ear plugs', 'Harness'].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Quantity"><NumberInput value={f.qty} onChange={(v) => setF({ ...f, qty: v })} /></Field>
            <Field label="Issued to"><Select value={f.workerId} onChange={(v) => setF({ ...f, workerId: v })} placeholder="Gang / several" options={workers.map((w) => ({ value: w.id, label: w.name }))} /></Field>
          </>
        )}
        {kind === 'TOOLBOX' && (
          <>
            <Field label="Topic" required className="sm:col-span-2"><Input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="Working near hot mix paver" /></Field>
            <Field label="Attendees"><NumberInput value={f.attendees} onChange={(v) => setF({ ...f, attendees: v })} /></Field>
          </>
        )}
        {kind === 'ACCIDENT' && (
          <>
            <Field label="Person" required><Input value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} /></Field>
            <Field label="Severity"><Select value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={[{ value: 'NEAR_MISS', label: 'Near miss' }, { value: 'MINOR', label: 'Minor' }, { value: 'MAJOR', label: 'Major' }, { value: 'FATAL', label: 'Fatal' }]} /></Field>
            <Field label="Injury / what happened" required className="sm:col-span-2"><Input value={f.injury} onChange={(e) => setF({ ...f, injury: e.target.value })} /></Field>
            <Field label="Action taken" className="sm:col-span-2"><Input value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} /></Field>
            <Field label="Reported to" hint="Inspector / ESIC / police"><Input value={f.reportedTo} onChange={(e) => setF({ ...f, reportedTo: e.target.value })} /></Field>
          </>
        )}
        <Field label="Remarks" className="sm:col-span-2"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}

/* ================= SUB-03: sub-contractor quantities against department billing ================= */
export function SubconCompare() {
  const db = useDB();
  const works = useWorks();
  const [siteId, setSiteId] = useState(works[0]?.id || '');
  const rows = useMemo(() => (siteId ? subconVsBilled(db, siteId) : []), [db, siteId]);
  return (
    <DataTable
      title="Sub-contractor quantities vs department billing"
      subtitle="Quantity billed by sub-contractors against the up-to-date quantity in the latest RA bill — more than the department paid is flagged"
      rows={rows}
      rowKey={(r) => r.boqItemId}
      rowClassName={(r) => (r.diff > 0.0005 ? 'bg-bad-soft/40' : undefined)}
      toolbar={<Select value={siteId} onChange={setSiteId} options={works.map((w) => ({ value: w.id, label: w.short || w.name }))} className="w-48" />}
      columns={[
        { key: 'i', header: 'BOQ item', primary: true, value: (r) => `${r.itemNo} ${r.description}`, cell: (r) => <div><b>{r.itemNo}</b> <span className="text-[13px]">{r.description.slice(0, 80)}</span></div> },
        { key: 'd', header: 'Billed to dept', align: 'right', value: (r) => r.billedToDept, cell: (r) => `${num(r.billedToDept, 3)} ${r.unit}` },
        { key: 's', header: 'Sub-con billed', align: 'right', value: (r) => r.subconBilled, cell: (r) => `${num(r.subconBilled, 3)} ${r.unit}` },
        { key: 'x', header: 'Difference', align: 'right', value: (r) => r.diff, cell: (r) => (r.diff > 0.0005 ? <span className="text-bad font-semibold">+{num(r.diff, 3)}</span> : <Badge tone="good">Within</Badge>) },
      ]}
    />
  );
}


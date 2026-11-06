import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Link2, Plus, Upload } from 'lucide-react';
import { billCredits, cessByWorkYear, gstr1Rows, suggestBill, taxRecon, tallyXml, tdsReturnRows, TALLY_LEDGERS } from '@civil/domain/money';
import { DEFAULT_TDS, tdsSections } from '@civil/domain/billing';
import { templateById } from '@civil/domain/imports';
import { writeXlsx } from '@civil/domain/xlsx';
import { useDB, insert, update, updateSettings } from '../../data/store';
import { useSession } from '../../data/session';
import type { TaxCredit, TdsSection } from '../../data/types';
import { Badge, Button, Callout, Card, CardHeader, Modal, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, NumberInput, Segmented, Select, Toggle } from '../../components/ui/fields';
import { date, fyCode, inr, monthLabel, today } from '../../lib/format';
import { saveBlob } from '../../lib/export';
import { useNames } from '../shared';
import { ImportDialog } from '../masters/ImportExport';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xlsx = (name: string, rows: Array<Array<string | number>>) => saveBlob(new Blob([writeXlsx([{ name: name.slice(0, 31), rows, headerRows: [0] }]) as BlobPart], { type: XLSX }), `${name}.xlsx`);
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).toISOString().slice(0, 10);
const STATES: Record<string, string> = { '16': 'Tripura', '18': 'Assam', '17': 'Meghalaya', '15': 'Mizoram', '14': 'Manipur', '13': 'Nagaland', '12': 'Arunachal Pradesh', '19': 'West Bengal' };

export function TaxTab() {
  const db = useDB();
  const s = useSession();
  const [kind, setKind] = useState<'GSTR7A' | 'AS26'>('GSTR7A');
  if (!s.showRates || !s.allSites) return <Callout>Tax reconciliation and exports are for the owner and accounts.</Callout>;
  return (
    <div className="space-y-6">
      <ReconSection kind={kind} setKind={setKind} />
      <PerWork />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Exports />
        <TdsMaster />
      </div>
      <TallySection />
      {db.raBills.length === 0 && <p className="text-xs text-muted">Figures appear here once RA bills are submitted.</p>}
    </div>
  );
}

/* ---------- BIL-09: GST TDS vs GSTR-7A, income-tax TDS vs 26AS / AIS ---------- */
function ReconSection({ kind, setKind }: { kind: 'GSTR7A' | 'AS26'; setKind: (k: 'GSTR7A' | 'AS26') => void }) {
  const db = useDB();
  const n = useNames();
  const [add, setAdd] = useState(false);
  const [imp, setImp] = useState(false);
  const months = useMemo(() => taxRecon(db, kind), [db, kind]);
  const bills = useMemo(() => billCredits(db, kind), [db, kind]);
  const credits = useMemo(() => db.taxCredits.filter((c) => c.kind === kind).slice().sort((a, b) => b.date.localeCompare(a.date)), [db, kind]);
  const label = kind === 'GSTR7A' ? 'GST TDS' : 'Income-tax TDS';
  const src = kind === 'GSTR7A' ? 'GSTR-7A' : 'Form 26AS / AIS';
  const link = (c: TaxCredit, billId: string) => update('taxCredits', c.id, { billId: billId || undefined, siteId: db.raBills.find((b) => b.id === billId)?.siteId }, `${src} credit linked to a bill`, 'Tax credit');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'GSTR7A', label: 'GST TDS ↔ GSTR-7A' }, { value: 'AS26', label: 'Income-tax TDS ↔ 26AS / AIS' }]} />
        <div className="flex-1" />
        <Button icon={<Upload className="w-4 h-4" />} onClick={() => setImp(true)}>Import credits</Button>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setAdd(true)}>Add {src} credit</Button>
      </div>
      <DataTable
        title={`${label} by month — deducted on your bills vs credited in ${src}`}
        rows={months}
        rowKey={(r) => r.month}
        empty={<div className="p-6 text-center text-sm text-muted">Nothing yet.</div>}
        columns={[
          { key: 'm', header: 'Month', primary: true, value: (r) => r.month, cell: (r) => monthLabel(r.month) },
          { key: 'bills', header: 'Bills', value: (r) => r.bills.length, cell: (r) => <span className="text-xs text-muted">{r.bills.join(', ') || '—'}</span>, hideMobile: true },
          { key: 'd', header: 'Deducted', align: 'right', value: (r) => r.deducted, cell: (r) => inr(r.deducted) },
          { key: 'c', header: 'Credited', align: 'right', value: (r) => r.credited, cell: (r) => inr(r.credited) },
          { key: 'x', header: 'Difference', align: 'right', value: (r) => r.diff, cell: (r) => (Math.abs(r.diff) < 1 ? <Badge tone="good">Matches</Badge> : <Badge tone={r.diff < 0 ? 'bad' : 'warn'}>{r.diff < 0 ? 'Short ' : 'Extra '}{inr(Math.abs(r.diff))}</Badge>) },
        ]}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DataTable
          title="By bill"
          rows={bills}
          rowKey={(r) => r.billId}
          columns={[
            { key: 'b', header: 'Bill', primary: true, value: (r) => r.billNo, cell: (r) => <div><span className="font-mono text-[12px]">{r.billNo}</span><div className="text-[11px] text-muted">{n.site(r.siteId)} · {date(r.date)}</div></div> },
            { key: 'd', header: 'Deducted', align: 'right', value: (r) => r.deducted, cell: (r) => inr(r.deducted) },
            { key: 'c', header: 'Credited', align: 'right', value: (r) => r.credited, cell: (r) => inr(r.credited) },
            { key: 'x', header: '', value: (r) => r.diff, cell: (r) => (Math.abs(r.diff) < 1 ? <Badge tone="good">OK</Badge> : <Badge tone="warn">{inr(r.diff)}</Badge>) },
          ]}
        />
        <DataTable
          title={`${src} credits`}
          rows={credits}
          rowKey={(r) => r.id}
          columns={[
            { key: 'd', header: 'Date', value: (r) => r.date, cell: (r) => date(r.date) },
            { key: 'who', header: 'Deductor', primary: true, value: (r) => r.deductor, cell: (r) => <div><div>{r.deductor || '—'}</div><div className="text-[11px] text-muted font-mono">{r.deductorId} {r.certNo && `· ${r.certNo}`}</div></div> },
            { key: 'a', header: 'Amount', align: 'right', value: (r) => r.amount, cell: (r) => inr(r.amount) },
            {
              key: 'bill', header: 'Bill', sortable: false,
              cell: (r) => {
                const sug = r.billId ? undefined : suggestBill(db, r.id);
                return (
                  <div className="flex items-center gap-1">
                    <Select className="w-40" value={r.billId || ''} onChange={(x) => link(r, x)} options={[{ value: '', label: '— not linked —' }, ...db.raBills.filter((b) => b.status !== 'DRAFT').map((b) => ({ value: b.id, label: b.no }))]} />
                    {sug && <Button size="sm" variant="ghost" icon={<Link2 className="w-3.5 h-3.5" />} onClick={() => link(r, sug.id)}>{sug.no}</Button>}
                  </div>
                );
              },
            },
          ]}
        />
      </div>
      {add && <CreditForm kind={kind} onClose={() => setAdd(false)} />}
      {imp && <ImportDialog template={templateById('tax-credits')!} onClose={() => setImp(false)} />}
    </div>
  );
}

function CreditForm({ kind, onClose }: { kind: 'GSTR7A' | 'AS26'; onClose: () => void }) {
  const db = useDB();
  const client = db.clients[0];
  const [v, setV] = useState({ date: today(), deductor: client?.offices?.[0]?.division || client?.name || '', deductorId: client?.offices?.[0]?.gstin || client?.gstin || '', base: '' as number | '', amount: '' as number | '', certNo: '' });
  const save = () => {
    if (!(Number(v.amount) > 0)) return toast.error('Amount is required');
    insert('taxCredits', { kind, ...v, base: Number(v.base) || 0, amount: Number(v.amount) } as any, `${kind === 'GSTR7A' ? 'GSTR-7A' : '26AS'} credit ${inr(Number(v.amount))}`, 'Tax credit');
    toast.success('Credit added', 'Link it to its bill in the table');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={kind === 'GSTR7A' ? 'GST TDS credit (GSTR-7A)' : 'Income-tax TDS credit (26AS / AIS)'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date of deduction"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Certificate / reference"><Input value={v.certNo} onChange={(e) => setV({ ...v, certNo: e.target.value })} /></Field>
        <Field label="Deductor" className="col-span-2"><Input value={v.deductor} onChange={(e) => setV({ ...v, deductor: e.target.value })} /></Field>
        <Field label={kind === 'GSTR7A' ? 'Deductor GSTIN' : 'Deductor TAN'}><Input value={v.deductorId} onChange={(e) => setV({ ...v, deductorId: e.target.value.toUpperCase() })} /></Field>
        <Field label={kind === 'GSTR7A' ? 'Taxable value' : 'Amount paid'}><NumberInput value={v.base} onChange={(x) => setV({ ...v, base: x })} prefix="₹" /></Field>
        <Field label="Tax credited"><NumberInput value={v.amount} onChange={(x) => setV({ ...v, amount: x })} prefix="₹" /></Field>
      </div>
    </Modal>
  );
}

/* ---------- RPT-04 / BIL-09: per work and year ---------- */
function PerWork() {
  const db = useDB();
  const n = useNames();
  const rows = useMemo(() => cessByWorkYear(db), [db]);
  return (
    <DataTable
      title="Deducted by the department — per work and financial year"
      rows={rows}
      rowKey={(r) => `${r.siteId}|${r.fy}`}
      toolbar={<Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => xlsx('Taxes per work', [['Work', 'Financial year', 'GST TDS', 'Income-tax TDS', 'Labour cess'], ...rows.map((r) => [n.site(r.siteId), r.fy, r.gstTds, r.itTds, r.cess])])}>Excel</Button>}
      columns={[
        { key: 'w', header: 'Work', primary: true, value: (r) => n.site(r.siteId) },
        { key: 'fy', header: 'Year', value: (r) => r.fy },
        { key: 'g', header: 'GST TDS', align: 'right', value: (r) => r.gstTds, cell: (r) => inr(r.gstTds) },
        { key: 'i', header: 'Income-tax TDS', align: 'right', value: (r) => r.itTds, cell: (r) => inr(r.itTds) },
        { key: 'c', header: 'Labour cess', align: 'right', value: (r) => r.cess, cell: (r) => inr(r.cess) },
      ]}
    />
  );
}

/* ---------- BIL-08 GSTR-1 and the TDS return data ---------- */
function Exports() {
  const db = useDB();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [q, setQ] = useState(() => {
    const m = Number(today().slice(5, 7));
    return m >= 4 && m <= 6 ? 'Q1' : m <= 9 && m >= 7 ? 'Q2' : m >= 10 ? 'Q3' : 'Q4';
  });
  const fy = fyCode(today());
  const qRange = (): [string, string] => {
    const y = Number(fy.slice(0, 4));
    return q === 'Q1' ? [`${y}-04-01`, `${y}-06-30`] : q === 'Q2' ? [`${y}-07-01`, `${y}-09-30`] : q === 'Q3' ? [`${y}-10-01`, `${y}-12-31`] : [`${y + 1}-01-01`, `${y + 1}-03-31`];
  };
  const gstr1 = () => {
    const rows = gstr1Rows(db, monthStart(`${month}-01`), monthEnd(`${month}-01`));
    if (!rows.length) return toast.info('No invoices in this month');
    const d = (x: string) => new Date(x).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    xlsx(`GSTR-1 B2B ${month}`, [
      ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess Amount', 'HSN/SAC'],
      ...rows.map((r) => [r.gstin, r.receiver, r.invoiceNo, d(r.date), r.value, `${r.placeOfSupply}-${STATES[r.placeOfSupply] || ''}`, r.reverseCharge, '', r.type, '', r.rate, r.taxable, r.igst, r.cgst, r.sgst, 0, r.sac]),
    ]);
  };
  const tds = () => {
    const [from, to] = qRange();
    const rows = tdsReturnRows(db, from, to);
    if (!rows.length) return toast.info('No TDS deducted in this quarter');
    xlsx(`TDS return ${fy} ${q}`, [['Date of payment', 'Voucher', 'Deductee', 'PAN', 'Section', 'Rate %', 'Amount paid / credited', 'TDS'], ...rows.map((r) => [r.date, r.voucher, r.party, r.pan, r.section, r.rate, r.amountPaid, r.tds])]);
  };
  return (
    <Card>
      <CardHeader title="Returns data" subtitle="For your CA / return filing utility" />
      <div className="px-5 pb-5 space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="GSTR-1 (B2B invoices) — month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          <Button icon={<Download className="w-4 h-4" />} onClick={gstr1}>GSTR-1 Excel</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={`TDS return (Form 140, earlier 26Q) — ${fy}`}><Select value={q} onChange={setQ} options={['Q1', 'Q2', 'Q3', 'Q4'].map((x) => ({ value: x, label: x }))} /></Field>
          <Button icon={<Download className="w-4 h-4" />} onClick={tds}>TDS return Excel</Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------- Query 2: TDS master ---------- */
function TdsMaster() {
  const db = useDB();
  const s = useSession();
  const fy = fyCode(today());
  const [sections, setSections] = useState<TdsSection[]>(() => tdsSections(db).map((x) => ({ ...x })));
  const on = db.settings.tds?.enabledFy?.[fy] ?? true;
  const save = (enabledFy = db.settings.tds?.enabledFy || {}) => updateSettings({ tds: { enabledFy, sections } }, 'TDS rules updated');
  const set = (i: number, p: Partial<TdsSection>) => setSections(sections.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Card>
      <CardHeader title="TDS on payments you make" subtitle="Applied automatically to payments to contractors and transporters" />
      <div className="px-5 pb-5 space-y-3">
        <Toggle checked={on} onChange={(x) => s.isAdmin && (save({ ...(db.settings.tds?.enabledFy || {}), [fy]: x }), toast.success(`TDS ${x ? 'on' : 'off'} for ${fy}`))} label={`Deduct TDS in ${fy}`} hint="Switch per financial year" />
        {sections.map((x, i) => (
          <div key={i} className="rounded-xl border border-line p-3 space-y-2">
            <Input value={x.label} onChange={(e) => set(i, { label: e.target.value })} disabled={!s.isAdmin} aria-label="Section" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Field label="Individual / HUF"><NumberInput value={x.rateInd} onChange={(v) => set(i, { rateInd: Number(v) || 0 })} suffix="%" disabled={!s.isAdmin} /></Field>
              <Field label="Firm / company"><NumberInput value={x.rateOther} onChange={(v) => set(i, { rateOther: Number(v) || 0 })} suffix="%" disabled={!s.isAdmin} /></Field>
              <Field label="No PAN"><NumberInput value={x.rateNoPan} onChange={(v) => set(i, { rateNoPan: Number(v) || 0 })} suffix="%" disabled={!s.isAdmin} /></Field>
              <Field label="Above per payment"><NumberInput value={x.single} onChange={(v) => set(i, { single: Number(v) || 0 })} prefix="₹" disabled={!s.isAdmin} /></Field>
              <Field label="Above per year"><NumberInput value={x.annual} onChange={(v) => set(i, { annual: Number(v) || 0 })} prefix="₹" disabled={!s.isAdmin} /></Field>
            </div>
          </div>
        ))}
        {s.isAdmin && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setSections([...sections, { code: `SEC-${sections.length + 1}`, label: 'New head (rent / professional fees …)', rateInd: 0, rateOther: 0, rateNoPan: 20, single: 0, annual: 0 }])}>Add head</Button>
            <Button size="sm" variant="ghost" onClick={() => setSections(DEFAULT_TDS.map((x) => ({ ...x })))}>Reset</Button>
            <div className="flex-1" />
            <Button size="sm" variant="primary" onClick={() => (save(), toast.success('TDS rules saved'))}>Save</Button>
          </div>
        )}
        <p className="text-[11px] text-muted">Rates as given in your requirements (s.393(1), earlier 194C). Your CA should confirm them; other heads (rent, professional fees, salary) can be added here.</p>
      </div>
    </Card>
  );
}

/* ---------- ACC-03 Tally export ---------- */
function TallySection() {
  const db = useDB();
  const s = useSession();
  const [from, setFrom] = useState(monthStart(today()));
  const [to, setTo] = useState(today());
  const [company, setCompany] = useState(db.settings.tally?.company || db.firms[0]?.legalName || '');
  const [ledgers, setLedgers] = useState<Record<string, string>>(() => ({ ...Object.fromEntries(Object.entries(TALLY_LEDGERS).map(([k, v]) => [k, v.name])), ...(db.settings.tally?.ledgers || {}) }));
  const [map, setMap] = useState(false);
  const preview = useMemo(() => tallyXml(db, from, to), [db, from, to]);
  const download = () => {
    if (!preview.count) return toast.info('No vouchers in these dates');
    saveBlob(new Blob([preview.masters], { type: 'application/xml' }), `Tally masters ${from} to ${to}.xml`);
    setTimeout(() => saveBlob(new Blob([preview.vouchers], { type: 'application/xml' }), `Tally vouchers ${from} to ${to}.xml`), 400);
    toast.success(`${preview.count} vouchers exported`, 'Import the masters file first, then the vouchers (Gateway of Tally › Import › Data)');
  };
  return (
    <Card>
      <CardHeader title="Export to TallyPrime" subtitle="RA bills (sales), department deductions (journal), receipts, purchase bills and payments" action={s.isAdmin && <Button size="sm" variant="ghost" onClick={() => setMap(true)}>Ledger names</Button>} />
      <div className="px-5 pb-5 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button variant="primary" icon={<Download className="w-4 h-4" />} onClick={download}>Download for Tally</Button>
          <Badge>{preview.count} vouchers</Badge>
          {preview.unbalanced.length > 0 && <Badge tone="bad">{preview.unbalanced.length} not balanced</Badge>}
        </div>
        <p className="text-[11px] text-muted">Two files: ledger masters (party ledgers under Sundry Debtors / Creditors, tax ledgers under Duties & Taxes) and vouchers. Set the ledger names once to match your accountant's Tally.</p>
      </div>
      <Modal open={map} onClose={() => setMap(false)} size="max-w-2xl" title="Tally company and ledger names" footer={<><Button onClick={() => setMap(false)}>Cancel</Button><Button variant="primary" onClick={() => (updateSettings({ tally: { company, ledgers } }, 'Tally ledger names'), setMap(false), toast.success('Saved'))}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Company name in Tally"><Input value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(TALLY_LEDGERS).map(([k, v]) => <Field key={k} label={`${v.name} (${v.group})`}><Input value={ledgers[k] || ''} onChange={(e) => setLedgers({ ...ledgers, [k]: e.target.value })} /></Field>)}
          </div>
          <p className="text-xs text-muted">Party ledgers use the names in Masters (clients, suppliers, sub-contractors).</p>
        </div>
      </Modal>
    </Card>
  );
}

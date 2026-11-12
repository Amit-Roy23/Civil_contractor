import React, { useMemo, useState } from 'react';
import { CircleCheck, Plus, Power, Trash2 } from 'lucide-react';
import type { Client, ClientOffice, Contact, DeductionProfile, Firm, Site } from '../../data/types';
import { WORK_STAGES, addMonths, clientDeductions, contractTaxable, currentCompletion, defaultDeductions, sdReleaseDue, stageLabel, timeAllowedMonths } from '@civil/domain/works';
import { useDB, insert, runCommand, update } from '../../data/store';
import { useSession } from '../../data/session';
import { Badge, Button, Callout, Card, Drawer, Section, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, NumberInput, Select, Textarea, Toggle } from '../../components/ui/fields';
import { date, inr, inrCompact } from '../../lib/format';
import { cn, uid } from '../../lib/utils';

/* ---------- small building blocks ---------- */
type Num = number | '';
const num = (v: Num | undefined) => (v === '' || v === undefined ? undefined : Number(v));
const G = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

/** editable list of rows (EOT log, engineers, advances …) */
function Rows<T>({ title, rows, onChange, blank, render, hint }: { title: string; rows: T[]; onChange: (r: T[]) => void; blank: () => T; render: (r: T, set: (p: Partial<T>) => void) => React.ReactNode; hint?: string }) {
  return (
    <Section title={title} action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => onChange([...rows, blank()])}>Add</Button>}>
      {hint && <p className="text-xs text-muted mb-2">{hint}</p>}
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted">None yet.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">{render(r, (p) => onChange(rows.map((x, j) => (j === i ? { ...x, ...p } : x))))}</div>
            <Button variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`} title="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DeductionsEditor({ value, onChange, disabled }: { value: DeductionProfile; onChange: (d: DeductionProfile) => void; disabled?: boolean }) {
  const set = (p: Partial<DeductionProfile>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3">
      <div className={G}>
        <Field label="GST TDS %" hint="1% CGST + 1% SGST on taxable value"><NumberInput disabled={disabled} value={value.gstTdsPct} onChange={(x) => set({ gstTdsPct: Number(x) || 0 })} suffix="%" /></Field>
        <Field label="GST TDS only when contract taxable value is above"><NumberInput disabled={disabled} value={value.gstTdsThreshold} onChange={(x) => set({ gstTdsThreshold: Number(x) || 0 })} prefix="₹" /></Field>
        <Field label="Income-tax TDS %" hint="s.393(1) (earlier 194C) — Form 131"><NumberInput disabled={disabled} value={value.itTdsPct} onChange={(x) => set({ itTdsPct: Number(x) || 0 })} suffix="%" /></Field>
        <Field label="Income-tax TDS basis"><Select disabled={disabled} value={value.itTdsOnGst ? 'with' : 'without'} onChange={(x) => set({ itTdsOnGst: x === 'with' })} options={[{ value: 'without', label: 'On value without GST' }, { value: 'with', label: 'On value with GST' }]} /></Field>
        <Field label="Labour cess %" hint="Code on Social Security 2020, s.100(1)"><NumberInput disabled={disabled} value={value.labourCessPct} onChange={(x) => set({ labourCessPct: Number(x) || 0 })} suffix="%" /></Field>
        <Field label="Labour cess basis"><Select disabled={disabled} value={value.labourCessOnGst ? 'with' : 'without'} onChange={(x) => set({ labourCessOnGst: x === 'with' })} options={[{ value: 'without', label: 'On value without GST' }, { value: 'with', label: 'On value with GST' }]} /></Field>
        <Field label="TCS %" hint="Not applicable today — kept at 0"><NumberInput disabled={disabled} value={value.tcsPct} onChange={(x) => set({ tcsPct: Number(x) || 0 })} suffix="%" /></Field>
      </div>
      <Rows
        title="Other deduction heads"
        hint="Royalty, department material, time penalty, others — as per agreement"
        rows={value.others}
        onChange={(others) => set({ others })}
        blank={() => ({ head: '', pct: 0, basis: 'GROSS' as const })}
        render={(r, s) => (
          <>
            <Input className="col-span-2" placeholder="Head" value={r.head} onChange={(e) => s({ head: e.target.value })} />
            <NumberInput value={r.pct} onChange={(x) => s({ pct: Number(x) || 0 })} suffix="%" aria-label="Percent" />
            <Select value={r.basis} onChange={(x) => s({ basis: x as any })} options={[{ value: 'GROSS', label: 'On gross bill' }, { value: 'TAXABLE', label: 'On taxable value' }, { value: 'FIXED', label: 'Fixed amount' }]} />
          </>
        )}
      />
    </div>
  );
}

const contactRows = (rows: Contact[], onChange: (r: Contact[]) => void, title: string) => (
  <Rows
    title={title}
    rows={rows}
    onChange={onChange}
    blank={() => ({ designation: 'JE', name: '', phone: '' })}
    render={(r, s) => (
      <>
        <Input placeholder="EE / AE / SDO / JE" value={r.designation} onChange={(e) => s({ designation: e.target.value })} aria-label="Designation" />
        <Input placeholder="Name" value={r.name} onChange={(e) => s({ name: e.target.value })} aria-label="Name" />
        <Input className="col-span-2" placeholder="Phone" inputMode="tel" value={r.phone} onChange={(e) => s({ phone: e.target.value })} aria-label="Phone" />
      </>
    )}
  />
);

/* ================= Works (Query 1) ================= */
export function WorksTab() {
  const db = useDB();
  const s = useSession();
  const [edit, setEdit] = useState<Partial<Site> | null>(null);
  const rows = useMemo(() => db.sites.filter((x) => !(x as any).outOfScope).slice().reverse(), [db]);
  const firmName = (id?: string) => db.firms.find((f) => f.id === id)?.code || '';
  return (
    <>
      <DataTable
        title="Works"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={s.can('masters', 'edit') ? setEdit : undefined}
        columns={[
          { key: 'name', header: 'Work', primary: true, value: (r) => r.name, cell: (r) => <div className="min-w-0"><div className="font-medium">{r.short}</div><div className="text-[11px] text-muted line-clamp-2">{r.name}</div><div className="text-[10px] text-muted font-mono mt-0.5">{r.code}</div></div> },
          { key: 'client', header: 'Client / office', value: (r) => db.clients.find((c) => c.id === r.clientId)?.name, cell: (r) => { const c = db.clients.find((x) => x.id === r.clientId); const o = c?.offices?.find((x) => x.id === r.officeId); return <div><div className="text-[13px]">{c?.name}</div>{o && <div className="text-[11px] text-muted">{o.division}</div>}</div>; } },
          ...(db.firms.length > 1 ? [{ key: 'firm', header: 'Firm', value: (r: Site) => firmName(r.firmId) }] : []),
          { key: 'cv', header: 'Contract value', align: 'right', rate: true, value: (r) => r.contractValue, cell: (r) => inrCompact(r.contractValue) },
          { key: 'due', header: 'Completion due', value: (r) => currentCompletion(r), cell: (r) => <div><div>{date(currentCompletion(r))}</div>{(r.eots || []).length > 0 && <div className="text-[11px] text-muted">{r.eots!.length} EOT</div>}</div>, hideMobile: true },
          { key: 'stage', header: 'Status', value: (r) => stageLabel(r.stage) || r.status, cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'good' : r.status === 'ON_HOLD' ? 'warn' : 'neutral'} dot>{stageLabel(r.stage) || r.status}</Badge> },
        ]}
        toolbar={s.can('masters', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({})}>Add work</Button>}
        empty={<div className="p-8 text-center text-sm text-muted">No works yet — add each work from its LOA and agreement, or import them from Excel (Masters › Import &amp; export).</div>}
      />
      {edit && <WorkForm rec={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

const ZERO = { MATERIAL: 0, LABOUR: 0, STAFF: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 };
const emptyGuarantee = () => ({ amount: 0, mode: '' as const, bank: '', number: '', issueDate: '', validity: '', claimDate: '' });

export function WorkForm({ rec, onClose }: { rec: Partial<Site>; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const isNew = !rec.id;
  const [v, setV] = useState<any>(() => ({
    status: 'ACTIVE', stage: 'IN_PROGRESS', gstPct: 18, retentionPct: 0, workType: 'ROAD', budget: ZERO, openingCost: ZERO, openingAsOf: '', contractValue: 0,
    firmId: db.firms[0]?.id, clientId: db.clients.length === 1 ? db.clients[0]!.id : '', eots: [], clientEngineers: [], advances: [], milestones: [],
    emd: { ...emptyGuarantee(), refundDate: '' }, perfSecurity: { ...emptyGuarantee(), pct: 0 }, addlPerfSecurity: emptyGuarantee(),
    priceAdjustment: { applicable: false, baseDate: '', components: [] }, tender: { nitNo: '', nitDate: '', tenderId: '' },
    ...JSON.parse(JSON.stringify(rec)),
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Record<string, unknown>) => setV((o: any) => ({ ...o, ...p }));
  const sub = (k: string, p: Record<string, unknown>) => setV((o: any) => ({ ...o, [k]: { ...o[k], ...p } }));
  const client: Client | undefined = db.clients.find((c) => c.id === v.clientId);
  const deductions: DeductionProfile = v.deductions || clientDeductions(client);
  const quotedValue = v.estimatedCost && v.quoteType && v.quoteType !== 'ITEM_RATE' ? v.estimatedCost * (1 + ((v.quoteType === 'BELOW' ? -1 : v.quoteType === 'ABOVE' ? 1 : 0) * (v.quotedPct || 0)) / 100) : 0;
  const enlist = db.firms.find((f) => f.id === v.firmId)?.enlistment;
  const plantForBitumen = db.plants.find((p) => p.type === 'HOT_MIX');

  const pickClient = (id: string) => {
    const c = db.clients.find((x) => x.id === id);
    set({ clientId: id, officeId: c?.offices?.length === 1 ? c.offices[0]!.id : undefined, deductions: clientDeductions(c), retentionPct: v.retentionPct || c?.retentionPct || 0 });
  };
  const pickOffice = (id: string) => {
    const o = client?.offices?.find((x) => x.id === id);
    set({ officeId: id || undefined, clientEngineers: v.clientEngineers?.length ? v.clientEngineers : (o?.contacts || []).map((c) => ({ ...c })) });
  };

  const save = async () => {
    if (!String(v.name || '').trim()) return toast.error('Name of work is required');
    if (!v.clientId) return toast.error('Choose the client');
    if (!(v.contractValue > 0)) return toast.error('Contract value is required');
    if (v.chainageFrom !== undefined && v.chainageTo !== undefined && v.chainageTo < v.chainageFrom) return toast.error('Chainage "to" is before "from"');
    const out: Record<string, unknown> = { ...v, deductions };
    for (const k of ['estimatedCost', 'quotedPct', 'chainageFrom', 'chainageTo', 'lengthKm', 'sdCeiling', 'dlpMonths', 'openingWorkDone', 'openingBilled', 'openingReceived', 'timeAllowedMonths']) out[k] = num(out[k] as Num);
    for (const k of ['actualCompletion', 'agreementDate']) if (!out[k]) delete out[k];
    if (!out.engineerId) delete out.engineerId;
    if (!out.plantId) delete out.plantId;
    if (!out.officeId) delete out.officeId;
    out.eots = (v.eots || []).filter((e: any) => e.letterNo || e.newCompletion);
    out.clientEngineers = (v.clientEngineers || []).filter((e: Contact) => e.name || e.phone);
    out.milestones = (v.milestones || []).filter((m: any) => m.date);
    out.advances = (v.advances || []).filter((a: any) => a.amount > 0);
    delete out.outOfScope;
    setBusy(true);
    try {
      if (isNew) {
        const r = await runCommand({ kind: 'insert', coll: 'sites', rec: out }, `Work ${v.short || v.name}`);
        toast.success('Work added', `${r?.code || ''} — its site store was created`);
      } else {
        const { id, createdAt, createdBy, ...patch } = out as any;
        update('sites', rec.id!, patch, `Work ${v.short || v.name} updated`, 'Work');
        toast.success('Saved');
      }
      onClose();
    } catch (e) {
      toast.error('Not saved', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const g = (k: 'emd' | 'perfSecurity' | 'addlPerfSecurity', extra?: React.ReactNode) => (
    <div className={G}>
      {extra}
      <Field label="Amount"><NumberInput value={v[k].amount || ''} onChange={(x) => sub(k, { amount: Number(x) || 0 })} prefix="₹" /></Field>
      <Field label="Mode"><Select value={v[k].mode} onChange={(x) => sub(k, { mode: x })} options={[{ value: '', label: '—' }, { value: 'BG', label: 'Bank guarantee' }, { value: 'FDR', label: 'FDR' }, { value: 'EBG', label: 'e-BG' }, { value: 'ONLINE', label: 'Online' }, { value: 'EXEMPTED', label: 'Exempted' }]} /></Field>
      <Field label="Bank"><Input value={v[k].bank} onChange={(e) => sub(k, { bank: e.target.value })} /></Field>
      <Field label="BG / FDR / receipt no."><Input value={v[k].number} onChange={(e) => sub(k, { number: e.target.value })} /></Field>
      <Field label="Issue date"><Input type="date" value={v[k].issueDate} onChange={(e) => sub(k, { issueDate: e.target.value })} /></Field>
      <Field label="Valid up to"><Input type="date" value={v[k].validity} onChange={(e) => sub(k, { validity: e.target.value })} /></Field>
      <Field label="Claim date"><Input type="date" value={v[k].claimDate} onChange={(e) => sub(k, { claimDate: e.target.value })} /></Field>
    </div>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-3xl"
      title={isNew ? 'Add work' : v.short || v.name}
      subtitle={isNew ? 'From the LOA and agreement — the work code is given automatically' : v.code}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button>
        </>
      }
    >
      <div className="space-y-7">
        <Section title="Work">
          <div className={G}>
            <Field label="Name of work" required className="sm:col-span-2" hint="Exactly as in the agreement"><Textarea value={v.name || ''} onChange={(e) => set({ name: e.target.value })} rows={2} /></Field>
            <Field label="Short name" hint="Shown on phone screens"><Input value={v.short || ''} onChange={(e) => set({ short: e.target.value })} maxLength={40} /></Field>
            <Field label="Work code" hint={isNew ? 'Leave blank for automatic, e.g. SD/2026-27/001' : undefined}><Input value={v.code || ''} onChange={(e) => set({ code: e.target.value })} placeholder="Automatic" /></Field>
            {db.firms.length > 1 && <Field label="Executing firm" required><Select value={v.firmId || ''} onChange={(x) => set({ firmId: x })} options={db.firms.map((f) => ({ value: f.id, label: f.legalName }))} /></Field>}
            <Field label="Client" required><Select value={v.clientId} onChange={pickClient} placeholder="Choose" options={db.clients.filter((c) => c.active !== false).map((c) => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Office (circle / division / sub-division)"><Select value={v.officeId || ''} onChange={pickOffice} options={[{ value: '', label: '—' }, ...(client?.offices || []).map((o) => ({ value: o.id, label: [o.division, o.subDivision, o.circle].filter(Boolean).join(' · ') || 'Office' }))]} /></Field>
            <Field label="Type of work"><Select value={v.workType} onChange={(x) => set({ workType: x })} options={[{ value: 'ROAD', label: 'Road' }, { value: 'BRIDGE', label: 'Bridge' }, { value: 'BUILDING', label: 'Building' }, { value: 'IRRIGATION', label: 'Irrigation' }]} /></Field>
            <Field label="Status"><Select value={v.stage || 'IN_PROGRESS'} onChange={(x) => set({ stage: x })} options={WORK_STAGES} /></Field>
          </div>
        </Section>

        <Section title="Tender, LOA and agreement">
          <div className={G}>
            <Field label="NIT / DNIT no."><Input value={v.tender.nitNo} onChange={(e) => sub('tender', { nitNo: e.target.value })} placeholder="18/SE(I)/PWD(R&B)/KGT/2026-27" /></Field>
            <Field label="NIT date"><Input type="date" value={v.tender.nitDate} onChange={(e) => sub('tender', { nitDate: e.target.value })} /></Field>
            <Field label="Tender ID" hint="tripuratenders.gov.in"><Input value={v.tender.tenderId} onChange={(e) => sub('tender', { tenderId: e.target.value })} /></Field>
            <Field label="Work order / LOA no."><Input value={v.workOrderNo || ''} onChange={(e) => set({ workOrderNo: e.target.value })} /></Field>
            <Field label="LOA date"><Input type="date" value={v.workOrderDate || ''} onChange={(e) => set({ workOrderDate: e.target.value })} /></Field>
            <Field label="Agreement no."><Input value={v.agreementNo || ''} onChange={(e) => set({ agreementNo: e.target.value })} /></Field>
            <Field label="Agreement date"><Input type="date" value={v.agreementDate || ''} onChange={(e) => set({ agreementDate: e.target.value })} /></Field>
            <Field label="Estimated cost put to tender"><NumberInput value={v.estimatedCost ?? ''} onChange={(x) => set({ estimatedCost: x })} prefix="₹" /></Field>
            <Field label="Quoted rate"><Select value={v.quoteType || ''} onChange={(x) => set({ quoteType: x || undefined })} options={[{ value: '', label: '—' }, { value: 'ABOVE', label: '% above estimate' }, { value: 'BELOW', label: '% below estimate' }, { value: 'PAR', label: 'At par' }, { value: 'ITEM_RATE', label: 'Item rate' }]} /></Field>
            {(v.quoteType === 'ABOVE' || v.quoteType === 'BELOW') && <Field label="Quoted %"><NumberInput value={v.quotedPct ?? ''} onChange={(x) => set({ quotedPct: x })} suffix="%" /></Field>}
            <Field label="Contract value" required hint={quotedValue ? `Estimate at quoted rate: ${inr(Math.round(quotedValue))}` : undefined}><NumberInput value={v.contractValue || ''} onChange={(x) => set({ contractValue: Number(x) || 0 })} prefix="₹" /></Field>
            <Field label="GST %" hint="18% for works contracts"><NumberInput value={v.gstPct} onChange={(x) => set({ gstPct: Number(x) || 0 })} suffix="%" /></Field>
            <div className="sm:col-span-2"><Toggle checked={!!v.gstIncluded} onChange={(x) => set({ gstIncluded: x })} label="Contract value includes GST" hint={v.gstIncluded ? `Taxable value ${inr(Math.round(contractTaxable(v)))}` : 'GST is extra on each bill'} /></div>
          </div>
          {enlist?.limit && v.contractValue > enlist.limit ? <Callout tone="warn" className="mt-3">Contract value is above the firm's enlistment limit ({enlist.cls}, up to {inrCompact(enlist.limit)}).</Callout> : null}
        </Section>

        <Section title="Location">
          <div className={G}>
            <Field label="District"><Input value={v.district || ''} onChange={(e) => set({ district: e.target.value })} /></Field>
            <Field label="Sub-division"><Input value={v.subDivision || ''} onChange={(e) => set({ subDivision: e.target.value })} /></Field>
            <Field label="Block / village"><Input value={v.block || ''} onChange={(e) => set({ block: e.target.value })} /></Field>
            <Field label="GPS pin" hint="lat, long"><Input value={v.gps || ''} onChange={(e) => set({ gps: e.target.value })} /></Field>
            <Field label="Chainage from (km)"><NumberInput value={v.chainageFrom ?? ''} onChange={(x) => set({ chainageFrom: x, lengthKm: x !== '' && v.chainageTo !== undefined && v.chainageTo !== '' ? Math.round((Number(v.chainageTo) - Number(x)) * 1000) / 1000 : v.lengthKm })} /></Field>
            <Field label="Chainage to (km)"><NumberInput value={v.chainageTo ?? ''} onChange={(x) => set({ chainageTo: x, lengthKm: x !== '' && v.chainageFrom !== undefined && v.chainageFrom !== '' ? Math.round((Number(x) - Number(v.chainageFrom)) * 1000) / 1000 : v.lengthKm })} /></Field>
            <Field label="Length (km)"><NumberInput value={v.lengthKm ?? ''} onChange={(x) => set({ lengthKm: x })} /></Field>
            <Field label="Location description"><Input value={v.location || ''} onChange={(e) => set({ location: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Dates">
          <div className={G}>
            <Field label="Date of start (as per work order)"><Input type="date" value={v.startDate || ''} onChange={(e) => set({ startDate: e.target.value, timeAllowedMonths: timeAllowedMonths({ startDate: e.target.value, scheduledCompletion: v.scheduledCompletion }) || v.timeAllowedMonths })} /></Field>
            <Field label="Time allowed (months)"><NumberInput value={v.timeAllowedMonths ?? ''} onChange={(x) => set({ timeAllowedMonths: x, scheduledCompletion: x && v.startDate ? addMonths(v.startDate, Number(x)) : v.scheduledCompletion })} /></Field>
            <Field label="Stipulated completion"><Input type="date" value={v.scheduledCompletion || ''} onChange={(e) => set({ scheduledCompletion: e.target.value, timeAllowedMonths: timeAllowedMonths({ startDate: v.startDate, scheduledCompletion: e.target.value }) || v.timeAllowedMonths })} /></Field>
            <Field label="Actual completion"><Input type="date" value={v.actualCompletion || ''} onChange={(e) => set({ actualCompletion: e.target.value })} /></Field>
          </div>
          <div className="mt-3">
            <Rows
              title="Extensions of time"
              hint={(v.eots || []).length ? `Completion now due ${date(currentCompletion(v))}` : 'Each EOT letter with its new completion date'}
              rows={v.eots}
              onChange={(eots) => set({ eots })}
              blank={() => ({ letterNo: '', date: '', newCompletion: '', reason: '' })}
              render={(r: any, s) => (
                <>
                  <Input placeholder="Letter no." value={r.letterNo} onChange={(e) => s({ letterNo: e.target.value })} aria-label="Letter no." />
                  <Input type="date" value={r.date} onChange={(e) => s({ date: e.target.value })} aria-label="Letter date" />
                  <Input type="date" value={r.newCompletion} onChange={(e) => s({ newCompletion: e.target.value })} aria-label="New completion date" />
                  <Input placeholder="Reason" value={r.reason} onChange={(e) => s({ reason: e.target.value })} aria-label="Reason" />
                </>
              )}
            />
          </div>
        </Section>

        <Section title="Engineers">
          {contactRows(v.clientEngineers, (clientEngineers) => set({ clientEngineers }), "Client's engineers (EE, AE / SDO, JE)")}
          <div className={cn(G, 'mt-3')}>
            <Field label="Our site engineer"><Select value={v.engineerId || ''} onChange={(x) => set({ engineerId: x || undefined })} options={[{ value: '', label: '—' }, ...db.users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))]} /></Field>
            <Field label="Our supervisor"><Input value={v.supervisorName || ''} onChange={(e) => set({ supervisorName: e.target.value })} /></Field>
          </div>
        </Section>

        {s.showRates && (
          <>
            <Section title="EMD">
              {g('emd')}
              <div className={cn(G, 'mt-3')}><Field label="Refund date"><Input type="date" value={v.emd.refundDate} onChange={(e) => sub('emd', { refundDate: e.target.value })} /></Field></div>
            </Section>
            <Section title="Performance security">
              {g('perfSecurity', <Field label="% of contract value"><NumberInput value={v.perfSecurity.pct || ''} onChange={(x) => sub('perfSecurity', { pct: Number(x) || 0, amount: Math.round(((Number(x) || 0) * (v.contractValue || 0)) / 100) })} suffix="%" /></Field>)}
            </Section>
            <Section title="Additional performance security">
              <p className="text-xs text-muted mb-2">Required when the bid is below the estimate.</p>
              {g('addlPerfSecurity')}
            </Section>
            <Section title="Security deposit / retention">
              <div className={G}>
                <Field label="% deducted from each RA bill"><NumberInput value={v.retentionPct} onChange={(x) => set({ retentionPct: Number(x) || 0 })} suffix="%" /></Field>
                <Field label="Ceiling (if any)"><NumberInput value={v.sdCeiling ?? ''} onChange={(x) => set({ sdCeiling: x })} prefix="₹" /></Field>
                <Field label="Defect liability period (months)"><NumberInput value={v.dlpMonths ?? ''} onChange={(x) => set({ dlpMonths: x })} /></Field>
                <Field label="Security release due"><Input disabled value={sdReleaseDue(v) ? date(sdReleaseDue(v)) : 'After actual completion'} /></Field>
              </div>
            </Section>
            <Section title="Deductions by the client" action={client && <Button size="sm" variant="ghost" onClick={() => set({ deductions: clientDeductions(client) })}>Copy from client</Button>}>
              <DeductionsEditor value={deductions} onChange={(d) => set({ deductions: d })} />
            </Section>
            <Rows
              title="Advances"
              rows={v.advances}
              onChange={(advances) => set({ advances })}
              blank={() => ({ kind: 'MOBILISATION', amount: 0, interestPct: 0, recoveryPct: 0 })}
              render={(r: any, s) => (
                <>
                  <Select value={r.kind} onChange={(x) => s({ kind: x })} options={[{ value: 'MOBILISATION', label: 'Mobilisation' }, { value: 'MACHINERY', label: 'Machinery' }, { value: 'SECURED', label: 'Secured' }]} />
                  <NumberInput value={r.amount || ''} onChange={(x) => s({ amount: Number(x) || 0 })} prefix="₹" aria-label="Amount" />
                  <NumberInput value={r.interestPct} onChange={(x) => s({ interestPct: Number(x) || 0 })} suffix="% int." aria-label="Interest %" />
                  <NumberInput value={r.recoveryPct} onChange={(x) => s({ recoveryPct: Number(x) || 0 })} suffix="% / bill" aria-label="Recovery % per bill" />
                </>
              )}
            />
            <Section title="Price adjustment">
              <Toggle checked={!!v.priceAdjustment.applicable} onChange={(x) => sub('priceAdjustment', { applicable: x })} label="Price adjustment applies" />
              {v.priceAdjustment.applicable && (
                <div className="mt-3 space-y-3">
                  <div className={G}><Field label="Base date"><Input type="date" value={v.priceAdjustment.baseDate} onChange={(e) => sub('priceAdjustment', { baseDate: e.target.value })} /></Field></div>
                  <Rows
                    title="Components"
                    rows={v.priceAdjustment.components}
                    onChange={(components) => sub('priceAdjustment', { components })}
                    blank={() => ({ name: 'Bitumen', basePrice: 0, unit: 'MT', sharePct: 0 })}
                    render={(r: any, s) => (
                      <>
                        <Select value={r.name} onChange={(x) => s({ name: x })} options={['Bitumen', 'Cement', 'Steel', 'Fuel', 'Labour', 'Other'].map((x) => ({ value: x, label: x }))} />
                        <NumberInput value={r.basePrice || ''} onChange={(x) => s({ basePrice: Number(x) || 0 })} prefix="₹" aria-label="Base price" />
                        <Input value={r.unit} onChange={(e) => s({ unit: e.target.value })} placeholder="Unit" aria-label="Unit" />
                        <NumberInput value={r.sharePct || ''} onChange={(x) => s({ sharePct: Number(x) || 0 })} suffix="% share" aria-label="Share %" />
                      </>
                    )}
                  />
                </div>
              )}
            </Section>
          </>
        )}

        <Section title="Time penalty and milestones">
          <div className={G}>
            <Field label="Liquidated damages rate %"><NumberInput value={v.ld?.ratePct ?? ''} onChange={(x) => set({ ld: x === '' ? undefined : { per: 'WEEK', maxPct: 10, ...v.ld, ratePct: Number(x) } })} suffix="%" /></Field>
            <Field label="Per"><Select value={v.ld?.per || 'WEEK'} onChange={(x) => set({ ld: { ratePct: 0, maxPct: 10, ...v.ld, per: x } })} options={[{ value: 'DAY', label: 'Day of delay' }, { value: 'WEEK', label: 'Week of delay' }, { value: 'MONTH', label: 'Month of delay' }]} /></Field>
            <Field label="Maximum %"><NumberInput value={v.ld?.maxPct ?? ''} onChange={(x) => set({ ld: { ratePct: 0, per: 'WEEK', ...v.ld, maxPct: Number(x) || 0 } })} suffix="%" /></Field>
          </div>
          <div className="mt-3">
            <Rows
              title="Milestones"
              rows={v.milestones}
              onChange={(milestones) => set({ milestones })}
              blank={() => ({ date: '', targetPct: 0, label: '' })}
              render={(r: any, s) => (
                <>
                  <Input type="date" value={r.date} onChange={(e) => s({ date: e.target.value })} aria-label="Milestone date" />
                  <NumberInput value={r.targetPct || ''} onChange={(x) => s({ targetPct: Number(x) || 0 })} suffix="% progress" aria-label="Target %" />
                  <Input className="col-span-2" value={r.label} onChange={(e) => s({ label: e.target.value })} placeholder="Description" aria-label="Description" />
                </>
              )}
            />
          </div>
        </Section>

        <Section title="Store and plant">
          <div className={G}>
            <Field label="Site store" hint="Created automatically with the work"><Input disabled value={db.stores.find((x) => x.siteId === v.id)?.name || `Site Store — ${v.short || 'new work'}`} /></Field>
            <Field label="Hot mix plant" hint="Link when the BOQ has bituminous items"><Select value={v.plantId || ''} onChange={(x) => set({ plantId: x || undefined })} options={[{ value: '', label: '—' }, ...db.plants.map((p) => ({ value: p.id, label: p.name }))]} /></Field>
          </div>
          {!v.plantId && plantForBitumen && v.workType === 'ROAD' && <p className="text-xs text-muted mt-2">Road work: link {plantForBitumen.name} if bituminous layers are in the BOQ, so hot mix dispatches are charged here.</p>}
        </Section>

        {s.showRates && (
          <Section title="Running work: figures up to go-live">
            <p className="text-xs text-muted mb-2">For works already in progress when you start using WCM.</p>
            <div className={G}>
              <Field label="Go-live date"><Input type="date" value={v.openingAsOf || ''} onChange={(e) => set({ openingAsOf: e.target.value })} /></Field>
              <Field label="Value of work done"><NumberInput value={v.openingWorkDone ?? ''} onChange={(x) => set({ openingWorkDone: x })} prefix="₹" /></Field>
              <Field label="Billed (gross)"><NumberInput value={v.openingBilled ?? ''} onChange={(x) => set({ openingBilled: x })} prefix="₹" /></Field>
              <Field label="Received"><NumberInput value={v.openingReceived ?? ''} onChange={(x) => set({ openingReceived: x })} prefix="₹" /></Field>
              {(['MATERIAL', 'LABOUR', 'STAFF', 'SUBCONTRACT', 'VEHICLE', 'MISC', 'OVERHEAD'] as const).map((h) => (
                <Field key={h} label={`Cost so far — ${({ MATERIAL: 'material', LABOUR: 'labour', STAFF: 'staff salary', SUBCONTRACT: 'sub-contract', VEHICLE: 'machinery', MISC: 'site expenses', OVERHEAD: 'overhead' })[h]}`}>
                  <NumberInput value={v.openingCost?.[h] || ''} onChange={(x) => set({ openingCost: { ...ZERO, ...v.openingCost, [h]: Number(x) || 0 } })} prefix="₹" />
                </Field>
              ))}
            </div>
          </Section>
        )}
        <p className="text-[11px] text-muted">Document files (LOA, agreement, BOQ, drawings, guarantees) will be attached here once the document vault is added.</p>
      </div>
    </Drawer>
  );
}

/* ================= Firms (Query 2, PF-04) ================= */
export function FirmsTab() {
  const db = useDB();
  const s = useSession();
  const [edit, setEdit] = useState<Partial<Firm> | null>(null);
  return (
    <>
      <Callout className="mb-4">Each firm has its own GSTIN, letterhead and numbering. Works and the plant are booked to a firm; you can add another firm later (company or partnership).</Callout>
      <div className="flex justify-end mb-3">{s.isAdmin && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({})}>Add firm</Button>}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {db.firms.map((f) => (
          <Card key={f.id} hover className="p-5 cursor-pointer" onClick={() => s.isAdmin && setEdit(f)}>
            <div className="flex items-start gap-3">
              {f.logo ? <img src={f.logo} alt="" className="w-12 h-12 rounded-xl object-contain bg-white border border-line" /> : <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white font-bold flex items-center justify-center">{f.code}</div>}
              <div className="min-w-0">
                <div className="font-semibold">{f.legalName}</div>
                {f.tradeName && f.tradeName !== f.legalName && <div className="text-xs text-fg-2">{f.tradeName}</div>}
                <div className="text-xs text-muted mt-1">GSTIN {f.gstin || '—'} · PAN {f.pan || '—'}</div>
                {f.enlistment.no && <div className="text-xs text-muted">{f.enlistment.dept} {f.enlistment.cls} · {f.enlistment.no}{f.enlistment.validTo ? ` · valid to ${date(f.enlistment.validTo)}` : ''}</div>}
              </div>
              {f.active === false && <Badge className="ml-auto">Inactive</Badge>}
            </div>
          </Card>
        ))}
        {!db.firms.length && <Card className="p-6 text-sm text-muted">No firm yet — add your firm's details.</Card>}
      </div>
      {edit && <FirmForm rec={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 280 * 1024) return reject(new Error('Image is larger than 280 KB — use a smaller PNG or JPEG'));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the image'));
    r.readAsDataURL(file);
  });
}
function ImagePick({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <Field label={label} hint="PNG or JPEG, up to 280 KB">
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt={label} className="h-14 max-w-[160px] object-contain rounded-lg border border-line bg-white" /> : <div className="h-14 w-24 rounded-lg border-2 border-dashed border-line" />}
        <label className="text-sm text-brand cursor-pointer">
          {value ? 'Change' : 'Choose'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) readImage(f).then(onChange, (x) => toast.error(x.message)); }} />
        </label>
        {value && <button type="button" className="text-sm text-muted" onClick={() => onChange(undefined)}>Remove</button>}
      </div>
    </Field>
  );
}

function FirmForm({ rec, onClose }: { rec: Partial<Firm>; onClose: () => void }) {
  const isNew = !rec.id;
  const [v, setV] = useState<any>(() => ({
    code: '', legalName: '', tradeName: '', constitution: 'PROPRIETOR', gstin: '', pan: '', tan: '', udyam: '', address: '', places: [], contactName: '', phone: '', email: '', epfCode: '', esicCode: '', banks: [], invoicePrefix: '',
    enlistment: { dept: '', no: '', cls: '', limit: 0, validTo: '' }, labourLicence: { no: '', authority: '', validTo: '', note: '' }, ...JSON.parse(JSON.stringify(rec)),
  }));
  const set = (p: Record<string, unknown>) => setV((o: any) => ({ ...o, ...p }));
  const sub = (k: string, p: Record<string, unknown>) => setV((o: any) => ({ ...o, [k]: { ...o[k], ...p } }));
  const save = () => {
    if (!v.code || !v.legalName) return toast.error('Code and legal name are required');
    const out = { ...v, gstin: v.gstin.toUpperCase().trim(), pan: v.pan.toUpperCase().trim(), code: v.code.toUpperCase().trim() };
    if (isNew) insert('firms', out, `Firm ${out.legalName} added`, 'Firm');
    else {
      const { id, createdAt, createdBy, ...patch } = out;
      update('firms', rec.id!, patch, `Firm ${out.legalName} updated`, 'Firm');
    }
    toast.success('Firm saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} width="max-w-2xl" title={isNew ? 'Add firm' : v.legalName} subtitle="Company profile — letterhead, GSTIN and numbering" footer={<>{!isNew && <Button variant="ghost" className="mr-auto" icon={<Power className="w-4 h-4" />} onClick={() => (update('firms', rec.id!, { active: rec.active === false }, `Firm ${v.legalName} ${rec.active === false ? 'reactivated' : 'deactivated'}`, 'Firm', undefined, 'DEACTIVATE'), onClose())}>{rec.active === false ? 'Reactivate' : 'Deactivate'}</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-7">
        <Section title="Firm">
          <div className={G}>
            <Field label="Legal name" required className="sm:col-span-2"><Input value={v.legalName} onChange={(e) => set({ legalName: e.target.value })} /></Field>
            <Field label="Trade name" hint="e.g. name used for the hot mix plant"><Input value={v.tradeName} onChange={(e) => set({ tradeName: e.target.value })} /></Field>
            <Field label="Short code" required hint="Used in numbers, e.g. SD/2026-27/001"><Input value={v.code} onChange={(e) => set({ code: e.target.value })} maxLength={10} /></Field>
            <Field label="Constitution"><Select value={v.constitution} onChange={(x) => set({ constitution: x })} options={[{ value: 'PROPRIETOR', label: 'Sole proprietor' }, { value: 'PARTNERSHIP', label: 'Partnership' }, { value: 'LLP', label: 'LLP' }, { value: 'COMPANY', label: 'Company' }]} /></Field>
            <Field label="Invoice number series" hint={`e.g. SD/INV → SD/INV/2026-27/0001`}><Input value={v.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value })} /></Field>
          </div>
        </Section>
        <Section title="Registrations">
          <div className={G}>
            <Field label="GSTIN"><Input value={v.gstin} onChange={(e) => set({ gstin: e.target.value })} maxLength={15} /></Field>
            <Field label="GST registration"><Input value={v.gstRegType || ''} onChange={(e) => set({ gstRegType: e.target.value })} placeholder="Regular — Tripura" /></Field>
            <Field label="GST liable from"><Input type="date" value={v.gstLiableFrom || ''} onChange={(e) => set({ gstLiableFrom: e.target.value })} /></Field>
            <Field label="PAN"><Input value={v.pan} onChange={(e) => set({ pan: e.target.value })} maxLength={10} /></Field>
            <Field label="TAN"><Input value={v.tan} onChange={(e) => set({ tan: e.target.value })} maxLength={10} /></Field>
            <Field label="Udyam registration"><Input value={v.udyam} onChange={(e) => set({ udyam: e.target.value })} /></Field>
            <Field label="EPF code"><Input value={v.epfCode} onChange={(e) => set({ epfCode: e.target.value })} /></Field>
            <Field label="ESIC code"><Input value={v.esicCode} onChange={(e) => set({ esicCode: e.target.value })} /></Field>
          </div>
        </Section>
        <Section title="Enlistment">
          <div className={G}>
            <Field label="Department"><Input value={v.enlistment.dept} onChange={(e) => sub('enlistment', { dept: e.target.value })} placeholder="PWD (R&B), Government of Tripura" /></Field>
            <Field label="Enlistment no."><Input value={v.enlistment.no} onChange={(e) => sub('enlistment', { no: e.target.value })} /></Field>
            <Field label="Class"><Input value={v.enlistment.cls} onChange={(e) => sub('enlistment', { cls: e.target.value })} placeholder="Class-III" /></Field>
            <Field label="Works up to"><NumberInput value={v.enlistment.limit || ''} onChange={(x) => sub('enlistment', { limit: Number(x) || 0 })} prefix="₹" /></Field>
            <Field label="Valid to"><Input type="date" value={v.enlistment.validTo} onChange={(e) => sub('enlistment', { validTo: e.target.value })} /></Field>
          </div>
        </Section>
        <Section title="Labour licence">
          <div className={G}>
            <Field label="Licence no."><Input value={v.labourLicence.no} onChange={(e) => sub('labourLicence', { no: e.target.value })} /></Field>
            <Field label="Issued by"><Input value={v.labourLicence.authority} onChange={(e) => sub('labourLicence', { authority: e.target.value })} /></Field>
            <Field label="Valid to"><Input type="date" value={v.labourLicence.validTo} onChange={(e) => sub('labourLicence', { validTo: e.target.value })} /></Field>
            <Field label="Note"><Input value={v.labourLicence.note} onChange={(e) => sub('labourLicence', { note: e.target.value })} /></Field>
          </div>
        </Section>
        <Section title="Address and contact">
          <div className={G}>
            <Field label="Principal place of business" className="sm:col-span-2"><Textarea rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            <Field label="Billing contact"><Input value={v.contactName} onChange={(e) => set({ contactName: e.target.value })} /></Field>
            <Field label="Phone"><Input value={v.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Email"><Input value={v.email} onChange={(e) => set({ email: e.target.value })} type="email" /></Field>
          </div>
          <div className="mt-3">
            <Rows title="Additional places of business (GST)" rows={v.places} onChange={(places) => set({ places })} blank={() => ({ name: '', address: '' })} render={(r: any, s) => (<><Input placeholder="Name" value={r.name} onChange={(e) => s({ name: e.target.value })} aria-label="Place name" /><Input className="col-span-3" placeholder="Address" value={r.address} onChange={(e) => s({ address: e.target.value })} aria-label="Address" /></>)} />
          </div>
        </Section>
        <Rows title="Bank accounts" rows={v.banks} onChange={(banks) => set({ banks })} blank={() => ({ bank: '', account: '', ifsc: '', branch: '' })} render={(r: any, s) => (<><Input placeholder="Bank" value={r.bank} onChange={(e) => s({ bank: e.target.value })} aria-label="Bank" /><Input placeholder="Branch" value={r.branch || ''} onChange={(e) => s({ branch: e.target.value })} aria-label="Branch" /><Input placeholder="Account no." value={r.account} onChange={(e) => s({ account: e.target.value })} aria-label="Account no." /><Input placeholder="IFSC" value={r.ifsc} onChange={(e) => s({ ifsc: e.target.value.toUpperCase() })} aria-label="IFSC" /></>)} />
        <Section title="Letterhead">
          <div className={G}>
            <ImagePick label="Logo" value={v.logo} onChange={(logo) => set({ logo })} />
            <ImagePick label="Signature" value={v.signature} onChange={(signature) => set({ signature })} />
          </div>
        </Section>
      </div>
    </Drawer>
  );
}

/* ================= Clients with offices and deductions (Query 2) ================= */
export function ClientForm({ rec, onClose }: { rec: Partial<Client>; onClose: () => void }) {
  const isNew = !rec.id;
  const [v, setV] = useState<any>(() => ({ code: '', name: '', kind: 'GOVT', gstin: '', address: '', billingContact: '', email: '', phone: '', retentionPct: 0, offices: [], ...JSON.parse(JSON.stringify(rec)) }));
  const [d, setD] = useState<DeductionProfile>(() => clientDeductions(rec as Client) || defaultDeductions());
  const set = (p: Record<string, unknown>) => setV((o: any) => ({ ...o, ...p }));
  const save = () => {
    if (!v.code || !v.name) return toast.error('Code and name are required');
    const out = { ...v, deductions: d, tdsPct: d.itTdsPct, cessPct: d.labourCessPct, offices: v.offices.map((o: ClientOffice) => ({ ...o, contacts: o.contacts.filter((c) => c.name || c.phone || c.designation) })) };
    if (isNew) insert('clients', out, `Client ${out.name} added`, 'Client');
    else {
      const { id, createdAt, createdBy, ...patch } = out;
      update('clients', rec.id!, patch, `Client ${out.name} updated`, 'Client');
    }
    toast.success('Client saved');
    onClose();
  };
  const setOffice = (i: number, p: Partial<ClientOffice>) => set({ offices: v.offices.map((o: ClientOffice, j: number) => (j === i ? { ...o, ...p } : o)) });
  return (
    <Drawer open onClose={onClose} width="max-w-2xl" title={isNew ? 'Add client' : v.name} subtitle="Department, its offices, and what it deducts from your bills" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-7">
        <Section title="Client">
          <div className={G}>
            <Field label="Name" required className="sm:col-span-2"><Input value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="PWD (R&B), Government of Tripura" /></Field>
            <Field label="Code" required><Input value={v.code} onChange={(e) => set({ code: e.target.value })} /></Field>
            <Field label="Type"><Select value={v.kind || 'GOVT'} onChange={(x) => set({ kind: x })} options={[{ value: 'GOVT', label: 'Government department' }, { value: 'LOCAL_BODY', label: 'Municipal / local body' }, { value: 'PRIVATE', label: 'Private' }, { value: 'BUYER', label: 'Hot mix buyer' }]} /></Field>
            <Field label="GSTIN" hint="Copy from the GSTR-7A TDS certificate"><Input value={v.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} maxLength={15} /></Field>
            <Field label="Default security deposit %" hint="Each work can change it"><NumberInput value={v.retentionPct} onChange={(x) => set({ retentionPct: Number(x) || 0 })} suffix="%" /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            <Field label="Billing contact"><Input value={v.billingContact} onChange={(e) => set({ billingContact: e.target.value })} /></Field>
            <Field label="Email"><Input value={v.email || ''} onChange={(e) => set({ email: e.target.value })} /></Field>
          </div>
        </Section>
        <Section title="Offices (circle / division / sub-division)" action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => set({ offices: [...v.offices, { id: uid('of'), circle: '', division: '', subDivision: '', address: '', email: '', gstin: '', contacts: [{ designation: 'EE', name: '', phone: '' }] }] })}>Add office</Button>}>
          <div className="space-y-4">
            {v.offices.length === 0 && <p className="text-xs text-muted">Add each office as you win tenders there.</p>}
            {v.offices.map((o: ClientOffice, i: number) => (
              <Card key={o.id} className="p-4">
                <div className={G}>
                  <Field label="Circle"><Input value={o.circle} onChange={(e) => setOffice(i, { circle: e.target.value })} /></Field>
                  <Field label="Division"><Input value={o.division} onChange={(e) => setOffice(i, { division: e.target.value })} /></Field>
                  <Field label="Sub-division"><Input value={o.subDivision} onChange={(e) => setOffice(i, { subDivision: e.target.value })} /></Field>
                  <Field label="Email"><Input value={o.email} onChange={(e) => setOffice(i, { email: e.target.value })} /></Field>
                  <Field label="Postal address" className="sm:col-span-2"><Input value={o.address} onChange={(e) => setOffice(i, { address: e.target.value })} /></Field>
                </div>
                <div className="mt-3">{contactRows(o.contacts, (contacts) => setOffice(i, { contacts }), 'Engineers and billing contacts')}</div>
                <div className="flex justify-end mt-2"><Button size="sm" variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ offices: v.offices.filter((_: unknown, j: number) => j !== i) })}>Remove office</Button></div>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Deducted from your RA bills (defaults — each work can change them)">
          <DeductionsEditor value={d} onChange={setD} />
        </Section>
      </div>
    </Drawer>
  );
}

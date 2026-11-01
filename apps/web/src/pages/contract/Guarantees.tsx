import { useMemo, useState } from 'react';
import { CalendarPlus, Landmark, MessageCircle, Plus, Printer, ShieldCheck } from 'lucide-react';
import { bankUsage, blockedBy, guaranteeDue, moneyBlocked } from '@civil/domain/money';
import { useDB, insert, update } from '../../data/store';
import { useSession } from '../../data/session';
import type { BankFacility, GuaranteeRec } from '../../data/types';
import { Badge, Button, Callout, Card, CardHeader, Drawer, Modal, Progress, Stat, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, NumberInput, Segmented, Select, Textarea } from '../../components/ui/fields';
import { date, inr, inrCompact, today } from '../../lib/format';
import { printLetter, shareWhatsApp } from '../../lib/export';
import { sum } from '../../lib/utils';
import { useNames } from '../shared';

const KIND: Record<GuaranteeRec['kind'], string> = { EMD: 'EMD', PS: 'Performance security', APS: 'Additional performance security', SD: 'Security deposit', ADVANCE: 'Advance guarantee', OTHER: 'Other' };
const INSTR: Record<GuaranteeRec['instrument'], string> = { BG: 'Bank guarantee', EBG: 'e-BG', FDR: 'FDR', DD: 'Demand draft', ONLINE: 'Online', CASH: 'Cash' };
const STATUS: Record<GuaranteeRec['status'], [string, 'good' | 'info' | 'neutral' | 'bad']> = { ACTIVE: ['Active', 'good'], EXTENDED: ['Extended', 'info'], RELEASED: ['Released', 'neutral'], ENCASHED: ['Encashed', 'bad'] };

function DueBadge({ g }: { g: GuaranteeRec }) {
  const d = guaranteeDue(g, today());
  if (!d) return <span className="text-muted">—</span>;
  if (d.days < 0) return <Badge tone="bad">Expired {-d.days} d ago</Badge>;
  return <Badge tone={d.days <= 7 ? 'bad' : d.days <= 30 ? 'warn' : d.days <= 60 ? 'info' : 'neutral'}>{d.days} days left</Badge>;
}

export function GuaranteesTab() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const [filter, setFilter] = useState<'live' | 'due' | 'all'>('live');
  const [edit, setEdit] = useState<Partial<GuaranteeRec> | null>(null);
  const [extend, setExtend] = useState<GuaranteeRec | null>(null);
  const [close, setClose] = useState<GuaranteeRec | null>(null);
  const [bank, setBank] = useState<Partial<BankFacility> | null>(null);
  const live = db.guarantees.filter((g) => g.status === 'ACTIVE' || g.status === 'EXTENDED');
  const rows = useMemo(() => db.guarantees.filter((g) => (filter === 'all' ? true : filter === 'live' ? g.status === 'ACTIVE' || g.status === 'EXTENDED' : (guaranteeDue(g, today())?.days ?? 999) <= 60)).slice().sort((a, b) => (a.expiryDate || '9').localeCompare(b.expiryDate || '9')), [db, filter]);
  const blocked = useMemo(() => moneyBlocked(db).filter((x) => s.seesSite(x.siteId)), [db, s]);
  const banks = useMemo(() => bankUsage(db), [db]);
  if (!s.showRates) return <Callout>Guarantees and deposits are visible to the owner and accounts only.</Callout>;
  const due30 = live.filter((g) => (guaranteeDue(g, today())?.days ?? 999) <= 30);
  const canEdit = s.can('contract', 'edit');

  const extLetter = (g: GuaranteeRec) => {
    const site = db.sites.find((x) => x.id === g.siteId);
    printLetter({
      firmId: site?.firmId,
      ref: `${g.number || 'BG'}/EXT`,
      date: date(today()),
      to: ['The Branch Manager', g.bank, g.branch].filter(Boolean),
      subject: `Extension of ${INSTR[g.instrument].toLowerCase()} no. ${g.number} for ${inr(g.amount)}`,
      paragraphs: [
        `Our ${INSTR[g.instrument].toLowerCase()} no. ${g.number} dated ${g.issueDate ? date(g.issueDate) : '—'} for ${inr(g.amount)}, issued in favour of ${g.beneficiary || 'the department'} towards ${KIND[g.kind].toLowerCase()}${site ? ` for the work "${site.name}"` : g.tenderRef ? ` for ${g.tenderRef}` : ''}, is valid up to ${g.expiryDate ? date(g.expiryDate) : '—'}.`,
        `As the work / contract period is continuing, the department requires the guarantee to remain valid. We request you to extend its validity by twelve months, with the claim period extended accordingly, and to debit our account with the charges.`,
      ],
      enclosures: ['Copy of the guarantee', "Department's letter, if any"],
    });
  };
  const share = (g: GuaranteeRec) => {
    const d = guaranteeDue(g, today());
    shareWhatsApp(`${KIND[g.kind]} ${INSTR[g.instrument]} ${g.number} (${g.bank}) for ₹${Math.round(g.amount).toLocaleString('en-IN')} ${d && d.days < 0 ? `expired on ${date(g.expiryDate)}` : `expires on ${date(g.expiryDate)} — ${d?.days} days left`}.${g.siteId ? ` Work: ${n.site(g.siteId)}.` : ''}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <Stat label="Active guarantees & deposits" value={sum(live, (g) => g.amount)} format={inrCompact} tone="info" sub={`${live.length} instruments`} />
        <Stat label="Expiring in 30 days" value={due30.length} tone={due30.length ? 'bad' : 'good'} sub={due30.length ? 'extend or release' : 'none'} />
        <Stat label="Money blocked in works" value={sum(blocked, (x) => x.total)} format={inrCompact} tone="brand" sub="EMD, SD held, margins, FDRs" />
        <Stat label="BG limit available" value={sum(banks, (b) => b.available)} format={inrCompact} tone="violet" sub={`of ${inrCompact(sum(banks, (b) => b.limit))} sanctioned`} />
      </div>
      {due30.length > 0 && <Callout tone="warn">{due30.length} guarantee(s) expire within 30 days. Use “Extension letter” for a ready request to the bank, or share the reminder on WhatsApp.</Callout>}

      <DataTable
        title="Guarantee and deposit register"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={canEdit ? setEdit : undefined}
        toolbar={
          <>
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'live', label: 'Active' }, { value: 'due', label: 'Due ≤ 60 days' }, { value: 'all', label: 'All' }]} />
            {canEdit && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({ kind: 'PS', instrument: 'BG', status: 'ACTIVE', marginPct: db.bankFacilities[0]?.marginPct || 0, bank: db.bankFacilities[0]?.bank || '' })}>Add</Button>}
          </>
        }
        empty={<div className="p-8 text-center text-sm text-muted">No guarantees yet — add each EMD, performance security, BG and FDR.</div>}
        columns={[
          { key: 'kind', header: 'Type', primary: true, value: (r) => KIND[r.kind], cell: (r) => <div><div className="font-medium">{KIND[r.kind]}</div><div className="text-[11px] text-muted">{INSTR[r.instrument]} {r.number}</div></div> },
          { key: 'work', header: 'Work / tender', value: (r) => (r.siteId ? n.site(r.siteId) : r.tenderRef || ''), cell: (r) => (r.siteId ? n.site(r.siteId) : <span className="text-muted">{r.tenderRef || '—'}</span>) },
          { key: 'bank', header: 'Bank', value: (r) => r.bank, hideMobile: true },
          { key: 'amt', header: 'Amount', align: 'right', value: (r) => r.amount, cell: (r) => <b>{inr(r.amount)}</b> },
          { key: 'exp', header: 'Valid to', value: (r) => r.expiryDate, cell: (r) => <div><div>{r.expiryDate ? date(r.expiryDate) : '—'}</div>{r.claimDate && <div className="text-[11px] text-muted">claim {date(r.claimDate)}</div>}</div> },
          { key: 'due', header: 'Expiry', value: (r) => guaranteeDue(r, today())?.days ?? 9999, cell: (r) => <DueBadge g={r} /> },
          { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <Badge tone={STATUS[r.status][1]} dot>{STATUS[r.status][0]}{r.extensions.length ? ` ×${r.extensions.length}` : ''}</Badge> },
          ...(canEdit
            ? [{
                key: 'act', header: '', sortable: false,
                cell: (r: GuaranteeRec) => (r.status === 'RELEASED' || r.status === 'ENCASHED' ? null : (
                  <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" aria-label="Extension letter to the bank" onClick={() => extLetter(r)}><Printer className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Share reminder on WhatsApp" onClick={() => share(r)}><MessageCircle className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" icon={<CalendarPlus className="w-3.5 h-3.5" />} onClick={() => setExtend(r)}>Extend</Button>
                    <Button size="sm" variant="ghost" onClick={() => setClose(r)}>Release</Button>
                  </div>
                )),
              }]
            : []),
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Money blocked per work" subtitle="EMD and FDRs in full, BG margin, security deposit held from bills" />
          <div className="px-5 pb-5">
            {blocked.length ? (
              <div className="space-y-2">
                {blocked.sort((a, b) => b.total - a.total).map((x) => (
                  <div key={x.siteId} className="rounded-xl border border-line px-3 py-2">
                    <div className="flex justify-between text-sm"><b>{n.site(x.siteId)}</b><b className="num">{inr(x.total)}</b></div>
                    <div className="text-[11px] text-muted mt-0.5">EMD {inr(x.emd)} · performance security {inr(x.ps)} · SD held {inr(x.sdHeld)}{x.other ? ` · other ${inr(x.other)}` : ''}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No money blocked.</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Bank limits" subtitle="BG limit, used, margin money and FDRs under lien" action={canEdit && <Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setBank({ marginPct: 10 })}>Bank</Button>} />
          <div className="px-5 pb-5 space-y-3">
            {banks.length ? banks.map((b) => {
              const f = db.bankFacilities.find((x) => x.bank.trim().toLowerCase() === b.bank.trim().toLowerCase());
              return (
                <button key={b.bank} type="button" className="w-full text-left rounded-xl border border-line px-3 py-2 hover:border-line-strong" onClick={() => canEdit && setBank(f || { bank: b.bank, marginPct: 10 })}>
                  <div className="flex justify-between text-sm"><span className="font-medium flex items-center gap-1.5"><Landmark className="w-4 h-4 text-muted" />{b.bank}</span><span className="num">{b.limit ? `${inrCompact(b.used)} of ${inrCompact(b.limit)}` : `${inrCompact(b.used)} used · limit not entered`}</span></div>
                  {b.limit > 0 && <Progress value={b.usedPct} thin tone={b.usedPct > 90 ? 'bad' : b.usedPct > 75 ? 'warn' : 'brand'} />}
                  <div className="text-[11px] text-muted mt-1">{b.count} BGs · margin {inr(b.margin)} · FDRs under lien {inr(b.fdrLien)}{b.limit ? ` · available ${inr(b.available)}` : ''}</div>
                </button>
              );
            }) : <p className="text-sm text-muted">Add your banks and BG limits.</p>}
          </div>
        </Card>
      </div>

      {edit && <GuaranteeForm rec={edit} onClose={() => setEdit(null)} />}
      {extend && <ExtendForm g={extend} onClose={() => setExtend(null)} />}
      {close && <CloseForm g={close} onClose={() => setClose(null)} />}
      {bank && <BankForm rec={bank} onClose={() => setBank(null)} />}
    </div>
  );
}

function GuaranteeForm({ rec, onClose }: { rec: Partial<GuaranteeRec>; onClose: () => void }) {
  const db = useDB();
  const [v, setV] = useState<any>({ number: '', bank: '', branch: '', amount: '', issueDate: '', expiryDate: '', claimDate: '', beneficiary: '', remarks: '', tenderRef: '', ...rec });
  const set = (p: Record<string, unknown>) => setV({ ...v, ...p });
  const site = db.sites.find((x) => x.id === v.siteId);
  const save = () => {
    if (!(Number(v.amount) > 0)) return toast.error('Amount is required');
    const out = { ...v, amount: Number(v.amount), marginPct: Number(v.marginPct) || 0, siteId: v.siteId || undefined, tenderRef: v.tenderRef || undefined };
    if (rec.id) {
      const { id, createdAt, createdBy, ...patch } = out;
      update('guarantees', rec.id, patch, `${KIND[out.kind as GuaranteeRec['kind']]} ${out.number} updated`, 'Guarantee');
    } else insert('guarantees', { ...out, extensions: [] }, `${KIND[out.kind as GuaranteeRec['kind']]} ${out.number} added`, 'Guarantee');
    toast.success('Saved');
    onClose();
  };
  const suggest = site && v.kind === 'PS' && site.perfSecurity?.pct ? Math.round((site.contractValue * site.perfSecurity.pct) / 100) : 0;
  return (
    <Drawer open onClose={onClose} title={rec.id ? `${KIND[v.kind as GuaranteeRec['kind']]} ${v.number}` : 'Add guarantee or deposit'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Type"><Select value={v.kind} onChange={(x) => set({ kind: x })} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Instrument"><Select value={v.instrument} onChange={(x) => set({ instrument: x })} options={Object.entries(INSTR).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Work"><Select value={v.siteId || ''} onChange={(x) => set({ siteId: x || undefined })} options={[{ value: '', label: '— Tender (not yet a work) —' }, ...db.sites.filter((x) => !(x as any).outOfScope).map((x) => ({ value: x.id, label: x.short }))]} /></Field>
        {!v.siteId && <Field label="Tender reference"><Input value={v.tenderRef || ''} onChange={(e) => set({ tenderRef: e.target.value })} placeholder="NIT / tender ID" /></Field>}
        <Field label="BG / FDR / receipt no."><Input value={v.number} onChange={(e) => set({ number: e.target.value })} /></Field>
        <Field label="Amount" required hint={suggest ? `Performance security ${site!.perfSecurity!.pct}% of contract = ${inr(suggest)}` : undefined}><NumberInput value={v.amount} onChange={(x) => set({ amount: x })} prefix="₹" /></Field>
        <Field label="Bank"><Input list="wcm-banks" value={v.bank} onChange={(e) => set({ bank: e.target.value })} /><datalist id="wcm-banks">{db.bankFacilities.map((b) => <option key={b.id} value={b.bank} />)}</datalist></Field>
        <Field label="Branch"><Input value={v.branch} onChange={(e) => set({ branch: e.target.value })} /></Field>
        <Field label="Issue date"><Input type="date" value={v.issueDate} onChange={(e) => set({ issueDate: e.target.value })} /></Field>
        <Field label="Valid up to"><Input type="date" value={v.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} /></Field>
        <Field label="Claim date"><Input type="date" value={v.claimDate} onChange={(e) => set({ claimDate: e.target.value })} /></Field>
        {(v.instrument === 'BG' || v.instrument === 'EBG') && <Field label="Margin with bank %"><NumberInput value={v.marginPct} onChange={(x) => set({ marginPct: x })} suffix="%" /></Field>}
        <Field label="In favour of" className="sm:col-span-2"><Input value={v.beneficiary} onChange={(e) => set({ beneficiary: e.target.value })} placeholder="Executive Engineer, PWD (R&B) …" /></Field>
        <Field label="Remarks" className="sm:col-span-2"><Textarea value={v.remarks} onChange={(e) => set({ remarks: e.target.value })} /></Field>
      </div>
      {rec.extensions?.length ? (
        <div className="mt-5 text-sm">
          <div className="font-medium mb-1">Extensions</div>
          {rec.extensions.map((e, i) => <div key={i} className="text-xs text-muted">{date(e.date)} — valid to {date(e.expiry)}{e.letterNo ? ` (letter ${e.letterNo})` : ''}</div>)}
        </div>
      ) : null}
    </Drawer>
  );
}

function ExtendForm({ g, onClose }: { g: GuaranteeRec; onClose: () => void }) {
  const [v, setV] = useState({ expiry: '', claim: '', letterNo: '' });
  const save = () => {
    if (!v.expiry || v.expiry <= g.expiryDate) return toast.error('New validity must be after the current expiry');
    update('guarantees', g.id, { extensions: [...g.extensions, { date: today(), expiry: v.expiry, claim: v.claim, letterNo: v.letterNo }], expiryDate: v.expiry, claimDate: v.claim || g.claimDate, status: 'EXTENDED' }, `${g.number} extended to ${v.expiry}`, 'Guarantee');
    toast.success('Extension recorded');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Extend ${INSTR[g.instrument]} ${g.number}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-fg-2">Now valid to {date(g.expiryDate)}.</p>
        <Field label="New validity"><Input type="date" value={v.expiry} onChange={(e) => setV({ ...v, expiry: e.target.value })} /></Field>
        <Field label="New claim date"><Input type="date" value={v.claim} onChange={(e) => setV({ ...v, claim: e.target.value })} /></Field>
        <Field label="Bank's amendment / letter no."><Input value={v.letterNo} onChange={(e) => setV({ ...v, letterNo: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function CloseForm({ g, onClose }: { g: GuaranteeRec; onClose: () => void }) {
  const [status, setStatus] = useState<'RELEASED' | 'ENCASHED'>('RELEASED');
  const [on, setOn] = useState(today());
  const save = () => {
    update('guarantees', g.id, { status, releasedOn: on }, `${g.number} ${status.toLowerCase()}`, 'Guarantee');
    toast.success(status === 'RELEASED' ? 'Marked released' : 'Marked encashed');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${INSTR[g.instrument]} ${g.number}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'RELEASED', label: 'Released / returned' }, { value: 'ENCASHED', label: 'Encashed by department' }]} />
        <Field label="Date"><Input type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} /></Field>
        <p className="text-xs text-muted">Blocked money {inr(blockedBy(g))} will be freed.</p>
      </div>
    </Modal>
  );
}

function BankForm({ rec, onClose }: { rec: Partial<BankFacility>; onClose: () => void }) {
  const [v, setV] = useState<any>({ bank: '', branch: '', bgLimit: '', marginPct: 10, fdrUnderLien: '', remarks: '', ...rec });
  const save = () => {
    if (!v.bank.trim()) return toast.error('Bank name is required');
    const out = { ...v, bgLimit: Number(v.bgLimit) || 0, marginPct: Number(v.marginPct) || 0, fdrUnderLien: Number(v.fdrUnderLien) || 0 };
    if (rec.id) {
      const { id, createdAt, createdBy, ...patch } = out;
      update('bankFacilities', rec.id, patch, `Bank ${out.bank} updated`, 'Bank');
    } else insert('bankFacilities', out, `Bank ${out.bank} added`, 'Bank');
    toast.success('Saved');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={rec.id ? rec.bank! : 'Bank and BG limit'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<ShieldCheck className="w-4 h-4" />} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Bank" className="col-span-2"><Input value={v.bank} onChange={(e) => setV({ ...v, bank: e.target.value })} /></Field>
        <Field label="Branch"><Input value={v.branch} onChange={(e) => setV({ ...v, branch: e.target.value })} /></Field>
        <Field label="BG limit sanctioned"><NumberInput value={v.bgLimit} onChange={(x) => setV({ ...v, bgLimit: x })} prefix="₹" /></Field>
        <Field label="Margin on BGs"><NumberInput value={v.marginPct} onChange={(x) => setV({ ...v, marginPct: x })} suffix="%" /></Field>
        <Field label="Other FDRs under lien"><NumberInput value={v.fdrUnderLien} onChange={(x) => setV({ ...v, fdrUnderLien: x })} prefix="₹" /></Field>
      </div>
    </Modal>
  );
}

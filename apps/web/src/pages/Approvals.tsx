import { useMemo, useState } from 'react';
import { Check, CircleCheck, Clock, CornerUpLeft, ShieldCheck, X } from 'lucide-react';
import { useDB, decide } from '../data/store';
import { approvalVisible, useSession } from '../data/session';
import { pendingApprovals, type ApprovalItem } from '../data/selectors';
import { useSiteFilter } from '../components/layout/AppShell';
import { Badge, Button, Card, Empty, Modal, PageHeader, toast } from '../components/ui/core';
import { Field, Segmented, Textarea } from '../components/ui/fields';
import { DataTable } from '../components/ui/DataTable';
import { date, dateTime, inr, relTime } from '../lib/format';
import { navigate } from '../lib/router';
import { cn } from '../lib/utils';
import { useNames } from './shared';

export default function Approvals() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [mod, setMod] = useState('all');
  const [act, setAct] = useState<{ items: ApprovalItem[]; decision: 'APPROVED' | 'REJECTED' | 'SENT_BACK' } | null>(null);
  const [remark, setRemark] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const items = useMemo(() => pendingApprovals(db).filter((a) => approvalVisible(s, a) && (!siteId || !a.siteId || a.siteId === siteId)), [db, s, siteId]);
  const shown = items.filter((a) => mod === 'all' || a.module === mod);
  const mods = Array.from(new Set(items.map((a) => a.module)));
  const canApprove = s.can('approvals', 'approve');
  const overLimit = (a: ApprovalItem) => (a.amount || 0) > s.role.approvalLimit;
  const history = useMemo(() => db.audit.filter((a) => a.action === 'APPROVE' || a.action === 'REJECT' || a.action === 'SEND_BACK').slice(0, 200), [db]);

  const run = () => {
    if (!act) return;
    if (act.decision !== 'APPROVED' && !remark.trim()) return toast.error('Remark is required to reject or send back');
    for (const a of act.items) decide(a.collection, a.id, act.decision, remark.trim() || 'Approved', a.title);
    toast.success(`${act.items.length} ${act.items.length === 1 ? 'entry' : 'entries'} ${act.decision === 'APPROVED' ? 'approved' : act.decision === 'REJECTED' ? 'rejected' : 'sent back'}`, act.decision === 'APPROVED' ? 'Now included in final cost (APR-03)' : 'The person who raised it has been notified');
    setAct(null);
    setRemark('');
    setSel(new Set());
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Purchase orders, issues, expenses, fuel and back-dated entries above the set limits wait here. Unapproved entries show as pending and stay out of final cost."
        tags={['APR-01', 'APR-02', 'APR-03', 'ROLE-04']}
        actions={<Segmented value={view} onChange={setView} options={[{ value: 'pending', label: `Pending (${items.length})` }, { value: 'history', label: 'History' }]} />}
      />
      {view === 'pending' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {['all', ...mods].map((m) => (
                <button key={m} onClick={() => setMod(m)} className={cn('px-3 h-8 rounded-full text-[13px] font-medium border transition-colors', mod === m ? 'bg-fg text-bg border-fg' : 'bg-surface border-line text-fg-2 hover:border-line-strong')}>
                  {m === 'all' ? 'All' : m} <span className="opacity-60">{m === 'all' ? items.length : items.filter((x) => x.module === m).length}</span>
                </button>
              ))}
            </div>
            <div className="flex-1" />
            {canApprove && sel.size > 0 && (
              <Button variant="success" icon={<Check className="w-4 h-4" />} onClick={() => setAct({ items: shown.filter((a) => sel.has(a.id) && !overLimit(a)), decision: 'APPROVED' })}>
                Approve {sel.size} selected
              </Button>
            )}
          </div>
          {shown.length === 0 ? (
            <Card>
              <Empty icon={<CircleCheck className="w-6 h-6" />} title="All clear" body="Nothing is waiting for approval." />
            </Card>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 stagger">
              {shown.map((a) => {
                const age = Date.now() - new Date(a.createdAt).getTime();
                const old = age > 86400000;
                return (
                  <Card key={a.id} className={cn('p-4 transition-all', sel.has(a.id) && 'ring-2 ring-brand')}>
                    <div className="flex items-start gap-3">
                      {canApprove && (
                        <input type="checkbox" checked={sel.has(a.id)} onChange={(e) => { const x = new Set(sel); e.target.checked ? x.add(a.id) : x.delete(a.id); setSel(x); }} className="mt-1 w-4 h-4 accent-[var(--brand)]" aria-label="Select" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge tone="info">{a.module}</Badge>
                          {a.siteId && <Badge>{n.site(a.siteId)}</Badge>}
                          <span className={cn('inline-flex items-center gap-1 text-[11px]', old ? 'text-bad font-semibold' : 'text-muted')}>
                            <Clock className="w-3 h-3" /> {relTime(a.createdAt)}{old ? ' · over 24 h (ALT-04)' : ''}
                          </span>
                        </div>
                        <button onClick={() => navigate(a.link)} className="text-left font-semibold mt-1.5 hover:underline">{a.title}</button>
                        <p className="text-[13px] text-fg-2 mt-0.5">{a.detail}</p>
                        <div className="text-[11px] text-muted mt-1.5">Raised by {n.user(a.createdBy)} · dated {date(a.date)}</div>
                      </div>
                      {a.amount !== undefined && s.showRates && <div className="text-right shrink-0"><div className="text-[11px] text-muted">Amount</div><div className="font-bold num">{inr(a.amount)}</div></div>}
                    </div>
                    {canApprove && (
                      <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-3 border-t border-line">
                        {overLimit(a) && <span className="text-[11px] text-warn mr-auto">Above your approval limit of {inr(s.role.approvalLimit)} — needs owner</span>}
                        <Button size="sm" variant="ghost" icon={<CornerUpLeft className="w-4 h-4" />} onClick={() => setAct({ items: [a], decision: 'SENT_BACK' })}>Send back</Button>
                        <Button size="sm" icon={<X className="w-4 h-4" />} onClick={() => setAct({ items: [a], decision: 'REJECTED' })}>Reject</Button>
                        <Button size="sm" variant="success" icon={<Check className="w-4 h-4" />} disabled={overLimit(a)} onClick={() => setAct({ items: [a], decision: 'APPROVED' })}>Approve</Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <DataTable
          title="Approval history"
          rows={history}
          rowKey={(r) => r.id}
          columns={[
            { key: 'at', header: 'When', value: (r) => r.at, cell: (r) => dateTime(r.at) },
            { key: 'action', header: 'Decision', value: (r) => r.action, cell: (r) => <Badge tone={r.action === 'APPROVE' ? 'good' : r.action === 'REJECT' ? 'bad' : 'warn'}>{r.action === 'APPROVE' ? 'Approved' : r.action === 'REJECT' ? 'Rejected' : 'Sent back'}</Badge> },
            { key: 'label', header: 'Entry', primary: true, value: (r) => r.label },
            { key: 'by', header: 'By', value: (r) => n.user(r.userId) },
            { key: 'reason', header: 'Remark', value: (r) => r.reason || '' },
          ]}
        />
      )}
      <Modal
        open={!!act}
        onClose={() => setAct(null)}
        title={act?.decision === 'APPROVED' ? `Approve ${act.items.length > 1 ? `${act.items.length} entries` : 'entry'}` : act?.decision === 'REJECTED' ? 'Reject entry' : 'Send back for correction'}
        footer={
          <>
            <Button onClick={() => setAct(null)}>Cancel</Button>
            <Button variant={act?.decision === 'APPROVED' ? 'success' : act?.decision === 'REJECTED' ? 'danger' : 'primary'} icon={<ShieldCheck className="w-4 h-4" />} onClick={run}>
              Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {act?.items.slice(0, 5).map((a) => <div key={a.id} className="text-sm font-medium">{a.title}</div>)}
          <Field label={act?.decision === 'APPROVED' ? 'Remark (optional)' : 'Remark'} required={act?.decision !== 'APPROVED'}>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={act?.decision === 'SENT_BACK' ? 'What needs to be corrected?' : ''} />
          </Field>
          <p className="text-[11px] text-muted">The person who raised it gets an in-app notification{db.settings.notify.whatsapp ? ' and WhatsApp' : ''}{db.settings.notify.email ? ' / email' : ''} (APR-02). Every decision is written to the audit log.</p>
        </div>
      </Modal>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { CircleCheck, DatabaseBackup, Eye, EyeOff, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import { useDB, insert, update, updateSettings, journalSize } from '../../data/store';
import { useSession } from '../../data/session';
import type { AuditEntry, ModuleKey, Perm, Role, Settings, User } from '../../data/types';
import { Badge, Button, Callout, Card, CardHeader, Drawer, PageHeader, Section, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, NumberInput, Segmented, Select, Toggle } from '../../components/ui/fields';
import { dateTime, fyCode, today } from '../../lib/format';
import { cn, initials } from '../../lib/utils';
import { useModuleTab, useNames } from '../shared';

export default function Admin() {
  const { tab, tabsEl } = useModuleTab('admin');
  return (
    <div>
      <PageHeader title="Administration" subtitle="Users, roles, settings and the audit trail." tags={['ROLE-01…05', 'SEC-01…04', '§2.4']} />
      {tabsEl}
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

/* ================= Users ================= */
function UsersTab() {
  const db = useDB();
  const n = useNames();
  const [edit, setEdit] = useState<Partial<User> | null>(null);
  return (
    <>
      <DataTable
        title="Users"
        rows={db.users}
        rowKey={(r) => r.id}
        onRowClick={setEdit}
        toolbar={<Button variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={() => setEdit({ name: '', username: '', phone: '', email: '', roleId: 'engineer', siteIds: [], plantIds: [], active: true })}>Add user</Button>}
        columns={[
          { key: 'name', header: 'User', primary: true, value: (r) => r.name, cell: (r) => <div className="flex items-center gap-2.5"><span className="w-8 h-8 rounded-lg bg-surface-3 text-[11px] font-bold flex items-center justify-center">{initials(r.name)}</span><div><div className="font-medium">{r.name}</div><div className="text-[11px] text-muted">@{r.username} · {r.phone}</div></div></div> },
          { key: 'role', header: 'Role', value: (r) => db.roles.find((x) => x.id === r.roleId)?.name, cell: (r) => <Badge tone="info">{db.roles.find((x) => x.id === r.roleId)?.name}</Badge> },
          { key: 'scope', header: 'Access to', value: (r) => (r.siteIds.length ? r.siteIds.map((s) => n.site(s)).join(', ') : r.plantIds.length ? r.plantIds.map((p) => n.lk.plant[p]?.code).join(', ') : 'All sites'), cell: (r) => <span className="text-[13px]">{r.siteIds.length ? r.siteIds.map((s) => n.site(s)).join(', ') : r.plantIds.length ? `Plants: ${r.plantIds.map((p) => n.lk.plant[p]?.code).join(', ')}` : db.roles.find((x) => x.id === r.roleId)?.allSites ? 'All sites' : 'Central store'}</span> },
          { key: '2fa', header: '2FA', value: (r) => (r.twoFactor ? 'On' : 'Off'), cell: (r) => (r.twoFactor ? <Badge tone="good">On</Badge> : <span className="text-muted text-xs">Off</span>), hideMobile: true },
          { key: 'active', header: 'Status', value: (r) => (r.active ? 'Active' : 'Disabled'), cell: (r) => (r.active ? <Badge tone="good" dot>Active</Badge> : <Badge>Disabled</Badge>) },
        ]}
      />
      {edit && <UserForm user={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function UserForm({ user, onClose }: { user: Partial<User>; onClose: () => void }) {
  const db = useDB();
  const [v, setV] = useState<Partial<User>>({ ...user });
  const role = db.roles.find((r) => r.id === v.roleId);
  const toggle = (k: 'siteIds' | 'plantIds', id: string) => setV({ ...v, [k]: (v[k] || []).includes(id) ? (v[k] || []).filter((x) => x !== id) : [...(v[k] || []), id] });
  const save = () => {
    if (!v.name || !v.username || !v.phone) return toast.error('Name, username and mobile are required');
    if (user.id) update('users', user.id, v as any, `User ${v.name} updated`, 'User');
    else insert('users', v as any, `User ${v.name} created`, 'User');
    toast.success('User saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={user.id ? user.name : 'New user'} subtitle="ROLE-02 · a user can be limited to one or more sites / plants" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name" required><Input value={v.name || ''} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Username" required><Input value={v.username || ''} onChange={(e) => setV({ ...v, username: e.target.value })} /></Field>
          <Field label="Mobile (OTP login)" required><Input value={v.phone || ''} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={v.email || ''} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="Role"><Select value={v.roleId || ''} onChange={(x) => setV({ ...v, roleId: x })} options={db.roles.map((r) => ({ value: r.id, label: r.name }))} /></Field>
        </div>
        {!role?.allSites && (
          <Section title="Sites this user can see">
            <div className="flex flex-wrap gap-2">
              {db.sites.map((s) => (
                <button key={s.id} type="button" onClick={() => toggle('siteIds', s.id)} className={cn('px-3 h-9 rounded-xl border text-sm', (v.siteIds || []).includes(s.id) ? 'bg-brand-soft border-brand text-fg font-medium' : 'border-line text-fg-2')}>{s.short}</button>
              ))}
            </div>
          </Section>
        )}
        {v.roleId === 'plant' && (
          <Section title="Plants">
            <div className="flex flex-wrap gap-2">
              {db.plants.map((p) => (
                <button key={p.id} type="button" onClick={() => toggle('plantIds', p.id)} className={cn('px-3 h-9 rounded-xl border text-sm', (v.plantIds || []).includes(p.id) ? 'bg-brand-soft border-brand font-medium' : 'border-line text-fg-2')}>{p.code}</button>
              ))}
            </div>
          </Section>
        )}
        <div className="space-y-3">
          <Toggle checked={!!v.twoFactor} onChange={(x) => setV({ ...v, twoFactor: x })} label="Two-factor authentication" hint="Recommended for Admin (SEC-01)" />
          <Toggle checked={v.active !== false} onChange={(x) => setV({ ...v, active: x })} label="Active" hint="Disabled users cannot sign in" />
        </div>
      </div>
    </Drawer>
  );
}

/* ================= Roles & permission matrix (ROLE-01/03) ================= */
const MODS: Array<[ModuleKey, string]> = [['dashboard', 'Dashboard'], ['masters', 'Masters'], ['inventory', 'Site inventory'], ['purchase', 'Store & purchase'], ['labour', 'Labour'], ['expenses', 'Expenses'], ['fleet', 'Vehicles'], ['plant', 'Plants'], ['contract', 'Contracts & billing'], ['reports', 'Reports'], ['approvals', 'Approvals'], ['alerts', 'Alerts'], ['admin', 'Administration']];
const PERMS: Perm[] = ['view', 'add', 'edit', 'delete', 'approve'];

function RolesTab() {
  const db = useDB();
  const s = useSession();
  const [roleId, setRoleId] = useState('engineer');
  const role = db.roles.find((r) => r.id === roleId)!;
  const [draft, setDraft] = useState<Role>(role);
  const pick = (id: string) => {
    setRoleId(id);
    setDraft(db.roles.find((r) => r.id === id)!);
  };
  const flip = (m: ModuleKey, p: Perm) => {
    const cur = draft.perms[m] || [];
    setDraft({ ...draft, perms: { ...draft.perms, [m]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] } });
  };
  const save = () => {
    update('roles', role.id, { perms: draft.perms, ratesVisible: draft.ratesVisible, approvalLimit: draft.approvalLimit, allSites: draft.allSites }, `Role ${role.name} permissions updated`, 'Role');
    toast.success('Role saved', 'Takes effect immediately for every user in this role');
  };
  const locked = role.id === 'owner';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {db.roles.map((r) => (
          <button key={r.id} onClick={() => pick(r.id)} className={cn('px-3.5 h-10 rounded-xl border text-sm font-medium transition-all', roleId === r.id ? 'bg-fg text-bg border-fg' : 'bg-surface border-line text-fg-2 hover:border-line-strong')}>
            {r.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader title={`${role.name} — permissions`} subtitle="ROLE-01 · per module: view, add, edit, delete, approve" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="text-left px-4 py-2.5">Module</th>
                  {PERMS.map((p) => <th key={p} className="px-3 py-2.5 text-center">{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODS.map(([m, label]) => (
                  <tr key={m} className="border-t border-line">
                    <td className="px-4 py-2 font-medium">{label}</td>
                    {PERMS.map((p) => {
                      const on = (draft.perms[m] || []).includes(p);
                      return (
                        <td key={p} className="text-center px-3 py-2">
                          <button disabled={locked} onClick={() => flip(m, p)} className={cn('w-7 h-7 rounded-lg inline-flex items-center justify-center transition-all active:scale-90', on ? 'bg-good text-white' : 'bg-surface-3 text-transparent hover:text-muted', locked && 'opacity-60')} aria-label={`${label} ${p}`}>
                            <CircleCheck className="w-4 h-4" />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5 space-y-5 h-fit">
          <Toggle checked={draft.ratesVisible} onChange={(x) => !locked && setDraft({ ...draft, ratesVisible: x })} label="Rates & amounts visible" hint="ROLE-03 · when off, users see quantities only" />
          <Toggle checked={draft.allSites} onChange={(x) => !locked && setDraft({ ...draft, allSites: x })} label="All sites" hint="ROLE-02 · when off, users see only the sites assigned to them" />
          <Field label="Approval limit" hint="Entries above this amount need someone higher">
            <NumberInput value={draft.approvalLimit === Infinity ? '' : draft.approvalLimit} onChange={(x) => setDraft({ ...draft, approvalLimit: x === '' ? Infinity : Number(x) })} prefix="₹" placeholder="No limit" disabled={locked} />
          </Field>
          <div className="flex items-center gap-2 text-xs text-muted">{draft.ratesVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />} {db.users.filter((u) => u.roleId === role.id).length} users in this role</div>
          {locked ? <Callout tone="info" icon={<Lock className="w-4 h-4" />}>Owner / Admin always has full access.</Callout> : s.isAdmin && <Button variant="primary" className="w-full justify-center" onClick={save}>Save role</Button>}
        </Card>
      </div>
    </div>
  );
}

/* ================= Settings ================= */
function SettingsTab() {
  const db = useDB();
  const s = useSession();
  const [v, setV] = useState<Settings>(db.settings);
  const set = <K extends keyof Settings>(k: K, x: Settings[K]) => setV({ ...v, [k]: x });
  const save = () => {
    updateSettings(v, 'Settings updated');
    toast.success('Settings saved', 'Rules apply to all new entries');
  };
  const N = (x: number | '') => (x === '' ? 0 : Number(x));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Approval limits" subtitle="APR-01 · entries above these amounts need approval" icon={<ShieldCheck className="w-[18px] h-[18px]" />} />
          <div className="px-5 pb-5 grid grid-cols-2 gap-4">
            <Field label="Purchase order"><NumberInput value={v.approvalLimits.po} onChange={(x) => set('approvalLimits', { ...v.approvalLimits, po: N(x) })} prefix="₹" /></Field>
            <Field label="Material issue"><NumberInput value={v.approvalLimits.issue} onChange={(x) => set('approvalLimits', { ...v.approvalLimits, issue: N(x) })} prefix="₹" /></Field>
            <Field label="Expense"><NumberInput value={v.approvalLimits.expense} onChange={(x) => set('approvalLimits', { ...v.approvalLimits, expense: N(x) })} prefix="₹" /></Field>
            <Field label="Fuel issue"><NumberInput value={v.approvalLimits.fuel} onChange={(x) => set('approvalLimits', { ...v.approvalLimits, fuel: N(x) })} prefix="₹" /></Field>
            <div className="col-span-2">
              <Toggle checked={v.excludePendingFromCost} onChange={(x) => set('excludePendingFromCost', x)} label="Exclude pending entries from final cost" hint="APR-03 · unapproved entries show as pending in reports" />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Entry rules" subtitle="MAT-14 · ROLE-04 · LAB-05 · MAT-10" icon={<Lock className="w-[18px] h-[18px]" />} />
          <div className="px-5 pb-5 grid grid-cols-2 gap-4">
            <Field label="Back-dating allowed (days)" hint="Beyond this needs approval"><NumberInput value={v.backdateDays} onChange={(x) => set('backdateDays', N(x))} /></Field>
            <Field label="Lock entries after (days)" hint="Then only Admin can edit, with reason"><NumberInput value={v.editLockDays} onChange={(x) => set('editLockDays', N(x))} /></Field>
            <Field label="Attendance locks next day at" hint="24-hour clock"><NumberInput value={v.attendanceLockHour} onChange={(x) => set('attendanceLockHour', N(x))} suffix=":00" /></Field>
            <Field label="Session timeout" hint="SEC-02"><NumberInput value={v.sessionTimeoutMin} onChange={(x) => set('sessionTimeoutMin', N(x))} suffix="min" /></Field>
            <div className="col-span-2"><Toggle checked={v.allowNegativeOverride} onChange={(x) => set('allowNegativeOverride', x)} label="Allow Admin to override negative stock block" hint="MAT-10 · the system always warns" /></div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Tolerances" subtitle="MAT-18 · FUEL-08 · PLT-11 — variance above these raises alerts" />
          <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(Object.keys(v.tolerance) as Array<keyof Settings['tolerance']>).map((k) => (
              <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}><NumberInput value={v.tolerance[k]} onChange={(x) => set('tolerance', { ...v.tolerance, [k]: N(x) })} suffix="%" /></Field>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Valuation & allocation" subtitle="MAT-11 · EXP-05" />
          <div className="px-5 pb-5 space-y-4">
            <Field label="Stock valuation method">
              <Segmented value={v.valuation} onChange={(x) => set('valuation', x)} options={[{ value: 'WAVG', label: 'Weighted average' }, { value: 'FIFO', label: 'FIFO' }]} />
            </Field>
            <Field label="Default overhead allocation basis">
              <Select value={v.overheadBasis} onChange={(x) => set('overheadBasis', x as Settings['overheadBasis'])} options={[{ value: 'EQUAL', label: 'Equal share' }, { value: 'CONTRACT', label: '% of contract value' }, { value: 'BILLING', label: '% of billing' }, { value: 'MANUAL', label: 'Manual' }]} />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Notifications" subtitle="APR-02 · alerts in-app plus these channels where configured" />
          <div className="px-5 pb-5 space-y-3">
            <Toggle checked={v.notify.whatsapp} onChange={(x) => set('notify', { ...v.notify, whatsapp: x })} label="WhatsApp" hint="Via WhatsApp Business gateway (TEC-08)" />
            <Toggle checked={v.notify.sms} onChange={(x) => set('notify', { ...v.notify, sms: x })} label="SMS" />
            <Toggle checked={v.notify.email} onChange={(x) => set('notify', { ...v.notify, email: x })} label="Email" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Financial year & data" subtitle="SEC-04 · TEC-03" icon={<DatabaseBackup className="w-[18px] h-[18px]" />} />
          <div className="px-5 pb-5 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-fg-2">Current financial year</span><b>{fyCode(today())} (1 Apr – 31 Mar)</b></div>
            <div className="flex justify-between"><span className="text-fg-2">Previous year</span><Badge tone="neutral"><Lock className="w-3 h-3" /> Closed & locked</Badge></div>
            <div className="flex justify-between"><span className="text-fg-2">Carry forward</span><span>Stock, supplier & client balances</span></div>
            <div className="flex justify-between"><span className="text-fg-2">Backups</span><span>Daily, kept 30 days (India region)</span></div>
            <div className="flex justify-between"><span className="text-fg-2">Changes made in this demo</span><span className="num">{journalSize()}</span></div>
            {s.isAdmin && <Button className="w-full justify-center" onClick={() => toast.info('Year-end closing', 'In production this carries forward stock and balances and locks the closed period (SEC-04).')}>Close financial year…</Button>}
          </div>
        </Card>
      </div>
      {s.isAdmin && (
        <div className="sticky bottom-20 lg:bottom-4 z-10 flex justify-end">
          <Button variant="primary" size="lg" onClick={save} icon={<CircleCheck className="w-5 h-5" />} className="shadow-pop">Save settings</Button>
        </div>
      )}
    </div>
  );
}

/* ================= Audit log (ROLE-05 / SEC-03) ================= */
function AuditTab() {
  const db = useDB();
  const n = useNames();
  const [action, setAction] = useState('all');
  const [view, setView] = useState<AuditEntry | null>(null);
  const rows = useMemo(() => db.audit.slice().sort((a, b) => b.at.localeCompare(a.at)).filter((a) => action === 'all' || a.action === action), [db, action]);
  const tone: Record<string, 'good' | 'info' | 'warn' | 'bad' | 'neutral' | 'violet'> = { CREATE: 'good', UPDATE: 'info', APPROVE: 'good', REJECT: 'bad', SEND_BACK: 'warn', CANCEL: 'bad', DELETE: 'bad', LOGIN: 'neutral', DEACTIVATE: 'warn' };
  return (
    <>
      <DataTable
        title="Audit log"
        subtitle="Every add, edit and delete: who, when, old value, new value"
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setView}
        pageSize={20}
        toolbar={<Select value={action} onChange={setAction} className="w-44" options={[{ value: 'all', label: 'All actions' }, ...['CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'SEND_BACK', 'CANCEL', 'DEACTIVATE', 'LOGIN'].map((x) => ({ value: x, label: x.replace('_', ' ').toLowerCase() }))]} />}
        columns={[
          { key: 'at', header: 'When', value: (r) => r.at, cell: (r) => <span className="text-[13px] whitespace-nowrap">{dateTime(r.at)}</span> },
          { key: 'user', header: 'User', value: (r) => n.user(r.userId) },
          { key: 'action', header: 'Action', value: (r) => r.action, cell: (r) => <Badge tone={tone[r.action]}>{r.action.replace('_', ' ').toLowerCase()}</Badge> },
          { key: 'entity', header: 'Record', value: (r) => r.entity, hideMobile: true },
          { key: 'label', header: 'Details', primary: true, value: (r) => r.label },
          { key: 'reason', header: 'Reason', value: (r) => r.reason || '', hideMobile: true },
        ]}
      />
      {view && (
        <Drawer open onClose={() => setView(null)} title={view.label} subtitle={`${n.user(view.userId)} · ${dateTime(view.at)}`}>
          <div className="space-y-4">
            <Badge tone={tone[view.action]}>{view.action}</Badge>
            {view.reason && <Callout>Reason: {view.reason}</Callout>}
            <div className="grid grid-cols-1 gap-3">
              <Section title="Old value"><pre className="text-xs bg-surface-2 border border-line rounded-xl p-3 overflow-auto max-h-64">{view.before ? JSON.stringify(view.before, null, 2) : '—'}</pre></Section>
              <Section title="New value"><pre className="text-xs bg-surface-2 border border-line rounded-xl p-3 overflow-auto max-h-64">{view.after ? JSON.stringify(view.after, null, 2) : '—'}</pre></Section>
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}


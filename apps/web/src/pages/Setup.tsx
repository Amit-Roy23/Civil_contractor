import { useState } from 'react';
import { CircleCheck, KeyRound } from 'lucide-react';
import { api, type LoginConfig } from '../data/api';
import { Button, Callout } from '../components/ui/core';
import { Field, Input, Select } from '../components/ui/fields';

/**
 * First visit to a new server: create the company and its owner login once, with the set-up key
 * from the hosting settings (SETUP_KEY). No terminal is needed.
 */
export function SetupCard({ cfg, onDone }: { cfg: LoginConfig; onDone: (username: string, company: string) => void }) {
  const s = cfg.setup!;
  const [f, setF] = useState({ setupKey: '', code: 'sd', template: s.templates[0]?.id || 'blank', companyName: '', ownerName: '', ownerUsername: 'owner', ownerPhone: '', email: '', ownerPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const blank = f.template === 'blank';
  const save = async () => {
    setErr('');
    if (f.ownerPassword.length < 8) return setErr('Owner password: at least 8 characters');
    if (f.ownerPassword !== f.confirm) return setErr('The two passwords do not match');
    if (blank && (!f.companyName.trim() || !f.ownerName.trim())) return setErr('Company name and owner name are required');
    setBusy(true);
    try {
      const r = await api.setup({ ...f, confirm: undefined });
      onDone(r.username, r.company);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bg-surface border border-line rounded-3xl shadow-card p-6 sm:p-8">
      <h2 className="text-xl font-bold flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-strong" /> First-time set-up</h2>
      <p className="text-sm text-fg-2 mt-1">This server has no company yet. Create the company and its owner login once; everyone else is added later in Administration › Users.</p>
      {!s.keyConfigured && <Callout tone="warn" className="mt-4">Set <b>SETUP_KEY</b> (12 characters or more) in the hosting settings and redeploy, then enter it here.</Callout>}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Set-up key" required className="sm:col-span-2" hint="The SETUP_KEY you saved in the hosting settings">
          <Input type="password" value={f.setupKey} onChange={(e) => set('setupKey', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Start from" className="sm:col-span-2">
          <Select value={f.template} onChange={(v) => set('template', v)} options={[...s.templates.map((t) => ({ value: t.id, label: t.label })), { value: 'blank', label: 'Blank company (enter masters later or import from Excel)' }]} />
        </Field>
        <Field label="Company code" required hint="Short, lowercase — e.g. sd">
          <Input value={f.code} onChange={(e) => set('code', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
        </Field>
        {blank ? (
          <>
            <Field label="Company / firm name" required><Input value={f.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
            <Field label="Owner name" required><Input value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
            <Field label="Owner username" required><Input value={f.ownerUsername} onChange={(e) => set('ownerUsername', e.target.value.toLowerCase())} autoCapitalize="none" /></Field>
            <Field label="Owner mobile"><Input value={f.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} inputMode="tel" /></Field>
            <Field label="E-mail"><Input value={f.email} onChange={(e) => set('email', e.target.value)} type="email" /></Field>
          </>
        ) : (
          <div className="text-xs text-muted self-end pb-2">The owner login comes from the template (Saurajit Deb: username <b>saurajit</b>).</div>
        )}
        <Field label="Owner password" required><Input type="password" value={f.ownerPassword} onChange={(e) => set('ownerPassword', e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirm password" required><Input type="password" value={f.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" /></Field>
      </div>
      {err && <p className="text-sm text-bad mt-3">{err}</p>}
      <Button variant="primary" size="lg" className="w-full justify-center mt-5" icon={<CircleCheck className="w-4 h-4" />} loading={busy} onClick={() => void save()}>
        Create company
      </Button>
    </div>
  );
}

/** the Admin forgot the password: set a new one with the set-up key from the hosting settings */
export function RecoverCard({ company, onDone, onCancel }: { company?: string; onDone: (username: string) => void; onCancel: () => void }) {
  const [f, setF] = useState({ setupKey: '', username: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    if (!f.username.trim()) return setErr('Enter the Admin username');
    if (f.newPassword.length < 8) return setErr('New password: at least 8 characters');
    if (f.newPassword !== f.confirm) return setErr('The two passwords do not match');
    setBusy(true);
    try {
      const r = await api.resetOwner({ setupKey: f.setupKey, username: f.username.trim(), newPassword: f.newPassword, company: company || undefined });
      onDone(r.username);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bg-surface border border-line rounded-3xl shadow-card p-6 sm:p-8">
      <h2 className="text-xl font-bold flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-strong" /> Forgot Admin password</h2>
      <p className="text-sm text-fg-2 mt-1">For the Admin only, with the set-up key saved in the hosting settings. Other users ask the Admin to set a new password in Administration › Users.</p>
      <div className="mt-5 space-y-4">
        <Field label="Set-up key" required><Input type="password" value={f.setupKey} onChange={(e) => setF({ ...f, setupKey: e.target.value })} autoComplete="off" /></Field>
        <Field label="Admin username" required><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} autoCapitalize="none" placeholder="saurajit" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="New password" required><Input type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Confirm new password" required><Input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" /></Field>
        </div>
        {err && <p className="text-sm text-bad">{err}</p>}
        <Button variant="primary" size="lg" className="w-full justify-center" icon={<CircleCheck className="w-4 h-4" />} loading={busy} onClick={() => void save()}>Set new password</Button>
        <button type="button" className="w-full text-sm text-muted hover:text-fg" onClick={onCancel}>Back to sign in</button>
      </div>
    </div>
  );
}

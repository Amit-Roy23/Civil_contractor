import { useState } from 'react';
import { ArrowRight, Building2, Factory, HardHat, KeyRound, Landmark, ShieldCheck, Smartphone, Truck, Warehouse } from 'lucide-react';
import { useDB, setCurrentUser } from '../data/store';
import { Button, toast } from '../components/ui/core';
import { Field, Input, Segmented } from '../components/ui/fields';
import { cn, initials } from '../lib/utils';
import { navigate } from '../lib/router';

const ROLE_META: Record<string, { icon: any; tint: string; blurb: string }> = {
  owner: { icon: Landmark, tint: 'from-amber-400 to-orange-600', blurb: 'Dashboards, approvals, profitability' },
  accountant: { icon: ShieldCheck, tint: 'from-sky-400 to-blue-600', blurb: 'Purchases, payments, bills, ledgers' },
  store: { icon: Warehouse, tint: 'from-emerald-400 to-teal-600', blurb: 'Central store receipts & issues' },
  engineer: { icon: HardHat, tint: 'from-violet-400 to-purple-600', blurb: 'Site stock, labour, expenses' },
  plant: { icon: Factory, tint: 'from-cyan-400 to-sky-600', blurb: 'Production, dispatch, raw material' },
  fleet: { icon: Truck, tint: 'from-rose-400 to-pink-600', blurb: 'Fuel, trips, maintenance' },
};

export default function Login() {
  const db = useDB();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('demo@123');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [twoFa, setTwoFa] = useState<string | null>(null);
  const [code2, setCode2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const enter = (userId: string) => {
    setBusy(true);
    setTimeout(() => {
      setCurrentUser(userId);
      navigate('/', true);
      const u = db.users.find((x) => x.id === userId)!;
      toast.success(`Welcome, ${u.name.split(' ')[0]}`, db.roles.find((r) => r.id === u.roleId)?.name);
    }, 350);
  };

  const submit = () => {
    setErr('');
    if (mode === 'password') {
      const u = db.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase() && x.active);
      if (!u || password.length < 4) return setErr('Invalid username or password');
      if (u.twoFactor) return setTwoFa(u.id); // SEC-01 optional 2FA for Admin
      return enter(u.id);
    }
    const digits = phone.replace(/\D/g, '');
    const u = db.users.find((x) => x.phone.replace(/\D/g, '') === digits.slice(-10));
    if (!otpSent) {
      if (!u) return setErr('This mobile number is not registered');
      setOtpSent(true);
      toast.info('OTP sent', 'Demo OTP is 123456');
      return;
    }
    if (otp !== '123456') return setErr('Incorrect OTP');
    enter(u!.id);
  };

  const roles = db.roles.map((r) => ({ role: r, user: db.users.find((u) => u.roleId === r.id)! }));

  return (
    <div className="min-h-full flex flex-col lg:flex-row bg-bg">
      {/* hero */}
      <div className="relative lg:w-[46%] bg-side text-white overflow-hidden px-6 sm:px-10 pt-8 pb-10 lg:p-12 flex flex-col">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-orange-500/25 blur-3xl" />
        <div className="absolute -left-20 bottom-0 w-72 h-72 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/30">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold tracking-tight">WCM</div>
            <div className="text-[11px] text-white/60">Works Contract Management</div>
          </div>
        </div>
        <div className="relative mt-8 lg:mt-auto anim-page">
          <h1 className="text-[28px] sm:text-4xl lg:text-[42px] font-bold leading-[1.1] tracking-tight">
            Every rupee and every tonne,
            <br />
            <span className="bg-gradient-to-r from-amber-300 to-orange-500 bg-clip-text text-transparent">site by site.</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-white/70 max-w-md">Material, labour, fuel, plant output and billing for all your sites in one place, with live profit and loss for each site.</p>
          <div className="hidden sm:grid grid-cols-3 gap-3 mt-8 max-w-md stagger">
            {[
              [db.sites.length, 'Project sites'],
              [db.plants.length, 'Production plants'],
              [db.vehicles.length, 'Vehicles & machines'],
            ].map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 backdrop-blur">
                <div className="text-2xl font-bold">{n}</div>
                <div className="text-[11px] text-white/60">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative hidden lg:block h-2 mt-10 rounded-full hazard opacity-80" />
      </div>

      {/* form */}
      <div className="flex-1 flex items-start lg:items-center justify-center px-4 sm:px-8 py-8 lg:py-12">
        <div className="w-full max-w-[460px] anim-page">
          {twoFa ? (
            <div className="bg-surface border border-line rounded-3xl shadow-card p-6 sm:p-8">
              <h2 className="text-xl font-bold">Two-factor verification</h2>
              <p className="text-sm text-fg-2 mt-1">Admin accounts need a second step. Enter the 6-digit code from your authenticator app (demo: 123456).</p>
              <div className="mt-5 space-y-4">
                <Field label="Authenticator code" error={err}>
                  <Input autoFocus inputMode="numeric" maxLength={6} value={code2} onChange={(e) => setCode2(e.target.value.replace(/\D/g, ''))} placeholder="••••••" className="text-center tracking-[0.5em] text-lg h-12" />
                </Field>
                <Button variant="primary" size="lg" className="w-full justify-center" loading={busy} onClick={() => (code2 === '123456' ? enter(twoFa) : setErr('Incorrect code'))}>
                  Verify & sign in
                </Button>
                <button className="w-full text-sm text-muted hover:text-fg" onClick={() => (setTwoFa(null), setCode2(''), setErr(''))}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-3xl shadow-card p-6 sm:p-8">
              <h2 className="text-xl font-bold">Sign in</h2>
              <p className="text-sm text-fg-2 mt-1">Use your username and password, or your mobile number with an OTP.</p>
              <Segmented
                className="mt-5 w-full flex"
                value={mode}
                onChange={(m) => (setMode(m), setErr(''))}
                options={[
                  { value: 'password', label: 'Username' },
                  { value: 'otp', label: 'Mobile OTP' },
                ]}
              />
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                {mode === 'password' ? (
                  <>
                    <Field label="Username">
                      <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                    </Field>
                    <Field label="Password" error={err}>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Mobile number" hint="Try 98640 10004 (site engineer)">
                      <Input prefix="+91" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98640 10004" disabled={otpSent} />
                    </Field>
                    {otpSent && (
                      <Field label="OTP" error={err} hint="Demo OTP: 123456">
                        <Input autoFocus inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="tracking-[0.4em]" />
                      </Field>
                    )}
                    {!otpSent && err && <p className="text-xs text-bad">{err}</p>}
                  </>
                )}
                <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy} icon={mode === 'otp' ? <Smartphone className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}>
                  {mode === 'otp' && !otpSent ? 'Send OTP' : 'Sign in'}
                </Button>
              </form>
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">or open the demo as</span>
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 stagger">
              {roles.map(({ role, user }) => {
                const m = ROLE_META[role.id]!;
                const I = m.icon;
                return (
                  <button key={role.id} onClick={() => enter(user.id)} className="group text-left bg-surface border border-line rounded-2xl p-3 hover:border-brand hover:shadow-pop transition-all active:scale-[0.98]">
                    <div className="flex items-center gap-2.5">
                      <span className={cn('w-9 h-9 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shrink-0', m.tint)}>
                        <I className="w-[18px] h-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-fg truncate">{role.name}</span>
                        <span className="block text-[11px] text-muted truncate">
                          {initials(user.name)} · {user.name.split(' ')[0]}
                        </span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </div>
                    <div className="text-[11px] text-fg-2 mt-2 leading-snug">{m.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

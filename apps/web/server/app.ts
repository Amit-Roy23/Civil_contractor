import { timingSafeEqual } from 'node:crypto';
import type { AuditEntry, CollectionKey, DB } from '@civil/domain/types';
import { applyCommand, RuleError, type Change, type Command } from '@civil/domain/policy';
import { buildSession } from '@civil/domain/session';
import { snapshotFor, viewRecord } from '@civil/domain/visibility';
import { buildCompanyDB, type SetupSpec } from '@civil/domain/setup';
import saurajitDeb from '../../api/setup/saurajit-deb.json';
import * as store from './store.js';
import * as auth from './auth.js';
import { clock, newId } from './clock.js';
import { HttpError, header, str, type Req, type Res } from './http.js';

/**
 * The WCM API for serverless hosting (Vercel + MongoDB). Same endpoints and the same business rules
 * (@civil/domain) as the NestJS + PostgreSQL server, so the web app works with either.
 */

const ok = (json: unknown, status = 200): Res => ({ status, json });
const safe = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : x)));

/** what the client templates bundled with the app can set up */
const TEMPLATES: Record<string, { label: string; spec: SetupSpec }> = {
  'saurajit-deb': { label: 'M/s Saurajit Deb (firm, PWD offices, stores, plant, machines, materials)', spec: saurajitDeb as unknown as SetupSpec },
};

export async function handle(req: Req): Promise<Res> {
  const p = req.path.replace(/\/+$/, '') || '/';
  const m = req.method.toUpperCase();
  try {
    if (p === '/health' || p === '/api/health') return await health();
    const v = p.replace(/^\/api/, '');
    if (!v.startsWith('/v2/')) throw new HttpError(404, 'Not found');
    const r = v.slice(3); // "/auth/login"
    let mm: RegExpMatchArray | null;

    /* ---------- public ---------- */
    if (m === 'GET' && r === '/auth/config') return ok(await config());
    if (m === 'POST' && r === '/auth/login') {
      if (!str(req.body?.username, 100) || !str(req.body?.password, 200)) throw new HttpError(400, 'Enter username and password');
      const out = await auth.passwordLogin(str(req.body.company, 64), req.body.username, req.body.password, req.ip);
      if ('token' in out && out.companyId && out.userId) await auditLogin(out.companyId, out.userId, 'password');
      return ok(out);
    }
    if (m === 'POST' && r === '/auth/otp/request') {
      if (!str(req.body?.login, 100)) throw new HttpError(400, 'Enter your mobile number or username');
      return ok(await auth.requestOtp(str(req.body.company, 64), req.body.login, req.ip));
    }
    if (m === 'POST' && r === '/auth/otp/verify') {
      if (!str(req.body?.ticket, 2000) || !/^\d{6}$/.test(str(req.body?.code, 6))) throw new HttpError(400, 'Enter the 6-digit OTP');
      const out = await auth.verifyOtp(req.body.ticket, req.body.code);
      await auditLogin(out.companyId, out.userId, 'OTP');
      return ok(out);
    }
    if (m === 'POST' && r === '/auth/demo') throw new HttpError(403, 'There is no demo on this server');
    if (m === 'POST' && r === '/setup') return ok(await setup(req));
    if (m === 'POST' && r === '/setup/reset-owner') return ok(await resetOwner(req));
    if (r === '/cron/daily') return ok(await cronDaily(req));

    /* ---------- signed in ---------- */
    const c = await auth.authenticate(req);
    if (m === 'GET' && r === '/auth/me') return ok({ companyId: c.companyId, isDemo: c.isDemo, userId: c.session.user.id, rev: c.rev });
    if (m === 'POST' && r === '/auth/password') return ok(await changePassword(c, req.body));
    if (m === 'GET' && r === '/data/rev') return ok({ rev: c.rev });
    if (m === 'GET' && r === '/data/snapshot') return ok(safe({ rev: c.rev, companyId: c.companyId, isDemo: c.isDemo, userId: c.session.user.id, db: snapshotFor(c.db, c.session) }));
    if (m === 'POST' && r === '/data/commands') return ok(await command(c, req.body));

    /* ---------- admin ---------- */
    if (m === 'GET' && r === '/admin/backups') {
      admin(c);
      const rows = await store.listBackups(c.companyId);
      const copies = (await store.companies()).filter((x) => x.is_test && x.id.startsWith(`${c.companyId}-test-`)).map((x) => ({ id: x.id, name: x.name }));
      return ok({ backups: rows.map(backupRow), testCopies: copies, daily: !!process.env.CRON_SECRET && process.env.BACKUP_DAILY !== 'off', offsite: false });
    }
    if (m === 'POST' && r === '/admin/backups') {
      admin(c);
      return ok(backupRow(await store.createBackup(c.companyId, 'manual')));
    }
    if (m === 'GET' && (mm = r.match(/^\/admin\/backups\/(\d+)\/download$/))) {
      admin(c);
      const data = await store.backupData(c.companyId, Number(mm[1]));
      if (!data) throw new HttpError(404, 'Backup not found');
      return { status: 200, raw: data, headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="wcm-backup-${c.companyId}-${mm[1]}.json.gz"` } };
    }
    if (m === 'POST' && (mm = r.match(/^\/admin\/backups\/(\d+)\/restore-test$/))) {
      admin(c);
      return ok(await restoreTest(c, Number(mm[1])));
    }
    if (m === 'DELETE' && (mm = r.match(/^\/admin\/test-copies\/([^/]+)$/))) {
      admin(c);
      const code = decodeURIComponent(mm[1]!);
      const co = await store.company(code);
      if (!co?.is_test || !code.startsWith(`${c.companyId}-test-`)) throw new HttpError(403, 'Only your own restore-test copies can be removed');
      await store.dropCompany(code);
      return ok({ ok: true });
    }
    if (m === 'POST' && (mm = r.match(/^\/admin\/users\/([^/]+)\/password$/))) {
      if (!c.session.can('admin', 'edit')) throw new HttpError(403, 'Only Admin can reset passwords');
      const id = decodeURIComponent(mm[1]!);
      if (!c.db.users.some((u) => u.id === id)) throw new HttpError(400, 'Unknown user');
      const pw = str(req.body?.password, 200);
      if (pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
      await store.setPassword(c.companyId, id, await auth.hashPassword(pw));
      return ok({ ok: true });
    }
    if (m === 'POST' && r === '/admin/reset-demo') throw new HttpError(403, 'There is no demo on this server');
    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return ok({ statusCode: e.status, message: e.message }, e.status);
    if (e instanceof RuleError) return ok({ statusCode: e.status, message: e.message }, e.status);
    console.error(e);
    return ok({ statusCode: 500, message: 'Server error — please try again' }, 500);
  }
}

async function health(): Promise<Res> {
  const problems = auth.configProblems();
  if (problems.length) return ok({ status: 'down', problems }, 503);
  const t0 = Date.now();
  try {
    await (await store.mongo()).command({ ping: 1 });
  } catch {
    return ok({ status: 'down', database: 'unreachable' }, 503);
  }
  return ok({ status: 'ok', database: 'ok', dbMs: Date.now() - t0, timestamp: new Date().toISOString() });
}

async function config() {
  const problems = auth.configProblems();
  if (problems.length) throw new HttpError(503, `Server not configured: ${problems.join('; ')}`);
  const list = await store.companies();
  const real = list.filter((c) => !c.is_demo && !c.is_test);
  return {
    demo: null,
    needsCompany: real.length > 1 && !process.env.DEFAULT_COMPANY,
    testCopies: list.some((c) => c.is_test),
    // OTP sign-in and two-factor need an SMS provider
    sms: !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID),
    // the admin can set a new password with the set-up key
    recovery: (process.env.SETUP_KEY || '').length >= 12,
    // first visit: no company yet — the login page offers the one-time set-up
    setup: real.length === 0 ? { templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label })), keyConfigured: (process.env.SETUP_KEY || '').length >= 12 } : null,
  };
}

/* ---------- one-time set-up of the first company (no terminal needed) ---------- */
async function setup(req: Req) {
  const key = process.env.SETUP_KEY || '';
  if (key.length < 12) throw new HttpError(403, 'Set SETUP_KEY (12 characters or more) in the Vercel project settings, then redeploy');
  const given = Buffer.from(str(req.body?.setupKey, 200));
  const want = Buffer.from(key);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    await store.rateLimit(`setup:${req.ip}`, 10, 15 * 60_000);
    throw new HttpError(403, 'Wrong set-up key');
  }
  const real = (await store.companies()).filter((c) => !c.is_test);
  if (real.length && process.env.ALLOW_MORE_COMPANIES !== 'on') throw new HttpError(409, 'The company is already set up — sign in instead');
  const b = req.body || {};
  const code = str(b.code, 30).toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(code)) throw new HttpError(400, 'Company code: 2–30 lowercase letters, digits or dashes (e.g. sd)');
  if (real.some((c) => c.id === code)) throw new HttpError(409, `Company ${code} already exists`);
  const password = str(b.ownerPassword, 200);
  if (password.length < 8) throw new HttpError(400, 'Owner password: at least 8 characters');
  let spec: SetupSpec;
  if (b.template && b.template !== 'blank') {
    const t = TEMPLATES[String(b.template)];
    if (!t) throw new HttpError(400, 'Unknown set-up template');
    spec = structuredClone(t.spec);
  } else {
    spec = {
      company: { name: str(b.companyName, 200), gstin: str(b.gstin, 15), pan: str(b.pan, 10), address: str(b.address, 400), phone: str(b.ownerPhone, 20), email: str(b.email, 120), banks: [] },
      owner: { name: str(b.ownerName, 120), username: str(b.ownerUsername, 40), phone: str(b.ownerPhone, 20), email: str(b.email, 120) },
    } as SetupSpec;
  }
  const { db, errors } = buildCompanyDB(spec, clock().today);
  if (errors.length) throw new HttpError(400, `Please correct: ${errors.join('; ')}`);
  await store.replaceAll(code, db.company.name, db);
  await store.setPassword(code, db.users[0]!.id, await auth.hashPassword(password));
  return { ok: true, company: code, username: db.users[0]!.username, name: db.company.name };
}

/* ---------- admin forgot the password: a new one with the set-up key ---------- */
async function resetOwner(req: Req) {
  await store.rateLimit(`reset:${req.ip}`, 5, 15 * 60_000);
  const key = process.env.SETUP_KEY || '';
  if (key.length < 12) throw new HttpError(403, 'Password recovery is off: set SETUP_KEY (12+ characters) in the hosting settings and redeploy');
  const given = Buffer.from(str(req.body?.setupKey, 200));
  const want = Buffer.from(key);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, 'Wrong set-up key');
  const pw = str(req.body?.newPassword, 200);
  if (pw.length < 8) throw new HttpError(400, 'New password: at least 8 characters');
  const company = await auth.resolveCompany(str(req.body?.company, 64));
  const { db } = await store.load(company.id);
  const user = auth.findUser(db, str(req.body?.username, 100));
  // only an Admin (owner role) is recovered this way; everyone else is reset by the Admin
  if (!user || user.roleId !== 'owner') throw new HttpError(404, 'No Admin with this username — other users ask the Admin to reset their password');
  await store.setPassword(company.id, user.id, await auth.hashPassword(pw));
  const { now } = clock();
  await store.write(company.id, (d) => {
    const a: AuditEntry = { id: newId('au'), at: now, userId: user.id, action: 'UPDATE', entity: 'User', entityId: user.id, label: `${user.name}: Admin password reset with the set-up key` };
    return { db: { ...d, audit: [...d.audit, a] }, changes: [{ coll: 'audit', id: a.id, rec: a }] };
  });
  return { ok: true, username: user.username, company: company.id };
}

/* ---------- daily backup, called by Vercel Cron ---------- */
async function cronDaily(req: Req) {
  const s = process.env.CRON_SECRET || '';
  if (!s || header(req, 'authorization') !== `Bearer ${s}`) throw new HttpError(401, 'Not allowed');
  if (process.env.BACKUP_DAILY === 'off') return { skipped: 'BACKUP_DAILY=off' };
  const { today } = clock();
  const done: string[] = [];
  for (const co of (await store.companies()).filter((x) => !x.is_demo && !x.is_test)) {
    const last = await store.lastBackup(co.id, 'daily');
    if (last && clock(last.createdAt).today === today) continue;
    await store.createBackup(co.id, 'daily');
    done.push(co.id);
  }
  return { ok: true, backedUp: done };
}

/* ---------- helpers ---------- */
function admin(c: auth.Ctx) {
  if (!c.session.isAdmin) throw new HttpError(403, 'Only Admin can manage backups');
}
const backupRow = (b: store.BackupDoc) => ({ id: b.id, created_at: b.createdAt.toISOString(), kind: b.kind, size: b.size, rev: b.rev, records: b.records });

async function auditLogin(cid: string, uid: string, how: string) {
  const { now } = clock();
  await store.write(cid, (db) => {
    const u = db.users.find((x) => x.id === uid);
    const a: AuditEntry = { id: newId('au'), at: now, userId: uid, action: 'LOGIN', entity: 'Session', entityId: uid, label: `${u?.name} signed in (${how})` };
    const changes: Change[] = [{ coll: 'audit', id: a.id, rec: a }];
    let next: DB = { ...db, audit: [...db.audit, a] };
    if (u) {
      const user = { ...u, lastLogin: now };
      next = { ...next, users: next.users.map((x) => (x.id === uid ? user : x)) };
      changes.push({ coll: 'users', id: uid, rec: user });
    }
    return { db: next, changes };
  });
}

async function changePassword(c: auth.Ctx, b: any) {
  const next = str(b?.next, 200);
  if (next.length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  const cred = await store.credential(c.companyId, c.session.user.id);
  if (cred && !(await auth.verifyPassword(cred.hash, str(b?.current, 200)).catch(() => false))) throw new HttpError(403, 'Current password is wrong');
  await store.setPassword(c.companyId, c.session.user.id, await auth.hashPassword(next));
  return { ok: true };
}

async function command(c: auth.Ctx, b: any) {
  const cmd = b?.cmd as Command;
  if (!cmd || typeof cmd !== 'object' || typeof (cmd as any).kind !== 'string') throw new HttpError(400, 'Missing command');
  const cmdId = b?.cmdId === undefined ? '' : str(b.cmdId, 64);
  if (b?.cmdId !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(cmdId)) throw new HttpError(400, 'Invalid command id');
  // a new user's password never enters the data or the audit trail
  let password = '';
  if (cmd.kind === 'insert' && cmd.coll === 'users') {
    password = str((cmd.rec as any)?.password, 200);
    if (password.length < 8) throw new HttpError(400, 'Give the new user a password of at least 8 characters');
    cmd.rec = { ...cmd.rec };
    delete (cmd.rec as any).password;
  }
  const { today, now, hour } = clock();
  const userId = c.session.user.id;
  const out = await store.write(
    c.companyId,
    (db) => {
      const session = buildSession(db, userId);
      if (!session || !session.user.active) throw new RuleError('Your account is disabled', 403);
      const res = applyCommand({ db, session, today, now, hour, newId: () => newId() }, cmd);
      let next = res.db;
      const changes = [...res.changes];
      for (const a of res.audit) {
        const rec: AuditEntry = { id: newId('au'), at: now, userId, ...a };
        next = { ...next, audit: [...next.audit, rec] };
        changes.push({ coll: 'audit', id: rec.id, rec });
      }
      return { db: next, changes, extra: res.record };
    },
    cmdId ? { cmdId, userId } : undefined,
  );
  if (password && out.extra && !out.replay) await store.setPassword(c.companyId, (out.extra as any).id, await auth.hashPassword(password));
  // answer with what this user may see of the result
  const { db } = await store.load(c.companyId);
  const s = buildSession(db, userId);
  if (!s) throw new HttpError(403, 'Your account was removed');
  const visible = out.changes.map((ch) => ('single' in ch ? ch : { ...ch, rec: viewRecord(db, s, ch.coll as CollectionKey, ch.rec) })).filter((ch) => 'single' in ch || ch.rec !== undefined);
  const record = out.extra && cmd.kind !== 'settings' && cmd.kind !== 'company' && 'coll' in cmd ? viewRecord(db, s, (cmd as any).coll, out.extra) : out.extra;
  return safe({ rev: out.rev, record, changes: visible });
}

async function restoreTest(c: auth.Ctx, id: number) {
  const data = await store.backupData(c.companyId, id);
  if (!data) throw new HttpError(404, 'Backup not found');
  const b = store.decodeBackup(data);
  const code = `${c.companyId}-test-${id}`.slice(0, 30);
  const old = await store.company(code);
  if (old && !old.is_test) throw new HttpError(403, `${code} is not a test copy`);
  for (const r of b.db.roles) if ((r as any).approvalLimit === null) (r as any).approvalLimit = Infinity;
  await store.replaceAll(code, `${b.name} — restore test of backup ${id}`, b.db, { test: true });
  await store.putCredentials(code, b.credentials);
  store.forgetCache(code);
  const { db } = await store.load(code);
  const expected = store.counts(b.db);
  const actual = store.counts(db);
  const mismatches = Object.keys({ ...expected, ...actual }).filter((k) => expected[k] !== actual[k]);
  return { company: code, expected, actual, ok: mismatches.length === 0, mismatches, backupId: id, backupAt: b.createdAt, rev: b.rev, records: Object.values(expected).reduce((s, n) => s + n, 0) };
}

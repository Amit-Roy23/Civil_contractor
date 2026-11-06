import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { DB, User } from '@civil/domain/types';
import { buildSession, type Session } from '@civil/domain/session';
import * as store from './store.js';
import { HttpError, header, type Req } from './http.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/* ---------------- configuration checks (refuse to run a live site unsafely) ---------------- */
const WEAK = /change[-_ ]?me|development|test-super-secret|example|password|secret-key|^(.)\1+$/i;
export function configProblems(env = process.env): string[] {
  const out: string[] = [];
  if (!env.MONGODB_URI && !env.MONGO_URL) out.push('MONGODB_URI is not set');
  const s = env.JWT_SECRET || '';
  if (s.length < 32) out.push('JWT_SECRET must be at least 32 characters (generate one with: openssl rand -hex 32)');
  else if (WEAK.test(s)) out.push('JWT_SECRET looks like a sample value — generate a new one');
  return out;
}
function secret() {
  const p = configProblems();
  if (p.length) throw new HttpError(503, `Server not configured: ${p.join('; ')}`);
  return process.env.JWT_SECRET!;
}

/* ---------------- passwords: scrypt (N=2^15, r=8, p=1) ---------------- */
const N = 32768;
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(stored: string, pw: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false; // e.g. an argon2 hash from the PostgreSQL version: reset the password
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

/* ---------------- tokens: JWT, HS256 ---------------- */
type TokenBody = { sub: string; cid: string; typ: 'access'; exp: number } | { sub: string; cid: string; typ: 'otp'; purpose: 'login' | '2fa'; exp: number };
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
function sign(body: object, seconds: number) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ ...body, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + seconds }));
  const sig = createHmac('sha256', secret()).update(`${head}.${payload}`).digest('base64url');
  return `${head}.${payload}.${sig}`;
}
function verify(token: string): TokenBody {
  const bad = () => new HttpError(401, 'Your session has expired — please sign in again');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw bad();
  const want = createHmac('sha256', secret()).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw bad();
  let body: TokenBody;
  try {
    body = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    throw bad();
  }
  if (!body.exp || body.exp * 1000 < Date.now()) throw bad();
  return body;
}
const hours = () => Number(process.env.SESSION_HOURS || 12);
export const signAccess = (cid: string, uid: string) => sign({ sub: uid, cid, typ: 'access' }, hours() * 3600);
const signTicket = (cid: string, uid: string, purpose: 'login' | '2fa') => sign({ sub: uid, cid, typ: 'otp', purpose }, 600);

/* ---------------- companies and users ---------------- */
export async function resolveCompany(code?: string) {
  const list = await store.companies();
  const want = (code || '').trim().toLowerCase();
  const real = list.filter((c) => !c.is_demo && !c.is_test);
  const pick = want ? list.find((c) => c.id === want) : list.find((c) => c.id === process.env.DEFAULT_COMPANY) || (real.length === 1 ? real[0] : undefined);
  if (!pick) throw new HttpError(401, want ? 'Company code not found' : 'Enter your company code');
  return pick;
}
export function findUser(db: DB, login: string): User | undefined {
  const l = login.trim().toLowerCase();
  const digits = l.replace(/\D/g, '');
  return db.users.find((u) => u.username.toLowerCase() === l || (digits.length >= 10 && u.phone.replace(/\D/g, '').endsWith(digits.slice(-10))));
}
const maskPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length >= 4 ? `•••••• ${d.slice(-4)}` : '';
};

export async function passwordLogin(code: string | undefined, login: string, password: string, ip: string) {
  await store.rateLimit(`ip:${ip}`, 30, 15 * 60_000);
  const company = await resolveCompany(code);
  const { db } = await store.load(company.id);
  const user = findUser(db, login);
  const bad = () => new HttpError(401, 'Wrong username or password');
  if (!user) throw bad();
  await store.rateLimit(`user:${company.id}:${user.id}`, 10, 15 * 60_000);
  const cred = await store.credential(company.id, user.id);
  if (!cred) throw bad();
  if (cred.lockedUntil && cred.lockedUntil > new Date()) throw new HttpError(403, 'Account locked after too many wrong passwords — try again in 15 minutes');
  const ok = await verifyPassword(cred.hash, password).catch(() => false);
  await store.recordLogin(company.id, user.id, ok);
  if (!ok) throw bad();
  if (!user.active) throw new HttpError(403, 'This user is disabled — contact the admin');
  if (user.twoFactor) {
    await issueOtp(company.id, user, '2fa');
    return { otpRequired: true as const, ticket: signTicket(company.id, user.id, '2fa'), phone: maskPhone(user.phone) };
  }
  return { token: signAccess(company.id, user.id), companyId: company.id, userId: user.id };
}

const otpHash = (cid: string, uid: string, code: string) => createHash('sha256').update(`${cid}:${uid}:${code}:${secret()}`).digest('hex');
async function issueOtp(cid: string, user: User, purpose: 'login' | '2fa') {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await store.putOtp(cid, user.id, purpose, otpHash(cid, user.id, code));
  await sendOtp(user.phone, code);
}
export async function requestOtp(code: string | undefined, login: string, ip: string) {
  await store.rateLimit(`otp-ip:${ip}`, 10, 15 * 60_000);
  const company = await resolveCompany(code);
  const { db } = await store.load(company.id);
  const user = findUser(db, login);
  if (!user || !user.active || !user.phone) throw new HttpError(401, 'No active user with this mobile number / username');
  await store.rateLimit(`otp-user:${company.id}:${user.id}`, 5, 15 * 60_000);
  await issueOtp(company.id, user, 'login');
  return { ticket: signTicket(company.id, user.id, 'login'), phone: maskPhone(user.phone), demo: false };
}
export async function verifyOtp(ticket: string, code: string) {
  const t = verify(ticket);
  if (t.typ !== 'otp') throw new HttpError(401, 'Invalid request');
  const row = await store.bumpOtp(t.cid, t.sub, t.purpose);
  if (!row || row.expiresAt < new Date()) throw new HttpError(401, 'OTP expired — request a new one');
  if (row.attempts > 5) throw new HttpError(403, 'Too many wrong OTPs — request a new one');
  if (row.codeHash !== otpHash(t.cid, t.sub, code)) throw new HttpError(401, 'Wrong OTP');
  await store.dropOtp(t.cid, t.sub, t.purpose);
  const { db } = await store.load(t.cid);
  if (!db.users.find((u) => u.id === t.sub)?.active) throw new HttpError(403, 'This user is disabled — contact the admin');
  return { token: signAccess(t.cid, t.sub), companyId: t.cid, userId: t.sub };
}

/** MSG91 SMS when configured; otherwise OTP sign-in is unavailable on a live site */
async function sendOtp(phone: string, code: string) {
  const digits = phone.replace(/\D/g, '');
  const mobile = digits.length === 10 ? `91${digits}` : digits;
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_OTP_TEMPLATE_ID) {
    if (process.env.OTP_TO_LOG === 'on') {
      console.warn(`OTP for ${mobile}: ${code} (SMS not configured)`);
      return;
    }
    throw new HttpError(503, 'SMS is not set up yet — sign in with your password');
  }
  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: process.env.MSG91_AUTH_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ template_id: process.env.MSG91_OTP_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: mobile, otp: code }] }),
  });
  if (!res.ok) throw new HttpError(503, 'Could not send the OTP — try again or use your password');
}

/* ---------------- request authentication ---------------- */
export interface Ctx {
  companyId: string;
  isDemo: boolean;
  rev: number;
  db: DB;
  session: Session;
}
export async function authenticate(req: Req): Promise<Ctx> {
  const h = header(req, 'authorization');
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in');
  const t = verify(h.slice(7));
  if (t.typ !== 'access') throw new HttpError(401, 'Please sign in');
  const co = await store.company(t.cid);
  if (!co) throw new HttpError(401, 'Please sign in');
  const { db, rev } = await store.load(t.cid);
  const user = db.users.find((u) => u.id === t.sub);
  if (!user || !user.active) throw new HttpError(401, 'Your account is disabled — contact the admin');
  if (!db.roles.some((r) => r.id === user.roleId)) throw new HttpError(401, 'Your role was removed — contact the admin');
  const session = buildSession(db, user.id);
  if (!session) throw new HttpError(401, 'Please sign in');
  return { companyId: t.cid, isDemo: co.is_demo, rev, db, session };
}

import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomInt } from 'node:crypto';
import type { DB, User } from '@civil/domain/types';
import { buildSession, type Session } from '@civil/domain/session';
import { V2Store } from './store.js';
import { sendOtp } from './sms.js';

const secret = () => process.env.JWT_SECRET || 'civil-erp-development-jwt-access-token-secret-key-32chars';
const TOKEN_HOURS = Number(process.env.SESSION_HOURS || 12);
export const DEMO_OTP = '123456';

export interface V2Request {
  companyId: string;
  isDemo: boolean;
  rev: number;
  db: DB;
  session: Session;
}

type TokenBody = { sub: string; cid: string; typ: 'access' } | { sub: string; cid: string; typ: 'otp'; purpose: 'login' | '2fa' };

export function signAccess(companyId: string, userId: string) {
  return jwt.sign({ sub: userId, cid: companyId, typ: 'access' }, secret(), { expiresIn: `${TOKEN_HOURS}h` });
}
function signTicket(companyId: string, userId: string, purpose: 'login' | '2fa') {
  return jwt.sign({ sub: userId, cid: companyId, typ: 'otp', purpose }, secret(), { expiresIn: '10m' });
}
function verify(token: string): TokenBody {
  try {
    return jwt.verify(token, secret()) as TokenBody;
  } catch {
    throw new UnauthorizedException('Your session has expired — please sign in again');
  }
}

/** simple in-memory limiter: N attempts per window per key (login brute-force protection) */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpException('Too many attempts — please wait a few minutes and try again', 429);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 50_000) hits.clear();
}

const otpHash = (companyId: string, userId: string, code: string) => createHash('sha256').update(`${companyId}:${userId}:${code}:${secret()}`).digest('hex');

@Injectable()
export class V2Auth {
  constructor(private store: V2Store) {}

  /** company to sign in to: given code, DEFAULT_COMPANY, or the only real company */
  async resolveCompany(code?: string) {
    const list = await this.store.companies();
    const want = (code || '').trim().toLowerCase();
    const pick = want ? list.find((c) => c.id === want) : list.find((c) => c.id === process.env.DEFAULT_COMPANY) || (list.filter((c) => !c.is_demo).length === 1 ? list.find((c) => !c.is_demo) : list.length === 1 ? list[0] : undefined);
    if (!pick) throw new UnauthorizedException(want ? 'Company code not found' : 'Enter your company code');
    return pick;
  }

  findUser(db: DB, login: string): User | undefined {
    const l = login.trim().toLowerCase();
    const digits = l.replace(/\D/g, '');
    return db.users.find((u) => u.username.toLowerCase() === l || (digits.length >= 10 && u.phone.replace(/\D/g, '').endsWith(digits.slice(-10))));
  }

  async passwordLogin(companyCode: string | undefined, login: string, password: string, ip: string) {
    rateLimit(`ip:${ip}`, 30, 15 * 60_000);
    const company = await this.resolveCompany(companyCode);
    const { db } = await this.store.load(company.id);
    const user = this.findUser(db, login);
    const bad = () => new UnauthorizedException('Wrong username or password');
    if (!user) throw bad();
    rateLimit(`user:${company.id}:${user.id}`, 10, 15 * 60_000);
    const cred = await this.store.credential(company.id, user.id);
    if (!cred) throw bad();
    if (cred.locked_until && cred.locked_until > new Date()) throw new ForbiddenException('Account locked after too many wrong passwords — try again in 15 minutes');
    const ok = await argon2.verify(cred.password_hash, password).catch(() => false);
    await this.store.recordLogin(company.id, user.id, ok);
    if (!ok) throw bad();
    if (!user.active) throw new ForbiddenException('This user is disabled — contact the admin');
    if (user.twoFactor && !company.is_demo) {
      await this.issueOtp(company.id, user, '2fa');
      return { otpRequired: true as const, ticket: signTicket(company.id, user.id, '2fa'), phone: maskPhone(user.phone) };
    }
    return { token: signAccess(company.id, user.id), companyId: company.id, userId: user.id };
  }

  async requestOtp(companyCode: string | undefined, login: string, ip: string) {
    rateLimit(`otp-ip:${ip}`, 10, 15 * 60_000);
    const company = await this.resolveCompany(companyCode);
    const { db } = await this.store.load(company.id);
    const user = this.findUser(db, login);
    if (!user || !user.active || !user.phone) throw new UnauthorizedException('No active user with this mobile number / username');
    rateLimit(`otp-user:${company.id}:${user.id}`, 5, 15 * 60_000);
    if (!company.is_demo) await this.issueOtp(company.id, user, 'login');
    return { ticket: signTicket(company.id, user.id, 'login'), phone: maskPhone(user.phone), demo: company.is_demo };
  }

  private async issueOtp(companyId: string, user: User, purpose: 'login' | '2fa') {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.store.sql`INSERT INTO wcm_otps (company_id, user_id, purpose, code_hash, expires_at) VALUES (${companyId}, ${user.id}, ${purpose}, ${otpHash(companyId, user.id, code)}, now() + interval '5 minutes')
                         ON CONFLICT (company_id, user_id, purpose) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`;
    await sendOtp(user.phone, code);
  }

  async verifyOtp(ticket: string, code: string) {
    const t = verify(ticket);
    if (t.typ !== 'otp') throw new UnauthorizedException('Invalid request');
    const company = await this.store.company(t.cid);
    if (!company) throw new UnauthorizedException('Invalid request');
    if (company.is_demo) {
      if (code !== DEMO_OTP) throw new UnauthorizedException(`Wrong OTP — the demo OTP is ${DEMO_OTP}`);
    } else {
      const [row] = await this.store.sql<{ code_hash: string; attempts: number; expires_at: Date }[]>`
        UPDATE wcm_otps SET attempts = attempts + 1 WHERE company_id = ${t.cid} AND user_id = ${t.sub} AND purpose = ${t.purpose} RETURNING code_hash, attempts, expires_at`;
      if (!row || row.expires_at < new Date()) throw new UnauthorizedException('OTP expired — request a new one');
      if (row.attempts > 5) throw new ForbiddenException('Too many wrong OTPs — request a new one');
      if (row.code_hash !== otpHash(t.cid, t.sub, code)) throw new UnauthorizedException('Wrong OTP');
      await this.store.sql`DELETE FROM wcm_otps WHERE company_id = ${t.cid} AND user_id = ${t.sub} AND purpose = ${t.purpose}`;
    }
    const { db } = await this.store.load(t.cid);
    const user = db.users.find((u) => u.id === t.sub);
    if (!user?.active) throw new ForbiddenException('This user is disabled — contact the admin');
    return { token: signAccess(t.cid, t.sub), companyId: t.cid, userId: t.sub };
  }

  async hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}

const maskPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length >= 4 ? `•••••• ${d.slice(-4)}` : '';
};

/** checks the bearer token and gives the handler the user's company data and session */
@Injectable()
export class V2Guard implements CanActivate {
  constructor(private store: V2Store) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const h: string = req.headers['authorization'] || '';
    if (!h.startsWith('Bearer ')) throw new UnauthorizedException('Please sign in');
    const t = verify(h.slice(7));
    if (t.typ !== 'access') throw new UnauthorizedException('Please sign in');
    const company = await this.store.company(t.cid);
    if (!company) throw new UnauthorizedException('Please sign in');
    const { db, rev } = await this.store.load(t.cid);
    const user = db.users.find((u) => u.id === t.sub);
    if (!user || !user.active) throw new UnauthorizedException('Your account is disabled — contact the admin');
    if (!db.roles.some((r) => r.id === user.roleId)) throw new UnauthorizedException('Your role was removed — contact the admin');
    const session = buildSession(db, user.id);
    if (!session) throw new UnauthorizedException('Please sign in');
    req.v2 = { companyId: t.cid, isDemo: company.is_demo, rev, db, session } satisfies V2Request;
    return true;
  }
}

export const Ctx2 = createParamDecorator((_d: unknown, ctx: ExecutionContext): V2Request => ctx.switchToHttp().getRequest().v2);

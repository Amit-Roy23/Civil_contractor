import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpException, Ip, NotFoundException, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as argon2 from 'argon2';
import type { AuditEntry, CollectionKey, DB } from '@civil/domain/types';
import { applyCommand, RuleError, type Change, type Command } from '@civil/domain/policy';
import { buildSession } from '@civil/domain/session';
import { snapshotFor, viewRecord } from '@civil/domain/visibility';
import { V2Store } from './store.js';
import { Ctx2, signAccess, V2Auth, V2Guard, type V2Request } from './auth.js';
import { DemoService } from './demo.service.js';
import { BackupService, counts } from './backup.service.js';
import { clock, newId } from './clock.js';

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v : '');

@Controller('v2/auth')
export class AuthV2Controller {
  constructor(
    private auth: V2Auth,
    private store: V2Store,
    private demo: DemoService,
  ) {}

  /** public: what the login page should offer */
  @Get('config')
  async config() {
    const list = await this.store.companies();
    const demoCo = list.find((c) => c.is_demo);
    let demo: unknown = null;
    if (demoCo && this.demo.oneClick()) {
      const { db } = await this.store.load(demoCo.id);
      demo = { companyId: demoCo.id, users: db.users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, username: u.username, roleId: u.roleId, role: db.roles.find((r) => r.id === u.roleId)?.name, sites: u.siteIds.length })) };
    }
    return { demo, needsCompany: list.filter((c) => !c.is_demo && !c.is_test).length > 1 && !process.env.DEFAULT_COMPANY, testCopies: list.some((c) => c.is_test) };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() b: any, @Ip() ip: string) {
    if (!str(b?.username, 100) || !str(b?.password, 200)) throw new BadRequestException('Enter username and password');
    const r = await this.auth.passwordLogin(str(b.company, 64), b.username, b.password, ip);
    if ('token' in r && r.token) await this.audit(r.companyId!, r.userId!, 'password');
    return r;
  }

  @Post('otp/request')
  @HttpCode(200)
  async otpRequest(@Body() b: any, @Ip() ip: string) {
    if (!str(b?.login, 100)) throw new BadRequestException('Enter your mobile number or username');
    return this.auth.requestOtp(str(b.company, 64), b.login, ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  async otpVerify(@Body() b: any) {
    if (!str(b?.ticket, 2000) || !/^\d{6}$/.test(str(b?.code, 6))) throw new BadRequestException('Enter the 6-digit OTP');
    const r = await this.auth.verifyOtp(b.ticket, b.code);
    await this.audit(r.companyId, r.userId, 'OTP');
    return r;
  }

  /** one-click role cards — demo company only */
  @Post('demo')
  @HttpCode(200)
  async demoLogin(@Body() b: any) {
    if (!this.demo.oneClick()) throw new ForbiddenException('Demo sign-in is turned off');
    const co = (await this.store.companies()).find((c) => c.is_demo);
    if (!co) throw new ForbiddenException('No demo company on this server');
    const { db } = await this.store.load(co.id);
    const u = db.users.find((x) => x.id === str(b?.userId, 64) && x.active);
    if (!u) throw new BadRequestException('Unknown demo user');
    await this.audit(co.id, u.id, 'demo');
    return { token: signAccess(co.id, u.id), companyId: co.id, userId: u.id };
  }

  @Get('me')
  @UseGuards(V2Guard)
  me(@Ctx2() c: V2Request) {
    return { companyId: c.companyId, isDemo: c.isDemo, userId: c.session.user.id, rev: c.rev };
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(V2Guard)
  async changePassword(@Ctx2() c: V2Request, @Body() b: any) {
    const next = str(b?.next, 200);
    if (next.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const cred = await this.store.credential(c.companyId, c.session.user.id);
    if (cred && !(await argon2.verify(cred.password_hash, str(b?.current, 200)).catch(() => false))) throw new ForbiddenException('Current password is wrong');
    await this.store.setPassword(c.companyId, c.session.user.id, await this.auth.hash(next));
    return { ok: true };
  }

  private async audit(companyId: string, userId: string, how: string) {
    const { now } = clock();
    await this.store.write(companyId, (db) => {
      const u = db.users.find((x) => x.id === userId);
      const a: AuditEntry = { id: newId('au'), at: now, userId, action: 'LOGIN', entity: 'Session', entityId: userId, label: `${u?.name} signed in (${how})` };
      const user = u ? { ...u, lastLogin: now } : undefined;
      const changes: Change[] = [{ coll: 'audit', id: a.id, rec: a }];
      let next: DB = { ...db, audit: [...db.audit, a] };
      if (user) {
        next = { ...next, users: next.users.map((x) => (x.id === userId ? user : x)) };
        changes.push({ coll: 'users', id: userId, rec: user });
      }
      return { db: next, changes };
    });
  }
}

/** snapshot cache: building a user's view is cheap, but polling clients ask often */
const snapCache = new Map<string, string>();

@Controller('v2/data')
@UseGuards(V2Guard)
export class DataV2Controller {
  constructor(
    private store: V2Store,
    private auth: V2Auth,
  ) {}

  @Get('rev')
  rev(@Ctx2() c: V2Request) {
    return { rev: c.rev };
  }

  @Get('snapshot')
  snapshot(@Ctx2() c: V2Request) {
    const key = `${c.companyId}:${c.rev}:${c.session.user.id}`;
    let body = snapCache.get(key);
    if (!body) {
      body = JSON.stringify({ rev: c.rev, companyId: c.companyId, isDemo: c.isDemo, userId: c.session.user.id, db: snapshotFor(c.db, c.session) }, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v));
      if (snapCache.size > 40) snapCache.clear();
      snapCache.set(key, body);
    }
    return JSON.parse(body);
  }

  @Post('commands')
  @HttpCode(200)
  async command(@Ctx2() c: V2Request, @Body() b: any) {
    const cmd = b?.cmd as Command;
    if (!cmd || typeof cmd !== 'object' || typeof cmd.kind !== 'string') throw new BadRequestException('Missing command');
    // PF-03: phones send a unique id with every entry; a repeat of an id already saved is answered, not saved again
    const cmdId = b?.cmdId === undefined ? '' : str(b.cmdId, 64);
    if (b?.cmdId !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(cmdId)) throw new BadRequestException('Invalid command id');
    // a new user's password never enters the data or the audit trail
    let password = '';
    if (cmd.kind === 'insert' && cmd.coll === 'users') {
      password = str((cmd.rec as any)?.password, 200);
      if (password.length < 8) throw new BadRequestException('Give the new user a password of at least 8 characters');
      cmd.rec = { ...cmd.rec };
      delete (cmd.rec as any).password;
    }
    const { today, now, hour } = clock();
    const userId = c.session.user.id;
    let out;
    try {
      out = await this.store.write(c.companyId, (db) => {
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
      }, cmdId ? { cmdId, userId } : undefined);
    } catch (e) {
      if (e instanceof RuleError) throw new HttpException({ statusCode: e.status, message: e.message }, e.status);
      throw e;
    }
    if (password && out.extra && !out.replay) await this.store.setPassword(c.companyId, out.extra.id, await this.auth.hash(password));
    // answer with what this user may see of the result
    const { db } = await this.store.load(c.companyId);
    const s = buildSession(db, userId);
    if (!s) throw new ForbiddenException('Your account was removed');
    const visible = out.changes
      .map((ch) => ('single' in ch ? ch : { ...ch, rec: viewRecord(db, s, ch.coll as CollectionKey, ch.rec) }))
      .filter((ch) => 'single' in ch || ch.rec !== undefined);
    const record = out.extra && cmd.kind !== 'settings' && cmd.kind !== 'company' && 'coll' in cmd ? viewRecord(db, s, cmd.coll, out.extra) : out.extra;
    return JSON.parse(JSON.stringify({ rev: out.rev, record, changes: visible }, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v)));
  }
}

@Controller('v2/admin')
@UseGuards(V2Guard)
export class AdminV2Controller {
  constructor(
    private store: V2Store,
    private auth: V2Auth,
    private demo: DemoService,
    private backups: BackupService,
  ) {}

  private admin(c: V2Request) {
    if (!c.session.isAdmin) throw new ForbiddenException('Only Admin can manage backups');
  }

  /* ---------- PF-07 backups ---------- */
  @Get('backups')
  async listBackups(@Ctx2() c: V2Request) {
    this.admin(c);
    const rows = await this.backups.list(c.companyId);
    const copies = (await this.store.companies()).filter((x) => x.is_test).map((x) => ({ id: x.id, name: x.name }));
    return { backups: rows.map((r) => ({ ...r, id: Number(r.id), rev: Number(r.rev) })), testCopies: copies, daily: process.env.BACKUP_DAILY !== 'off', offsite: process.env.BACKUP_S3 === 'on' };
  }

  @Post('backups')
  @HttpCode(200)
  async backupNow(@Ctx2() c: V2Request) {
    this.admin(c);
    if (c.isDemo) throw new ForbiddenException('The demo company is not backed up');
    const r = await this.backups.create(c.companyId, 'manual');
    return { ...r, id: Number(r.id), rev: Number(r.rev) };
  }

  @Get('backups/:id/download')
  async download(@Ctx2() c: V2Request, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    this.admin(c);
    const data = await this.backups.file(c.companyId, id);
    if (!data) throw new NotFoundException('Backup not found');
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="wcm-backup-${c.companyId}-${id}.json.gz"`);
    res.end(data);
  }

  /** acceptance test of a backup: restore it into a separate company and compare every collection */
  @Post('backups/:id/restore-test')
  @HttpCode(200)
  async restoreTest(@Ctx2() c: V2Request, @Param('id', ParseIntPipe) id: number) {
    this.admin(c);
    const data = await this.backups.file(c.companyId, id);
    if (!data) throw new NotFoundException('Backup not found');
    const b = BackupService.decode(data);
    const code = `${c.companyId}-test-${id}`.slice(0, 30);
    const old = await this.store.company(code);
    if (old && !old.is_test) throw new ForbiddenException(`${code} is not a test copy`);
    const result = await this.backups.restore(b, code, { test: true, replace: !!old, name: `${b.name} — restore test of backup ${id}` });
    return { ...result, backupId: id, backupAt: b.createdAt, rev: b.rev, records: Object.values(counts(b.db)).reduce((s, n) => s + n, 0) };
  }

  @Delete('test-copies/:code')
  async dropTestCopy(@Ctx2() c: V2Request, @Param('code') code: string) {
    this.admin(c);
    const co = await this.store.company(code);
    if (!co?.is_test || !code.startsWith(`${c.companyId}-test-`)) throw new ForbiddenException('Only your own restore-test copies can be removed');
    await this.store.sql`DELETE FROM wcm_companies WHERE id = ${code}`;
    return { ok: true };
  }

  @Post('users/:id/password')
  @HttpCode(200)
  async setPassword(@Ctx2() c: V2Request, @Param('id') id: string, @Body() b: any) {
    if (!c.session.can('admin', 'edit')) throw new ForbiddenException('Only Admin can reset passwords');
    if (!c.db.users.some((u) => u.id === id)) throw new BadRequestException('Unknown user');
    const p = str(b?.password, 200);
    if (p.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    await this.store.setPassword(c.companyId, id, await this.auth.hash(p));
    return { ok: true };
  }

  @Post('reset-demo')
  @HttpCode(200)
  async resetDemo(@Ctx2() c: V2Request) {
    if (!c.isDemo) throw new ForbiddenException('Only the demo company can be reset');
    if (!c.session.isAdmin) throw new ForbiddenException('Only Admin can reset the demo');
    await this.demo.seed(c.companyId);
    return { ok: true };
  }
}

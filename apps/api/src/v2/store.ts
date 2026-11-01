import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import postgres from 'postgres';
import type { CollectionKey, DB } from '@civil/domain/types';
import { schemas } from '@civil/domain/schemas';
import type { Change } from '@civil/domain/policy';

/**
 * v2 persistence: every company's data lives as JSONB records (one row per record), plus a few
 * singletons (company profile, settings, voucher sequences). The API keeps a per-company copy in
 * memory and checks a revision counter before each request, so several API instances stay in step.
 * Writes are serialised per company with a Postgres advisory lock.
 */

export const COLLECTIONS = Object.keys(schemas) as CollectionKey[];
const SINGLES = ['company', 'settings', 'seq'] as const;

export interface CompanyRow {
  id: string;
  name: string;
  is_demo: boolean;
  /** a backup restored to check it (PF-07) — never chosen by default at sign-in */
  is_test: boolean;
}

interface Cached {
  rev: number;
  db: DB;
}

@Injectable()
export class V2Store implements OnModuleInit {
  readonly sql = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/civil_erp', {
    max: Number(process.env.DB_POOL_MAX || 10),
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  private cache = new Map<string, Cached>();
  private locks = new Map<string, Promise<unknown>>();
  private log = new Logger('V2Store');

  async onModuleInit() {
    await this.ensureSchema();
  }

  async ensureSchema() {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS wcm_companies (
        id text PRIMARY KEY,
        name text NOT NULL,
        is_demo boolean NOT NULL DEFAULT false,
        rev bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE wcm_companies ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS wcm_records (
        company_id text NOT NULL REFERENCES wcm_companies(id) ON DELETE CASCADE,
        coll text NOT NULL,
        id text NOT NULL,
        ord bigserial,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, coll, id)
      );
      CREATE INDEX IF NOT EXISTS wcm_records_load ON wcm_records (company_id, ord);
      CREATE TABLE IF NOT EXISTS wcm_singletons (
        company_id text NOT NULL REFERENCES wcm_companies(id) ON DELETE CASCADE,
        key text NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (company_id, key)
      );
      CREATE TABLE IF NOT EXISTS wcm_credentials (
        company_id text NOT NULL REFERENCES wcm_companies(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        password_hash text NOT NULL,
        failed_attempts int NOT NULL DEFAULT 0,
        locked_until timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, user_id)
      );
      -- PF-03: commands already applied, so a retry from a phone that lost the answer is not saved twice
      CREATE TABLE IF NOT EXISTS wcm_command_log (
        company_id text NOT NULL REFERENCES wcm_companies(id) ON DELETE CASCADE,
        cmd_id text NOT NULL,
        user_id text NOT NULL,
        result jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, cmd_id)
      );
      CREATE TABLE IF NOT EXISTS wcm_otps (
        company_id text NOT NULL,
        user_id text NOT NULL,
        code_hash text NOT NULL,
        purpose text NOT NULL,
        attempts int NOT NULL DEFAULT 0,
        expires_at timestamptz NOT NULL,
        PRIMARY KEY (company_id, user_id, purpose)
      );
    `);
    await this.sql`DELETE FROM wcm_command_log WHERE created_at < now() - interval '60 days'`;
  }

  /* ---------------- companies ---------------- */

  async companies(): Promise<CompanyRow[]> {
    return this.sql<CompanyRow[]>`SELECT id, name, is_demo, is_test FROM wcm_companies ORDER BY created_at`;
  }

  async company(id: string): Promise<CompanyRow | undefined> {
    const [c] = await this.sql<CompanyRow[]>`SELECT id, name, is_demo, is_test FROM wcm_companies WHERE id = ${id}`;
    return c;
  }

  /** replace a company's whole dataset (create company / reset demo) */
  async replaceAll(id: string, name: string, isDemo: boolean, db: DB, opts: { test?: boolean } = {}) {
    await this.withLock(id, async () => {
      await this.sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${'wcm:' + id}))`;
        await tx`INSERT INTO wcm_companies (id, name, is_demo, is_test) VALUES (${id}, ${name}, ${isDemo}, ${!!opts.test})
                 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = EXCLUDED.is_demo, is_test = EXCLUDED.is_test`;
        await tx`DELETE FROM wcm_records WHERE company_id = ${id}`;
        await tx`DELETE FROM wcm_singletons WHERE company_id = ${id}`;
        const rows: Array<{ company_id: string; coll: string; id: string; data: unknown }> = [];
        for (const coll of COLLECTIONS) for (const r of (db[coll] as any[]) || []) rows.push({ company_id: id, coll, id: r.id, data: jsonSafe(r) });
        for (let i = 0; i < rows.length; i += 2000) {
          const chunk = rows.slice(i, i + 2000);
          await tx`INSERT INTO wcm_records ${tx(chunk as any, 'company_id', 'coll', 'id', 'data')}`;
        }
        for (const k of SINGLES) await tx`INSERT INTO wcm_singletons (company_id, key, data) VALUES (${id}, ${k}, ${tx.json(jsonSafe(db[k]) as any)})`;
        await tx`UPDATE wcm_companies SET rev = rev + 1 WHERE id = ${id}`;
      });
      this.cache.delete(id);
    });
  }

  /* ---------------- reads ---------------- */

  async rev(id: string): Promise<number> {
    const [r] = await this.sql<{ rev: string }[]>`SELECT rev FROM wcm_companies WHERE id = ${id}`;
    return r ? Number(r.rev) : -1;
  }

  /** the company's data, reloaded only when another instance changed it */
  async load(id: string): Promise<Cached> {
    const rev = await this.rev(id);
    const hit = this.cache.get(id);
    if (hit && hit.rev === rev) return hit;
    return this.reload(id, this.sql);
  }

  private async reload(id: string, q: postgres.Sql | postgres.TransactionSql): Promise<Cached> {
    const [meta] = await q<{ rev: string }[]>`SELECT rev FROM wcm_companies WHERE id = ${id}`;
    if (!meta) throw new Error(`Unknown company ${id}`);
    const db: any = { version: 1, seededOn: '' };
    for (const c of COLLECTIONS) db[c] = [];
    const rows = await q<{ coll: string; data: any }[]>`SELECT coll, data FROM wcm_records WHERE company_id = ${id} ORDER BY ord`;
    for (const r of rows) (db[r.coll] ||= []).push(r.data);
    const singles = await q<{ key: string; data: any }[]>`SELECT key, data FROM wcm_singletons WHERE company_id = ${id}`;
    for (const s of singles) db[s.key] = s.data;
    db.seq ||= {};
    for (const role of db.roles) if (role.approvalLimit === null) role.approvalLimit = Infinity;
    const fresh = { rev: Number(meta.rev), db: db as DB };
    this.cache.set(id, fresh);
    return fresh;
  }

  /* ---------------- writes ---------------- */

  /**
   * Run `fn` against the latest data with the company locked (in this process and in Postgres),
   * persist what it changed and bump the revision.
   */
  async write<T>(
    id: string,
    fn: (db: DB) => { db: DB; changes: Change[]; extra?: T },
    once?: { cmdId: string; userId: string },
  ): Promise<{ rev: number; changes: Change[]; extra?: T; replay?: boolean }> {
    return this.withLock(id, () =>
      this.sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${'wcm:' + id}))`;
        const [meta] = await tx<{ rev: string }[]>`SELECT rev FROM wcm_companies WHERE id = ${id}`;
        if (once) {
          const [done] = await tx<{ result: any; user_id: string }[]>`SELECT result, user_id FROM wcm_command_log WHERE company_id = ${id} AND cmd_id = ${once.cmdId}`;
          if (done && done.user_id === once.userId) return { next: null, out: { rev: Number(meta!.rev), changes: done.result.changes as Change[], extra: done.result.extra as T, replay: true } };
        }
        let cur = this.cache.get(id);
        if (!cur || cur.rev !== Number(meta!.rev)) cur = await this.reload(id, tx);
        const res = fn(cur.db);
        const rec = new Map<string, { coll: string; id: string; data: unknown }>();
        const single = new Map<string, unknown>();
        for (const c of res.changes) {
          if ('single' in c) single.set(c.single, c.value);
          else rec.set(`${c.coll}\u0000${c.id}`, { coll: c.coll, id: c.id, data: c.rec });
        }
        for (const r of rec.values())
          await tx`INSERT INTO wcm_records (company_id, coll, id, data) VALUES (${id}, ${r.coll}, ${r.id}, ${tx.json(jsonSafe(r.data) as any)})
                   ON CONFLICT (company_id, coll, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
        for (const [k, v] of single)
          await tx`INSERT INTO wcm_singletons (company_id, key, data) VALUES (${id}, ${k}, ${tx.json(jsonSafe(v) as any)})
                   ON CONFLICT (company_id, key) DO UPDATE SET data = EXCLUDED.data`;
        const [{ rev }] = (await tx<{ rev: string }[]>`UPDATE wcm_companies SET rev = rev + 1 WHERE id = ${id} RETURNING rev`) as any;
        if (once) await tx`INSERT INTO wcm_command_log (company_id, cmd_id, user_id, result) VALUES (${id}, ${once.cmdId}, ${once.userId}, ${tx.json(jsonSafe({ changes: res.changes, extra: res.extra }) as any)})`;
        // only publish the new state once the transaction is certain to commit
        const next = { rev: Number(rev), db: res.db };
        return { next, out: { rev: Number(rev), changes: res.changes, extra: res.extra } };
      }).then(({ next, out }) => {
        if (next) this.cache.set(id, next);
        return out;
      }),
    );
  }

  /** serialise work per company inside this process */
  private withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(id, tail);
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return run;
  }

  /* ---------------- credentials ---------------- */

  async credential(companyId: string, userId: string) {
    const [c] = await this.sql<{ password_hash: string; failed_attempts: number; locked_until: Date | null }[]>`
      SELECT password_hash, failed_attempts, locked_until FROM wcm_credentials WHERE company_id = ${companyId} AND user_id = ${userId}`;
    return c;
  }
  async setPassword(companyId: string, userId: string, hash: string) {
    await this.sql`INSERT INTO wcm_credentials (company_id, user_id, password_hash) VALUES (${companyId}, ${userId}, ${hash})
                   ON CONFLICT (company_id, user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL, updated_at = now()`;
  }
  async recordLogin(companyId: string, userId: string, ok: boolean, lockAfter = 5, lockMinutes = 15) {
    if (ok) await this.sql`UPDATE wcm_credentials SET failed_attempts = 0, locked_until = NULL WHERE company_id = ${companyId} AND user_id = ${userId}`;
    else
      await this.sql`UPDATE wcm_credentials SET failed_attempts = failed_attempts + 1,
                     locked_until = CASE WHEN failed_attempts + 1 >= ${lockAfter} THEN now() + (${lockMinutes} || ' minutes')::interval ELSE locked_until END
                     WHERE company_id = ${companyId} AND user_id = ${userId}`;
  }
}

/** JSON can't carry Infinity — store it as null (read back as Infinity for role limits) */
function jsonSafe(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : x)));
}

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { gzipSync, gunzipSync } from 'node:zlib';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { DB } from '@civil/domain/types';
import { V2Store, COLLECTIONS } from './store.js';
import { clock } from './clock.js';

/**
 * PF-07 backups. Every client company is backed up once a day (kept 30 days) into wcm_backups, and —
 * when BACKUP_S3=on — a copy goes to the S3 bucket so a backup survives the loss of the database.
 * A backup holds every record, the singletons and the users' password hashes, so a restored copy can
 * be signed in to with the same passwords.
 */
export interface BackupFile {
  format: 'wcm-backup';
  version: 1;
  companyId: string;
  name: string;
  rev: number;
  createdAt: string;
  db: DB;
  credentials: Array<{ user_id: string; password_hash: string }>;
}
export interface BackupRow {
  id: number;
  created_at: Date;
  kind: 'daily' | 'manual';
  size: number;
  rev: number;
  records: number;
}

const KEEP_DAILY = Number(process.env.BACKUP_KEEP_DAYS || 30);
const KEEP_MANUAL = 20;

/** record counts per collection — used to prove a restore is complete */
export function counts(db: DB): Record<string, number> {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, ((db as any)[c] || []).length]).filter(([, n]) => (n as number) > 0));
}

@Injectable()
export class BackupService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger('Backup');
  private timer?: NodeJS.Timeout;
  constructor(private store: V2Store) {}

  async onApplicationBootstrap() {
    await this.store.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS wcm_backups (
        id bigserial PRIMARY KEY,
        company_id text NOT NULL REFERENCES wcm_companies(id) ON DELETE CASCADE,
        kind text NOT NULL,
        rev bigint NOT NULL,
        records int NOT NULL,
        size int NOT NULL,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS wcm_backups_company ON wcm_backups (company_id, created_at DESC);
    `);
    if (process.env.BACKUP_DAILY === 'off') return;
    // check every hour; the first check a minute after start
    setTimeout(() => void this.daily(), 60_000).unref();
    this.timer = setInterval(() => void this.daily(), 60 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** one daily backup per real company per business day; only one API instance does it */
  async daily() {
    const [lock] = await this.store.sql<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(hashtext('wcm:daily-backup')) AS ok`;
    if (!lock?.ok) return;
    try {
      const { today } = clock();
      const companies = (await this.store.companies()).filter((c) => !c.is_demo && !c.is_test);
      for (const c of companies) {
        const [done] = await this.store.sql`SELECT 1 FROM wcm_backups WHERE company_id = ${c.id} AND kind = 'daily'
          AND (created_at AT TIME ZONE ${process.env.BUSINESS_TZ || 'Asia/Kolkata'})::date = ${today}::date`;
        if (done) continue;
        try {
          await this.create(c.id, 'daily');
        } catch (e) {
          this.log.error(`Daily backup of ${c.id} failed: ${(e as Error).message}`);
        }
      }
    } finally {
      await this.store.sql`SELECT pg_advisory_unlock(hashtext('wcm:daily-backup'))`;
    }
  }

  async build(companyId: string): Promise<BackupFile> {
    const company = await this.store.company(companyId);
    if (!company) throw new Error(`Unknown company ${companyId}`);
    const { db, rev } = await this.store.load(companyId);
    const credentials = await this.store.sql<{ user_id: string; password_hash: string }[]>`SELECT user_id, password_hash FROM wcm_credentials WHERE company_id = ${companyId}`;
    return { format: 'wcm-backup', version: 1, companyId, name: company.name, rev, createdAt: new Date().toISOString(), db, credentials: [...credentials] };
  }

  static encode(b: BackupFile): Buffer {
    return gzipSync(Buffer.from(JSON.stringify(b, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v))));
  }
  static decode(buf: Buffer): BackupFile {
    let json: string;
    try {
      json = gunzipSync(buf).toString('utf8');
    } catch {
      json = buf.toString('utf8');
    }
    const b = JSON.parse(json) as BackupFile;
    if (b?.format !== 'wcm-backup' || !b.db || !Array.isArray(b.credentials)) throw new Error('This is not a WCM backup file');
    return b;
  }

  async create(companyId: string, kind: 'daily' | 'manual'): Promise<BackupRow> {
    const b = await this.build(companyId);
    const data = BackupService.encode(b);
    const records = Object.values(counts(b.db)).reduce((s, n) => s + n, 0);
    const [row] = await this.store.sql<BackupRow[]>`INSERT INTO wcm_backups (company_id, kind, rev, records, size, data)
      VALUES (${companyId}, ${kind}, ${b.rev}, ${records}, ${data.length}, ${data}) RETURNING id, created_at, kind, size, rev, records`;
    await this.store.sql`DELETE FROM wcm_backups WHERE company_id = ${companyId} AND kind = 'daily' AND id NOT IN
      (SELECT id FROM wcm_backups WHERE company_id = ${companyId} AND kind = 'daily' ORDER BY created_at DESC LIMIT ${KEEP_DAILY})`;
    await this.store.sql`DELETE FROM wcm_backups WHERE company_id = ${companyId} AND kind = 'manual' AND id NOT IN
      (SELECT id FROM wcm_backups WHERE company_id = ${companyId} AND kind = 'manual' ORDER BY created_at DESC LIMIT ${KEEP_MANUAL})`;
    await this.offsite(companyId, b.createdAt, data);
    this.log.log(`Backup ${row!.id} of ${companyId} (${kind}): ${records} records, ${Math.round(data.length / 1024)} KB`);
    return row!;
  }

  private async offsite(companyId: string, at: string, data: Buffer) {
    if (process.env.BACKUP_S3 !== 'on') return;
    try {
      const s3 = new S3Client({
        region: process.env.S3_REGION || 'ap-south-1',
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: !!process.env.S3_ENDPOINT,
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
      });
      await s3.send(new PutObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET || process.env.S3_BUCKET, Key: `wcm-backups/${companyId}/${at.replace(/[:.]/g, '-')}.json.gz`, Body: data, ContentType: 'application/gzip' }));
    } catch (e) {
      this.log.error(`Off-site copy of ${companyId} backup failed: ${(e as Error).message}`);
    }
  }

  async list(companyId: string): Promise<BackupRow[]> {
    return this.store.sql<BackupRow[]>`SELECT id, created_at, kind, size, rev, records FROM wcm_backups WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT 100`;
  }

  async file(companyId: string, id: number): Promise<Buffer | undefined> {
    const [r] = await this.store.sql<{ data: Buffer }[]>`SELECT data FROM wcm_backups WHERE company_id = ${companyId} AND id = ${id}`;
    return r?.data;
  }

  /**
   * Restore a backup into a company. `replace` overwrites an existing company (disaster recovery, CLI only);
   * otherwise the target must be a new code. Returns record counts of the backup and of what was written.
   */
  async restore(b: BackupFile, target: string, opts: { name?: string; test?: boolean; replace?: boolean } = {}) {
    const existing = await this.store.company(target);
    if (existing && !opts.replace) throw new Error(`Company ${target} already exists`);
    if (existing && opts.replace && existing.is_demo) throw new Error('The demo company is not restored from backups');
    for (const r of b.db.roles) if (r.approvalLimit === null) (r as any).approvalLimit = Infinity;
    await this.store.replaceAll(target, opts.name || b.name, false, b.db, { test: !!opts.test });
    await this.store.sql`DELETE FROM wcm_credentials WHERE company_id = ${target}`;
    for (const c of b.credentials) await this.store.sql`INSERT INTO wcm_credentials (company_id, user_id, password_hash) VALUES (${target}, ${c.user_id}, ${c.password_hash})`;
    (this.store as any).cache.delete(target);
    const { db } = await this.store.load(target);
    const expected = counts(b.db);
    const actual = counts(db);
    const mismatches = Object.keys({ ...expected, ...actual }).filter((k) => expected[k] !== actual[k]);
    return { company: target, expected, actual, ok: mismatches.length === 0, mismatches };
  }
}

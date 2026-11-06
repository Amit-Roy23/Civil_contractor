import { MongoClient, type ClientSession, type Collection, type Db } from 'mongodb';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { CollectionKey, DB } from '@civil/domain/types';
import { schemas } from '@civil/domain/schemas';
import type { Change } from '@civil/domain/policy';
import { HttpError } from './http.js';

/**
 * MongoDB persistence for the serverless API (Vercel). Same model as the PostgreSQL version:
 * each company's records are stored one document per record, plus singletons (company profile,
 * settings, voucher sequences) and a revision counter. Every write runs in a transaction that first
 * bumps the company's revision, so concurrent writers are serialised by MongoDB (a write conflict
 * makes the later one retry against the newer data). Needs a replica set — MongoDB Atlas is one.
 *
 * Record bodies are kept as JSON text, so any key (dots, $) and Infinity survive unchanged.
 */

export const COLLECTIONS = Object.keys(schemas) as CollectionKey[];
const SINGLES = ['company', 'settings', 'seq'] as const;

interface CompanyDoc {
  _id: string;
  name: string;
  isDemo: boolean;
  isTest: boolean;
  rev: number;
  ord: number;
  backupSeq?: number;
  createdAt: Date;
}
interface RecordDoc {
  _id: string;
  cid: string;
  coll: string;
  rid: string;
  ord: number;
  json: string;
  updatedAt: Date;
}
interface SingleDoc {
  _id: string;
  cid: string;
  key: string;
  json: string;
}
interface CredDoc {
  _id: string;
  cid: string;
  uid: string;
  hash: string;
  failed: number;
  lockedUntil: Date | null;
  updatedAt: Date;
}
interface CmdDoc {
  _id: string;
  cid: string;
  uid: string;
  result: string;
  createdAt: Date;
}
interface OtpDoc {
  _id: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}
interface LimitDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}
export interface BackupDoc {
  _id: string;
  cid: string;
  id: number;
  kind: 'daily' | 'manual';
  rev: number;
  records: number;
  size: number;
  chunks: number;
  createdAt: Date;
}
interface ChunkDoc {
  _id: string;
  data: Buffer;
}

export interface CompanyRow {
  id: string;
  name: string;
  is_demo: boolean;
  is_test: boolean;
}

const jsonText = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : x));
const k2 = (...p: string[]) => p.join('\u0001');

/* ---------------- connection (reused across invocations of a warm function) ---------------- */
let clientP: Promise<MongoClient> | null = null;
let ready: Promise<void> | null = null;

function uri() {
  const u = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  if (!u) throw new HttpError(503, 'The database is not set up: add MONGODB_URI in the Vercel project settings');
  return u;
}

export async function mongo(): Promise<Db> {
  if (!clientP) {
    clientP = new MongoClient(uri(), { maxPoolSize: Number(process.env.DB_POOL_MAX || 10), serverSelectionTimeoutMS: 8000, retryWrites: true }).connect();
    clientP.catch(() => (clientP = null));
  }
  const client = await clientP;
  const db = client.db(process.env.MONGODB_DB || undefined);
  if (!ready) {
    ready = ensureIndexes(db);
    ready.catch(() => (ready = null));
  }
  await ready;
  return db;
}
export async function client(): Promise<MongoClient> {
  await mongo();
  return clientP!;
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection('wcm_records').createIndex({ cid: 1, ord: 1 }),
    db.collection('wcm_singles').createIndex({ cid: 1 }),
    db.collection('wcm_credentials').createIndex({ cid: 1 }),
    db.collection('wcm_cmdlog').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 86400 }),
    db.collection('wcm_otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('wcm_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('wcm_backups').createIndex({ cid: 1, createdAt: -1 }),
  ]);
}

const col = {
  companies: (d: Db) => d.collection<CompanyDoc>('wcm_companies'),
  records: (d: Db) => d.collection<RecordDoc>('wcm_records'),
  singles: (d: Db) => d.collection<SingleDoc>('wcm_singles'),
  creds: (d: Db) => d.collection<CredDoc>('wcm_credentials'),
  cmds: (d: Db) => d.collection<CmdDoc>('wcm_cmdlog'),
  otps: (d: Db) => d.collection<OtpDoc>('wcm_otps'),
  limits: (d: Db) => d.collection<LimitDoc>('wcm_limits'),
  backups: (d: Db) => d.collection<BackupDoc>('wcm_backups'),
  chunks: (d: Db) => d.collection<ChunkDoc>('wcm_backup_chunks'),
};

/* ---------------- companies ---------------- */
const row = (c: CompanyDoc): CompanyRow => ({ id: c._id, name: c.name, is_demo: !!c.isDemo, is_test: !!c.isTest });

export async function companies(): Promise<CompanyRow[]> {
  const d = await mongo();
  return (await col.companies(d).find({}, { sort: { createdAt: 1 } }).toArray()).map(row);
}
export async function company(id: string): Promise<CompanyRow | undefined> {
  const d = await mongo();
  const c = await col.companies(d).findOne({ _id: id });
  return c ? row(c) : undefined;
}

/* ---------------- reads ---------------- */
interface Cached {
  rev: number;
  db: DB;
}
const cache = new Map<string, Cached>();

export async function rev(id: string): Promise<number> {
  const d = await mongo();
  const c = await col.companies(d).findOne({ _id: id }, { projection: { rev: 1 } });
  return c ? c.rev : -1;
}

async function readAll(d: Db, id: string, session?: ClientSession): Promise<DB> {
  const db: any = { version: 1, seededOn: '' };
  for (const c of COLLECTIONS) db[c] = [];
  const cur = col.records(d).find({ cid: id }, { sort: { ord: 1 }, projection: { coll: 1, json: 1 }, session });
  for await (const r of cur) (db[r.coll] ||= []).push(JSON.parse(r.json));
  for (const s of await col.singles(d).find({ cid: id }, { session }).toArray()) db[s.key] = JSON.parse(s.json);
  db.seq ||= {};
  for (const role of db.roles || []) if (role.approvalLimit === null) role.approvalLimit = Infinity;
  return db as DB;
}

/** the company's data — reloaded only when another instance has changed it */
export async function load(id: string): Promise<Cached> {
  const d = await mongo();
  const c = await col.companies(d).findOne({ _id: id }, { projection: { rev: 1 } });
  if (!c) throw new HttpError(401, 'Please sign in');
  const hit = cache.get(id);
  if (hit && hit.rev === c.rev) return hit;
  const fresh = { rev: c.rev, db: await readAll(d, id) };
  cache.set(id, fresh);
  return fresh;
}

/* ---------------- writes ---------------- */
/**
 * Run `fn` against the latest data inside a transaction, persist what it changed and bump the
 * revision. With `once`, a command id already applied is answered from the log instead.
 */
export async function write<T>(
  id: string,
  fn: (db: DB) => { db: DB; changes: Change[]; extra?: T },
  once?: { cmdId: string; userId: string },
): Promise<{ rev: number; changes: Change[]; extra?: T; replay?: boolean }> {
  const d = await mongo();
  const cl = await client();
  if (once) {
    const done = await col.cmds(d).findOne({ _id: k2(id, once.cmdId) });
    if (done && done.uid === once.userId) {
      const r = JSON.parse(done.result);
      return { rev: await rev(id), changes: r.changes, extra: r.extra, replay: true };
    }
  }
  const session = cl.startSession();
  let out: { rev: number; changes: Change[]; extra?: T } | undefined;
  let next: Cached | undefined;
  try {
    await session.withTransaction(
      async () => {
        // the first write locks this company for the transaction: a concurrent writer conflicts and retries
        const meta = await col.companies(d).findOneAndUpdate({ _id: id }, { $inc: { rev: 1 } }, { session, returnDocument: 'after' });
        if (!meta) throw new HttpError(404, 'Unknown company');
        let cur = cache.get(id);
        if (!cur || cur.rev !== meta.rev - 1) cur = { rev: meta.rev - 1, db: await readAll(d, id, session) };
        const res = fn(cur.db);
        const recs = new Map<string, { coll: string; id: string; data: unknown }>();
        const singles = new Map<string, unknown>();
        for (const c of res.changes) {
          if ('single' in c) singles.set(c.single, c.value);
          else recs.set(k2(c.coll, c.id), { coll: c.coll, id: c.id, data: c.rec });
        }
        if (recs.size) {
          const base = (await col.companies(d).findOneAndUpdate({ _id: id }, { $inc: { ord: recs.size } }, { session, returnDocument: 'before', projection: { ord: 1 } }))?.ord || 0;
          const now = new Date();
          await col.records(d).bulkWrite(
            [...recs.values()].map((r, i) => ({
              updateOne: { filter: { _id: k2(id, r.coll, r.id) }, update: { $set: { cid: id, coll: r.coll, rid: r.id, json: jsonText(r.data), updatedAt: now }, $setOnInsert: { ord: base + i + 1 } }, upsert: true },
            })),
            { session, ordered: false },
          );
        }
        for (const [k, v] of singles) await col.singles(d).updateOne({ _id: k2(id, k) }, { $set: { cid: id, key: k, json: jsonText(v) } }, { session, upsert: true });
        if (once) await col.cmds(d).insertOne({ _id: k2(id, once.cmdId), cid: id, uid: once.userId, result: jsonText({ changes: res.changes, extra: res.extra }), createdAt: new Date() }, { session });
        out = { rev: meta.rev, changes: res.changes, extra: res.extra };
        next = { rev: meta.rev, db: res.db };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  } catch (e: any) {
    // the same command id saved by a parallel retry: answer it as a replay
    if (once && (e?.code === 11000 || /E11000/.test(String(e?.message)))) {
      const done = await col.cmds(d).findOne({ _id: k2(id, once.cmdId) });
      if (done) {
        const r = JSON.parse(done.result);
        return { rev: await rev(id), changes: r.changes, extra: r.extra, replay: true };
      }
    }
    throw e;
  } finally {
    await session.endSession();
  }
  if (next) cache.set(id, next);
  return out!;
}

/** replace a company's whole dataset (create company / restore a backup) */
export async function replaceAll(id: string, name: string, db: DB, opts: { test?: boolean } = {}) {
  const d = await mongo();
  const cl = await client();
  const session = cl.startSession();
  try {
    await session.withTransaction(async () => {
      await col.companies(d).updateOne({ _id: id }, { $set: { name, isDemo: false, isTest: !!opts.test }, $inc: { rev: 1 }, $setOnInsert: { createdAt: new Date(), ord: 0 } }, { session, upsert: true });
      await col.records(d).deleteMany({ cid: id }, { session });
      await col.singles(d).deleteMany({ cid: id }, { session });
      const docs: RecordDoc[] = [];
      let ord = 0;
      const now = new Date();
      for (const coll of COLLECTIONS) for (const r of ((db as any)[coll] as any[]) || []) docs.push({ _id: k2(id, coll, r.id), cid: id, coll, rid: r.id, ord: ++ord, json: jsonText(r), updatedAt: now });
      for (let i = 0; i < docs.length; i += 1000) await col.records(d).insertMany(docs.slice(i, i + 1000), { session, ordered: false });
      for (const k of SINGLES) await col.singles(d).insertOne({ _id: k2(id, k), cid: id, key: k, json: jsonText((db as any)[k] ?? (k === 'seq' ? {} : null)) }, { session });
      await col.companies(d).updateOne({ _id: id }, { $set: { ord } }, { session });
    });
  } finally {
    await session.endSession();
  }
  cache.delete(id);
}

export async function dropCompany(id: string) {
  const d = await mongo();
  await Promise.all([col.records(d).deleteMany({ cid: id }), col.singles(d).deleteMany({ cid: id }), col.creds(d).deleteMany({ cid: id }), col.cmds(d).deleteMany({ cid: id })]);
  const bs = await col.backups(d).find({ cid: id }).toArray();
  for (const b of bs) await col.chunks(d).deleteMany({ _id: { $in: Array.from({ length: b.chunks }, (_, i) => k2(b._id, String(i))) } });
  await col.backups(d).deleteMany({ cid: id });
  await col.companies(d).deleteOne({ _id: id });
  cache.delete(id);
}

/* ---------------- credentials ---------------- */
export async function credential(cid: string, uid: string) {
  const d = await mongo();
  return col.creds(d).findOne({ _id: k2(cid, uid) });
}
export async function setPassword(cid: string, uid: string, hash: string) {
  const d = await mongo();
  await col.creds(d).updateOne({ _id: k2(cid, uid) }, { $set: { cid, uid, hash, failed: 0, lockedUntil: null, updatedAt: new Date() } }, { upsert: true });
}
export async function recordLogin(cid: string, uid: string, ok: boolean, lockAfter = 5, lockMinutes = 15) {
  const d = await mongo();
  if (ok) {
    await col.creds(d).updateOne({ _id: k2(cid, uid) }, { $set: { failed: 0, lockedUntil: null } });
    return;
  }
  const c = await col.creds(d).findOneAndUpdate({ _id: k2(cid, uid) }, { $inc: { failed: 1 } }, { returnDocument: 'after' });
  if (c && c.failed >= lockAfter) await col.creds(d).updateOne({ _id: c._id }, { $set: { lockedUntil: new Date(Date.now() + lockMinutes * 60_000) } });
}
export async function allCredentials(cid: string) {
  const d = await mongo();
  return (await col.creds(d).find({ cid }).toArray()).map((c) => ({ user_id: c.uid, password_hash: c.hash }));
}
export async function putCredentials(cid: string, list: Array<{ user_id: string; password_hash: string }>) {
  const d = await mongo();
  await col.creds(d).deleteMany({ cid });
  if (list.length) await col.creds(d).insertMany(list.map((c) => ({ _id: k2(cid, c.user_id), cid, uid: c.user_id, hash: c.password_hash, failed: 0, lockedUntil: null, updatedAt: new Date() })));
}

/* ---------------- OTPs ---------------- */
export async function putOtp(cid: string, uid: string, purpose: string, codeHash: string) {
  const d = await mongo();
  await col.otps(d).updateOne({ _id: k2(cid, uid, purpose) }, { $set: { codeHash, attempts: 0, expiresAt: new Date(Date.now() + 5 * 60_000) } }, { upsert: true });
}
export async function bumpOtp(cid: string, uid: string, purpose: string) {
  const d = await mongo();
  return col.otps(d).findOneAndUpdate({ _id: k2(cid, uid, purpose) }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
}
export async function dropOtp(cid: string, uid: string, purpose: string) {
  const d = await mongo();
  await col.otps(d).deleteOne({ _id: k2(cid, uid, purpose) });
}

/* ---------------- rate limits (shared by every function instance) ---------------- */
export async function rateLimit(key: string, max: number, windowMs: number) {
  const d = await mongo();
  const now = new Date();
  // a window that has run out starts again at 1
  const doc = await col.limits(d).findOneAndUpdate(
    { _id: key, expiresAt: { $gt: now } },
    { $inc: { count: 1 } },
    { returnDocument: 'after' },
  );
  if (!doc) {
    await col.limits(d).updateOne({ _id: key }, { $set: { count: 1, expiresAt: new Date(now.getTime() + windowMs) } }, { upsert: true });
    return;
  }
  if (doc.count > max) throw new HttpError(429, 'Too many attempts — please wait a few minutes and try again');
}

/* ---------------- backups ---------------- */
const CHUNK = 8 * 1024 * 1024;
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
export function counts(db: DB): Record<string, number> {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, ((db as any)[c] || []).length]).filter(([, n]) => (n as number) > 0));
}
export const encodeBackup = (b: BackupFile) => gzipSync(Buffer.from(jsonText(b)));
export function decodeBackup(buf: Buffer): BackupFile {
  let text: string;
  try {
    text = gunzipSync(buf).toString('utf8');
  } catch {
    text = buf.toString('utf8');
  }
  const b = JSON.parse(text) as BackupFile;
  if (b?.format !== 'wcm-backup' || !b.db || !Array.isArray(b.credentials)) throw new HttpError(400, 'This is not a WCM backup file');
  return b;
}

export async function createBackup(cid: string, kind: 'daily' | 'manual') {
  const d = await mongo();
  const c = await col.companies(d).findOneAndUpdate({ _id: cid }, { $inc: { backupSeq: 1 } }, { returnDocument: 'after' });
  if (!c) throw new HttpError(404, 'Unknown company');
  const { db, rev: r } = await load(cid);
  const file: BackupFile = { format: 'wcm-backup', version: 1, companyId: cid, name: c.name, rev: r, createdAt: new Date().toISOString(), db, credentials: await allCredentials(cid) };
  const data = encodeBackup(file);
  const bid = k2(cid, String(c.backupSeq));
  const chunks = Math.max(1, Math.ceil(data.length / CHUNK));
  for (let i = 0; i < chunks; i++) await col.chunks(d).insertOne({ _id: k2(bid, String(i)), data: data.subarray(i * CHUNK, (i + 1) * CHUNK) });
  const records = Object.values(counts(db)).reduce((s, n) => s + n, 0);
  const doc: BackupDoc = { _id: bid, cid, id: c.backupSeq!, kind, rev: r, records, size: data.length, chunks, createdAt: new Date() };
  await col.backups(d).insertOne(doc);
  // keep the last N of each kind
  const keep = kind === 'daily' ? Number(process.env.BACKUP_KEEP_DAYS || 30) : 20;
  const old = await col.backups(d).find({ cid, kind }, { sort: { createdAt: -1 }, skip: keep }).toArray();
  for (const o of old) {
    await col.chunks(d).deleteMany({ _id: { $in: Array.from({ length: o.chunks }, (_, i) => k2(o._id, String(i))) } });
    await col.backups(d).deleteOne({ _id: o._id });
  }
  return doc;
}
export async function listBackups(cid: string) {
  const d = await mongo();
  return col.backups(d).find({ cid }, { sort: { createdAt: -1 }, limit: 100 }).toArray();
}
export async function lastBackup(cid: string, kind: 'daily' | 'manual') {
  const d = await mongo();
  return col.backups(d).findOne({ cid, kind }, { sort: { createdAt: -1 } });
}
export async function backupData(cid: string, id: number): Promise<Buffer | undefined> {
  const d = await mongo();
  const b = await col.backups(d).findOne({ cid, id });
  if (!b) return undefined;
  const parts = await col.chunks(d).find({ _id: { $in: Array.from({ length: b.chunks }, (_, i) => k2(b._id, String(i))) } }).toArray();
  parts.sort((a, z) => Number(a._id.split('\u0001').pop()) - Number(z._id.split('\u0001').pop()));
  // the driver hands back BSON Binary (its .buffer holds exactly the bytes), or a Uint8Array
  return Buffer.concat(parts.map((p) => {
    const b = p.data as any;
    return Buffer.from(b instanceof Uint8Array ? b : b.buffer);
  }));
}

export function forgetCache(id: string) {
  cache.delete(id);
}
export type { Collection };

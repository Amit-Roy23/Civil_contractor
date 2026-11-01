import { useSyncExternalStore } from 'react';
import type { AuditEntry, CollectionKey, DB, ID, Notification, Settings } from './types';
import { SEED_VERSION } from '@civil/domain/seed';
import { buildDemoDB, emptyDB } from '@civil/domain/demo';
import { buildMasters } from '@civil/domain/seed-masters';
import type { Command } from '@civil/domain/policy';
import { buildSession } from '@civil/domain/session';
import { fyCode, today } from '../lib/format';
import { uid } from '../lib/utils';
import { toast } from '../components/ui/core';
import { API_MODE, ApiError, api, hasToken, setToken, type CommandResult, type SignedIn, type Snapshot } from './api';
import { idbGet, idbSet } from './idb';

/**
 * Client-side data store, in one of two modes:
 *
 * - Demo (default): the sample dataset is generated for "today" and every change is kept in a small
 *   journal in localStorage that is replayed on load — demo edits survive a refresh.
 * - API (VITE_DATA_MODE=api): the server is the source of truth. Screens call the same functions;
 *   each change shows at once (optimistic) and goes into an outbox kept on the device (PF-03).
 *   The outbox is sent in order whenever there is network; each entry carries a unique id so a
 *   retry after a lost answer is never saved twice. The last data received is kept on the device,
 *   so the app opens and works without network; unsent entries are shown on top of it.
 */

type Op =
  | { t: 'ins'; c: CollectionKey; rec: any }
  | { t: 'upd'; c: CollectionKey; id: ID; patch: any }
  | { t: 'set'; k: 'settings' | 'company'; v: any }
  | { t: 'seq'; k: string; v: number };

const JOURNAL_KEY = 'wcm-journal-v1';
const listeners = new Set<() => void>();
let journal: { seed: number; ops: Op[] } = { seed: SEED_VERSION, ops: [] };
let db: DB;
let currentUserId: ID = 'u1';

/* ---------------- API connection state ---------------- */
export type Phase = 'signed-out' | 'loading' | 'ready' | 'error';
export interface ApiState {
  phase: Phase;
  isDemo: boolean;
  companyId: string;
  rev: number;
  error?: string;
  /** no network: entries are kept on this device */
  offline: boolean;
  /** entries waiting to be sent */
  unsent: number;
  /** when the data was last received from the server */
  syncedAt?: string;
}
let apiState: ApiState = { phase: 'signed-out', isDemo: false, companyId: '', rev: 0, offline: false, unsent: 0 };
const setApi = (p: Partial<ApiState>) => (apiState = { ...apiState, ...p });

function readJournal() {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j.seed === SEED_VERSION && Array.isArray(j.ops)) journal = j;
    }
  } catch {
    /* storage unavailable */
  }
}
let saveTimer: number | undefined;
function saveJournal() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    } catch {
      /* quota — keep in memory */
    }
  }, 250);
}

function apply(d: DB, op: Op): DB {
  if (op.t === 'ins') return (d[op.c] as any[]).some((x) => x.id === op.rec.id) ? d : { ...d, [op.c]: [...(d[op.c] as any[]), op.rec] };
  if (op.t === 'upd') return { ...d, [op.c]: (d[op.c] as any[]).map((x) => (x.id === op.id ? { ...x, ...op.patch } : x)) };
  if (op.t === 'set') return { ...d, [op.k]: { ...(d[op.k] as any), ...op.v } };
  if (op.t === 'seq') return { ...d, seq: { ...d.seq, [op.k]: op.v } };
  return d;
}

/** what the app shows before a user has signed in to the server */
function blankDB(): DB {
  const m = buildMasters(today());
  return emptyDB({ name: 'WCM', gstin: '', pan: '', address: '', phone: '', email: '', fy: fyCode(today()), banks: [] }, m.settings, []);
}

export function initStore() {
  if (API_MODE) {
    db = blankDB();
    currentUserId = '';
    if (hasToken()) {
      setApi({ phase: 'loading' });
      void startFromCache();
    }
    startSync();
    return;
  }
  readJournal();
  let d: DB = buildDemoDB(today());
  for (const op of journal.ops) {
    try {
      d = apply(d, op);
    } catch {
      /* ignore stale op */
    }
  }
  db = d;
  try {
    currentUserId = localStorage.getItem('wcm-user') || '';
  } catch {
    currentUserId = '';
  }
}

/** ops applied during an API-mode mutation, so they can be re-applied while unsent */
let capture: Op[] | null = null;
/** local change; in demo mode it is also journalled */
function commit(op: Op) {
  db = apply(db, op);
  if (capture) capture.push(op);
  if (!API_MODE) {
    journal.ops.push(op);
    saveJournal();
  }
}
function emit() {
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function getDB() {
  return db;
}
export function useDB(): DB {
  return useSyncExternalStore(subscribe, () => db, () => db);
}
export function useApiState(): ApiState {
  return useSyncExternalStore(subscribe, () => apiState, () => apiState);
}

/* ---------------- server sync (API mode) ---------------- */
interface OutItem {
  cmdId: string;
  cmd: Record<string, unknown>;
  /** the optimistic change shown while unsent */
  ops: Op[];
  label: string;
  at: string;
}
let outbox: OutItem[] = [];
/** whose data and outbox are loaded: "company:user" */
let owner = '';
let serverDb: DB | null = null;
let flushing = false;
let resyncWanted = false;
const waiters = new Map<string, { resolve: (r: CommandResult) => void; reject: (e: Error) => void }>();
const LAST_OWNER = 'last-owner';

const isNetwork = (e: unknown) => e instanceof ApiError && e.status === 0;
const cmdId = () => (crypto.randomUUID ? crypto.randomUUID() : uid('cmd'));

function withOutbox(d: DB): DB {
  for (const item of outbox) for (const op of item.ops) d = apply(d, op);
  return d;
}
function persistOutbox() {
  setApi({ unsent: outbox.length });
  if (owner) void idbSet(`outbox:${owner}`, outbox);
}

/** open with the data kept on this device, then refresh from the server */
async function startFromCache() {
  const last = await idbGet<string>(LAST_OWNER);
  const cached = last ? await idbGet<Snapshot>(`snap:${last}`) : undefined;
  if (cached && last) {
    owner = last;
    outbox = (await idbGet<OutItem[]>(`outbox:${owner}`)) || [];
    serverDb = cached.db;
    db = withOutbox(cached.db);
    currentUserId = cached.userId;
    setApi({ phase: 'ready', isDemo: cached.isDemo, companyId: cached.companyId, rev: cached.rev, unsent: outbox.length, syncedAt: (cached as any).savedAt });
    emit();
  }
  await loadSnapshot();
}

async function loadSnapshot() {
  try {
    const s = await api.snapshot();
    const who = `${s.companyId}:${s.userId}`;
    if (who !== owner) {
      owner = who;
      outbox = (await idbGet<OutItem[]>(`outbox:${owner}`)) || [];
    }
    serverDb = s.db;
    db = withOutbox(s.db);
    currentUserId = s.userId;
    const savedAt = new Date().toISOString();
    setApi({ phase: 'ready', isDemo: s.isDemo, companyId: s.companyId, rev: s.rev, error: undefined, offline: false, unsent: outbox.length, syncedAt: savedAt });
    void idbSet(`snap:${owner}`, { ...s, savedAt });
    void idbSet(LAST_OWNER, owner);
    emit();
    if (outbox.length) void flush();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) signOutLocal(e.message);
    else if (isNetwork(e) && apiState.phase === 'ready') setApi({ offline: true });
    else setApi({ phase: apiState.phase === 'ready' ? 'ready' : 'error', error: (e as Error).message, offline: isNetwork(e) });
    emit();
  }
}

function mergeServer(r: CommandResult) {
  let d = serverDb || db;
  for (const ch of r.changes) {
    if ('single' in ch) d = { ...d, [ch.single]: ch.value };
    else {
      const arr = (d as any)[ch.coll] as any[] | undefined;
      if (!arr) continue;
      const i = arr.findIndex((x) => x.id === ch.id);
      d = { ...d, [ch.coll]: i < 0 ? [...arr, ch.rec] : arr.map((x, j) => (j === i ? ch.rec : x)) };
    }
  }
  serverDb = d;
  // someone else saved in between — fetch their changes too
  if (r.rev !== apiState.rev + 1) resyncWanted = true;
  setApi({ rev: r.rev });
}

/** send the outbox in order; stops at the first network failure and tries again later */
async function flush() {
  if (flushing || apiState.phase !== 'ready') return;
  flushing = true;
  try {
    while (outbox.length) {
      const item = outbox[0]!;
      try {
        const r = await api.command(item.cmd, item.cmdId);
        outbox.shift();
        mergeServer(r);
        waiters.get(item.cmdId)?.resolve(r);
      } catch (e) {
        if (isNetwork(e)) {
          setApi({ offline: true });
          break;
        }
        if (e instanceof ApiError && e.status === 401) {
          signOutLocal(e.message);
          break;
        }
        // the server refused it: drop it and show why
        outbox.shift();
        const w = waiters.get(item.cmdId);
        if (w) w.reject(e as Error);
        else toast.error(`Not saved — ${item.label}`, (e as Error).message);
        resyncWanted = true;
      } finally {
        waiters.delete(item.cmdId);
      }
      setApi({ offline: false });
      persistOutbox();
      if (serverDb) db = withOutbox(serverDb);
      emit();
    }
  } finally {
    flushing = false;
  }
  persistOutbox();
  if (serverDb) db = withOutbox(serverDb);
  if (!outbox.length && resyncWanted) {
    resyncWanted = false;
    await loadSnapshot();
  } else emit();
}

function send(cmd: Record<string, unknown>, ops: Op[], label: string): string {
  const id = cmdId();
  outbox.push({ cmdId: id, cmd, ops, label, at: new Date().toISOString() });
  persistOutbox();
  void flush();
  return id;
}

/** run an API-mode mutation: capture its optimistic ops and queue the command */
function queued(label: string, cmd: Record<string, unknown>, mutate: () => void) {
  capture = [];
  try {
    mutate();
  } finally {
    const ops = capture;
    capture = null;
    send(cmd, ops, label);
  }
}

let syncStarted = false;
function startSync() {
  if (syncStarted) return;
  syncStarted = true;
  const check = async () => {
    if (apiState.phase !== 'ready' || document.hidden) return;
    if (outbox.length) return void flush();
    try {
      const { rev } = await api.rev();
      if (apiState.offline) setApi({ offline: false });
      if (rev !== apiState.rev && !outbox.length) await loadSnapshot();
      else emit();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOutLocal(e.message);
      else if (isNetwork(e) && !apiState.offline) {
        setApi({ offline: true });
        emit();
      }
    }
  };
  window.setInterval(check, 20_000);
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  window.addEventListener('offline', () => (setApi({ offline: true }), emit()));
  document.addEventListener('visibilitychange', check);
}

/** "sync now" from the status badge */
export function syncNow() {
  if (!API_MODE || apiState.phase !== 'ready') return;
  if (outbox.length) void flush();
  else void loadSnapshot();
}

/** called by the login page with the server's answer */
export async function signedIn(r: SignedIn) {
  setToken(r.token);
  setApi({ phase: 'loading' });
  emit();
  await loadSnapshot();
}
/** demo company: open as another user without a password */
export async function signInDemo(userId: ID) {
  await signedIn(await api.demoLogin(userId));
}
function signOutLocal(reason?: string) {
  // unsent entries stay on the device and are sent after the same user signs in again
  setToken('');
  db = blankDB();
  serverDb = null;
  currentUserId = '';
  setApi({ phase: 'signed-out', rev: 0, error: undefined });
  if (reason) toast.warn('Signed out', outbox.length ? `${reason} — ${outbox.length} unsent entries are kept on this device` : reason);
  outbox = [];
  owner = '';
  emit();
}

/**
 * Run a command and wait for the server's answer (Excel import, new work): nothing is shown until the
 * server has accepted it. In demo mode the same server rules run in the browser.
 */
export async function runCommand(cmd: Command, label: string): Promise<any> {
  if (!API_MODE) {
    // the server rules are loaded only when needed, to keep the first page load small
    const { applyCommand } = await import('@civil/domain/policy');
    const now = new Date();
    const r = applyCommand({ db, session: buildSession(db, currentUserId)!, today: today(), now: now.toISOString(), hour: now.getHours(), newId: () => uid('r') }, cmd);
    for (const ch of r.changes) {
      if ('single' in ch) {
        if (ch.single === 'seq') for (const [k, v] of Object.entries(ch.value as Record<string, number>)) (db.seq[k] !== v) && commit({ t: 'seq', k, v });
        else commit({ t: 'set', k: ch.single, v: ch.value });
      } else commit((db[ch.coll] as any[]).some((x) => x.id === ch.id) ? { t: 'upd', c: ch.coll, id: ch.id, patch: ch.rec } : { t: 'ins', c: ch.coll, rec: ch.rec });
    }
    for (const a of r.audit) audit(a);
    emit();
    return r.record;
  }
  if (apiState.offline || !navigator.onLine) throw new Error(`${label} needs the network — connect and try again`);
  const id = cmdId();
  const p = new Promise<CommandResult>((resolve, reject) => waiters.set(id, { resolve, reject }));
  outbox.push({ cmdId: id, cmd: cmd as unknown as Record<string, unknown>, ops: [], label, at: new Date().toISOString() });
  persistOutbox();
  void flush();
  return (await p).record;
}

/* ---------------- numbering ---------------- */
/** in API mode this number is provisional — the server gives the final one */
export function nextNo(prefix: string, date = today()): string {
  const n = (db.seq[prefix] || 0) + 1;
  commit({ t: 'seq', k: prefix, v: n });
  return `${prefix}/${fyCode(date).slice(2)}/${String(n).padStart(4, '0')}`;
}
export function peekNo(prefix: string, date = today()): string {
  return `${prefix}/${fyCode(date).slice(2)}/${String((db.seq[prefix] || 0) + 1).padStart(4, '0')}`;
}

/* ---------------- audit (ROLE-05) — the server writes it in API mode ---------------- */
function audit(e: Omit<AuditEntry, 'id' | 'at' | 'userId'>) {
  if (API_MODE) return;
  const rec: AuditEntry = { id: uid('au'), at: new Date().toISOString(), userId: currentUserId || 'u1', ...e };
  commit({ t: 'ins', c: 'audit', rec });
}

export function notify(n: Omit<Notification, 'id' | 'at' | 'read'>) {
  if (API_MODE) return;
  commit({ t: 'ins', c: 'notifications', rec: { id: uid('nt'), at: new Date().toISOString(), read: false, ...n } });
}

/* ---------------- mutations ---------------- */
export function insert<T extends { id?: string }>(c: CollectionKey, rec: T, label: string, entity: string): T & { id: string } {
  const full = { id: uid(c.slice(0, 2)), createdAt: new Date().toISOString(), createdBy: currentUserId || 'u1', active: true, ...rec } as T & { id: string };
  const { password, ...local } = full as any;
  const { createdAt: _a, createdBy: _b, ...body } = full as any;
  const run = () => {
    commit({ t: 'ins', c, rec: local });
    audit({ action: 'CREATE', entity, entityId: full.id, label, after: local });
  };
  if (API_MODE) queued(label, { kind: 'insert', coll: c, rec: { ...body, ...(password ? { password } : {}) } }, run);
  else run();
  emit();
  return local;
}

export function update(c: CollectionKey, id: ID, patch: Record<string, unknown>, label: string, entity: string, reason?: string, action: AuditEntry['action'] = 'UPDATE') {
  const before = (db[c] as any[]).find((x) => x.id === id);
  const run = () => {
    commit({ t: 'upd', c, id, patch });
    const changedBefore: Record<string, unknown> = {};
    if (before) for (const k of Object.keys(patch)) changedBefore[k] = before[k];
    audit({ action, entity, entityId: id, label, before: changedBefore, after: patch, reason });
  };
  if (API_MODE) queued(label, { kind: 'update', coll: c, id, patch, reason }, run);
  else run();
  emit();
}

export function updateSettings(patch: Partial<Settings>, reason = 'Settings changed') {
  const before = { ...db.settings };
  const run = () => {
    commit({ t: 'set', k: 'settings', v: patch });
    audit({ action: 'UPDATE', entity: 'Settings', entityId: 'settings', label: reason, before, after: patch });
  };
  if (API_MODE) queued(reason, { kind: 'settings', patch, reason }, run);
  else run();
  emit();
}
export function updateCompany(patch: Partial<DB['company']>) {
  const run = () => {
    commit({ t: 'set', k: 'company', v: patch });
    audit({ action: 'UPDATE', entity: 'Company', entityId: 'company', label: 'Company profile updated', after: patch });
  };
  if (API_MODE) queued('Company profile', { kind: 'company', patch }, run);
  else run();
  emit();
}

/** approve / reject / send back (APR-02) — same status mapping as the server */
export function decide(c: CollectionKey, id: ID, decision: 'APPROVED' | 'REJECTED' | 'SENT_BACK', remark: string, label: string, extra: Record<string, unknown> = {}) {
  const rec = (db[c] as any[]).find((x) => x.id === id);
  let status: string = decision;
  if (decision === 'APPROVED') {
    if (c === 'stockTxns' && rec) {
      if (rec.type === 'ISSUE') status = rec.issueToVehicleId ? 'POSTED' : 'IN_TRANSIT';
      else if (rec.type === 'TRANSFER' || rec.type === 'RETURN') status = 'IN_TRANSIT';
      else if (['CONSUMPTION', 'GRN', 'OPENING'].includes(rec.type)) status = 'POSTED';
    }
    if (c === 'pos') status = 'OPEN';
  }
  const run = () => {
    commit({ t: 'upd', c, id, patch: { status, approvalNote: remark, ...extra } });
    audit({ action: decision === 'APPROVED' ? 'APPROVE' : decision === 'REJECTED' ? 'REJECT' : 'SEND_BACK', entity: c, entityId: id, label, reason: remark });
    if (rec?.createdBy && rec.createdBy !== currentUserId) notify({ title: `${label} ${decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'sent back'}`, body: remark || '—', link: '/approvals', tone: decision === 'APPROVED' ? 'good' : decision === 'REJECTED' ? 'bad' : 'warn', userId: rec.createdBy });
  };
  if (API_MODE) queued(label, { kind: 'decide', coll: c, id, decision, remark }, run);
  else run();
  emit();
}

export function markNotificationsRead() {
  const mine = db.notifications.filter((x) => !x.read && (!x.userId || x.userId === currentUserId));
  if (!mine.length) return;
  const run = () => {
    for (const n of mine) commit({ t: 'upd', c: 'notifications', id: n.id, patch: { read: true } });
  };
  if (API_MODE) queued('Notifications read', { kind: 'markRead' }, run);
  else run();
  emit();
}

export async function resetDemo() {
  if (API_MODE) {
    await api.resetDemo();
    await loadSnapshot();
    return;
  }
  journal = { seed: SEED_VERSION, ops: [] };
  try {
    localStorage.removeItem(JOURNAL_KEY);
  } catch {
    /* ignore */
  }
  db = buildDemoDB(today());
  emit();
}

export function journalSize() {
  return API_MODE ? 0 : journal.ops.length;
}

/* ---------------- session ---------------- */
export function setCurrentUser(id: ID | '') {
  if (API_MODE) {
    if (!id) signOutLocal();
    else void signInDemo(id).catch((e) => toast.error('Could not switch user', (e as Error).message));
    return;
  }
  currentUserId = id;
  try {
    if (id) localStorage.setItem('wcm-user', id);
    else localStorage.removeItem('wcm-user');
  } catch {
    /* ignore */
  }
  if (id) audit({ action: 'LOGIN', entity: 'Session', entityId: id, label: `${db.users.find((u) => u.id === id)?.name} signed in` });
  emit();
}
export function getCurrentUserId() {
  return currentUserId;
}

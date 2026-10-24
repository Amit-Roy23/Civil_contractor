import { useSyncExternalStore } from 'react';
import type { AuditEntry, CollectionKey, DB, ID, Notification, Settings } from './types';
import { SEED_VERSION } from '@civil/domain/seed';
import { buildDemoDB, emptyDB } from '@civil/domain/demo';
import { buildMasters } from '@civil/domain/seed-masters';
import { fyCode, today } from '../lib/format';
import { uid } from '../lib/utils';
import { toast } from '../components/ui/core';
import { API_MODE, ApiError, api, hasToken, setToken, type CommandResult, type SignedIn } from './api';

/**
 * Client-side data store, in one of two modes:
 *
 * - Demo (default): the sample dataset is generated for "today" and every change is kept in a small
 *   journal in localStorage that is replayed on load — demo edits survive a refresh.
 * - API (VITE_DATA_MODE=api): the server is the source of truth. Screens call the same functions;
 *   each change shows at once (optimistic), is sent to the server in order, and is replaced by what
 *   the server decided (numbers, statuses, rates). Errors undo the change by reloading from the server.
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
}
let apiState: ApiState = { phase: 'signed-out', isDemo: false, companyId: '', rev: 0 };
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
  if (op.t === 'ins') return { ...d, [op.c]: [...(d[op.c] as any[]), op.rec] };
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
      void loadSnapshot();
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

/** local change; in demo mode it is also journalled */
function commit(op: Op) {
  db = apply(db, op);
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
let queue: Promise<void> = Promise.resolve();
let pending = 0;
let resyncWanted = false;

async function loadSnapshot() {
  try {
    const s = await api.snapshot();
    db = s.db;
    currentUserId = s.userId;
    setApi({ phase: 'ready', isDemo: s.isDemo, companyId: s.companyId, rev: s.rev, error: undefined });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) signOutLocal(e.message);
    else setApi({ phase: apiState.phase === 'ready' ? 'ready' : 'error', error: (e as Error).message });
  }
  emit();
}

function mergeServer(r: CommandResult) {
  let d = db;
  for (const ch of r.changes) {
    if ('single' in ch) d = { ...d, [ch.single]: ch.value };
    else {
      const arr = (d as any)[ch.coll] as any[] | undefined;
      if (!arr) continue;
      const i = arr.findIndex((x) => x.id === ch.id);
      d = { ...d, [ch.coll]: i < 0 ? [...arr, ch.rec] : arr.map((x, j) => (j === i ? ch.rec : x)) };
    }
  }
  db = d;
  // someone else saved in between — fetch their changes too
  if (r.rev !== apiState.rev + 1) resyncWanted = true;
  setApi({ rev: r.rev });
}

function send(cmd: Record<string, unknown>) {
  pending++;
  queue = queue.then(async () => {
    try {
      mergeServer(await api.command(cmd));
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) return signOutLocal(err.message);
      toast.error('Not saved', err.message);
      resyncWanted = true;
    } finally {
      pending--;
      if (pending === 0 && resyncWanted) {
        resyncWanted = false;
        await loadSnapshot();
      } else emit();
    }
  });
}

let syncStarted = false;
function startSync() {
  if (syncStarted) return;
  syncStarted = true;
  const check = async () => {
    if (apiState.phase !== 'ready' || pending > 0 || document.hidden) return;
    try {
      const { rev } = await api.rev();
      if (rev !== apiState.rev && pending === 0) await loadSnapshot();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOutLocal(e.message);
    }
  };
  window.setInterval(check, 20_000);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
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
  setToken('');
  db = blankDB();
  currentUserId = '';
  setApi({ phase: 'signed-out', rev: 0, error: undefined });
  if (reason) toast.warn('Signed out', reason);
  emit();
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
  commit({ t: 'ins', c, rec: local });
  audit({ action: 'CREATE', entity, entityId: full.id, label, after: local });
  if (API_MODE) {
    const { createdAt: _a, createdBy: _b, ...body } = full as any;
    send({ kind: 'insert', coll: c, rec: { ...body, ...(password ? { password } : {}) } });
  }
  emit();
  return local;
}

export function update(c: CollectionKey, id: ID, patch: Record<string, unknown>, label: string, entity: string, reason?: string, action: AuditEntry['action'] = 'UPDATE') {
  const before = (db[c] as any[]).find((x) => x.id === id);
  commit({ t: 'upd', c, id, patch });
  const changedBefore: Record<string, unknown> = {};
  if (before) for (const k of Object.keys(patch)) changedBefore[k] = before[k];
  audit({ action, entity, entityId: id, label, before: changedBefore, after: patch, reason });
  if (API_MODE) send({ kind: 'update', coll: c, id, patch, reason });
  emit();
}

export function updateSettings(patch: Partial<Settings>, reason = 'Settings changed') {
  const before = { ...db.settings };
  commit({ t: 'set', k: 'settings', v: patch });
  audit({ action: 'UPDATE', entity: 'Settings', entityId: 'settings', label: reason, before, after: patch });
  if (API_MODE) send({ kind: 'settings', patch, reason });
  emit();
}
export function updateCompany(patch: Partial<DB['company']>) {
  commit({ t: 'set', k: 'company', v: patch });
  audit({ action: 'UPDATE', entity: 'Company', entityId: 'company', label: 'Company profile updated', after: patch });
  if (API_MODE) send({ kind: 'company', patch });
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
  commit({ t: 'upd', c, id, patch: { status, approvalNote: remark, ...extra } });
  audit({ action: decision === 'APPROVED' ? 'APPROVE' : decision === 'REJECTED' ? 'REJECT' : 'SEND_BACK', entity: c, entityId: id, label, reason: remark });
  if (rec?.createdBy && rec.createdBy !== currentUserId) notify({ title: `${label} ${decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'sent back'}`, body: remark || '—', link: '/approvals', tone: decision === 'APPROVED' ? 'good' : decision === 'REJECTED' ? 'bad' : 'warn', userId: rec.createdBy });
  if (API_MODE) send({ kind: 'decide', coll: c, id, decision, remark });
  emit();
}

export function markNotificationsRead() {
  const mine = db.notifications.filter((x) => !x.read && (!x.userId || x.userId === currentUserId));
  for (const n of mine) commit({ t: 'upd', c: 'notifications', id: n.id, patch: { read: true } });
  if (API_MODE && mine.length) send({ kind: 'markRead' });
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

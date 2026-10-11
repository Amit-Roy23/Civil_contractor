import { useSyncExternalStore } from 'react';
import type { AuditEntry, CollectionKey, CostHead, DB, ID, Notification, Settings } from './types';
import { buildSeed, SEED_VERSION } from './seed';
import { COST_HEADS, siteCostSheet } from './selectors';
import { fyCode, today } from '../lib/format';
import { uid } from '../lib/utils';

/**
 * Client-side data store. The demo dataset is generated deterministically for "today",
 * and every change the user makes is kept in a small journal in localStorage that is
 * replayed on load — so demo edits survive a refresh without storing megabytes.
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

/** opening cost (pre go-live) so that each site's books start from a believable margin */
function calibrate(d: DB) {
  const target: Record<string, number> = { s1: 0.885, s2: 0.93, s3: 0.86, s4: 1.04, s5: 0.95 };
  for (const s of d.sites) {
    const win = siteCostSheet(d, s.id, { from: '0000-01-01', to: '9999-12-31' });
    const desired = win.workDone * (target[s.id] ?? 0.9);
    const gap = Math.max(0, desired - win.cost);
    const mix: Record<CostHead, number> = { MATERIAL: 0.5, LABOUR: 0.13, SUBCONTRACT: 0.08, VEHICLE: 0.18, MISC: 0.05, OVERHEAD: 0.06 };
    COST_HEADS.forEach((h) => (s.openingCost[h] = Math.round(gap * mix[h])));
  }
}

function apply(d: DB, op: Op): DB {
  if (op.t === 'ins') return { ...d, [op.c]: [...(d[op.c] as any[]), op.rec] };
  if (op.t === 'upd') return { ...d, [op.c]: (d[op.c] as any[]).map((x) => (x.id === op.id ? { ...x, ...op.patch } : x)) };
  if (op.t === 'set') return { ...d, [op.k]: { ...(d[op.k] as any), ...op.v } };
  if (op.t === 'seq') return { ...d, seq: { ...d.seq, [op.k]: op.v } };
  return d;
}

export function initStore() {
  readJournal();
  const base = buildSeed(today());
  calibrate(base);
  let d: DB = base;
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

function commit(op: Op, persist = true) {
  db = apply(db, op);
  if (persist) {
    journal.ops.push(op);
    saveJournal();
  }
}
function emit() {
  listeners.forEach((l) => l());
}

export function getDB() {
  return db;
}
export function useDB(): DB {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => db,
    () => db,
  );
}

/* ---------------- numbering ---------------- */
export function nextNo(prefix: string, date = today()): string {
  const n = (db.seq[prefix] || 0) + 1;
  commit({ t: 'seq', k: prefix, v: n });
  return `${prefix}/${fyCode(date).slice(2)}/${String(n).padStart(4, '0')}`;
}
export function peekNo(prefix: string, date = today()): string {
  return `${prefix}/${fyCode(date).slice(2)}/${String((db.seq[prefix] || 0) + 1).padStart(4, '0')}`;
}

/* ---------------- audit (ROLE-05) ---------------- */
function audit(e: Omit<AuditEntry, 'id' | 'at' | 'userId'>) {
  const rec: AuditEntry = { id: uid('au'), at: new Date().toISOString(), userId: currentUserId || 'u1', ...e };
  commit({ t: 'ins', c: 'audit', rec });
}

export function notify(n: Omit<Notification, 'id' | 'at' | 'read'>) {
  commit({ t: 'ins', c: 'notifications', rec: { id: uid('nt'), at: new Date().toISOString(), read: false, ...n } });
}

/* ---------------- mutations ---------------- */
export function insert<T extends { id?: string }>(c: CollectionKey, rec: T, label: string, entity: string): T & { id: string } {
  const full = { id: uid(c.slice(0, 2)), createdAt: new Date().toISOString(), createdBy: currentUserId || 'u1', active: true, ...rec } as T & { id: string };
  commit({ t: 'ins', c, rec: full });
  audit({ action: 'CREATE', entity, entityId: full.id, label, after: full });
  emit();
  return full;
}

export function update(c: CollectionKey, id: ID, patch: Record<string, unknown>, label: string, entity: string, reason?: string, action: AuditEntry['action'] = 'UPDATE') {
  const before = (db[c] as any[]).find((x) => x.id === id);
  commit({ t: 'upd', c, id, patch });
  const changedBefore: Record<string, unknown> = {};
  if (before) for (const k of Object.keys(patch)) changedBefore[k] = before[k];
  audit({ action, entity, entityId: id, label, before: changedBefore, after: patch, reason });
  emit();
}

export function updateSettings(patch: Partial<Settings>, reason = 'Settings changed') {
  const before = { ...db.settings };
  commit({ t: 'set', k: 'settings', v: patch });
  audit({ action: 'UPDATE', entity: 'Settings', entityId: 'settings', label: reason, before, after: patch });
  emit();
}
export function updateCompany(patch: Partial<DB['company']>) {
  commit({ t: 'set', k: 'company', v: patch });
  audit({ action: 'UPDATE', entity: 'Company', entityId: 'company', label: 'Company profile updated', after: patch });
  emit();
}

/** approve / reject / send back (APR-02) */
export function decide(c: CollectionKey, id: ID, decision: 'APPROVED' | 'REJECTED' | 'SENT_BACK', remark: string, label: string, extra: Record<string, unknown> = {}) {
  const rec = (db[c] as any[]).find((x) => x.id === id);
  let status: string = decision;
  if (decision === 'APPROVED') {
    if (c === 'stockTxns' && rec && ['ISSUE', 'TRANSFER'].includes(rec.type)) status = 'IN_TRANSIT';
    if (c === 'stockTxns' && rec && ['CONSUMPTION', 'GRN', 'RETURN'].includes(rec.type)) status = 'POSTED';
    if (c === 'pos') status = 'OPEN';
  }
  commit({ t: 'upd', c, id, patch: { status, approvalNote: remark, ...extra } });
  audit({ action: decision === 'APPROVED' ? 'APPROVE' : decision === 'REJECTED' ? 'REJECT' : 'SEND_BACK', entity: c, entityId: id, label, reason: remark });
  if (rec?.createdBy && rec.createdBy !== currentUserId) notify({ title: `${label} ${decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'sent back'}`, body: remark || '—', link: '/approvals', tone: decision === 'APPROVED' ? 'good' : decision === 'REJECTED' ? 'bad' : 'warn' });
  emit();
}

export function markNotificationsRead() {
  for (const n of db.notifications.filter((x) => !x.read)) commit({ t: 'upd', c: 'notifications', id: n.id, patch: { read: true } });
  emit();
}

export function resetDemo() {
  journal = { seed: SEED_VERSION, ops: [] };
  try {
    localStorage.removeItem(JOURNAL_KEY);
  } catch {
    /* ignore */
  }
  const base = buildSeed(today());
  calibrate(base);
  db = base;
  emit();
}

export function journalSize() {
  return journal.ops.length;
}

/* ---------------- session ---------------- */
export function setCurrentUser(id: ID | '') {
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

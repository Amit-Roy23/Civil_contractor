import { describe, expect, it } from 'vitest';
import { buildDemoDB } from '../src/demo.js';
import { applyCommand, RuleError, type Command } from '../src/policy.js';
import { buildSession } from '../src/session.js';
import { snapshotFor } from '../src/visibility.js';
import { availability } from '../src/ledger.js';
import type { DB } from '../src/types.js';

const TODAY = '2026-10-24';
const base = buildDemoDB(TODAY);
let n = 0;
const run = (db: DB, userId: string, cmd: Command, hour = 10) =>
  applyCommand({ db, session: buildSession(db, userId), today: TODAY, now: `${TODAY}T10:00:00.000Z`, hour, newId: () => `zt${++n}` }, cmd);
const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RuleError);
    return e as RuleError;
  }
  throw new Error('expected a RuleError');
};
/** a material with stock in a store, and its quantity */
const stocked = (db: DB, store: string) => {
  for (const m of db.materials) {
    const q = availability(db, store, m.id, TODAY);
    if (Math.min(q.onDate, q.minAfter) > 5) return { materialId: m.id, avail: Math.min(q.onDate, q.minAfter) };
  }
  throw new Error('no stock');
};

describe('stock rules', () => {
  it('consumption posts and gets a server number', () => {
    const { materialId } = stocked(base, 'st-s1');
    const r = run(base, 'u4', { kind: 'insert', coll: 'stockTxns', rec: { type: 'CONSUMPTION', date: TODAY, fromStoreId: 'st-s1', lines: [{ materialId, qty: 1, rate: 999 }], status: 'APPROVED', no: 'HACK' } });
    expect(r.record.status).toMatch(/POSTED|PENDING/);
    expect(r.record.no).toMatch(/^CON\/\d{2}-?\d*\/\d{4}$|^CON\//);
    expect(r.record.no).not.toBe('HACK');
    expect(r.record.lines[0].rate).toBe(0);
    expect(r.record.createdBy).toBe('u4');
  });
  it('blocks negative stock (MAT-10)', () => {
    const { materialId, avail } = stocked(base, 'st-s1');
    const e = err(() => run(base, 'u4', { kind: 'insert', coll: 'stockTxns', rec: { type: 'CONSUMPTION', date: TODAY, fromStoreId: 'st-s1', lines: [{ materialId, qty: avail + 1000 }] } }));
    expect(e.status).toBe(409);
  });
  it('engineer cannot post from another site store (ROLE-02)', () => {
    const { materialId } = stocked(base, 'st-s3');
    expect(err(() => run(base, 'u4', { kind: 'insert', coll: 'stockTxns', rec: { type: 'CONSUMPTION', date: TODAY, fromStoreId: 'st-s3', lines: [{ materialId, qty: 1 }] } })).status).toBe(403);
  });
  it('back-dated entries go for approval (MAT-14) and future dates fail', () => {
    const { materialId } = stocked(base, 'st-s1');
    const r = run(base, 'u4', { kind: 'insert', coll: 'stockTxns', rec: { type: 'CONSUMPTION', date: '2026-10-10', fromStoreId: 'st-s1', lines: [{ materialId, qty: 0.5 }] } });
    expect(r.record.status).toBe('PENDING');
    err(() => run(base, 'u4', { kind: 'insert', coll: 'stockTxns', rec: { type: 'CONSUMPTION', date: '2026-10-30', fromStoreId: 'st-s1', lines: [{ materialId, qty: 0.5 }] } }));
  });
  it('wastage is always pending, then approved by an approver with limit', () => {
    const { materialId } = stocked(base, 'st-s1');
    const r = run(base, 'u4', { kind: 'insert', coll: 'stockTxns', rec: { type: 'WASTAGE', date: TODAY, fromStoreId: 'st-s1', lines: [{ materialId, qty: 0.1 }], reason: 'Broken' } });
    expect(r.record.status).toBe('PENDING');
    expect(err(() => run(r.db, 'u4', { kind: 'decide', coll: 'stockTxns', id: r.record.id, decision: 'APPROVED' })).status).toBe(403); // own entry
    const a = run(r.db, 'u1', { kind: 'decide', coll: 'stockTxns', id: r.record.id, decision: 'APPROVED' });
    expect(a.record.status).toBe('APPROVED');
    expect(a.db.notifications.at(-1)?.userId).toBe('u4');
    err(() => run(a.db, 'u1', { kind: 'decide', coll: 'stockTxns', id: r.record.id, decision: 'APPROVED' }));
  });
  it('rejection needs a remark (APR-02)', () => {
    const { materialId } = stocked(base, 'st-s1');
    const r = run(base, 'u4', { kind: 'insert', coll: 'stockTxns', rec: { type: 'WASTAGE', date: TODAY, fromStoreId: 'st-s1', lines: [{ materialId, qty: 0.1 }], reason: 'Broken' } });
    err(() => run(r.db, 'u1', { kind: 'decide', coll: 'stockTxns', id: r.record.id, decision: 'REJECTED' }));
    expect(run(r.db, 'u1', { kind: 'decide', coll: 'stockTxns', id: r.record.id, decision: 'REJECTED', remark: 'No proof' }).record.status).toBe('REJECTED');
  });
  it('opening stock is admin only', () => {
    expect(err(() => run(base, 'u3', { kind: 'insert', coll: 'stockTxns', rec: { type: 'OPENING', date: TODAY, toStoreId: 'cs', lines: [{ materialId: base.materials[0]!.id, qty: 1, rate: 10 }] } })).status).toBe(403);
  });
  it('only admin can cancel, with a reason', () => {
    const t = base.stockTxns.find((x) => x.status === 'POSTED' && x.type === 'CONSUMPTION')!;
    expect(err(() => run(base, 'u4', { kind: 'update', coll: 'stockTxns', id: t.id, patch: { status: 'CANCELLED' }, reason: 'x' })).status).toBe(403);
    err(() => run(base, 'u1', { kind: 'update', coll: 'stockTxns', id: t.id, patch: { status: 'CANCELLED' } }));
    expect(run(base, 'u1', { kind: 'update', coll: 'stockTxns', id: t.id, patch: { status: 'CANCELLED' }, reason: 'Wrong entry' }).record.status).toBe('CANCELLED');
  });
  it('a posted voucher cannot be edited', () => {
    const t = base.stockTxns.find((x) => x.status === 'POSTED')!;
    err(() => run(base, 'u1', { kind: 'update', coll: 'stockTxns', id: t.id, patch: { lines: [] } }));
  });
});

describe('permissions and masking', () => {
  it('roles without rates cannot create money records (ROLE-03)', () => {
    expect(err(() => run(base, 'u4', { kind: 'insert', coll: 'payments', rec: { date: TODAY, partyType: 'SUPPLIER', partyId: base.suppliers[0]!.id, amount: 100, mode: 'CASH', kind: 'FULL' } })).status).toBe(403);
  });
  it('fleet cannot add workers', () => {
    expect(err(() => run(base, 'u9', { kind: 'insert', coll: 'workers', rec: { name: 'X' } })).status).toBe(403);
  });
  it('engineer snapshot hides other sites and rates', () => {
    const snap = snapshotFor(base, buildSession(base, 'u4'));
    expect(snap.expenses.every((e) => e.siteId === 's1')).toBe(true);
    expect(snap.materials.every((m) => m.stdRate === 0)).toBe(true);
    expect(snap.payments).toHaveLength(0);
    expect(snap.audit).toHaveLength(0);
    expect(snap.users.every((u) => u.phone === '')).toBe(true);
  });
  it('owner snapshot has everything', () => {
    const snap = snapshotFor(base, buildSession(base, 'u1'));
    expect(snap.expenses.length).toBe(base.expenses.length);
  });
  it('settings are admin only', () => {
    expect(err(() => run(base, 'u2', { kind: 'settings', patch: { backdateDays: 30 } })).status).toBe(403);
    expect(run(base, 'u1', { kind: 'settings', patch: { backdateDays: 5 } }).db.settings.backdateDays).toBe(5);
  });
  it('validates input shape', () => {
    const e = err(() => run(base, 'u4', { kind: 'insert', coll: 'expenses', rec: { date: 'yesterday', siteId: 's1', headId: base.expenseHeads[0]!.id, amount: -5 } }));
    expect(e.status).toBe(400);
  });
});

describe('expenses, attendance, approvals', () => {
  it('expense above limit goes pending, small one is approved', () => {
    const head = base.expenseHeads[0]!.id;
    const small = run(base, 'u4', { kind: 'insert', coll: 'expenses', rec: { date: TODAY, siteId: 's1', headId: head, amount: 500, mode: 'CASH', description: 'tea', paidTo: 'shop' } });
    expect(small.record.status).toBe('APPROVED');
    const big = run(base, 'u4', { kind: 'insert', coll: 'expenses', rec: { date: TODAY, siteId: 's1', headId: head, amount: 50000, mode: 'CASH', description: 'x', paidTo: 'y' } });
    expect(big.record.status).toBe('PENDING');
    // engineer limit 5,000 < 50,000 and it's their own; accountant can approve
    expect(run(big.db, 'u2', { kind: 'decide', coll: 'expenses', id: big.record.id, decision: 'APPROVED' }).record.status).toBe('APPROVED');
  });
  it('approval limit is enforced', () => {
    const head = base.expenseHeads[0]!.id;
    const big = run(base, 'u4', { kind: 'insert', coll: 'expenses', rec: { date: TODAY, siteId: 's1', headId: head, amount: 50000, mode: 'CASH', description: 'x', paidTo: 'y' } });
    // another engineer of site s1 doesn't exist; use a temp engineer role user on s1
    const db2 = { ...big.db, users: [...big.db.users, { ...big.db.users.find((u) => u.id === 'u5')!, id: 'u99', username: 'e99', siteIds: ['s1'] }] };
    expect(err(() => run(db2, 'u99', { kind: 'decide', coll: 'expenses', id: big.record.id, decision: 'APPROVED' })).status).toBe(403);
  });
  it('attendance older than lock is admin only (LAB-05) and no duplicates', () => {
    const w = base.workers.find((x) => x.siteId === 's1' && x.active !== false)!;
    expect(err(() => run(base, 'u4', { kind: 'insert', coll: 'attendance', rec: { date: '2026-10-20', siteId: 's1', workerId: w.id, status: 'P' } })).status).toBe(403);
    const dup = base.attendance.find((a) => a.workerId && a.siteId === 's1' && a.date === TODAY);
    if (dup) expect(err(() => run(base, 'u4', { kind: 'insert', coll: 'attendance', rec: { date: TODAY, siteId: 's1', workerId: dup.workerId, status: 'P' } })).status).toBe(409);
  });
  it('PO above limit needs approval and becomes OPEN', () => {
    const r = run(base, 'u2', { kind: 'insert', coll: 'pos', rec: { date: TODAY, supplierId: base.suppliers[0]!.id, deliveryStoreId: 'cs', lines: [{ materialId: base.materials[0]!.id, qty: 1000, rate: 500, gstPct: 18 }], terms: '' } });
    expect(r.record.status).toBe('PENDING');
    expect(run(r.db, 'u1', { kind: 'decide', coll: 'pos', id: r.record.id, decision: 'APPROVED' }).record.status).toBe('OPEN');
  });
  it('RA bill is rebuilt from measurements', () => {
    const r = run(base, 'u1', { kind: 'insert', coll: 'raBills', rec: { date: TODAY, siteId: 's1', lines: [{ boqItemId: 'fake', uptoQty: 1e9, prevQty: 0, thisQty: 1e9, rate: 1e9 }], deductions: { securityDeposit: 0, retention: 0, tds: 0, cess: 0, gstTds: 0, royalty: 0, advanceRecovery: 0, materialRecovery: 0, penalty: 0 } } });
    expect(r.record.lines.every((l: any) => l.boqItemId !== 'fake')).toBe(true);
    expect(r.record.status).toBe('SUBMITTED');
  });
});

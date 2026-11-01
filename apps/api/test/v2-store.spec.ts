import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDemoDB } from '@civil/domain/demo';
import { applyCommand } from '@civil/domain/policy';
import { buildSession } from '@civil/domain/session';
import { V2Store } from '../src/v2/store.js';
import { clock, newId } from '../src/v2/clock.js';

/** v2 persistence: data survives a reload, concurrent writes never lose an update or a voucher number */
describe('v2 store', () => {
  const store = new V2Store();
  const CO = 'v2test';

  beforeAll(async () => {
    await store.ensureSchema();
    await store.replaceAll(CO, 'V2 Test', true, buildDemoDB(clock().today));
  });
  afterAll(async () => {
    await store.sql`DELETE FROM wcm_companies WHERE id = ${CO}`;
    await store.sql.end();
  });

  const expense = (amount: number) => (db: any) => {
    const { today, now, hour } = clock();
    const r = applyCommand({ db, session: buildSession(db, 'u4')!, today, now, hour, newId: () => newId() }, { kind: 'insert', coll: 'expenses', rec: { date: today, siteId: 's1', headId: db.expenseHeads[0].id, amount, mode: 'CASH', description: 'test', paidTo: 'test' } });
    return { db: r.db, changes: r.changes, extra: r.record };
  };

  it('round-trips the whole dataset', async () => {
    const a = await store.load(CO);
    (store as any).cache.clear();
    const b = await store.load(CO);
    expect(b.db.stockTxns.length).toBe(a.db.stockTxns.length);
    expect(b.db.roles.find((r) => r.id === 'owner')!.approvalLimit).toBe(Infinity);
    expect(b.db.settings).toEqual(a.db.settings);
  });

  it('serialises concurrent writes with gapless numbers', async () => {
    const before = await store.load(CO);
    const n0 = before.db.expenses.length;
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => store.write(CO, expense(100 + i))));
    const revs = results.map((r) => r.rev).sort((x, y) => x - y);
    expect(new Set(revs).size).toBe(12);
    (store as any).cache.clear();
    const after = await store.load(CO);
    expect(after.db.expenses.length).toBe(n0 + 12);
    const nos = results.map((r) => Number(String(r.extra.no).split('/').pop())).sort((x, y) => x - y);
    expect(nos[11]! - nos[0]!).toBe(11);
  });

  it('a repeated command id is answered from the log, not saved twice (PF-03)', async () => {
    const before = (await store.load(CO)).db.expenses.length;
    const once = { cmdId: 'retry-test-0001', userId: 'u4' };
    const a = await store.write(CO, expense(777), once);
    const b = await store.write(CO, expense(777), once);
    expect(b.replay).toBe(true);
    expect(b.extra.id).toBe(a.extra.id);
    (store as any).cache.clear();
    expect((await store.load(CO)).db.expenses.length).toBe(before + 1);
  });

  it('a failed command changes nothing', async () => {
    const rev = await store.rev(CO);
    await expect(store.write(CO, expense(-5))).rejects.toThrow();
    expect(await store.rev(CO)).toBe(rev);
  });
});

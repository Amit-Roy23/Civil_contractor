import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCompanyDB } from '../src/setup.js';
import { applyCommand, RuleError, type Command } from '../src/policy.js';
import { buildSession } from '../src/session.js';
import { snapshotFor } from '../src/visibility.js';
import { checkImport, exportSheet, templateById, templateSheets } from '../src/imports.js';
import { readXlsx, writeXlsx } from '../src/xlsx.js';
import { siteCostSheet } from '../src/selectors.js';
import type { DB } from '../src/types.js';

const TODAY = '2026-11-01';
const spec = JSON.parse(readFileSync(new URL('../../../apps/api/setup/saurajit-deb.json', import.meta.url), 'utf8'));
const fresh = () => buildCompanyDB(spec, TODAY).db;
let n = 0;
const run = (db: DB, userId: string, cmd: Command) => applyCommand({ db, session: buildSession(db, userId)!, today: TODAY, now: `${TODAY}T10:00:00.000Z`, hour: 10, newId: () => `id${++n}` }, cmd);
const work = (extra: Record<string, unknown> = {}) => ({
  name: 'Improvement of Dharmanagar–Kadamtala road from Ch. 0.000 to 6.500 km', clientId: 'c-pwd-rb-tr', contractValue: 24800000, workType: 'ROAD', status: 'ACTIVE',
  budget: { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 }, openingCost: { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 }, ...extra,
});

describe('client setup (Queries 2–4)', () => {
  it('builds with no errors and no sample works', () => {
    const { db, errors } = buildCompanyDB(spec, TODAY);
    expect(errors).toEqual([]);
    expect(db.sites).toHaveLength(0);
    expect(db.stockTxns).toHaveLength(0);
    expect(db.firms[0]!.gstin).toBe('16BGXPD9663C1Z0');
    expect(db.plants[0]!.storeId).toBe(db.stores.find((s) => s.type === 'PLANT')!.id);
    expect(db.clients[0]!.deductions!.gstTdsThreshold).toBe(250000);
  });
});

describe('works master (Query 1)', () => {
  it('numbers the work per firm, copies client deductions and creates the site store', () => {
    const r = run(fresh(), 'u1', { kind: 'insert', coll: 'sites', rec: work({ workOrderDate: '2026-10-15', short: 'Kadamtala Rd' }) });
    expect(r.record.code).toBe('SD/2026-27/001');
    expect(r.record.firmId).toBe('f-sd');
    expect(r.record.deductions.itTdsPct).toBe(1);
    expect(r.record.stage).toBe('IN_PROGRESS');
    const store = r.db.stores.find((s) => s.siteId === r.record.id)!;
    expect(store.name).toBe('Site Store — Kadamtala Rd');
    const r2 = run(r.db, 'u1', { kind: 'insert', coll: 'sites', rec: work({ name: 'Second work', workOrderDate: '2026-10-20' }) });
    expect(r2.record.code).toBe('SD/2026-27/002');
  });
  it('derives status from stage', () => {
    const r = run(fresh(), 'u1', { kind: 'insert', coll: 'sites', rec: work({ stage: 'STOPPED' }) });
    expect(r.record.status).toBe('ON_HOLD');
    const u = run(r.db, 'u1', { kind: 'update', coll: 'sites', id: r.record.id, patch: { stage: 'PHYSICALLY_COMPLETE', actualCompletion: '2026-10-30' } });
    expect(u.record.status).toBe('COMPLETED');
  });
  it('a work cannot close while its site store holds stock (Query 3 rule 5)', () => {
    let r = run(fresh(), 'u1', { kind: 'insert', coll: 'sites', rec: work() });
    const site = r.record;
    const store = r.db.stores.find((s) => s.siteId === site.id)!;
    r = run(r.db, 'u1', { kind: 'insert', coll: 'stockTxns', rec: { type: 'OPENING', date: TODAY, toStoreId: store.id, lines: [{ materialId: 'm-bit-vg30', qty: 2, rate: 52000 }] } });
    let e: unknown;
    try {
      run(r.db, 'u1', { kind: 'update', coll: 'sites', id: site.id, patch: { stage: 'CLOSED' } });
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(RuleError);
    expect((e as Error).message).toMatch(/Bitumen VG-30 2 MT/);
    // empty store: closes and the store is switched off
    const empty = run(fresh(), 'u1', { kind: 'insert', coll: 'sites', rec: work() });
    const c = run(empty.db, 'u1', { kind: 'update', coll: 'sites', id: empty.record.id, patch: { stage: 'CLOSED' } });
    expect(c.db.stores.find((s) => s.siteId === empty.record.id)!.active).toBe(false);
  });
  it('a second site store for the same work is refused', () => {
    const r = run(fresh(), 'u1', { kind: 'insert', coll: 'sites', rec: work() });
    expect(() => run(r.db, 'u1', { kind: 'insert', coll: 'stores', rec: { code: 'X1', name: 'x', type: 'SITE', siteId: r.record.id } })).toThrow(/already has a site store/);
  });
});

describe('Excel import (XL-04 / PF-06)', () => {
  const sheetFrom = async (rows: unknown[][]) => (await readXlsx(writeXlsx([{ name: 'Works', rows: rows as any }])))[0]!.rows;
  it('works: Query 1 column names, refs by name, dates DD/MM/YYYY, opening figures', async () => {
    const db = fresh();
    const t = templateById('works')!;
    const rows = await sheetFrom([
      ['Name of work *', 'Short name', 'Client', 'Office / division', 'Contract value', 'Includes GST', 'LOA date', 'Status', 'Work done till go-live', 'Billed till go-live', 'Received till go-live'],
      ['Road from A to B', 'A–B road', 'PWD (R&B), Government of Tripura', 'PWD (R&B) Dharmanagar Division', '1,25,00,000', 'No', '15/10/2026', 'In progress', 4000000, 3500000, 3000000],
      ['Bridge at C', 'C bridge', 'PWD-RB-TR', '', 9800000, 'Yes', '01/09/2026', 'LOA received', '', '', ''],
    ]);
    const res = checkImport(db, t, rows);
    expect(res.errors).toEqual([]);
    expect(res.ops).toHaveLength(2);
    const r = run(db, 'u1', { kind: 'import', template: 'works', ops: res.ops });
    expect(r.db.sites.map((s) => s.code)).toEqual(['SD/2026-27/001', 'SD/2026-27/002']);
    expect(r.db.sites[0]!.officeId).toBeTruthy();
    expect(r.db.stores.filter((s) => s.type === 'SITE')).toHaveLength(2);
    const cs = siteCostSheet(r.db, r.db.sites[0]!.id);
    expect([cs.workDone, cs.billed, cs.received]).toEqual([4000000, 3500000, 3000000]);
  });
  it('lists every bad row and column before anything is saved', async () => {
    const db = fresh();
    const rows = await sheetFrom([
      ['Name of work', 'Client', 'Contract value', 'LOA date', 'Status'],
      ['Good work', 'PWD-RB-TR', 100, '01/10/2026', 'In progress'],
      ['', 'Nobody', 'abc', '31/02/2026', 'Running'],
    ]);
    const res = checkImport(db, templateById('works')!, rows);
    expect(res.errors.map((e) => e.column)).toEqual(['Name of work', 'Client', 'Contract value', 'LOA date', 'Status']);
    expect(res.errors.every((e) => e.row === 3)).toBe(true);
  });
  it('the server rejects the whole file if one row breaks a rule', () => {
    const db = fresh();
    const ops = [
      { row: 2, kind: 'insert' as const, coll: 'materials' as const, rec: { code: 'NEW-1', name: 'New', category: 'Others', unit: 'MT', kind: 'RAW' } },
      { row: 3, kind: 'insert' as const, coll: 'materials' as const, rec: { code: 'BIT-VG30', name: 'Dup', category: 'Others', unit: 'MT', kind: 'RAW' } },
    ];
    expect(() => run(db, 'u1', { kind: 'import', template: 'materials', ops })).toThrow(/Row 3: Code BIT-VG30 already exists — nothing was imported/);
  });
  it('opening stock: one voucher per store and date, admin only', async () => {
    const db = fresh();
    const rows = await sheetFrom([
      ['Store', 'Material', 'Quantity', 'Rate', 'As on date'],
      ['Plant Store — Kalikapur', 'Bitumen VG-30', 18.5, 52000, '31/10/2026'],
      ['Plant Store — Kalikapur', 'LDO (burner fuel)', 3200, 92, '31/10/2026'],
      ['Central Godown — Chandrapur', 'CEM-OPC53', 12, 7600, '31/10/2026'],
    ]);
    const res = checkImport(db, templateById('opening-stock')!, rows);
    expect(res.errors).toEqual([]);
    expect(res.ops).toHaveLength(2);
    const r = run(db, 'u1', { kind: 'import', template: 'opening-stock', ops: res.ops });
    expect(r.db.stockTxns.filter((x) => x.type === 'OPENING' && x.status === 'POSTED')).toHaveLength(2);
  });
  it('template and export use the same columns, and export re-imports cleanly', async () => {
    const t = templateById('materials')!;
    expect(templateSheets(t)[0]!.rows[0]![0]).toBe('Code *');
    const db = fresh();
    const sheet = exportSheet(db, t);
    const back = checkImport({ ...db, materials: [] }, t, (await readXlsx(writeXlsx([sheet])))[0]!.rows);
    expect(back.errors).toEqual([]);
    expect(back.ops).toHaveLength(db.materials.length);
  });
});

describe('work-level access (ROLE-02)', () => {
  it('an engineer only receives full details of his own works', () => {
    let db = fresh();
    const a = run(db, 'u1', { kind: 'insert', coll: 'sites', rec: work({ name: 'Work A' }) });
    const b = run(a.db, 'u1', { kind: 'insert', coll: 'sites', rec: work({ name: 'Work B' }) });
    db = { ...b.db, users: [...b.db.users, { id: 'e1', name: 'Site Engineer', username: 'eng', phone: '9000000001', email: '', roleId: 'engineer', siteIds: [a.record.id], plantIds: [], active: true }] };
    const snap = snapshotFor(db, buildSession(db, 'e1')!);
    const mine = snap.sites.find((s) => s.id === a.record.id)!;
    const other = snap.sites.find((s) => s.id === b.record.id) as any;
    expect(mine.clientId).toBe('c-pwd-rb-tr');
    expect(mine.contractValue).toBe(0); // rates hidden for engineers
    expect(other.outOfScope).toBe(true);
    expect(other.deductions).toBeUndefined();
  });
});

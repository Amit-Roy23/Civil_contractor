import type { CollectionKey, Company, DB, User } from './types.js';
import { buildMasters } from './seed-masters.js';
import { emptyDB } from './demo.js';
import { schemas, zodMessage } from './schemas.js';
import { fyCode } from './format.js';
import { clientDeductions } from './works.js';

/**
 * A real client's starting data (PF-06 "empty start"): the client's own firm, clients, stores, plant,
 * machines and material catalogue — no sample works or transactions. Standard roles, units, expense
 * heads and settings come from the product defaults.
 *
 * Records reference each other by code (a plant names its store's code, a store its plant's code),
 * and every record is checked with the same schema the server uses for entries.
 */
export interface SetupSpec {
  company: Omit<Company, 'fy'>;
  firms?: Array<Record<string, any>>;
  clients?: Array<Record<string, any>>;
  /** `plantCode` links a plant store to its plant */
  stores?: Array<Record<string, any> & { plantCode?: string }>;
  /** `storeCode` links the plant to its store */
  plants?: Array<Record<string, any> & { storeCode: string }>;
  materials?: Array<Record<string, any>>;
  vehicles?: Array<Record<string, any>>;
  owner: { name: string; username: string; phone: string; email?: string };
}

const SYS = 'u1';
const idFrom = (prefix: string, code: string) => `${prefix}-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 64);

export function buildCompanyDB(spec: SetupSpec, today: string): { db: DB; errors: string[] } {
  const m = buildMasters(today);
  const db = emptyDB({ ...spec.company, fy: fyCode(today) }, m.settings, m.roles);
  db.seededOn = today;
  db.units = m.units;
  db.expenseHeads = m.expenseHeads.map((e) => ({ ...e, createdAt: `${today}T00:00:00.000Z`, createdBy: SYS }));
  const errors: string[] = [];
  const at = `${today}T00:00:00.000Z`;
  const add = (coll: CollectionKey, prefix: string, raw: Record<string, any>, i: number) => {
    const rec = { id: raw.id || idFrom(prefix, String(raw.code || raw.name || i + 1)), createdAt: at, createdBy: SYS, active: true, ...raw };
    const r = schemas[coll].safeParse(rec);
    if (!r.success) {
      errors.push(`${coll} row ${i + 1} (${raw.code || raw.name || ''}): ${zodMessage(r.error)}`);
      return undefined;
    }
    (db[coll] as any[]).push(r.data);
    return r.data;
  };

  (spec.firms || []).forEach((f, i) => add('firms', 'f', f, i));

  (spec.clients || []).forEach((c, i) => {
    const offices = (c.offices || []).map((o: any, j: number) => ({ id: o.id || idFrom(`o${i + 1}`, `${j + 1}-${o.division || o.circle || 'office'}`), ...o }));
    const deductions = c.deductions || clientDeductions(undefined);
    add('clients', 'c', { tdsPct: deductions.itTdsPct, cessPct: deductions.labourCessPct, retentionPct: 0, ...c, offices, deductions }, i);
  });

  // plants and their stores point at each other: create ids first, link second
  const plantId = new Map((spec.plants || []).map((p) => [p.code, p.id || idFrom('p', p.code)]));
  const storeId = new Map((spec.stores || []).map((s) => [s.code, s.id || idFrom('st', s.code)]));
  (spec.stores || []).forEach((s, i) => {
    const { plantCode, ...rest } = s;
    if (plantCode && !plantId.has(plantCode)) errors.push(`stores row ${i + 1} (${s.code}): plant ${plantCode} is not in the plants list`);
    add('stores', 'st', { ...rest, id: storeId.get(s.code), plantId: plantCode ? plantId.get(plantCode) : undefined }, i);
  });
  (spec.plants || []).forEach((p, i) => {
    const { storeCode, ...rest } = p;
    if (!storeId.has(storeCode)) errors.push(`plants row ${i + 1} (${p.code}): store ${storeCode} is not in the stores list`);
    const inCharges = (rest.inCharges || []).map((h: any) => ({ ...h, from: h.from || today }));
    add('plants', 'p', { firmId: db.firms[0]?.id, ...rest, inCharges, id: plantId.get(p.code), storeId: storeId.get(storeCode) || '' }, i);
  });
  if (db.stores.filter((s) => s.type === 'CENTRAL').length > 1) errors.push('Only one central store is allowed');

  (spec.materials || []).forEach((x, i) => add('materials', 'm', { kind: 'RAW', gstPct: 18, minStock: 0, reorderQty: 0, stdRate: 0, hsn: '', ...x }, i));
  for (const x of db.materials) if (!db.units.some((u) => u.code === x.unit)) errors.push(`materials ${x.code}: unknown unit ${x.unit}`);

  (spec.vehicles || []).forEach((v, i) =>
    add('vehicles', 'v', { ownership: 'OWNED', fuelType: 'HSD', meterType: 'HOURS', status: 'IDLE', docs: [], lastServiceAt: 0, serviceEvery: 0, internalRate: 0, emi: 0, driverSalary: 0, tankCapacity: 0, driver: '', year: 2020, ...v }, i),
  );

  const owner: User = { id: 'u1', name: spec.owner.name, username: spec.owner.username.toLowerCase(), phone: spec.owner.phone, email: spec.owner.email || '', roleId: 'owner', siteIds: [], plantIds: [], active: true };
  const u = schemas.users.safeParse(owner);
  if (!u.success) errors.push(`owner: ${zodMessage(u.error)}`);
  db.users = [owner];

  // codes must be unique within a master
  for (const coll of ['firms', 'clients', 'stores', 'plants', 'materials', 'vehicles'] as CollectionKey[]) {
    const seen = new Set<string>();
    for (const r of db[coll] as any[]) {
      const k = String(r.code).toLowerCase();
      if (seen.has(k)) errors.push(`${coll}: code ${r.code} is used twice`);
      seen.add(k);
    }
  }
  return { db, errors };
}

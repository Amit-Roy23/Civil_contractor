import type {
  BoqItem,
  Client,
  CostHead,
  ExpenseHead,
  FuelSource,
  Material,
  MaterialCategory,
  ModuleKey,
  Perm,
  Plant,
  Recipe,
  Role,
  Settings,
  Site,
  Store,
  SubContractor,
  Supplier,
  Trade,
  UnitDef,
  User,
  Vehicle,
  VehicleDoc,
  Worker,
} from './types';
import { addDays } from '../lib/format';

/* ---------- deterministic RNG ---------- */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    r: (lo: number, hi: number) => lo + (hi - lo) * next(),
    ri: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
  };
}

const SYS = 'u1';
const base = (id: string, createdAt: string) => ({ id, createdAt, createdBy: SYS, active: true });

export const COMPANY = {
  name: 'Arohon Infra Projects Pvt. Ltd.',
  gstin: '18AAKCA4821N1ZQ',
  pan: 'AAKCA4821N',
  address: 'House No. 14, Bhetapara Road, Khanapara, Guwahati, Assam 781022',
  phone: '+91 361 223 4567',
  email: 'accounts@arohoninfra.in',
  fy: '',
  banks: [
    { bank: 'State Bank of India, Dispur', account: '3874 1209 556', ifsc: 'SBIN0006320' },
    { bank: 'HDFC Bank, GS Road', account: '5020 0043 1187 22', ifsc: 'HDFC0001215' },
  ],
};

export function buildMasters(T: string) {
  const D = (n: number) => addDays(T, -n);
  const F = (n: number) => addDays(T, n);
  const created = D(400);

  /* ---------------- Clients ---------------- */
  const clients: Client[] = [
    { ...base('c1', created), code: 'NHIDCL', name: 'NHIDCL — National Highways & Infrastructure Dev. Corp.', gstin: '18AADCN5426F1ZT', address: 'Regional Office, Zoo Road, Guwahati', billingContact: 'GM (Projects), PIU Nagaon', tdsPct: 2, retentionPct: 5, cessPct: 1 },
    { ...base('c2', created), code: 'PWDB', name: 'PWD (Building), Govt. of Assam', gstin: '18AAAGP0371K1ZB', address: 'Chandmari, Guwahati', billingContact: 'Executive Engineer, Dibrugarh Bldg Divn', tdsPct: 2, retentionPct: 5, cessPct: 1 },
    { ...base('c3', created), code: 'AIRRDA', name: 'Assam State Rural Roads Dev. Agency (PMGSY)', gstin: '18AABTA1129C1ZL', address: 'Ganeshguri, Guwahati', billingContact: 'PIU Kamrup (Rural)', tdsPct: 2, retentionPct: 5, cessPct: 1 },
    { ...base('c4', created), code: 'GMDA', name: 'Guwahati Metropolitan Development Authority', gstin: '18AAALG0914E1Z2', address: 'Bhangagarh, Guwahati', billingContact: 'Chief Engineer, GMDA', tdsPct: 2, retentionPct: 5, cessPct: 1 },
    { ...base('c5', created), code: 'WRD', name: 'Water Resources Department, Assam', gstin: '18AAAGW1033R1ZD', address: 'Chandmari, Guwahati', billingContact: 'EE, Guwahati Embankment Divn', tdsPct: 2, retentionPct: 5, cessPct: 1 },
  ];

  /* ---------------- Sites ---------------- */
  const budgetSplit = (cv: number, m: Partial<Record<CostHead, number>>): Record<CostHead, number> => {
    const r = { MATERIAL: 0.46, LABOUR: 0.12, SUBCONTRACT: 0.08, VEHICLE: 0.14, MISC: 0.04, OVERHEAD: 0.04, ...m };
    const out = {} as Record<CostHead, number>;
    (Object.keys(r) as CostHead[]).forEach((k) => (out[k] = Math.round((cv * r[k]!) / 1000) * 1000));
    return out;
  };
  const zeroCost = (): Record<CostHead, number> => ({ MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 });
  const sites: Site[] = [
    {
      ...base('s1', created), code: 'NH27-NGN', short: 'NH-27 Nagaon', name: 'NH-27 Four-Laning, Nagaon Bypass Pkg-II', clientId: 'c1',
      workOrderNo: 'NHIDCL/GHY/NH27/PKG-II/2025/118', workOrderDate: D(440), contractValue: 486000000, location: 'Nagaon, Assam', gps: '26.3464, 92.6840',
      startDate: D(420), scheduledCompletion: F(310), engineerId: 'u4', status: 'ACTIVE', securityDeposit: 14580000, retentionPct: 5, gstPct: 18, workType: 'ROAD',
      budget: budgetSplit(486000000, { MATERIAL: 0.5 }), openingCost: zeroCost(), openingAsOf: '',
    },
    {
      ...base('s2', created), code: 'GRF-FLY', short: 'Six Mile Flyover', name: 'Guwahati Ring Road Flyover, Six Mile Junction', clientId: 'c4',
      workOrderNo: 'GMDA/CE/FLY/2025-26/07', workOrderDate: D(320), contractValue: 324000000, location: 'Six Mile, Guwahati', gps: '26.1268, 91.8017',
      startDate: D(300), scheduledCompletion: F(420), engineerId: 'u5', status: 'ACTIVE', securityDeposit: 9720000, retentionPct: 5, gstPct: 18, workType: 'BRIDGE',
      budget: budgetSplit(324000000, { SUBCONTRACT: 0.12 }), openingCost: zeroCost(), openingAsOf: '',
    },
    {
      ...base('s3', created), code: 'PMGSY-KMP', short: 'PMGSY Kamrup', name: 'PMGSY Rural Roads Pkg AS-03-112, Kamrup', clientId: 'c3',
      workOrderNo: 'AIRRDA/PMGSY-III/KMP/112', workOrderDate: D(380), contractValue: 128000000, location: 'Boko–Chaygaon, Kamrup', gps: '25.9721, 91.2387',
      startDate: D(360), scheduledCompletion: F(60), engineerId: 'u6', status: 'ACTIVE', securityDeposit: 3840000, retentionPct: 5, gstPct: 12, workType: 'ROAD',
      budget: budgetSplit(128000000, {}), openingCost: zeroCost(), openingAsOf: '',
    },
    {
      ...base('s4', created), code: 'DBR-HST', short: 'Dibrugarh Hostel', name: 'Hostel Block G+6, AMC Dibrugarh (PWD Bldg)', clientId: 'c2',
      workOrderNo: 'PWD/B/DBR/2025-26/44', workOrderDate: D(250), contractValue: 182000000, location: 'Dibrugarh, Assam', gps: '27.4728, 94.9120',
      startDate: D(230), scheduledCompletion: F(500), engineerId: 'u7', status: 'ACTIVE', securityDeposit: 5460000, retentionPct: 5, gstPct: 18, workType: 'BUILDING',
      budget: budgetSplit(182000000, { LABOUR: 0.16, VEHICLE: 0.06 }), openingCost: zeroCost(), openingAsOf: '',
    },
    {
      ...base('s5', created), code: 'BRP-RTW', short: 'Riverfront Wall', name: 'Brahmaputra Riverfront Retaining Wall, Uzanbazar', clientId: 'c5',
      workOrderNo: 'WRD/GED/2025/RTW-03', workOrderDate: D(210), contractValue: 96000000, location: 'Uzanbazar, Guwahati', gps: '26.1923, 91.7550',
      startDate: D(190), scheduledCompletion: F(240), engineerId: 'u5', status: 'ON_HOLD', securityDeposit: 2880000, retentionPct: 5, gstPct: 12, workType: 'IRRIGATION',
      budget: budgetSplit(96000000, {}), openingCost: zeroCost(), openingAsOf: '',
    },
  ];

  /* ---------------- Plants & stores ---------------- */
  const plants: Plant[] = [
    { ...base('p1', created), code: 'HMP-01', name: 'Hot Mix Plant, Sonapur', type: 'HOT_MIX', capacityPerHour: 120, capacityUnit: 'TPH', location: 'Sonapur, Kamrup (M)', inChargeId: 'u8', storeId: 'py-p1', costMode: 'ACTUAL', fixedRate: { m30: 6400, m31: 7300 } },
    { ...base('p2', created), code: 'RMC-01', name: 'Concrete Batching Plant, Changsari', type: 'BATCHING', capacityPerHour: 30, capacityUnit: 'cum/h', location: 'Changsari, Kamrup', inChargeId: 'u8', storeId: 'py-p2', costMode: 'ACTUAL', fixedRate: { m32: 4800, m33: 5200, m34: 5700 } },
    { ...base('p3', created), code: 'CRS-01', name: 'Stone Crusher, Boko', type: 'CRUSHER', capacityPerHour: 150, capacityUnit: 'TPH', location: 'Boko, Kamrup', inChargeId: 'u8', storeId: 'py-p3', costMode: 'ACTUAL', fixedRate: {} },
  ];

  const stores: Store[] = [
    { ...base('cs', created), code: 'CS-01', name: 'Central Godown, Khanapara', type: 'CENTRAL' },
    ...sites.map((s) => ({ ...base(`st-${s.id}`, created), code: `ST-${s.code.split('-')[0]}`, name: `${s.short} Site Store`, type: 'SITE' as const, siteId: s.id })),
    ...plants.map((p) => ({ ...base(`py-${p.id}`, created), code: `PY-${p.code.split('-')[0]}`, name: `${p.code} Plant Yard`, type: 'PLANT' as const, plantId: p.id })),
  ];

  /* ---------------- Units ---------------- */
  const units: UnitDef[] = [
    { id: 'MT', code: 'MT', name: 'Metric tonne' },
    { id: 'KG', code: 'KG', name: 'Kilogram', base: 'MT', factor: 0.001 },
    { id: 'QTL', code: 'QTL', name: 'Quintal', base: 'MT', factor: 0.1 },
    { id: 'BAG', code: 'BAG', name: 'Bag (50 kg)', base: 'MT', factor: 0.05 },
    { id: 'CUM', code: 'CUM', name: 'Cubic metre' },
    { id: 'CFT', code: 'CFT', name: 'Cubic feet', base: 'CUM', factor: 0.0283168 },
    { id: 'SQM', code: 'SQM', name: 'Square metre' },
    { id: 'SQFT', code: 'SQFT', name: 'Square feet', base: 'SQM', factor: 0.092903 },
    { id: 'RMT', code: 'RMT', name: 'Running metre' },
    { id: 'NOS', code: 'NOS', name: 'Numbers' },
    { id: 'LTR', code: 'LTR', name: 'Litre' },
    { id: 'TRIP', code: 'TRIP', name: 'Trip' },
    { id: 'HR', code: 'HR', name: 'Hour' },
    { id: 'DAY', code: 'DAY', name: 'Day' },
  ];

  /* ---------------- Materials ---------------- */
  type MDef = [string, string, string, MaterialCategory, string, number, string, number, number, number, Material['kind'], Partial<Material>?];
  const mdefs: MDef[] = [
    ['m01', 'CEM-OPC53', 'OPC 53 Grade Cement', 'Cement', 'MT', 7400, '2523', 28, 60, 150, 'RAW', { altUnit: 'BAG', altFactor: 0.05, batchTracked: true, tolerancePct: 3 }],
    ['m02', 'CEM-PPC', 'PPC Cement', 'Cement', 'MT', 6900, '2523', 28, 30, 80, 'RAW', { altUnit: 'BAG', altFactor: 0.05, batchTracked: true, tolerancePct: 3 }],
    ['m03', 'TMT-12', 'TMT Bar Fe500D 12 mm', 'Steel', 'MT', 58500, '7214', 18, 20, 40, 'RAW', { batchTracked: true, tolerancePct: 2 }],
    ['m04', 'TMT-16', 'TMT Bar Fe500D 16 mm', 'Steel', 'MT', 57800, '7214', 18, 20, 40, 'RAW', { batchTracked: true, tolerancePct: 2 }],
    ['m05', 'TMT-25', 'TMT Bar Fe500D 25 mm', 'Steel', 'MT', 57200, '7214', 18, 15, 30, 'RAW', { batchTracked: true, tolerancePct: 2 }],
    ['m06', 'AGG-40', 'Aggregate 40 mm', 'Aggregate', 'MT', 1050, '2517', 5, 150, 400, 'BOTH'],
    ['m07', 'AGG-20', 'Aggregate 20 mm', 'Aggregate', 'MT', 1150, '2517', 5, 200, 500, 'BOTH'],
    ['m08', 'AGG-10', 'Aggregate 10 mm', 'Aggregate', 'MT', 1200, '2517', 5, 150, 400, 'BOTH'],
    ['m09', 'AGG-DUST', 'Stone Dust', 'Aggregate', 'MT', 650, '2517', 5, 150, 400, 'BOTH'],
    ['m10', 'BLD-RAW', 'Boulders (crusher feed)', 'Aggregate', 'MT', 520, '2516', 5, 400, 1200, 'RAW'],
    ['m11', 'SAND-Z2', 'Coarse Sand Zone-II', 'Sand', 'CUM', 1850, '2505', 5, 60, 150, 'RAW'],
    ['m12', 'BIT-VG30', 'Bitumen VG-30', 'Bitumen', 'MT', 52000, '2713', 18, 30, 60, 'RAW', { batchTracked: true, tolerancePct: 3 }],
    ['m13', 'BIT-SS1', 'Bitumen Emulsion SS-1', 'Bitumen', 'MT', 46000, '2715', 18, 4, 10, 'RAW'],
    ['m14', 'FLYASH', 'Fly Ash', 'Others', 'MT', 900, '2621', 5, 20, 60, 'RAW'],
    ['m15', 'ADMX-PCE', 'Admixture PCE (Superplasticiser)', 'Consumables', 'LTR', 145, '3824', 18, 600, 2000, 'RAW'],
    ['m16', 'FILLER', 'Filler — Hydrated Lime', 'Others', 'MT', 7800, '2522', 18, 4, 12, 'RAW'],
    ['m17', 'HSD', 'HSD (Diesel)', 'Fuel & Lubricants', 'LTR', 92, '2710', 0, 2000, 10000, 'RAW'],
    ['m18', 'FO', 'Furnace Oil (burner)', 'Fuel & Lubricants', 'LTR', 58, '2710', 18, 3000, 12000, 'RAW'],
    ['m19', 'EO-15W40', 'Engine Oil 15W-40', 'Fuel & Lubricants', 'LTR', 310, '2710', 18, 150, 400, 'RAW'],
    ['m20', 'BRK-FLY', 'Fly Ash Bricks 230×110×75', 'Bricks', 'NOS', 7.2, '6815', 12, 15000, 40000, 'RAW'],
    ['m21', 'NP3-900', 'NP3 RCC Pipe 900 mm', 'Pipes', 'RMT', 4200, '6810', 18, 20, 60, 'RAW'],
    ['m22', 'BW-18G', 'Binding Wire 18 G', 'Steel', 'KG', 82, '7217', 18, 300, 1000, 'RAW'],
    ['m23', 'SHT-PLT', "Shuttering Plate 3'×2'", 'Tools & Tackles', 'NOS', 1650, '7308', 18, 0, 0, 'RAW', { returnable: true }],
    ['m24', 'PROP-ST', 'Steel Prop (adjustable)', 'Tools & Tackles', 'NOS', 980, '7308', 18, 0, 0, 'RAW', { returnable: true }],
    ['m25', 'SCF-6M', 'Scaffolding Pipe 6 m', 'Tools & Tackles', 'NOS', 1450, '7306', 18, 0, 0, 'RAW', { returnable: true }],
    ['m26', 'CBL-4SQ', 'Copper Cable 4 sq mm', 'Electrical', 'RMT', 68, '8544', 18, 200, 500, 'RAW'],
    ['m27', 'SPR-HFLT', 'Hydraulic Filter (spare)', 'Spares', 'NOS', 1850, '8421', 18, 6, 12, 'RAW'],
    ['m28', 'SPR-TYRE', 'Tyre 10.00-R20 (spare)', 'Spares', 'NOS', 21500, '4011', 28, 4, 8, 'RAW'],
    ['m30', 'HMP-DBM', 'DBM Grade-II (hot mix)', 'Plant Output', 'MT', 6200, '2715', 18, 0, 0, 'OUTPUT', { tolerancePct: 2 }],
    ['m31', 'HMP-BC', 'BC Grade-II (hot mix)', 'Plant Output', 'MT', 7100, '2715', 18, 0, 0, 'OUTPUT', { tolerancePct: 2 }],
    ['m32', 'RMC-M20', 'Ready Mix Concrete M20', 'Plant Output', 'CUM', 4700, '3824', 18, 0, 0, 'OUTPUT', { tolerancePct: 2 }],
    ['m33', 'RMC-M25', 'Ready Mix Concrete M25', 'Plant Output', 'CUM', 5100, '3824', 18, 0, 0, 'OUTPUT', { tolerancePct: 2 }],
    ['m34', 'RMC-M30', 'Ready Mix Concrete M30', 'Plant Output', 'CUM', 5600, '3824', 18, 0, 0, 'OUTPUT', { tolerancePct: 2 }],
  ];
  const materials: Material[] = mdefs.map(([id, code, name, category, unit, stdRate, hsn, gstPct, minStock, reorderQty, kind, extra]) => ({
    ...base(id, created), code, name, category, unit, stdRate, hsn, gstPct, minStock, reorderQty, kind, ...(extra || {}),
  }));

  /* ---------------- Recipes (MST-14) ---------------- */
  const recipes: Recipe[] = [
    { ...base('r-dbm', created), code: 'JMF-DBM-II', name: 'DBM Gr-II job mix (MoRTH 507)', productId: 'm30', perUnit: 'MT', lines: [{ materialId: 'm07', qty: 0.3 }, { materialId: 'm08', qty: 0.28 }, { materialId: 'm09', qty: 0.335 }, { materialId: 'm16', qty: 0.02 }, { materialId: 'm12', qty: 0.045 }] },
    { ...base('r-bc', created), code: 'JMF-BC-II', name: 'BC Gr-II job mix (MoRTH 509)', productId: 'm31', perUnit: 'MT', lines: [{ materialId: 'm07', qty: 0.18 }, { materialId: 'm08', qty: 0.36 }, { materialId: 'm09', qty: 0.38 }, { materialId: 'm16', qty: 0.025 }, { materialId: 'm12', qty: 0.055 }] },
    { ...base('r-bc-s3', created), code: 'JMF-BC-PMGSY', name: 'BC job mix — PMGSY spec (Kamrup)', productId: 'm31', siteId: 's3', perUnit: 'MT', lines: [{ materialId: 'm07', qty: 0.2 }, { materialId: 'm08', qty: 0.35 }, { materialId: 'm09', qty: 0.37 }, { materialId: 'm16', qty: 0.022 }, { materialId: 'm12', qty: 0.052 }] },
    { ...base('r-m20', created), code: 'MIX-M20', name: 'M20 design mix', productId: 'm32', perUnit: 'CUM', lines: [{ materialId: 'm01', qty: 0.32 }, { materialId: 'm11', qty: 0.46 }, { materialId: 'm07', qty: 0.74 }, { materialId: 'm08', qty: 0.46 }, { materialId: 'm15', qty: 2.6 }] },
    { ...base('r-m25', created), code: 'MIX-M25', name: 'M25 design mix', productId: 'm33', perUnit: 'CUM', lines: [{ materialId: 'm01', qty: 0.36 }, { materialId: 'm11', qty: 0.43 }, { materialId: 'm07', qty: 0.74 }, { materialId: 'm08', qty: 0.45 }, { materialId: 'm15', qty: 3.2 }] },
    { ...base('r-m25-s2', created), code: 'MIX-M25-FA', name: 'M25 with fly ash — GMDA spec (Flyover)', productId: 'm33', siteId: 's2', perUnit: 'CUM', lines: [{ materialId: 'm01', qty: 0.33 }, { materialId: 'm14', qty: 0.06 }, { materialId: 'm11', qty: 0.42 }, { materialId: 'm07', qty: 0.74 }, { materialId: 'm08', qty: 0.45 }, { materialId: 'm15', qty: 3.4 }] },
    { ...base('r-m30', created), code: 'MIX-M30', name: 'M30 design mix', productId: 'm34', perUnit: 'CUM', lines: [{ materialId: 'm01', qty: 0.41 }, { materialId: 'm11', qty: 0.4 }, { materialId: 'm07', qty: 0.73 }, { materialId: 'm08', qty: 0.45 }, { materialId: 'm15', qty: 3.8 }] },
    { ...base('r-crs', created), code: 'CRS-SPLIT', name: 'Crusher yield split (boulders)', productId: 'm10', perUnit: 'MT', lines: [{ materialId: 'm10', qty: 1 }], split: [{ materialId: 'm06', pct: 24 }, { materialId: 'm07', pct: 31 }, { materialId: 'm08', pct: 18 }, { materialId: 'm09', pct: 22 }] },
    // work-item recipes (site BOQ)
    { ...base('w-gsb', created), code: 'WI-GSB', name: 'GSB Gr-I per cum', productId: '', perUnit: 'CUM', lines: [{ materialId: 'm06', qty: 1.05 }, { materialId: 'm09', qty: 0.95 }] },
    { ...base('w-wmm', created), code: 'WI-WMM', name: 'WMM per cum', productId: '', perUnit: 'CUM', lines: [{ materialId: 'm07', qty: 0.82 }, { materialId: 'm08', qty: 0.55 }, { materialId: 'm09', qty: 0.78 }] },
    { ...base('w-dbm', created), code: 'WI-DBM', name: 'DBM laying per MT', productId: '', perUnit: 'MT', lines: [{ materialId: 'm30', qty: 1.0 }] },
    { ...base('w-bc', created), code: 'WI-BC', name: 'BC laying per MT', productId: '', perUnit: 'MT', lines: [{ materialId: 'm31', qty: 1.0 }] },
    { ...base('w-m25', created), code: 'WI-RCC25', name: 'RCC M25 (RMC) per cum', productId: '', perUnit: 'CUM', lines: [{ materialId: 'm33', qty: 1.02 }] },
    { ...base('w-m30', created), code: 'WI-RCC30', name: 'RCC M30 (RMC) per cum', productId: '', perUnit: 'CUM', lines: [{ materialId: 'm34', qty: 1.02 }] },
    { ...base('w-steel', created), code: 'WI-REINF', name: 'Reinforcement per MT', productId: '', perUnit: 'MT', lines: [{ materialId: 'm04', qty: 1.03 }, { materialId: 'm22', qty: 8 }] },
    { ...base('w-steel12', created), code: 'WI-REINF12', name: 'Reinforcement (12 mm) per MT', productId: '', perUnit: 'MT', lines: [{ materialId: 'm03', qty: 1.03 }, { materialId: 'm22', qty: 9 }] },
    { ...base('w-steel25', created), code: 'WI-REINF25', name: 'Reinforcement (25 mm) per MT', productId: '', perUnit: 'MT', lines: [{ materialId: 'm05', qty: 1.03 }, { materialId: 'm22', qty: 6 }] },
    { ...base('w-pcc', created), code: 'WI-PCC15', name: 'PCC M15 site mix per cum', productId: '', perUnit: 'CUM', lines: [{ materialId: 'm01', qty: 0.22 }, { materialId: 'm11', qty: 0.47 }, { materialId: 'm07', qty: 1.32 }] },
    { ...base('w-brick', created), code: 'WI-BRICK', name: 'Brick masonry 1:6 per cum', productId: '', perUnit: 'CUM', lines: [{ materialId: 'm20', qty: 500 }, { materialId: 'm02', qty: 0.065 }, { materialId: 'm11', qty: 0.28 }] },
    { ...base('w-plaster', created), code: 'WI-PLST', name: '12 mm plaster 1:4 per sqm', productId: '', perUnit: 'SQM', lines: [{ materialId: 'm02', qty: 0.0062 }, { materialId: 'm11', qty: 0.0155 }] },
    { ...base('w-pipe', created), code: 'WI-PIPE', name: 'NP3 pipe culvert per RMT', productId: '', perUnit: 'RMT', lines: [{ materialId: 'm21', qty: 1.0 }] },
    { ...base('w-boulder', created), code: 'WI-PITCH', name: 'Boulder pitching per cum', productId: '', perUnit: 'CUM', lines: [{ materialId: 'm10', qty: 1.65 }] },
  ];

  /* ---------------- BOQ (MST-15) ---------------- */
  // [itemNo, description, unit, rate, share of contract value, recipeId]
  type B = [string, string, string, number, number, string?];
  const boqDefs: Record<string, B[]> = {
    s1: [
      ['1.01', 'Earthwork in embankment with approved soil', 'CUM', 245, 0.07],
      ['2.01', 'Granular Sub-Base Grading-I', 'CUM', 2250, 0.11, 'w-gsb'],
      ['3.01', 'Wet Mix Macadam', 'CUM', 2650, 0.12, 'w-wmm'],
      ['4.01', 'Dense Bituminous Macadam Gr-II, 60 mm', 'MT', 8650, 0.22, 'w-dbm'],
      ['4.02', 'Bituminous Concrete Gr-II, 40 mm', 'MT', 9750, 0.17, 'w-bc'],
      ['5.01', 'RCC M25 in box culverts & minor bridges', 'CUM', 11200, 0.13, 'w-m25'],
      ['5.02', 'HYSD reinforcement Fe500D', 'MT', 82500, 0.12, 'w-steel'],
      ['6.01', 'NP3 RCC pipe culvert 900 mm dia', 'RMT', 6400, 0.06, 'w-pipe'],
    ],
    s2: [
      ['1.01', 'Excavation for foundations incl. dewatering', 'CUM', 420, 0.03],
      ['2.01', 'PCC M15 levelling course', 'CUM', 6800, 0.04, 'w-pcc'],
      ['3.01', 'RCC M30 in piers & pier caps', 'CUM', 13200, 0.27, 'w-m30'],
      ['3.02', 'RCC M25 in deck slab', 'CUM', 12300, 0.21, 'w-m25'],
      ['4.01', 'HYSD reinforcement Fe500D (25 mm)', 'MT', 84500, 0.24, 'w-steel25'],
      ['4.02', 'HYSD reinforcement Fe500D (16 mm)', 'MT', 83200, 0.11, 'w-steel'],
      ['5.01', 'Elastomeric bearings (supply & fix)', 'NOS', 68000, 0.04],
      ['6.01', 'Crash barrier RCC', 'RMT', 9200, 0.06],
    ],
    s3: [
      ['1.01', 'Earthwork in formation cutting / filling', 'CUM', 210, 0.1],
      ['2.01', 'Granular Sub-Base Grading-III', 'CUM', 2100, 0.2, 'w-gsb'],
      ['3.01', 'Wet Mix Macadam', 'CUM', 2550, 0.22, 'w-wmm'],
      ['4.01', 'Bituminous Concrete 30 mm (PMGSY)', 'MT', 9450, 0.28, 'w-bc'],
      ['5.01', 'NP3 pipe culvert 900 mm', 'RMT', 6300, 0.12, 'w-pipe'],
      ['6.01', 'PCC M15 for drains & aprons', 'CUM', 6500, 0.08, 'w-pcc'],
    ],
    s4: [
      ['1.01', 'Excavation in foundation', 'CUM', 380, 0.03],
      ['2.01', 'PCC M15 below foundation', 'CUM', 6900, 0.05, 'w-pcc'],
      ['3.01', 'RCC M25 in footings, columns, beams, slabs', 'CUM', 11800, 0.32, 'w-m25'],
      ['4.01', 'HYSD reinforcement Fe500D (12 mm)', 'MT', 81500, 0.25, 'w-steel12'],
      ['5.01', 'Fly ash brick masonry 1:6', 'CUM', 7400, 0.12, 'w-brick'],
      ['6.01', '12 mm cement plaster 1:4', 'SQM', 365, 0.07, 'w-plaster'],
      ['7.01', 'Vitrified tile flooring', 'SQM', 1650, 0.08],
      ['8.01', 'Internal electrification (lump sum points)', 'NOS', 2850, 0.08],
    ],
    s5: [
      ['1.01', 'Excavation in river bank', 'CUM', 360, 0.08],
      ['2.01', 'RCC M25 retaining wall', 'CUM', 11400, 0.42, 'w-m25'],
      ['3.01', 'HYSD reinforcement Fe500D', 'MT', 82000, 0.24, 'w-steel'],
      ['4.01', 'Boulder pitching on slope', 'CUM', 2900, 0.2, 'w-boulder'],
      ['5.01', 'Geotextile filter layer', 'SQM', 240, 0.06],
    ],
  };
  const boq: BoqItem[] = [];
  for (const s of sites) {
    for (const [itemNo, description, unit, rate, share, recipeId] of boqDefs[s.id]!) {
      const qty = Math.round((s.contractValue * share) / rate);
      boq.push({ ...base(`b-${s.id}-${itemNo}`, s.startDate), siteId: s.id, itemNo, description, unit, qty, rate, recipeId });
    }
  }
  // an approved extra item (BOQ-01 deviation)
  boq.push({ ...base('b-s1-X1', D(40)), siteId: 's1', itemNo: 'X-01', description: 'Extra item: Slope protection with stone pitching (deviation)', unit: 'CUM', qty: 1800, rate: 3100, recipeId: 'w-boulder', isExtra: true, approvalRef: 'NHIDCL/PIU-NGN/EI/2026/03' });

  /* ---------------- Suppliers ---------------- */
  const sup = (id: string, code: string, name: string, materials: string, creditDays: number, kind: Supplier['kind'], city: string, gst: string, opening = 0): Supplier => ({
    ...base(id, created), code, name, gstin: gst, pan: gst.slice(2, 12), address: city, contact: 'Sales Manager', phone: `+91 9${String(854000000 + Number(id.slice(2)) * 7919).slice(0, 9)}`,
    bank: 'SBI / Current A/c', materials, creditDays, openingBalance: opening, kind,
  });
  const suppliers: Supplier[] = [
    sup('sp01', 'STAR-CEM', 'Star Cement Ltd (Lumshnong) — Depot Guwahati', 'Cement OPC / PPC', 30, 'MATERIAL', 'Amingaon, Guwahati', '18AAECS1872B1ZX', 1840000),
    sup('sp02', 'DALMIA', 'Dalmia Cement (Bharat) Ltd', 'Cement', 30, 'MATERIAL', 'Lanka, Hojai', '18AACCD4417M1ZL', 0),
    sup('sp03', 'TATA-TISCON', 'Tata Steel — Tiscon Stockist, Brahmaputra Steels', 'TMT bars, binding wire', 21, 'MATERIAL', 'Fancy Bazar, Guwahati', '18AAFFB2231Q1ZP', 3250000),
    sup('sp04', 'SRMB', 'SRMB Srijan Ltd — NE Depot', 'TMT bars', 21, 'MATERIAL', 'Byrnihat, Ri-Bhoi', '18AAHCS5520C1Z4', 0),
    sup('sp05', 'IOCL-BIT', 'Indian Oil Corporation — Bitumen (Guwahati Refinery)', 'Bitumen VG-30, emulsion', 15, 'MATERIAL', 'Noonmati, Guwahati', '18AAACI1681G1ZO', 2150000),
    sup('sp06', 'KAMRUP-AGG', 'Kamrup Stone & Aggregates', 'Boulders, aggregate, sand', 15, 'MATERIAL', 'Boko, Kamrup', '18ABGPK8812D1ZA', 420000),
    sup('sp07', 'BHARALI-SAND', 'Bharali Sand Suppliers', 'Sand Zone-II', 7, 'MATERIAL', 'Palasbari, Kamrup', '18AJQPB3310L1ZM', 160000),
    sup('sp08', 'NE-BRICKS', 'North East Fly Ash Bricks', 'Fly ash bricks', 15, 'MATERIAL', 'Jogighopa', '18AAKFN6610R1ZV', 0),
    sup('sp09', 'ASSAM-PIPES', 'Assam Hume Pipes & Precast', 'NP3 pipes', 30, 'MATERIAL', 'Sonapur', '18AAICA2241P1Z9', 0),
    sup('sp10', 'FOSROC-NE', 'Fosroc Chemicals — NE Distributor', 'Admixtures', 30, 'MATERIAL', 'Guwahati', '18AAGFF7742H1ZQ', 0),
    sup('sp11', 'NTPC-ASH', 'Bongaigaon Fly Ash Traders', 'Fly ash, filler', 15, 'MATERIAL', 'Bongaigaon', '18AARFB1188N1ZC', 0),
    sup('sp12', 'IOCL-JGR', 'Indian Oil — Jagiroad COCO Pump', 'HSD (credit account)', 15, 'FUEL_PUMP', 'Jagiroad, Morigaon', '18AAACI1681G2ZN', 380000),
    sup('sp13', 'HP-DBR', 'HP Petrol Pump, Dibrugarh', 'HSD (credit account)', 15, 'FUEL_PUMP', 'Dibrugarh', '18AAACH1118B1Z3', 0),
    sup('sp14', 'IOCL-BULK', 'IOCL Bulk HSD (tanker supply)', 'HSD bulk', 10, 'FUEL_PUMP', 'Betkuchi, Guwahati', '18AAACI1681G3ZM', 0),
    sup('sp15', 'BORA-TPT', 'Bora Transport (hired tippers)', 'Tipper hire', 30, 'VEHICLE_OWNER', 'Nagaon', '18ACBPB5523E1ZK', 0),
    sup('sp16', 'NE-EARTH', 'NE Earthmovers (hired excavator, crane)', 'Machine hire', 30, 'VEHICLE_OWNER', 'Guwahati', '18AAKFN9910Q1Z1', 0),
    sup('sp17', 'TATA-MOTORS', 'Tata Motors Authorised Service, Guwahati', 'Spares, service', 30, 'SERVICE', 'Guwahati', '18AACCT2257H1ZM', 0),
    sup('sp18', 'BALAJI-ELEC', 'Balaji Electricals', 'Cables, electrical', 15, 'MATERIAL', 'Paltan Bazar', '18AJYPB7721G1ZQ', 0),
  ];

  /* ---------------- Sub-contractors (MST-08) ---------------- */
  const subcons: SubContractor[] = [
    { ...base('sc1', created), code: 'LC-RAMESH', name: 'Ramesh Labour Contractor', kind: 'LABOUR_CONTRACTOR', pan: 'AKLPR4412C', gstin: '', trade: 'Masons & helpers', rateType: 'PER_DAY', bank: 'Axis Bank, Nagaon', phone: '+91 94350 21877', openingBalance: 85000, licenceNo: 'ALC/NGN/2024/119', licenceExpiry: F(22), pfNo: 'AS/GHY/0045521', esiNo: '42000123450001001', bocwNo: 'BOCW/AS/2024/8812', tradeRates: { Mason: 850, Helper: 520, 'Bar Bender': 780, Carpenter: 820 } },
    { ...base('sc2', created), code: 'LC-HAZARIKA', name: 'Hazarika Manpower Services', kind: 'LABOUR_CONTRACTOR', pan: 'BHZPH8810L', gstin: '18BHZPH8810L1Z0', trade: 'Bar benders, carpenters', rateType: 'PER_DAY', bank: 'SBI Six Mile', phone: '+91 98640 55120', openingBalance: 0, licenceNo: 'ALC/KMM/2025/044', licenceExpiry: F(190), pfNo: 'AS/GHY/0051190', esiNo: '42000456780001002', bocwNo: 'BOCW/AS/2025/1021', tradeRates: { Mason: 870, Helper: 540, 'Bar Bender': 800, Carpenter: 840 } },
    { ...base('sc3', created), code: 'LC-UPPER', name: 'Upper Assam Labour Co-op', kind: 'LABOUR_CONTRACTOR', pan: 'AAAAU1234P', gstin: '', trade: 'General labour', rateType: 'PER_DAY', bank: 'UCO Bank, Dibrugarh', phone: '+91 97060 11902', openingBalance: 0, licenceNo: 'ALC/DBR/2023/301', licenceExpiry: D(5), pfNo: '', esiNo: '', bocwNo: 'BOCW/AS/2023/5511', tradeRates: { Mason: 820, Helper: 500, 'Bar Bender': 760, Carpenter: 800 } },
    { ...base('sc4', created), code: 'SC-MEGHNA', name: 'Meghna Constructions (piece-rate)', kind: 'SUB_CONTRACTOR', pan: 'AAMFM2231K', gstin: '18AAMFM2231K1ZD', trade: 'Brickwork & plaster', rateType: 'PER_UNIT', bank: 'HDFC Dibrugarh', phone: '+91 94351 77634', openingBalance: 120000, tradeRates: {} },
    { ...base('sc5', created), code: 'SC-BARAK', name: 'Barak Valley Infra (culverts)', kind: 'SUB_CONTRACTOR', pan: 'AAKFB7781F', gstin: '18AAKFB7781F1Z6', trade: 'Pipe culverts & drains', rateType: 'PER_UNIT', bank: 'SBI Silchar', phone: '+91 94350 88812', openingBalance: 0, tradeRates: {} },
    { ...base('sc6', created), code: 'SC-PRAG', name: 'Pragjyoti Earthworks', kind: 'SUB_CONTRACTOR', pan: 'ABCFP4471N', gstin: '18ABCFP4471N1ZQ', trade: 'Earthwork', rateType: 'PER_UNIT', bank: 'Axis Guwahati', phone: '+91 70028 13390', openingBalance: 0, tradeRates: {} },
  ];

  /* ---------------- Workers (MST-09) ---------------- */
  const firsts = ['Ratul', 'Bijoy', 'Pranjal', 'Hiren', 'Mukut', 'Dhruba', 'Bhaskar', 'Nayan', 'Gautam', 'Kamal', 'Ajit', 'Raju', 'Biren', 'Pankaj', 'Tapan', 'Dilip', 'Sanjib', 'Jiten', 'Mridul', 'Rupam', 'Utpal', 'Akash', 'Ramen', 'Lakhi', 'Montu', 'Babul', 'Prakash', 'Jadu', 'Nitul', 'Hemen', 'Anil', 'Suresh', 'Mohan', 'Rabin', 'Kishore', 'Pulin', 'Deben', 'Sailen', 'Arup', 'Bubul', 'Rajib', 'Bipul', 'Manoj', 'Dinesh', 'Kalyan', 'Tarun', 'Mantu', 'Gopal'];
  const lasts = ['Kalita', 'Das', 'Bora', 'Saikia', 'Gogoi', 'Nath', 'Deka', 'Baruah', 'Medhi', 'Talukdar', 'Rabha', 'Boro', 'Hazarika', 'Sarma', 'Pegu', 'Ali', 'Haque', 'Mili'];
  const rng = makeRng(7);
  const tradePlan: Array<[Trade, number, number]> = [
    ['Supervisor', 1, 1100],
    ['Mason', 3, 820],
    ['Helper', 4, 520],
    ['Carpenter', 1, 800],
    ['Bar Bender', 1, 780],
    ['Operator', 2, 950],
    ['Driver', 1, 850],
  ];
  const workers: Worker[] = [];
  let wn = 0;
  for (const s of sites.filter((x) => x.status === 'ACTIVE')) {
    for (const [trade, count, rate] of tradePlan) {
      for (let i = 0; i < count; i++) {
        wn++;
        const name = `${firsts[(wn * 7) % firsts.length]} ${lasts[(wn * 5) % lasts.length]}`;
        const wage = rate + rng.ri(-4, 6) * 10;
        workers.push({
          ...base(`w${String(wn).padStart(3, '0')}`, D(rng.ri(120, 700))), code: `WK-${String(1000 + wn)}`, name,
          phone: `+91 9${rng.ri(100000000, 999999999)}`, aadhaar: `XXXX-XXXX-${rng.ri(1000, 9999)}`, trade, wageRate: wage, otRate: Math.round((wage / 8) * 1.5),
          ownership: 'OWN', siteId: s.id, upi: `${name.split(' ')[0]!.toLowerCase()}${rng.ri(10, 99)}@sbi`, joiningDate: D(rng.ri(120, 900)),
        });
      }
    }
  }

  /* ---------------- Vehicles (MST-10) ---------------- */
  const docs = (expiries: number[]): VehicleDoc[] =>
    (['Insurance', 'Fitness', 'Permit', 'PUC', 'Road Tax'] as const).map((type, i) => ({ type, number: `${type.slice(0, 3).toUpperCase()}-${100000 + i * 7331 + expiries[i]! * 13}`, expiry: F(expiries[i]!) }));
  type V = [string, string, string, Vehicle['type'], string, string, number, Vehicle['meterType'], number, number, string | undefined, string, number[], Partial<Vehicle>?];
  const vdefs: V[] = [
    ['v01', 'TIP-01', 'AS01-EC-4521', 'Tipper', 'Tata', 'Signa 2823.K', 2021, 'KM', 3.2, 300, 's1', 'Ratul Kalita', [210, 95, 160, 28, 300], { emi: 52000, driverSalary: 22000 }],
    ['v02', 'TIP-02', 'AS01-EC-4522', 'Tipper', 'Tata', 'Signa 2823.K', 2021, 'KM', 3.2, 300, 's1', 'Bijoy Das', [210, 95, 160, 6, 300], { emi: 52000, driverSalary: 22000 }],
    ['v03', 'TIP-03', 'AS01-FC-1187', 'Tipper', 'Ashok Leyland', 'Boss 2518', 2022, 'KM', 3.4, 280, 's1', 'Pranjal Bora', [12, 240, 200, 120, 280], { emi: 47000, driverSalary: 21000 }],
    ['v04', 'TIP-04', 'AS01-FC-1188', 'Tipper', 'Ashok Leyland', 'Boss 2518', 2022, 'KM', 3.4, 280, 's3', 'Hiren Saikia', [190, 240, 200, 64, 280], { emi: 47000, driverSalary: 21000 }],
    ['v05', 'TM-01', 'AS01-GC-7720', 'Transit Mixer', 'Schwing Stetter', 'AM 6 cum on BharatBenz', 2020, 'KM', 2.6, 300, 's2', 'Mukut Gogoi', [140, 29, 150, 44, 140], { emi: 0, driverSalary: 23000 }],
    ['v06', 'TM-02', 'AS01-GC-7721', 'Transit Mixer', 'Schwing Stetter', 'AM 6 cum on BharatBenz', 2020, 'KM', 2.6, 300, 's4', 'Dhruba Nath', [140, 200, 150, 78, 140], { emi: 0, driverSalary: 23000 }],
    ['v07', 'EXC-01', 'EXC-01 / TH-EX200', 'Excavator', 'Tata Hitachi', 'EX 200 LC', 2019, 'HOURS', 0, 400, 's1', 'Bhaskar Deka', [-3, 365, 365, 365, 365], { stdLph: 14, emi: 0, driverSalary: 26000 }],
    ['v08', 'EXC-02', 'EXC-02 / HY-R210', 'Excavator', 'Hyundai', 'R210 Smart', 2021, 'HOURS', 0, 400, 's2', 'Nayan Baruah', [88, 365, 365, 365, 365], { stdLph: 13.5, emi: 68000, driverSalary: 26000 }],
    ['v09', 'JCB-01', 'AS01-JC-5510', 'JCB', 'JCB', '3DX Super', 2022, 'HOURS', 0, 160, 's4', 'Gautam Medhi', [55, 180, 365, 90, 220], { stdLph: 5.5, emi: 31000, driverSalary: 20000 }],
    ['v10', 'JCB-02', 'AS01-JC-3307', 'JCB', 'JCB', '3DX', 2020, 'HOURS', 0, 160, 's3', 'Kamal Talukdar', [130, 14, 365, 120, 220], { stdLph: 5.8, emi: 0, driverSalary: 20000 }],
    ['v11', 'RLR-01', 'RLR-01 / HAMM 3410', 'Roller', 'Hamm', '3410 Vibratory', 2019, 'HOURS', 0, 250, 's1', 'Ajit Rabha', [240, 365, 365, 365, 365], { stdLph: 8, emi: 0, driverSalary: 21000 }],
    ['v12', 'RLR-02', 'RLR-02 / HD-99', 'Roller', 'Hamm', 'HD 99 Tandem', 2021, 'HOURS', 0, 200, 's3', 'Raju Boro', [240, 365, 365, 365, 365], { stdLph: 6.2, emi: 0, driverSalary: 21000 }],
    ['v13', 'PVR-01', 'PVR-01 / SUPER 1800', 'Paver', 'Vögele', 'Super 1800-3i', 2018, 'HOURS', 0, 300, 's1', 'Biren Hazarika', [300, 365, 365, 365, 365], { stdLph: 16, emi: 0, driverSalary: 28000 }],
    ['v14', 'GRD-01', 'GRD-01 / CAT 120', 'Grader', 'Caterpillar', '120 GC', 2020, 'HOURS', 0, 300, 's1', 'Pankaj Sarma', [9, 365, 365, 365, 365], { stdLph: 12, emi: 0, driverSalary: 26000 }],
    ['v15', 'TNK-01', 'AS01-AC-0981', 'Tanker', 'Tata', 'LPK 1613 Water Tanker', 2017, 'KM', 4.2, 200, 's1', 'Tapan Pegu', [70, 160, 100, 15, 120], { emi: 0, driverSalary: 18000 }],
    ['v16', 'CAR-01', 'AS01-DC-3304', 'Car', 'Mahindra', 'Scorpio-N', 2023, 'KM', 11, 57, 's1', 'Dilip Ali', [300, 900, 900, 160, 900], { emi: 21000, driverSalary: 16000, fuelType: 'HSD' }],
    ['v17', 'DG-01', 'DG-01 / KOEL 125', 'Generator', 'Kirloskar', 'KOEL 125 kVA', 2021, 'HOURS', 0, 250, 's4', 'Sanjib Haque', [365, 365, 365, 365, 365], { stdLph: 18, emi: 0, driverSalary: 15000 }],
    ['v18', 'LDR-01', 'LDR-01 / CAT 938', 'Loader', 'Caterpillar', '938 Wheel Loader', 2020, 'HOURS', 0, 250, undefined, 'Jiten Mili', [180, 365, 365, 365, 365], { stdLph: 11, emi: 0, driverSalary: 23000 }],
    ['v19', 'HTIP-01', 'AS02-AC-9087', 'Tipper', 'Tata', 'LPK 2518', 2018, 'KM', 3.3, 250, 's3', 'Mridul (Bora Tpt)', [40, 26, 80, 11, 90], { ownership: 'HIRED', ownerName: 'Bora Transport', ownerSupplierId: 'sp15', hireBasis: 'PER_TRIP', hireRate: 1850, hireWithFuel: false, emi: 0, driverSalary: 0 }],
    ['v20', 'HEX-01', 'HEX-01 / PC210', 'Excavator', 'Komatsu', 'PC 210', 2019, 'HOURS', 0, 400, 's2', 'Rupam (NE Earth)', [90, 365, 365, 365, 365], { stdLph: 14, ownership: 'HIRED', ownerName: 'NE Earthmovers', ownerSupplierId: 'sp16', hireBasis: 'PER_HOUR', hireRate: 1650, minGuaranteedHours: 200, hireWithFuel: false, emi: 0, driverSalary: 0 }],
    ['v21', 'HCR-01', 'AS01-HC-7712', 'Excavator', 'ACE', 'Hydra 14XW crane', 2020, 'HOURS', 0, 150, 's2', 'Utpal (NE Earth)', [120, 60, 200, 30, 200], { stdLph: 6, ownership: 'HIRED', ownerName: 'NE Earthmovers', ownerSupplierId: 'sp16', hireBasis: 'PER_DAY', hireRate: 9500, hireWithFuel: true, emi: 0, driverSalary: 0 }],
    ['v22', 'HTIP-02', 'AS01-HC-2211', 'Tipper', 'BharatBenz', '2823C', 2022, 'KM', 3.2, 300, 's1', 'Akash (Bora Tpt)', [150, 120, 200, 48, 250], { ownership: 'HIRED', ownerName: 'Bora Transport', ownerSupplierId: 'sp15', hireBasis: 'PER_MONTH', hireRate: 98000, hireWithFuel: false, emi: 0, driverSalary: 0 }],
  ];
  const vehicles: Vehicle[] = vdefs.map(([id, code, regNo, type, make, model, year, meterType, stdKmpl, tank, siteId, driver, exp, extra]) => ({
    ...base(id, created), code, regNo, type, make, model, year, ownership: 'OWNED', fuelType: 'HSD', tankCapacity: tank, meterType,
    stdKmpl: meterType === 'KM' ? stdKmpl : undefined, driver, siteId, docs: docs(exp),
    serviceEvery: meterType === 'KM' ? 10000 : 250, lastServiceAt: 0, internalRate: meterType === 'KM' ? 38 : 1450, emi: 0, driverSalary: 20000,
    status: 'WORKING', ...(extra || {}),
  }));
  // driving licence for drivers of road vehicles
  vehicles.filter((v) => v.meterType === 'KM' && v.ownership === 'OWNED').forEach((v, i) => v.docs.push({ type: 'Driver Licence', number: `AS01 2019000${4410 + i}`, expiry: F(i === 2 ? 18 : 400 + i * 20) }));

  /* ---------------- Fuel sources (MST-11) ---------------- */
  const fuelSources: FuelSource[] = [
    { ...base('fs1', created), code: 'FT-01', name: 'Own HSD Tank, Central Yard Khanapara', type: 'OWN_TANK', capacity: 20000 },
    { ...base('fs2', created), code: 'BW-01', name: 'Mobile Bowser BW-01 (NH-27)', type: 'BOWSER', capacity: 6000, siteId: 's1' },
    { ...base('fs3', created), code: 'BW-02', name: 'Mobile Bowser BW-02 (Kamrup / Flyover)', type: 'BOWSER', capacity: 4000, siteId: 's3' },
    { ...base('fs4', created), code: 'OP-JGR', name: 'IOCL Jagiroad (credit pump)', type: 'OUTSIDE_PUMP', capacity: 0, supplierId: 'sp12' },
    { ...base('fs5', created), code: 'OP-DBR', name: 'HP Pump Dibrugarh (credit pump)', type: 'OUTSIDE_PUMP', capacity: 0, supplierId: 'sp13' },
  ];

  /* ---------------- Expense heads (MST-12) ---------------- */
  const eh: Array<[string, string]> = [
    ['Site office', 'Rent'], ['Site office', 'Electricity'], ['Site office', 'Water'], ['Travel', 'Conveyance & local travel'], ['Food', 'Staff food & refreshment'],
    ['Repairs', 'Minor repairs & maintenance'], ['Govt. fees', 'Royalty & permits'], ['Testing', 'Material testing charges'], ['Hospitality', 'Client / visitor hospitality'],
    ['Machine hire', 'Machine / vehicle hire (cash)'], ['Office', 'Stationery & printing'], ['Welfare', 'Medical & first aid'], ['Security', 'Watch & ward'], ['Others', 'Miscellaneous'],
  ];
  const expenseHeads: ExpenseHead[] = eh.map(([head, subHead], i) => ({ ...base(`eh${String(i + 1).padStart(2, '0')}`, created), head, subHead }));

  /* ---------------- Roles & users (ROLE-01..05) ---------------- */
  const all: Perm[] = ['view', 'add', 'edit', 'delete', 'approve'];
  const v: Perm[] = ['view'];
  const va: Perm[] = ['view', 'add'];
  const vae: Perm[] = ['view', 'add', 'edit'];
  const mods: ModuleKey[] = ['dashboard', 'masters', 'inventory', 'purchase', 'labour', 'expenses', 'fleet', 'plant', 'contract', 'reports', 'approvals', 'alerts', 'admin'];
  const permsFor = (m: Partial<Record<ModuleKey, Perm[]>>) => Object.fromEntries(mods.map((k) => [k, m[k] || []])) as Record<ModuleKey, Perm[]>;
  const roles: Role[] = [
    { id: 'owner', name: 'Owner / Admin', description: 'Full access to every site, rates and approvals', perms: permsFor(Object.fromEntries(mods.map((k) => [k, all]))), ratesVisible: true, allSites: true, approvalLimit: Infinity },
    { id: 'accountant', name: 'Accountant', description: 'Purchases, payments, bills and ledgers across all sites', perms: permsFor({ dashboard: v, masters: vae, inventory: v, purchase: all, labour: [...vae, 'approve'], expenses: all, fleet: v, plant: v, contract: all, reports: v, approvals: ['view', 'approve'], alerts: v }), ratesVisible: true, allSites: true, approvalLimit: 500000 },
    { id: 'store', name: 'Store Keeper', description: 'Central store receipts and issues', perms: permsFor({ dashboard: v, masters: v, inventory: [...vae, 'approve'], purchase: vae, reports: v, approvals: ['view', 'approve'], alerts: v }), ratesVisible: false, allSites: false, approvalLimit: 150000 },
    { id: 'engineer', name: 'Site Engineer', description: 'Site receipts, consumption, attendance and expenses for assigned sites', perms: permsFor({ dashboard: v, masters: v, inventory: vae, purchase: va, labour: vae, expenses: vae, fleet: vae, contract: vae, reports: v, approvals: ['view', 'approve'], alerts: v }), ratesVisible: false, allSites: false, approvalLimit: 5000 },
    { id: 'plant', name: 'Plant In-charge', description: 'Plant raw material, production and dispatch', perms: permsFor({ dashboard: v, masters: v, inventory: va, purchase: va, plant: [...vae, 'approve'], fleet: va, reports: v, approvals: ['view', 'approve'], alerts: v }), ratesVisible: false, allSites: false, approvalLimit: 50000 },
    { id: 'fleet', name: 'Fleet In-charge', description: 'Fuel issue, logbooks, trips and maintenance for all vehicles', perms: permsFor({ dashboard: v, masters: v, fleet: [...vae, 'approve'], inventory: v, reports: v, approvals: ['view', 'approve'], alerts: v }), ratesVisible: true, allSites: true, approvalLimit: 40000 },
  ];
  const users: User[] = [
    { id: 'u1', name: 'Anupam Choudhury', username: 'owner', phone: '98640 10001', email: 'anupam@arohoninfra.in', roleId: 'owner', siteIds: [], plantIds: [], active: true, twoFactor: true },
    { id: 'u2', name: 'Priyanka Sharma', username: 'accounts', phone: '98640 10002', email: 'accounts@arohoninfra.in', roleId: 'accountant', siteIds: [], plantIds: [], active: true },
    { id: 'u3', name: 'Bikash Kalita', username: 'store', phone: '98640 10003', email: 'store@arohoninfra.in', roleId: 'store', siteIds: [], plantIds: [], active: true },
    { id: 'u4', name: 'Rituraj Bora', username: 'engineer', phone: '98640 10004', email: 'rituraj@arohoninfra.in', roleId: 'engineer', siteIds: ['s1'], plantIds: [], active: true },
    { id: 'u5', name: 'Manash Pratim Das', username: 'manash', phone: '98640 10005', email: 'manash@arohoninfra.in', roleId: 'engineer', siteIds: ['s2', 's5'], plantIds: [], active: true },
    { id: 'u6', name: 'Dipankar Gogoi', username: 'dipankar', phone: '98640 10006', email: 'dipankar@arohoninfra.in', roleId: 'engineer', siteIds: ['s3'], plantIds: [], active: true },
    { id: 'u7', name: 'Ankita Baruah', username: 'ankita', phone: '98640 10007', email: 'ankita@arohoninfra.in', roleId: 'engineer', siteIds: ['s4'], plantIds: [], active: true },
    { id: 'u8', name: 'Hemanta Saikia', username: 'plant', phone: '98640 10008', email: 'plant@arohoninfra.in', roleId: 'plant', siteIds: [], plantIds: ['p1', 'p2', 'p3'], active: true },
    { id: 'u9', name: 'Jayanta Nath', username: 'fleet', phone: '98640 10009', email: 'fleet@arohoninfra.in', roleId: 'fleet', siteIds: [], plantIds: [], active: true },
  ];

  const settings: Settings = {
    approvalLimits: { po: 200000, issue: 150000, expense: 10000, fuel: 40000 },
    backdateDays: 3,
    editLockDays: 7,
    tolerance: { default: 5, cement: 3, steel: 2, bitumen: 3, fuel: 10, plant: 3, dispatch: 1.5 },
    valuation: 'WAVG',
    excludePendingFromCost: true,
    attendanceLockHour: 10,
    allowNegativeOverride: false,
    sessionTimeoutMin: 30,
    notify: { sms: false, whatsapp: true, email: true },
    overheadBasis: 'CONTRACT',
  };

  return { clients, sites, plants, stores, units, materials, recipes, boq, suppliers, subcons, workers, vehicles, fuelSources, expenseHeads, roles, users, settings };
}

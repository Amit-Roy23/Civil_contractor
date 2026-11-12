import type { CollectionKey, DB, ModuleKey } from './types.js';
import { schemas, zodMessage } from './schemas.js';
import { WORK_STAGES, clientDeductions } from './works.js';
import { excelDate, type Cell } from './xlsx.js';

/**
 * Excel templates for every master and the opening data (XL-04, PF-06).
 * One column list drives three things: the template to download, export of existing records in the
 * same layout (so a sheet can be exported, corrected and imported back), and row-by-row checking of
 * an uploaded sheet — every problem is listed with its row and column before anything is saved.
 */

type ColType = 'text' | 'number' | 'date' | 'bool' | 'enum' | 'ref' | 'office';
export interface ImportColumn {
  header: string;
  /** dotted path in the record, e.g. "tender.nitNo" */
  key: string;
  type?: ColType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  /** look-up by any of these fields of another master */
  ref?: { coll: CollectionKey; by: string[]; show: string };
  hint?: string;
  example?: string | number;
}
export interface ImportOp {
  row: number;
  kind: 'insert' | 'update';
  coll: CollectionKey;
  rec?: Record<string, unknown>;
  id?: string;
  patch?: Record<string, unknown>;
}
export interface ImportError {
  row: number;
  column: string;
  message: string;
}
export interface ImportTemplate {
  id: string;
  title: string;
  coll: CollectionKey;
  description: string;
  columns: ImportColumn[];
  defaults?: Record<string, unknown>;
  /** field that must be unique (checked in the file and against existing records) */
  unique?: string;
  /** records currently held, for export */
  rows?: (db: DB) => any[];
  /** turn checked rows into commands; default: one insert per row */
  toOps?: (db: DB, rows: Array<{ row: number; rec: Record<string, any> }>, errors: ImportError[]) => ImportOp[];
  adminOnly?: boolean;
  /** shown and imported only by roles with this module (salaries: owner and accountant) */
  module?: ModuleKey;
}

/* ---------------- helpers ---------------- */
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9%]+/g, '');
export function getPath(o: any, path: string): any {
  return path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
}
export function setPath(o: any, path: string, v: unknown) {
  const ks = path.split('.');
  let x = o;
  ks.slice(0, -1).forEach((k) => (x = x[k] ??= {}));
  x[ks.at(-1)!] = v;
}
const opts = (...pairs: Array<[string, string]>) => pairs.map(([value, label]) => ({ value, label }));
const YESNO = 'Yes / No';

const STAGES = WORK_STAGES.map((s) => ({ value: s.value, label: s.label }));
const GUARANTEE_MODES = opts(['BG', 'Bank guarantee'], ['FDR', 'FDR'], ['EBG', 'e-BG'], ['ONLINE', 'Online'], ['EXEMPTED', 'Exempted']);
const ref = (coll: CollectionKey, by: string[], show = by[0]!) => ({ type: 'ref' as const, ref: { coll, by, show } });

/* ---------------- templates ---------------- */
export const TEMPLATES: ImportTemplate[] = [
  {
    id: 'works',
    title: 'Works',
    coll: 'sites',
    description: 'One row per work, with the column names of the works master (Query 1). Leave "Work code" blank to number it automatically.',
    unique: 'code',
    defaults: { status: 'ACTIVE', retentionPct: 0, gstPct: 18, workType: 'ROAD', budget: { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 }, openingCost: { MATERIAL: 0, LABOUR: 0, SUBCONTRACT: 0, VEHICLE: 0, MISC: 0, OVERHEAD: 0 }, openingAsOf: '' },
    columns: [
      { header: 'Work code', key: 'code', hint: 'Blank = automatic, e.g. SD/2026-27/001' },
      { header: 'Name of work', key: 'name', required: true, hint: 'Exactly as in the agreement' },
      { header: 'Short name', key: 'short', hint: 'For phone screens' },
      { header: 'Client', key: 'clientId', required: true, ...ref('clients', ['code', 'name']), hint: 'Client code or name from the client master' },
      { header: 'Office / division', key: 'officeId', type: 'office', hint: 'Division as in the client master, e.g. PWD (R&B) Dharmanagar Division' },
      { header: 'Executing firm', key: 'firmId', ...ref('firms', ['code', 'legalName', 'tradeName']), hint: 'Firm code; blank = main firm' },
      { header: 'NIT / DNIT no.', key: 'tender.nitNo', example: '18/SE(I)/PWD(R&B)/KGT/2026-27' },
      { header: 'NIT date', key: 'tender.nitDate', type: 'date' },
      { header: 'Tender ID', key: 'tender.tenderId', hint: 'tripuratenders.gov.in tender ID' },
      { header: 'Work order / LOA no.', key: 'workOrderNo' },
      { header: 'LOA date', key: 'workOrderDate', type: 'date' },
      { header: 'Agreement no.', key: 'agreementNo' },
      { header: 'Agreement date', key: 'agreementDate', type: 'date' },
      { header: 'Estimated cost put to tender', key: 'estimatedCost', type: 'number' },
      { header: 'Quoted rate', key: 'quoteType', type: 'enum', options: opts(['ABOVE', 'Above'], ['BELOW', 'Below'], ['PAR', 'At par'], ['ITEM_RATE', 'Item rate']) },
      { header: 'Quoted %', key: 'quotedPct', type: 'number' },
      { header: 'Contract value', key: 'contractValue', type: 'number', required: true },
      { header: 'Includes GST', key: 'gstIncluded', type: 'bool', hint: 'Yes = contract value includes GST; No = GST extra' },
      { header: 'GST %', key: 'gstPct', type: 'number', hint: 'Default 18' },
      { header: 'Type of work', key: 'workType', type: 'enum', options: opts(['ROAD', 'Road'], ['BRIDGE', 'Bridge'], ['BUILDING', 'Building'], ['IRRIGATION', 'Irrigation']) },
      { header: 'District', key: 'district' },
      { header: 'Sub-division', key: 'subDivision' },
      { header: 'Block / village', key: 'block' },
      { header: 'Location', key: 'location' },
      { header: 'GPS', key: 'gps', hint: 'lat, long' },
      { header: 'Chainage from (km)', key: 'chainageFrom', type: 'number' },
      { header: 'Chainage to (km)', key: 'chainageTo', type: 'number' },
      { header: 'Length (km)', key: 'lengthKm', type: 'number' },
      { header: 'Date of start', key: 'startDate', type: 'date' },
      { header: 'Stipulated completion', key: 'scheduledCompletion', type: 'date' },
      { header: 'Actual completion', key: 'actualCompletion', type: 'date' },
      { header: 'Status', key: 'stage', type: 'enum', options: STAGES },
      { header: 'Site engineer', key: 'engineerId', ...ref('users', ['username', 'name'], 'name') },
      { header: 'Supervisor', key: 'supervisorName' },
      { header: 'EMD amount', key: 'emd.amount', type: 'number' },
      { header: 'EMD mode', key: 'emd.mode', type: 'enum', options: GUARANTEE_MODES },
      { header: 'EMD refund date', key: 'emd.refundDate', type: 'date' },
      { header: 'Performance security %', key: 'perfSecurity.pct', type: 'number' },
      { header: 'Performance security amount', key: 'perfSecurity.amount', type: 'number' },
      { header: 'Performance security mode', key: 'perfSecurity.mode', type: 'enum', options: GUARANTEE_MODES },
      { header: 'Performance security bank', key: 'perfSecurity.bank' },
      { header: 'Performance security BG / FDR no.', key: 'perfSecurity.number' },
      { header: 'Performance security validity', key: 'perfSecurity.validity', type: 'date' },
      { header: 'Performance security claim date', key: 'perfSecurity.claimDate', type: 'date' },
      { header: 'Additional performance security amount', key: 'addlPerfSecurity.amount', type: 'number' },
      { header: 'Additional performance security BG no.', key: 'addlPerfSecurity.number' },
      { header: 'Additional performance security validity', key: 'addlPerfSecurity.validity', type: 'date' },
      { header: 'Security deposit % per bill', key: 'retentionPct', type: 'number' },
      { header: 'Security deposit ceiling', key: 'sdCeiling', type: 'number' },
      { header: 'Defect liability period (months)', key: 'dlpMonths', type: 'number' },
      { header: 'Linked plant', key: 'plantId', ...ref('plants', ['code', 'name'], 'name') },
      { header: 'Go-live date', key: 'openingAsOf', type: 'date', hint: 'Figures below are up to this date (running works)' },
      { header: 'Work done till go-live', key: 'openingWorkDone', type: 'number' },
      { header: 'Billed till go-live', key: 'openingBilled', type: 'number' },
      { header: 'Received till go-live', key: 'openingReceived', type: 'number' },
      { header: 'Material cost till go-live', key: 'openingCost.MATERIAL', type: 'number' },
      { header: 'Labour cost till go-live', key: 'openingCost.LABOUR', type: 'number' },
      { header: 'Sub-contract cost till go-live', key: 'openingCost.SUBCONTRACT', type: 'number' },
      { header: 'Machinery cost till go-live', key: 'openingCost.VEHICLE', type: 'number' },
      { header: 'Site expenses till go-live', key: 'openingCost.MISC', type: 'number' },
    ],
    rows: (db) => db.sites,
  },
  {
    id: 'clients',
    title: 'Clients',
    coll: 'clients',
    description: 'One row per client office. Repeat the client code on several rows to add more divisions / circles.',
    unique: 'code',
    columns: [
      { header: 'Code', key: 'code', required: true },
      { header: 'Name', key: 'name', required: true, example: 'PWD (R&B), Government of Tripura' },
      { header: 'Type', key: 'kind', type: 'enum', options: opts(['GOVT', 'Government department'], ['LOCAL_BODY', 'Municipal / local body'], ['PRIVATE', 'Private'], ['BUYER', 'Hot mix buyer']) },
      { header: 'GSTIN', key: 'gstin' },
      { header: 'Address', key: 'address' },
      { header: 'Billing contact', key: 'billingContact' },
      { header: 'Email', key: 'email' },
      { header: 'Phone', key: 'phone' },
      { header: 'Circle', key: '_office.circle' },
      { header: 'Division', key: '_office.division' },
      { header: 'Sub-division', key: '_office.subDivision' },
      { header: 'EE name', key: '_office.ee' },
      { header: 'EE phone', key: '_office.eePhone' },
      { header: 'GST TDS %', key: 'deductions.gstTdsPct', type: 'number', hint: 'Default 2' },
      { header: 'GST TDS above contract value', key: 'deductions.gstTdsThreshold', type: 'number', hint: 'Default 250000' },
      { header: 'Income-tax TDS %', key: 'deductions.itTdsPct', type: 'number', hint: 'Default 1' },
      { header: 'Income-tax TDS on value with GST', key: 'deductions.itTdsOnGst', type: 'bool' },
      { header: 'Labour cess %', key: 'deductions.labourCessPct', type: 'number', hint: 'Default 1' },
      { header: 'Labour cess on value with GST', key: 'deductions.labourCessOnGst', type: 'bool' },
      { header: 'TCS %', key: 'deductions.tcsPct', type: 'number', hint: 'Default 0' },
      { header: 'Security deposit % (default)', key: 'retentionPct', type: 'number' },
    ],
    rows: (db) => db.clients.flatMap((c) => (c.offices?.length ? c.offices.map((o) => ({ ...c, _office: { ...o, ee: o.contacts.find((x) => x.designation === 'EE')?.name, eePhone: o.contacts.find((x) => x.designation === 'EE')?.phone } })) : [c])),
    toOps: (db, rows) => {
      const byCode = new Map<string, { row: number; rec: Record<string, any> }>();
      for (const r of rows) {
        const { _office, ...rec } = r.rec;
        const key = String(rec.code).toLowerCase();
        const cur = byCode.get(key) || { row: r.row, rec: { retentionPct: 0, ...rec, offices: [] as any[] } };
        if (_office && (_office.division || _office.circle || _office.subDivision)) {
          cur.rec.offices.push({
            id: `o${cur.rec.offices.length + 1}-${norm(_office.division || _office.circle).slice(0, 30)}`,
            circle: _office.circle || '', division: _office.division || '', subDivision: _office.subDivision || '', address: '', email: '', gstin: '',
            contacts: _office.ee || _office.eePhone ? [{ designation: 'EE', name: _office.ee || '', phone: String(_office.eePhone || '') }] : [],
          });
        }
        byCode.set(key, cur);
      }
      return [...byCode.values()].map(({ row, rec }) => {
        const d = { ...clientDeductions(undefined), ...(rec.deductions || {}) };
        return { row, kind: 'insert' as const, coll: 'clients' as const, rec: { ...rec, deductions: d, tdsPct: d.itTdsPct, cessPct: d.labourCessPct } };
      });
    },
  },
  {
    id: 'suppliers',
    title: 'Suppliers',
    coll: 'suppliers',
    description: 'Material suppliers, fuel pumps, vehicle owners and service providers. Opening balance = amount you owe them at go-live.',
    unique: 'code',
    defaults: { kind: 'MATERIAL', creditDays: 30, openingBalance: 0 },
    columns: [
      { header: 'Code', key: 'code', required: true },
      { header: 'Name', key: 'name', required: true },
      { header: 'Type', key: 'kind', type: 'enum', options: opts(['MATERIAL', 'Material'], ['FUEL_PUMP', 'Fuel pump'], ['VEHICLE_OWNER', 'Vehicle owner'], ['SERVICE', 'Service']) },
      { header: 'GSTIN', key: 'gstin' },
      { header: 'PAN', key: 'pan' },
      { header: 'Address', key: 'address' },
      { header: 'Contact person', key: 'contact' },
      { header: 'Phone', key: 'phone' },
      { header: 'Bank details', key: 'bank' },
      { header: 'Materials supplied', key: 'materials' },
      { header: 'Credit days', key: 'creditDays', type: 'number' },
      { header: 'Opening balance', key: 'openingBalance', type: 'number' },
    ],
    rows: (db) => db.suppliers,
  },
  {
    id: 'subcons',
    title: 'Sub-contractors',
    coll: 'subcons',
    description: 'Sub-contractors and labour contractors.',
    unique: 'code',
    defaults: { kind: 'SUB_CONTRACTOR', rateType: 'PER_UNIT', openingBalance: 0, tradeRates: {} },
    columns: [
      { header: 'Code', key: 'code', required: true },
      { header: 'Name', key: 'name', required: true },
      { header: 'Type', key: 'kind', type: 'enum', options: opts(['SUB_CONTRACTOR', 'Sub-contractor'], ['LABOUR_CONTRACTOR', 'Labour contractor']) },
      { header: 'Rate type', key: 'rateType', type: 'enum', options: opts(['PER_UNIT', 'Per unit of work'], ['PER_DAY', 'Per day'], ['LUMP_SUM', 'Lump sum']) },
      { header: 'Trade', key: 'trade' },
      { header: 'Phone', key: 'phone' },
      { header: 'PAN', key: 'pan' },
      { header: 'GSTIN', key: 'gstin' },
      { header: 'Bank details', key: 'bank' },
      { header: 'Labour licence no.', key: 'licenceNo' },
      { header: 'Licence valid to', key: 'licenceExpiry', type: 'date' },
      { header: 'Opening balance', key: 'openingBalance', type: 'number' },
    ],
    rows: (db) => db.subcons,
  },
  {
    id: 'materials',
    title: 'Materials',
    coll: 'materials',
    description: 'Material catalogue. Unit must be one of the units master (MT, CUM, BAG, LTR, NOS …).',
    unique: 'code',
    defaults: { kind: 'RAW', gstPct: 18, minStock: 0, reorderQty: 0, stdRate: 0, hsn: '' },
    columns: [
      { header: 'Code', key: 'code', required: true },
      { header: 'Name', key: 'name', required: true },
      { header: 'Category', key: 'category', type: 'enum', required: true, options: ['Cement', 'Steel', 'Aggregate', 'Bitumen', 'Sand', 'Bricks', 'Pipes', 'Electrical', 'Consumables', 'Spares', 'Fuel & Lubricants', 'Plant Output', 'Tools & Tackles', 'Others'].map((x) => ({ value: x, label: x })) },
      { header: 'Unit', key: 'unit', ...ref('units', ['code', 'name'], 'code'), required: true },
      { header: 'Raw / plant output', key: 'kind', type: 'enum', options: opts(['RAW', 'Raw material'], ['OUTPUT', 'Plant output'], ['BOTH', 'Both']) },
      { header: 'HSN', key: 'hsn' },
      { header: 'GST %', key: 'gstPct', type: 'number' },
      { header: 'Standard rate', key: 'stdRate', type: 'number' },
      { header: 'Minimum stock', key: 'minStock', type: 'number' },
      { header: 'Reorder quantity', key: 'reorderQty', type: 'number' },
    ],
    rows: (db) => db.materials,
  },
  {
    id: 'workers',
    title: 'Workers',
    coll: 'workers',
    description: 'Own and contractor workers. Aadhaar is stored masked — only the last 4 digits are kept.',
    unique: 'code',
    defaults: { ownership: 'OWN', trade: 'Helper', otRate: 0 },
    columns: [
      { header: 'Worker ID', key: 'code', required: true },
      { header: 'Name', key: 'name', required: true },
      { header: 'Phone', key: 'phone' },
      { header: 'Aadhaar', key: 'aadhaar', hint: 'Only the last 4 digits are kept' },
      { header: 'Trade', key: 'trade', type: 'enum', options: ['Mason', 'Helper', 'Carpenter', 'Bar Bender', 'Operator', 'Driver', 'Electrician', 'Supervisor'].map((x) => ({ value: x, label: x })) },
      { header: 'Own / contractor', key: 'ownership', type: 'enum', options: opts(['OWN', 'Own'], ['CONTRACTOR', 'Contractor']) },
      { header: 'Contractor', key: 'contractorId', ...ref('subcons', ['code', 'name']) },
      { header: 'Wage per day', key: 'wageRate', type: 'number', required: true },
      { header: 'OT rate per hour', key: 'otRate', type: 'number' },
      { header: 'Work', key: 'siteId', required: true, ...ref('sites', ['code', 'short', 'name'], 'short') },
      { header: 'UPI', key: 'upi' },
      { header: 'Joining date', key: 'joiningDate', type: 'date' },
      { header: "Father's / husband's name", key: 'fatherName' },
      { header: 'Gender', key: 'gender', type: 'enum', options: opts(['M', 'Male'], ['F', 'Female'], ['O', 'Other']) },
      { header: 'Date of birth', key: 'dob', type: 'date' },
      { header: 'Bank account no.', key: 'bankAccount' },
      { header: 'IFSC', key: 'ifsc' },
      { header: 'EPF member', key: 'pfMember', type: 'bool' },
      { header: 'UAN', key: 'uan', hint: '12 digits' },
      { header: 'ESI member', key: 'esiMember', type: 'bool' },
      { header: 'ESIC IP no.', key: 'esicNo' },
    ],
    rows: (db) => db.workers,
  },
  {
    id: 'staff',
    title: 'Salaried staff',
    coll: 'staff',
    module: 'staff',
    description: 'Drivers, operators and office staff on monthly salary. Leave Staff ID blank for the next number (STF-001 …). Aadhaar is stored masked.',
    unique: 'code',
    defaults: { basis: 'MONTHLY', posting: 'HEAD_OFFICE', payMode: 'CASH', code: '' },
    columns: [
      { header: 'Staff ID', key: 'code', hint: 'Blank = next number' },
      { header: 'Name', key: 'name', required: true },
      { header: "Father's name", key: 'fatherName' },
      { header: 'Phone', key: 'phone' },
      { header: 'Aadhaar', key: 'aadhaar', hint: 'Only the last 4 digits are kept' },
      { header: 'PAN', key: 'pan' },
      { header: 'Address', key: 'address' },
      { header: 'Designation', key: 'designation', required: true, example: 'Driver' },
      { header: 'Joining date', key: 'joiningDate', type: 'date' },
      { header: 'Salary basis', key: 'basis', type: 'enum', options: opts(['MONTHLY', 'Monthly'], ['PER_DAY', 'Per day'], ['PER_TRIP', 'Per trip']) },
      { header: 'Salary / rate', key: 'salary', type: 'number', required: true, hint: 'per month, per day or per trip' },
      { header: 'Food / batta allowance', key: 'allowances.food', type: 'number' },
      { header: 'Mobile allowance', key: 'allowances.mobile', type: 'number' },
      { header: 'Travel allowance', key: 'allowances.travel', type: 'number' },
      { header: 'OT rate per hour', key: 'otRate', type: 'number' },
      { header: 'Posting', key: 'posting', type: 'enum', options: opts(['HEAD_OFFICE', 'Head office'], ['SITE', 'Site'], ['VEHICLE', 'Vehicle'], ['PLANT', 'Plant']) },
      { header: 'Work', key: 'siteId', ...ref('sites', ['code', 'short', 'name'], 'short') },
      { header: 'Vehicle', key: 'vehicleId', ...ref('vehicles', ['regNo', 'code'], 'regNo') },
      { header: 'Plant', key: 'plantId', ...ref('plants', ['code', 'name'], 'name') },
      { header: 'Payment mode', key: 'payMode', type: 'enum', options: opts(['CASH', 'Cash'], ['BANK', 'Bank'], ['UPI', 'UPI']) },
      { header: 'Bank account no.', key: 'bankAccount' },
      { header: 'IFSC', key: 'ifsc' },
      { header: 'UPI', key: 'upi' },
      { header: 'EPF member', key: 'pfMember', type: 'bool' },
      { header: 'UAN', key: 'uan', hint: '12 digits' },
      { header: 'ESI member', key: 'esiMember', type: 'bool' },
      { header: 'ESIC IP no.', key: 'esicNo' },
      { header: 'Driving licence no.', key: 'licenceNo' },
      { header: 'Licence expiry', key: 'licenceExpiry', type: 'date' },
    ],
    rows: (db) => db.staff,
  },
  {
    // FLT-03: daily km / engine hours / fuel from the Tata Fleet Edge "trip summary" export
    id: 'fleet-edge',
    title: 'Fleet Edge logbook',
    coll: 'logs',
    description: 'Daily vehicle summary exported from Fleet Edge (or any telematics): one row per vehicle per day. The work is the vehicle\'s current work unless given.',
    columns: [
      { header: 'Vehicle number', key: 'vehicleId', required: true, ...ref('vehicles', ['regNo', 'code'], 'regNo') },
      { header: 'Date', key: 'date', type: 'date', required: true },
      { header: 'Start odometer', key: 'openKm', type: 'number' },
      { header: 'End odometer', key: 'closeKm', type: 'number' },
      { header: 'Start engine hours', key: 'openHr', type: 'number' },
      { header: 'End engine hours', key: 'closeHr', type: 'number' },
      { header: 'Fuel consumed (L)', key: 'fuelLitres', type: 'number' },
      { header: 'Idle hours', key: 'idleHours', type: 'number' },
      { header: 'Work', key: 'siteId', ...ref('sites', ['code', 'short', 'name'], 'short') },
    ],
    toOps: (db, rows, errors) =>
      rows.flatMap(({ row, rec }) => {
        const v = db.vehicles.find((x) => x.id === rec.vehicleId);
        const siteId = rec.siteId || v?.siteId;
        if (!siteId) {
          errors.push({ row, column: 'Work', message: 'Vehicle has no current work — give the work' });
          return [];
        }
        if (db.logs.some((l) => l.vehicleId === rec.vehicleId && l.date === rec.date)) {
          errors.push({ row, column: 'Date', message: 'A logbook entry for this vehicle and date already exists' });
          return [];
        }
        return [{ row, kind: 'insert' as const, coll: 'logs' as const, rec: { ...rec, siteId, driver: v?.driver || '', trips: 0, route: 'Fleet Edge', idleHours: rec.idleHours || 0, source: 'FLEET_EDGE' } }];
      }),
  },
  {
    id: 'vehicles',
    title: 'Vehicles & machines',
    coll: 'vehicles',
    description: 'Vehicles and machines, owned or hired.',
    unique: 'code',
    defaults: { ownership: 'OWNED', fuelType: 'HSD', meterType: 'HOURS', status: 'IDLE', docs: [], lastServiceAt: 0, serviceEvery: 0, internalRate: 0, emi: 0, driverSalary: 0, tankCapacity: 0, driver: '' },
    columns: [
      { header: 'Machine ID', key: 'code', required: true },
      { header: 'Reg. no.', key: 'regNo' },
      { header: 'Type', key: 'type', type: 'enum', required: true, options: ['Tipper', 'Transit Mixer', 'JCB', 'Excavator', 'Roller', 'Paver', 'Grader', 'Tanker', 'Car', 'Generator', 'Loader', 'Paver Finisher', 'Compactor', 'Mobile Hot Mix', 'Bitumen Sprayer', 'Sweeper', 'Road Cleaner', 'Marking Machine', 'Concrete Mixer', 'Tractor', 'Other'].map((x) => ({ value: x, label: x })) },
      { header: 'Make', key: 'make' },
      { header: 'Model', key: 'model' },
      { header: 'Year', key: 'year', type: 'number' },
      { header: 'Owned / hired', key: 'ownership', type: 'enum', options: opts(['OWNED', 'Owned'], ['HIRED', 'Hired']) },
      { header: 'Owner (if hired)', key: 'ownerName' },
      { header: 'Meter', key: 'meterType', type: 'enum', options: opts(['KM', 'Km'], ['HOURS', 'Hours'], ['BOTH', 'Both']) },
      { header: 'Tank capacity (L)', key: 'tankCapacity', type: 'number' },
      { header: 'Driver / operator', key: 'driver' },
      { header: 'Working at work', key: 'siteId', ...ref('sites', ['code', 'short', 'name'], 'short') },
    ],
    rows: (db) => db.vehicles,
  },
  {
    id: 'boq',
    title: 'BOQ',
    coll: 'boq',
    description: 'Bill of quantities per work — one row per item.',
    columns: [
      { header: 'Work', key: 'siteId', required: true, ...ref('sites', ['code', 'short', 'name'], 'short') },
      { header: 'Item no.', key: 'itemNo', required: true },
      { header: 'Description', key: 'description', required: true },
      { header: 'Unit', key: 'unit', required: true },
      { header: 'Quantity', key: 'qty', type: 'number', required: true },
      { header: 'Estimate rate', key: 'estRate', type: 'number', hint: "Department's rate — the tendered % of the work is applied" },
      { header: 'Rate', key: 'rate', type: 'number', hint: 'Contract rate; leave blank to work it out from the estimate rate' },
    ],
    defaults: { rate: 0 },
    rows: (db) => db.boq,
    toOps: (db, rows, errors) => {
      const seen = new Set(db.boq.map((b) => `${b.siteId}|${norm(b.itemNo)}`));
      const ops: ImportOp[] = [];
      for (const r of rows) {
        const k = `${r.rec.siteId}|${norm(r.rec.itemNo)}`;
        if (seen.has(k)) errors.push({ row: r.row, column: 'Item no.', message: `Item ${r.rec.itemNo} already exists for this work` });
        if (!(r.rec.rate > 0) && !(r.rec.estRate > 0)) errors.push({ row: r.row, column: 'Rate', message: 'Give the rate or the estimate rate' });
        seen.add(k);
        ops.push({ row: r.row, kind: 'insert', coll: 'boq', rec: r.rec });
      }
      return ops;
    },
  },
  {
    id: 'tax-credits',
    title: 'Tax credits',
    coll: 'taxCredits',
    adminOnly: true,
    description: 'GST TDS from GSTR-7A certificates and income-tax TDS from Form 26AS / AIS, one row per credit. They are matched with your bills in Contracts › Tax & Tally.',
    columns: [
      { header: 'Type', key: 'kind', type: 'enum', required: true, options: opts(['GSTR7A', 'GST TDS (GSTR-7A)'], ['AS26', 'Income-tax TDS (26AS / AIS)']) },
      { header: 'Date', key: 'date', type: 'date', required: true },
      { header: 'Deductor', key: 'deductor', hint: 'e.g. EE, PWD (R&B) Dharmanagar Division' },
      { header: 'Deductor GSTIN / TAN', key: 'deductorId' },
      { header: 'Taxable value / amount paid', key: 'base', type: 'number' },
      { header: 'Tax credited', key: 'amount', type: 'number', required: true },
      { header: 'Certificate / reference no.', key: 'certNo' },
    ],
    rows: (db) => db.taxCredits,
  },
  {
    id: 'opening-stock',
    title: 'Opening stock',
    coll: 'stockTxns',
    adminOnly: true,
    description: 'Stock in each store at go-live, valued at its rate (weighted average). One opening voucher is made per store and date.',
    columns: [
      { header: 'Store', key: 'storeId', required: true, ...ref('stores', ['name', 'code'], 'name') },
      { header: 'Material', key: 'materialId', required: true, ...ref('materials', ['code', 'name'], 'name') },
      { header: 'Quantity', key: 'qty', type: 'number', required: true },
      { header: 'Rate', key: 'rate', type: 'number', required: true, hint: 'Rs. per unit' },
      { header: 'As on date', key: 'date', type: 'date', required: true },
    ],
    rows: (db) => db.stockTxns.filter((t) => t.type === 'OPENING' && t.status !== 'CANCELLED').flatMap((t) => t.lines.map((l) => ({ storeId: t.toStoreId, materialId: l.materialId, qty: l.qty, rate: l.rate, date: t.date }))),
    toOps: (_db, rows, errors) => {
      const groups = new Map<string, { row: number; storeId: string; date: string; lines: any[] }>();
      for (const r of rows) {
        if (!(r.rec.qty > 0)) errors.push({ row: r.row, column: 'Quantity', message: 'Quantity must be more than zero' });
        if (r.rec.rate < 0) errors.push({ row: r.row, column: 'Rate', message: 'Rate cannot be negative' });
        const k = `${r.rec.storeId}|${r.rec.date}`;
        const g = groups.get(k) || { row: r.row, storeId: r.rec.storeId, date: r.rec.date, lines: [] as any[] };
        if (g.lines.some((l) => l.materialId === r.rec.materialId)) errors.push({ row: r.row, column: 'Material', message: 'Same material twice for this store and date' });
        g.lines.push({ materialId: r.rec.materialId, qty: r.rec.qty, rate: r.rec.rate });
        groups.set(k, g);
      }
      return [...groups.values()].map((g) => ({ row: g.row, kind: 'insert' as const, coll: 'stockTxns' as const, rec: { type: 'OPENING', date: g.date, toStoreId: g.storeId, lines: g.lines, remark: 'Opening stock (Excel import)' } }));
    },
  },
  {
    id: 'party-balances',
    title: 'Party balances',
    coll: 'suppliers',
    adminOnly: true,
    description: 'Opening balance of existing suppliers and sub-contractors at go-live (amount you owe them; negative = advance paid).',
    columns: [
      { header: 'Party type', key: 'partyType', type: 'enum', required: true, options: opts(['suppliers', 'Supplier'], ['subcons', 'Sub-contractor']) },
      { header: 'Party', key: 'party', required: true, hint: 'Code or name' },
      { header: 'Opening balance', key: 'openingBalance', type: 'number', required: true },
    ],
    rows: (db) => [...db.suppliers.map((s) => ({ partyType: 'suppliers', party: s.code, openingBalance: s.openingBalance })), ...db.subcons.map((s) => ({ partyType: 'subcons', party: s.code, openingBalance: s.openingBalance }))],
    toOps: (db, rows, errors) =>
      rows.flatMap((r) => {
        const coll = r.rec.partyType as 'suppliers' | 'subcons';
        const p = (db[coll] as any[]).find((x) => norm(x.code) === norm(r.rec.party) || norm(x.name) === norm(r.rec.party));
        if (!p) {
          errors.push({ row: r.row, column: 'Party', message: `No ${coll === 'suppliers' ? 'supplier' : 'sub-contractor'} called "${r.rec.party}"` });
          return [];
        }
        return [{ row: r.row, kind: 'update' as const, coll, id: p.id, patch: { openingBalance: r.rec.openingBalance } }];
      }),
  },
];
export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

/* ---------------- template & export ---------------- */
function refLabel(db: DB, c: ImportColumn, v: unknown): Cell {
  if (!v) return '';
  const r = (db[c.ref!.coll] as any[]).find((x) => x.id === v || x.code === v);
  return r ? r[c.ref!.show] ?? r.code ?? r.name : String(v);
}

export function templateSheets(t: ImportTemplate) {
  return [
    { name: t.title, rows: [t.columns.map((c) => (c.required ? `${c.header} *` : c.header))], headerRows: [0] },
    {
      name: 'How to fill',
      rows: [
        [t.title],
        [t.description],
        ['Columns marked * are required. Keep the column names; extra columns are ignored. Dates as DD/MM/YYYY or an Excel date.'],
        [],
        ['Column', 'Required', 'What to enter', 'Allowed values'],
        ...t.columns.map((c) => [c.header, c.required ? 'Yes' : '', c.hint || (c.type === 'date' ? 'Date' : c.type === 'number' ? 'Number' : c.type === 'bool' ? YESNO : c.ref ? `From the ${c.ref.coll} master` : ''), c.options ? c.options.map((o) => o.label).join(', ') : c.example ?? '']),
      ],
      headerRows: [4],
      title: true,
    },
  ];
}

export function exportSheet(db: DB, t: ImportTemplate) {
  const recs = t.rows ? t.rows(db) : (db[t.coll] as any[]);
  const rows = recs.map((r) =>
    t.columns.map((c): Cell => {
      const v = getPath(r, c.key);
      if (v === undefined || v === null || v === '') return '';
      if (c.type === 'ref') return refLabel(db, c, v);
      if (c.type === 'office') return db.clients.flatMap((x) => x.offices || []).find((o) => o.id === v)?.division || '';
      if (c.type === 'enum') return c.options?.find((o) => o.value === v)?.label ?? String(v);
      if (c.type === 'bool') return v ? 'Yes' : 'No';
      return v as Cell;
    }),
  );
  return { name: t.title, rows: [t.columns.map((c) => c.header), ...rows], headerRows: [0] };
}

/* ---------------- checking an uploaded sheet ---------------- */
/** a real calendar date only — 31/02 is refused, not rolled over to March */
function validYmd(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d || y < 1990 || y > 2100) return null;
  return t.toISOString().slice(0, 10);
}
function parseDate(v: unknown): string | null {
  if (typeof v === 'number') return v > 20000 && v < 80000 ? excelDate(v) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return validYmd(Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]), Number(m[2]), Number(m[1]));
  return null;
}
function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,₹\s]|rs\.?/gi, '').replace(/%$/, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface ImportResult {
  ops: ImportOp[];
  errors: ImportError[];
  rows: number;
  /** header names in the sheet that matched no column */
  ignored: string[];
}

/** check every row of an uploaded sheet; nothing is saved here */
export function checkImport(db: DB, t: ImportTemplate, sheet: Cell[][]): ImportResult {
  const errors: ImportError[] = [];
  const want = new Map<string, ImportColumn>();
  for (const c of t.columns) {
    want.set(norm(c.header), c);
    want.set(norm(c.key), c);
  }
  // header row: the first of the top 10 rows that names at least two template columns
  let h = -1;
  for (let i = 0; i < Math.min(10, sheet.length); i++) {
    const hits = (sheet[i] || []).filter((x) => want.has(norm(String(x ?? '').replace(/\*$/, '')))).length;
    if (hits >= Math.min(2, t.columns.length)) {
      h = i;
      break;
    }
  }
  if (h < 0) return { ops: [], errors: [{ row: 1, column: '', message: `No header row found — use the ${t.title} template (first row: ${t.columns.slice(0, 3).map((c) => c.header).join(', ')} …)` }], rows: 0, ignored: [] };
  const head = sheet[h]!.map((x) => want.get(norm(String(x ?? '').replace(/\*$/, ''))));
  const ignored = sheet[h]!.filter((x, i) => x && !head[i]).map(String);
  for (const c of t.columns.filter((c) => c.required)) if (!head.includes(c)) errors.push({ row: h + 1, column: c.header, message: 'Required column is missing' });

  const lookups = new Map<ImportColumn, Map<string, string>>();
  const lk = (c: ImportColumn) => {
    let m = lookups.get(c);
    if (!m) {
      m = new Map();
      for (const r of db[c.ref!.coll] as any[]) for (const f of c.ref!.by) if (r[f]) m.set(norm(r[f]), r.id);
      lookups.set(c, m);
    }
    return m;
  };

  const good: Array<{ row: number; rec: Record<string, any> }> = [];
  let count = 0;
  for (let i = h + 1; i < sheet.length; i++) {
    const cells = sheet[i] || [];
    if (!cells.some((x) => x !== null && x !== undefined && String(x).trim() !== '')) continue;
    count++;
    const rowNo = i + 1;
    const rec: Record<string, any> = JSON.parse(JSON.stringify(t.defaults || {}));
    let bad = false;
    const err = (c: ImportColumn, message: string) => {
      errors.push({ row: rowNo, column: c.header, message });
      bad = true;
    };
    let officeRaw: string | null = null;
    head.forEach((c, j) => {
      if (!c) return;
      const raw = cells[j];
      const empty = raw === null || raw === undefined || String(raw).trim() === '';
      if (empty) {
        if (c.required) err(c, 'Required');
        return;
      }
      let v: unknown = typeof raw === 'string' ? raw.trim() : raw;
      switch (c.type) {
        case 'number': {
          const n = parseNumber(v);
          if (n === null) return err(c, `"${raw}" is not a number`);
          v = n;
          break;
        }
        case 'date': {
          const d = parseDate(v);
          if (!d) return err(c, `"${raw}" is not a date (use DD/MM/YYYY)`);
          v = d;
          break;
        }
        case 'bool':
          if (/^(y|yes|true|1|included|includes)$/i.test(String(v))) v = true;
          else if (/^(n|no|false|0|extra)$/i.test(String(v))) v = false;
          else return err(c, `"${raw}" — write Yes or No`);
          break;
        case 'enum': {
          const o = c.options!.find((x) => norm(x.value) === norm(v) || norm(x.label) === norm(v));
          if (!o) return err(c, `"${raw}" is not one of: ${c.options!.map((x) => x.label).join(', ')}`);
          v = o.value;
          break;
        }
        case 'ref': {
          const id = lk(c).get(norm(v));
          if (!id) return err(c, `"${raw}" is not in the ${c.ref!.coll} master`);
          v = id;
          break;
        }
        case 'office':
          officeRaw = String(v);
          return;
        default:
          v = String(v);
      }
      setPath(rec, c.key, v);
    });
    if (officeRaw !== null) {
      const client = db.clients.find((x) => x.id === rec.clientId);
      const o = (client?.offices || []).find((x) => [x.division, x.circle, x.subDivision].some((y) => y && norm(y) === norm(officeRaw)));
      if (!o) err(t.columns.find((c) => c.type === 'office')!, `"${officeRaw}" is not an office of ${client?.name || 'this client'}`);
      else rec.officeId = o.id;
    }
    if (t.coll === 'staff') for (const k of ['pan', 'ifsc'] as const) if (typeof rec[k] === 'string') rec[k] = rec[k].toUpperCase();
    if ((t.coll === 'workers' || t.coll === 'staff') && typeof rec.aadhaar === 'string' && rec.aadhaar) {
      const d = rec.aadhaar.replace(/\D/g, '');
      rec.aadhaar = d.length >= 4 ? `XXXX-XXXX-${d.slice(-4)}` : '';
    }
    if (!bad) good.push({ row: rowNo, rec });
  }

  // unique codes — in the file and against what is already saved
  if (t.unique) {
    const seen = new Map<string, number>();
    for (const r of good) {
      const v = r.rec[t.unique];
      if (!v) continue;
      const k = norm(v);
      const col = t.columns.find((c) => c.key === t.unique)!.header;
      if ((db[t.coll] as any[]).some((x) => norm(x[t.unique!]) === k)) errors.push({ row: r.row, column: col, message: `${v} already exists` });
      else if (seen.has(k) && t.id !== 'clients') errors.push({ row: r.row, column: col, message: `${v} is repeated (also row ${seen.get(k)})` });
      seen.set(k, seen.get(k) ?? r.row);
    }
  }

  const ops = t.toOps ? t.toOps(db, good, errors) : good.map((r) => ({ row: r.row, kind: 'insert' as const, coll: t.coll, rec: r.rec }));
  // final shape check with the same schema the server uses
  for (const op of ops) {
    if (op.kind !== 'insert') continue;
    const probe = { id: 'import-check', no: 'NEW', status: 'PENDING', ...op.rec };
    const res = schemas[op.coll].safeParse(probe);
    if (!res.success) errors.push({ row: op.row, column: '', message: zodMessage(res.error) });
  }
  errors.sort((a, b) => a.row - b.row);
  return { ops, errors, rows: count, ignored };
}

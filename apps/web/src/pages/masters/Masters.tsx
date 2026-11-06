import { useMemo, useState } from 'react';
import { CircleCheck, FileSpreadsheet, FileUp, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useDB, insert, update } from '../../data/store';
import { useSession } from '../../data/session';
import { lookup } from '../../data/selectors';
import type { CollectionKey, DB, VehicleDoc } from '../../data/types';
import { Badge, Button, Callout, Card, Drawer, PageHeader, Section, toast } from '../../components/ui/core';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Combo, Field, Input, NumberInput, Select, Textarea, Toggle } from '../../components/ui/fields';
import { inr, inrCompact, qty } from '../../lib/format';
import { cn } from '../../lib/utils';
import { materialOptions, useModuleTab, useQueryParam } from '../shared';
import { templateById } from '@civil/domain/imports';
import { tdsSections } from '@civil/domain/billing';
import { ClientForm, FirmsTab, WorksTab } from './WorkForm';
import { ImportDialog, ImportExportTab, exportTemplate } from './ImportExport';

type FType = 'text' | 'number' | 'money' | 'date' | 'select' | 'textarea' | 'toggle' | 'pct';
interface FieldDef {
  key: string;
  label: string;
  type?: FType;
  options?: (db: DB) => Array<{ value: string; label: string }>;
  required?: boolean;
  span?: 2;
  hint?: string;
  mask?: boolean; // Aadhaar
}
interface MasterDef {
  coll: CollectionKey;
  title: string;
  req: string;
  fields: FieldDef[];
  cols: (db: DB) => Array<Column<any>>;
  defaults?: Record<string, unknown>;
  rateCols?: boolean;
}

const opt = (arr: string[]) => () => arr.map((x) => ({ value: x, label: x }));
const ENTITY = () => [{ value: '', label: '—' }, { value: 'INDIVIDUAL', label: 'Individual' }, { value: 'HUF', label: 'HUF' }, { value: 'FIRM', label: 'Firm' }, { value: 'LLP', label: 'LLP' }, { value: 'COMPANY', label: 'Company' }, { value: 'OTHER', label: 'Other' }];
const tdsOpts = (db: DB) => [{ value: '', label: 'As per party type (default)' }, { value: 'NONE', label: 'No TDS' }, ...tdsSections(db).map((x) => ({ value: x.code, label: x.label }))];
const sitesOpt = (db: DB) => db.sites.filter((s) => !(s as any).outOfScope && s.status !== 'COMPLETED').map((s) => ({ value: s.id, label: s.short }));
const activeCell = { key: 'active', header: 'Status', value: (r: any) => (r.active === false ? 'Inactive' : 'Active'), cell: (r: any) => (r.active === false ? <Badge>Inactive</Badge> : <Badge tone="good" dot>Active</Badge>) };

const MASTERS: Record<string, MasterDef> = {
  materials: {
    coll: 'materials', title: 'Materials', req: 'MST-05',
    fields: [
      { key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true },
      { key: 'category', label: 'Category', type: 'select', options: opt(['Cement', 'Steel', 'Aggregate', 'Bitumen', 'Sand', 'Bricks', 'Pipes', 'Electrical', 'Consumables', 'Spares', 'Fuel & Lubricants', 'Plant Output', 'Tools & Tackles', 'Others']), required: true },
      { key: 'kind', label: 'Raw / plant output', type: 'select', options: () => [{ value: 'RAW', label: 'Raw material' }, { value: 'OUTPUT', label: 'Plant output' }, { value: 'BOTH', label: 'Both' }] },
      { key: 'unit', label: 'Unit', type: 'select', options: (db) => db.units.filter((u) => !u.base).map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` })), required: true },
      { key: 'altUnit', label: 'Alternate unit', type: 'select', options: (db) => [{ value: '', label: '—' }, ...db.units.map((u) => ({ value: u.code, label: u.code }))] },
      { key: 'altFactor', label: '1 alt unit = ? unit', type: 'number', hint: 'e.g. 1 BAG = 0.05 MT' }, { key: 'hsn', label: 'HSN' }, { key: 'gstPct', label: 'GST %', type: 'pct' },
      { key: 'stdRate', label: 'Standard rate', type: 'money' }, { key: 'minStock', label: 'Minimum stock', type: 'number' }, { key: 'reorderQty', label: 'Reorder quantity', type: 'number' },
      { key: 'tolerancePct', label: 'Consumption tolerance %', type: 'pct' }, { key: 'returnable', label: 'Returnable (tools & tackles)', type: 'toggle' }, { key: 'batchTracked', label: 'Batch / lot tracking', type: 'toggle' },
    ],
    defaults: { kind: 'RAW', gstPct: 18, minStock: 0, reorderQty: 0, stdRate: 0 },
    cols: () => [
      { key: 'code', header: 'Code', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: 'name', header: 'Material', primary: true, value: (r) => r.name },
      { key: 'category', header: 'Category', value: (r) => r.category },
      { key: 'unit', header: 'Unit', value: (r) => `${r.unit}${r.altUnit ? ` / ${r.altUnit}` : ''}` },
      { key: 'gst', header: 'HSN · GST', value: (r) => `${r.hsn} · ${r.gstPct}%`, hideMobile: true },
      { key: 'min', header: 'Min / reorder', align: 'right', value: (r) => r.minStock, cell: (r) => `${r.minStock} / ${r.reorderQty}`, hideMobile: true },
      { key: 'rate', header: 'Std rate', align: 'right', rate: true, value: (r) => r.stdRate, cell: (r) => inr(r.stdRate) },
      activeCell,
    ],
  },
  suppliers: {
    coll: 'suppliers', title: 'Suppliers / vendors', req: 'MST-06',
    fields: [
      { key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'gstin', label: 'GSTIN' }, { key: 'pan', label: 'PAN' },
      { key: 'address', label: 'Address', span: 2 }, { key: 'contact', label: 'Contact person' }, { key: 'phone', label: 'Phone' }, { key: 'bank', label: 'Bank details', span: 2 },
      { key: 'materials', label: 'Materials supplied', span: 2 }, { key: 'kind', label: 'Type', type: 'select', options: () => [{ value: 'MATERIAL', label: 'Material' }, { value: 'FUEL_PUMP', label: 'Fuel pump' }, { value: 'VEHICLE_OWNER', label: 'Vehicle owner' }, { value: 'SERVICE', label: 'Service' }] },
      { key: 'creditDays', label: 'Credit days', type: 'number' }, { key: 'openingBalance', label: 'Opening balance', type: 'money' },
      { key: 'entityType', label: 'PAN holder type', type: 'select', options: ENTITY, hint: 'Blank = read from the PAN' }, { key: 'tdsCode', label: 'TDS on payments', type: 'select', options: tdsOpts }, { key: 'transporter10', label: 'Transporter with ≤10 goods carriages (declaration on file — no TDS)', type: 'toggle' },
    ],
    defaults: { kind: 'MATERIAL', creditDays: 30, openingBalance: 0 },
    cols: () => [
      { key: 'code', header: 'Code', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: 'name', header: 'Supplier', primary: true, value: (r) => r.name, cell: (r) => <div><div className="font-medium">{r.name}</div><div className="text-[11px] text-muted">{r.materials}</div></div> },
      { key: 'gstin', header: 'GSTIN', value: (r) => r.gstin, cell: (r) => <span className="font-mono text-xs">{r.gstin}</span>, hideMobile: true },
      { key: 'phone', header: 'Phone', value: (r) => r.phone, hideMobile: true },
      { key: 'credit', header: 'Credit', align: 'right', value: (r) => r.creditDays, cell: (r) => `${r.creditDays} d` },
      { key: 'ob', header: 'Opening bal.', align: 'right', rate: true, value: (r) => r.openingBalance, cell: (r) => inr(r.openingBalance) },
      activeCell,
    ],
  },
  clients: {
    coll: 'clients', title: 'Clients / departments', req: 'MST-07',
    fields: [{ key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'gstin', label: 'GSTIN' }, { key: 'billingContact', label: 'Billing contact' }, { key: 'address', label: 'Address', span: 2 }, { key: 'tdsPct', label: 'TDS %', type: 'pct' }, { key: 'retentionPct', label: 'Retention %', type: 'pct' }, { key: 'cessPct', label: 'Labour cess %', type: 'pct' }],
    defaults: { tdsPct: 2, retentionPct: 5, cessPct: 1 },
    cols: () => [
      { key: 'code', header: 'Code', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: 'name', header: 'Client', primary: true, value: (r) => r.name },
      { key: 'gstin', header: 'GSTIN', value: (r) => r.gstin, hideMobile: true },
      { key: 'rules', header: 'TDS / retention / cess', value: (r) => `${r.tdsPct}% / ${r.retentionPct}% / ${r.cessPct}%` },
      activeCell,
    ],
  },
  subcons: {
    coll: 'subcons', title: 'Sub-contractors & labour contractors', req: 'MST-08',
    fields: [
      { key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true },
      { key: 'kind', label: 'Type', type: 'select', options: () => [{ value: 'LABOUR_CONTRACTOR', label: 'Labour contractor' }, { value: 'SUB_CONTRACTOR', label: 'Sub-contractor' }] },
      { key: 'rateType', label: 'Rate type', type: 'select', options: () => [{ value: 'PER_DAY', label: 'Per day' }, { value: 'PER_UNIT', label: 'Per unit of work' }, { value: 'LUMP_SUM', label: 'Lump sum' }] },
      { key: 'trade', label: 'Trade' }, { key: 'phone', label: 'Phone' }, { key: 'pan', label: 'PAN' }, { key: 'gstin', label: 'GSTIN' }, { key: 'bank', label: 'Bank details', span: 2 }, { key: 'openingBalance', label: 'Opening balance', type: 'money' },
      { key: 'licenceNo', label: 'Labour licence no.' }, { key: 'licenceExpiry', label: 'Licence expiry', type: 'date' }, { key: 'pfNo', label: 'PF no.' }, { key: 'esiNo', label: 'ESI no.' }, { key: 'bocwNo', label: 'BOCW registration' },
      { key: 'entityType', label: 'PAN holder type', type: 'select', options: ENTITY, hint: 'Blank = read from the PAN' }, { key: 'tdsCode', label: 'TDS on payments', type: 'select', options: tdsOpts },
    ],
    defaults: { kind: 'LABOUR_CONTRACTOR', rateType: 'PER_DAY', openingBalance: 0, tradeRates: { Mason: 850, Helper: 520 } },
    cols: () => [
      { key: 'code', header: 'Code', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: 'name', header: 'Name', primary: true, value: (r) => r.name },
      { key: 'kind', header: 'Type', value: (r) => (r.kind === 'LABOUR_CONTRACTOR' ? 'Labour contractor' : 'Sub-contractor') },
      { key: 'trade', header: 'Trade', value: (r) => r.trade },
      { key: 'rt', header: 'Rate type', value: (r) => r.rateType.replace('_', ' ').toLowerCase(), hideMobile: true },
      activeCell,
    ],
  },
  workers: {
    coll: 'workers', title: 'Workers', req: 'MST-09',
    fields: [
      { key: 'code', label: 'Worker ID', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'phone', label: 'Phone' }, { key: 'aadhaar', label: 'Aadhaar (optional)', mask: true, hint: 'Stored masked — only last 4 digits kept' },
      { key: 'trade', label: 'Trade / skill', type: 'select', options: opt(['Mason', 'Helper', 'Carpenter', 'Bar Bender', 'Operator', 'Driver', 'Electrician', 'Supervisor']) },
      { key: 'ownership', label: 'Own / contractor', type: 'select', options: () => [{ value: 'OWN', label: 'Own worker' }, { value: 'CONTRACTOR', label: "Contractor's worker" }] },
      { key: 'wageRate', label: 'Wage per day', type: 'money', required: true }, { key: 'otRate', label: 'OT rate per hour', type: 'money' },
      { key: 'siteId', label: 'Assigned work', type: 'select', options: sitesOpt, required: true }, { key: 'upi', label: 'UPI' }, { key: 'joiningDate', label: 'Joining date', type: 'date' },
      { key: 'fatherName', label: "Father's / husband's name" }, { key: 'gender', label: 'Gender', type: 'select', options: () => [{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }] }, { key: 'dob', label: 'Date of birth', type: 'date' }, { key: 'address', label: 'Permanent address' },
      { key: 'bankAccount', label: 'Bank account no.' }, { key: 'ifsc', label: 'IFSC' },
      { key: 'pfMember', label: 'EPF member', type: 'toggle' }, { key: 'uan', label: 'UAN (12 digits)' }, { key: 'esiMember', label: 'ESI member', type: 'toggle' }, { key: 'esicNo', label: 'ESIC IP no.' }, { key: 'leftOn', label: 'Left on', type: 'date' },
    ],
    defaults: { ownership: 'OWN', trade: 'Helper', wageRate: 520, otRate: 98, gender: 'M', pfMember: false, esiMember: false },
    cols: (db) => [
      { key: 'code', header: 'ID', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: 'name', header: 'Worker', primary: true, value: (r) => r.name, cell: (r) => <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-surface-3 text-[10px] font-bold flex items-center justify-center">{r.name.split(' ').map((p: string) => p[0]).join('')}</span><div><div className="font-medium">{r.name}</div><div className="text-[11px] text-muted">{r.aadhaar}</div></div></div> },
      { key: 'trade', header: 'Trade', value: (r) => r.trade },
      { key: 'site', header: 'Site', value: (r) => lookup(db).site[r.siteId]?.short },
      { key: 'wage', header: 'Wage / OT', align: 'right', rate: true, value: (r) => r.wageRate, cell: (r) => `${inr(r.wageRate)} / ${inr(r.otRate)}` },
      { key: 'phone', header: 'Phone', value: (r) => r.phone, hideMobile: true },
      activeCell,
    ],
  },
  vehicles: {
    coll: 'vehicles', title: 'Vehicles & machines', req: 'MST-10',
    fields: [
      { key: 'code', label: 'Machine ID', required: true }, { key: 'regNo', label: 'Reg. no.', required: true },
      { key: 'type', label: 'Type', type: 'select', options: opt(['Tipper', 'Transit Mixer', 'JCB', 'Excavator', 'Roller', 'Paver', 'Grader', 'Tanker', 'Car', 'Generator', 'Loader', 'Paver Finisher', 'Compactor', 'Mobile Hot Mix', 'Bitumen Sprayer', 'Sweeper', 'Road Cleaner', 'Marking Machine', 'Concrete Mixer', 'Tractor', 'Other']) },
      { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' }, { key: 'year', label: 'Year', type: 'number' },
      { key: 'ownership', label: 'Owned / hired', type: 'select', options: () => [{ value: 'OWNED', label: 'Owned' }, { value: 'HIRED', label: 'Hired' }] },
      { key: 'ownerName', label: 'Owner (if hired)' },
      { key: 'hireBasis', label: 'Hire basis', type: 'select', options: () => [{ value: '', label: '—' }, { value: 'PER_HOUR', label: 'Per hour' }, { value: 'PER_DAY', label: 'Per day' }, { value: 'PER_MONTH', label: 'Per month' }, { value: 'PER_TRIP', label: 'Per trip' }, { value: 'PER_KM', label: 'Per km' }] },
      { key: 'hireRate', label: 'Hire rate', type: 'money' }, { key: 'minGuaranteedHours', label: 'Min. guaranteed hours', type: 'number' }, { key: 'hireWithFuel', label: 'Hire includes fuel', type: 'toggle' },
      { key: 'fuelType', label: 'Fuel', type: 'select', options: opt(['HSD', 'Petrol']) }, { key: 'tankCapacity', label: 'Tank capacity (L)', type: 'number' },
      { key: 'meterType', label: 'Meter', type: 'select', options: () => [{ value: 'KM', label: 'Km' }, { value: 'HOURS', label: 'Hours' }, { value: 'BOTH', label: 'Both' }] },
      { key: 'stdKmpl', label: 'Standard KMPL', type: 'number' }, { key: 'stdLph', label: 'Standard LPH', type: 'number' },
      { key: 'driver', label: 'Driver / operator' }, { key: 'siteId', label: 'Working at work', type: 'select', options: (db) => [{ value: '', label: '—' }, ...sitesOpt(db)] },
      { key: 'serviceEvery', label: 'Service every (km / hrs)', type: 'number' }, { key: 'internalRate', label: 'Internal hire rate', type: 'money' }, { key: 'emi', label: 'EMI / month', type: 'money' }, { key: 'driverSalary', label: 'Driver salary / month', type: 'money' },
    ],
    defaults: { ownership: 'OWNED', fuelType: 'HSD', meterType: 'KM', status: 'WORKING', docs: [], lastServiceAt: 0, serviceEvery: 10000, internalRate: 40, emi: 0, driverSalary: 20000, tankCapacity: 200 },
    cols: (db) => [
      { key: 'code', header: 'ID', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: 'reg', header: 'Vehicle', primary: true, value: (r) => r.regNo, cell: (r) => <div><div className="font-medium">{r.regNo}</div><div className="text-[11px] text-muted">{r.type} · {r.make} {r.model} ({r.year})</div></div> },
      { key: 'own', header: 'Ownership', value: (r) => r.ownership, cell: (r) => (r.ownership === 'HIRED' ? <Badge tone="violet">Hired · {r.ownerName}</Badge> : <Badge>Owned</Badge>) },
      { key: 'std', header: 'Standard', value: (r) => r.stdKmpl || r.stdLph, cell: (r) => (r.meterType === 'HOURS' ? `${r.stdLph} LPH` : `${r.stdKmpl} KMPL`) },
      { key: 'site', header: 'Site', value: (r) => lookup(db).site[r.siteId]?.short || '—' },
      { key: 'driver', header: 'Driver', value: (r) => r.driver, hideMobile: true },
      activeCell,
    ],
  },
  stores: {
    coll: 'stores', title: 'Stores / godowns', req: 'MST-03',
    fields: [
      { key: 'name', label: 'Name (as shown on screen)', required: true, span: 2 }, { key: 'code', label: 'Internal code', required: true },
      { key: 'type', label: 'Type', type: 'select', options: () => [{ value: 'CENTRAL', label: 'Central godown' }, { value: 'PLANT', label: 'Plant yard' }, { value: 'SITE', label: 'Site store' }] },
      { key: 'plantId', label: 'Linked plant', type: 'select', options: (db) => [{ value: '', label: '—' }, ...db.plants.map((p) => ({ value: p.id, label: p.name }))] },
      { key: 'address', label: 'Location / address', span: 2 }, { key: 'holds', label: 'Holds', type: 'textarea', span: 2 },
    ],
    defaults: { type: 'CENTRAL' },
    cols: (db) => [
      { key: 'name', header: 'Store', primary: true, value: (r) => r.name, cell: (r) => <div><div className="font-medium">{r.name}</div>{r.address && <div className="text-[11px] text-muted">{r.address}</div>}</div> },
      { key: 'type', header: 'Type', value: (r) => r.type, cell: (r) => <Badge tone={r.type === 'CENTRAL' ? 'brand' : r.type === 'PLANT' ? 'info' : 'neutral'}>{r.type === 'CENTRAL' ? 'Central godown' : r.type === 'PLANT' ? 'Plant yard' : 'Site store'}</Badge> },
      { key: 'link', header: 'Linked to', value: (r) => lookup(db).site[r.siteId]?.short || lookup(db).plant[r.plantId]?.name || (r.type === 'CENTRAL' ? 'All works and the plant' : '—') },
      activeCell,
    ],
  },
  plants: {
    coll: 'plants', title: 'Plants', req: 'MST-04',
    fields: [
      { key: 'name', label: 'Plant name (on screen)', required: true, span: 2 }, { key: 'code', label: 'Internal code', required: true },
      { key: 'type', label: 'Type', type: 'select', options: () => [{ value: 'HOT_MIX', label: 'Hot mix (asphalt)' }, { value: 'BATCHING', label: 'Batching' }, { value: 'CRUSHER', label: 'Crusher' }, { value: 'WMM', label: 'WMM' }] },
      { key: 'subType', label: 'Drum or batch', type: 'select', options: () => [{ value: '', label: '—' }, { value: 'DRUM_MIX', label: 'Drum-mix (continuous)' }, { value: 'BATCH_MIX', label: 'Batch type' }] },
      { key: 'makeModel', label: 'Make and model' }, { key: 'capacityPerHour', label: 'Rated capacity / hour', type: 'number' }, { key: 'capacityUnit', label: 'Capacity unit', hint: 'e.g. TPH (60–90)' },
      { key: 'consentedCapacity', label: 'Consented capacity (MT / day)', type: 'number' }, { key: 'consentRef', label: 'Consent to operate (ref. and date)' },
      { key: 'location', label: 'Location', span: 2 }, { key: 'storeId', label: 'Linked store', type: 'select', options: (db) => db.stores.filter((s) => s.type === 'PLANT').map((s) => ({ value: s.id, label: s.name })), required: true },
      { key: 'firmId', label: 'Unit name / firm', type: 'select', options: (db) => [{ value: '', label: '—' }, ...db.firms.map((f) => ({ value: f.id, label: f.tradeName || f.legalName }))] },
      { key: 'equipment', label: 'Main equipment', type: 'textarea', span: 2 }, { key: 'power', label: 'Power' }, { key: 'burnerFuel', label: 'Burner fuel' },
      { key: 'burnerFuelId', label: 'Burner fuel material (LDO / FO)', type: 'select', options: (db) => [{ value: '', label: '—' }, ...db.materials.filter((m) => m.category === 'Fuel & Lubricants').map((m) => ({ value: m.id, label: m.name }))], hint: 'Burner fuel used in production leaves the plant store' },
      { key: 'ldoPerMtNorm', label: 'Burner fuel norm (L / MT)', type: 'number' },
      { key: 'dgFuelId', label: 'DG set fuel material (diesel)', type: 'select', options: (db) => [{ value: '', label: '—' }, ...db.materials.filter((m) => m.category === 'Fuel & Lubricants').map((m) => ({ value: m.id, label: m.name }))] },
      { key: 'dieselPerMtNorm', label: 'DG diesel norm (L / MT)', type: 'number' },
    ],
    defaults: { type: 'HOT_MIX', costMode: 'ACTUAL', fixedRate: {}, subType: 'DRUM_MIX', inCharges: [] },
    cols: (db) => [
      { key: 'name', header: 'Plant', primary: true, value: (r) => r.name, cell: (r) => <div><div className="font-medium">{r.name}</div><div className="text-[11px] text-muted">{[r.makeModel, r.subType === 'DRUM_MIX' ? 'drum-mix' : r.subType === 'BATCH_MIX' ? 'batch type' : ''].filter(Boolean).join(' · ')}</div></div> },
      { key: 'type', header: 'Type', value: (r) => ({ HOT_MIX: 'Hot mix', BATCHING: 'Batching', CRUSHER: 'Crusher', WMM: 'WMM' } as Record<string, string>)[r.type] },
      { key: 'cap', header: 'Capacity', value: (r) => `${r.capacityPerHour} ${r.capacityUnit}`, cell: (r) => <div><div>{r.capacityPerHour} {r.capacityUnit}</div>{r.consentedCapacity ? <div className="text-[11px] text-muted">consent {r.consentedCapacity} MT/day</div> : null}</div> },
      { key: 'ic', header: 'In-charge', value: (r) => [...(r.inCharges || [])].sort((a: any, b: any) => a.from.localeCompare(b.from)).at(-1)?.name || lookup(db).user[r.inChargeId]?.name },
      activeCell,
    ],
  },
  'fuel-sources': {
    coll: 'fuelSources', title: 'Fuel sources', req: 'MST-11',
    fields: [{ key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'type', label: 'Type', type: 'select', options: () => [{ value: 'OWN_TANK', label: 'Own tank' }, { value: 'BOWSER', label: 'Bowser' }, { value: 'OUTSIDE_PUMP', label: 'Outside pump (account)' }] }, { key: 'capacity', label: 'Capacity (L)', type: 'number' }, { key: 'siteId', label: 'Current site', type: 'select', options: (db) => [{ value: '', label: '—' }, ...sitesOpt(db)] }, { key: 'supplierId', label: 'Pump account (supplier)', type: 'select', options: (db) => [{ value: '', label: '—' }, ...db.suppliers.filter((s) => s.kind === 'FUEL_PUMP').map((s) => ({ value: s.id, label: s.name }))] }],
    defaults: { type: 'OWN_TANK', capacity: 0 },
    cols: (db) => [
      { key: 'code', header: 'Code', value: (r) => r.code, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
      { key: 'name', header: 'Source', primary: true, value: (r) => r.name },
      { key: 'type', header: 'Type', value: (r) => r.type.replace('_', ' ').toLowerCase() },
      { key: 'cap', header: 'Capacity', align: 'right', value: (r) => r.capacity, cell: (r) => (r.capacity ? `${r.capacity.toLocaleString('en-IN')} L` : '—') },
      { key: 'site', header: 'Site / account', value: (r) => lookup(db).site[r.siteId]?.short || lookup(db).supplier[r.supplierId]?.code || '—' },
    ],
  },
  'expense-heads': {
    coll: 'expenseHeads', title: 'Expense heads', req: 'MST-12',
    fields: [{ key: 'head', label: 'Head', required: true }, { key: 'subHead', label: 'Sub-head', required: true }],
    cols: () => [{ key: 'head', header: 'Head', primary: true, value: (r) => r.head }, { key: 'sub', header: 'Sub-head', value: (r) => r.subHead }, activeCell],
  },
  units: {
    coll: 'units', title: 'Units', req: 'MST-13',
    fields: [{ key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'base', label: 'Base unit', hint: 'Leave blank if this is a base unit' }, { key: 'factor', label: 'Factor to base', type: 'number' }],
    cols: () => [{ key: 'code', header: 'Code', primary: true, value: (r) => r.code }, { key: 'name', header: 'Name', value: (r) => r.name }, { key: 'conv', header: 'Conversion', value: (r) => (r.base ? `1 ${r.code} = ${r.factor} ${r.base}` : 'Base unit') }],
  },
  boq: {
    coll: 'boq', title: 'BOQ items', req: 'MST-15',
    fields: [{ key: 'siteId', label: 'Work', type: 'select', options: sitesOpt, required: true }, { key: 'itemNo', label: 'Item no.', required: true }, { key: 'description', label: 'Description', required: true, span: 2 }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'Quantity', type: 'number' }, { key: 'rate', label: 'Rate', type: 'money' }, { key: 'recipeId', label: 'Linked recipe', type: 'select', options: (db) => [{ value: '', label: '—' }, ...db.recipes.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))] }],
    cols: (db) => [
      { key: 'site', header: 'Site', value: (r) => lookup(db).site[r.siteId]?.short },
      { key: 'no', header: 'Item', value: (r) => r.itemNo },
      { key: 'desc', header: 'Description', primary: true, value: (r) => r.description },
      { key: 'qty', header: 'Qty', align: 'right', value: (r) => r.qty, cell: (r) => qty(r.qty, r.unit) },
      { key: 'rate', header: 'Rate', align: 'right', rate: true, value: (r) => r.rate, cell: (r) => inr(r.rate) },
      { key: 'amt', header: 'Amount', align: 'right', rate: true, value: (r) => r.qty * r.rate, cell: (r) => inrCompact(r.qty * r.rate) },
      { key: 'recipe', header: 'Recipe', value: (r) => lookup(db).recipe[r.recipeId]?.code || '—', hideMobile: true },
    ],
  },
};

export default function Masters() {
  const { tab, tabsEl } = useModuleTab('masters');
  return (
    <div>
      <PageHeader title="Masters" subtitle="Entered once and reused everywhere — add, edit, deactivate (never delete once used), Excel import and export." />
      {tabsEl}
      {tab === 'sites' ? <WorksTab /> : tab === 'firms' || tab === 'company' ? <FirmsTab /> : tab === 'import' ? <ImportExportTab /> : tab === 'recipes' ? <RecipesTab /> : MASTERS[tab] ? <MasterTab key={tab} def={MASTERS[tab]!} /> : null}
    </div>
  );
}

function MasterTab({ def }: { def: MasterDef }) {
  const db = useDB();
  const s = useSession();
  const q = useQueryParam('q');
  const [edit, setEdit] = useState<any | null>(null);
  const rows = useMemo(() => (db[def.coll] as any[]).filter((r) => !q || r.code === q).slice().reverse(), [db, def, q]);
  const cols = useMemo(() => def.cols(db), [db, def]);
  const canAdd = s.can('masters', 'add');
  const tpl = templateById(({ clients: 'clients', suppliers: 'suppliers', subcons: 'subcons', materials: 'materials', workers: 'workers', vehicles: 'vehicles', boq: 'boq' } as Record<string, string>)[def.coll] || '');
  const [importing, setImporting] = useState(false);
  return (
    <>
      <DataTable
        title={def.title}
        rows={rows}
        columns={[
          ...cols,
          ...(s.can('masters', 'edit') ? [{ key: '_edit', header: '', sortable: false, cell: (r: any) => <Button size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" />} onClick={(e) => (e.stopPropagation(), setEdit(r))}>Edit</Button> } as Column<any>] : []),
        ]}
        rowKey={(r) => r.id}
        onRowClick={s.can('masters', 'edit') ? setEdit : undefined}
        rowClassName={(r) => (r.active === false ? 'opacity-55' : undefined)}
        toolbar={
          canAdd && (
            <>
              {tpl && <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => exportTemplate(db, tpl)}>Export</Button>}
              {tpl && <Button icon={<FileUp className="w-4 h-4" />} onClick={() => setImporting(true)}>Import</Button>}
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({ ...(def.defaults || {}) })}>Add</Button>
            </>
          )
        }
      />
      {edit && (def.coll === 'clients' ? <ClientForm rec={edit} onClose={() => setEdit(null)} /> : <MasterForm def={def} rec={edit} onClose={() => setEdit(null)} />)}
      {importing && tpl && <ImportDialog template={tpl} onClose={() => setImporting(false)} />}
    </>
  );
}

function MasterForm({ def, rec, onClose }: { def: MasterDef; rec: any; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const isNew = !rec.id;
  const [v, setV] = useState<Record<string, any>>({ ...rec });
  const [docs, setDocs] = useState<VehicleDoc[]>(rec.docs || []);
  const [inCharges, setInCharges] = useState<Array<{ name: string; from: string; userId?: string }>>(rec.inCharges || []);
  const [locs, setLocs] = useState<Array<{ name: string; materialId: string; capacity: number | ''; unit: string }>>(rec.locations || []);
  const set = (k: string, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  const save = () => {
    for (const f of def.fields) if (f.required && (v[f.key] === undefined || v[f.key] === '')) return toast.error(`${f.label} is required`);
    const out: Record<string, unknown> = {};
    for (const f of def.fields) {
      let x = v[f.key];
      if (f.mask && typeof x === 'string' && /\d{4}/.test(x) && !x.startsWith('XXXX')) x = `XXXX-XXXX-${x.replace(/\D/g, '').slice(-4)}`;
      if (x === '') x = undefined;
      out[f.key] = x;
    }
    if (def.coll === 'vehicles') out.docs = docs;
    if (def.coll === 'stores') {
      if (locs.some((l) => !l.name || !l.materialId)) return toast.error('Each tank / stockpile needs a name and a material');
      out.locations = locs.map((l) => ({ ...l, capacity: Number(l.capacity) || 0, unit: l.unit || db.materials.find((m) => m.id === l.materialId)?.unit || '' }));
    }
    if (def.coll === 'plants') {
      if (inCharges.some((h) => !h.name || !h.from)) return toast.error('Each in-charge needs a name and an effective date');
      out.inCharges = inCharges;
    }
    if (isNew) {
      insert(def.coll, { ...(def.defaults || {}), ...out }, `${def.title}: ${out.name || out.code || out.head || ''} added`, def.title);
      toast.success('Added');
    } else {
      update(def.coll, rec.id, out, `${def.title}: ${out.name || out.code || out.head || ''} updated`, def.title);
      toast.success('Saved');
    }
    onClose();
  };
  const toggleActive = () => {
    update(def.coll, rec.id, { active: rec.active === false }, `${def.title}: ${rec.name || rec.code} ${rec.active === false ? 'reactivated' : 'deactivated'}`, def.title, undefined, 'DEACTIVATE');
    toast.success(rec.active === false ? 'Reactivated' : 'Deactivated', 'Kept for history — used records are never deleted');
    onClose();
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? `Add ${def.title.toLowerCase().replace(/s$/, '')}` : rec.name || rec.code || rec.head || 'Edit'}
      footer={
        <>
          {!isNew && s.can('masters', 'delete') && 'active' in rec && (
            <Button variant="ghost" icon={<Power className="w-4 h-4" />} onClick={toggleActive} className="mr-auto">
              {rec.active === false ? 'Reactivate' : 'Deactivate'}
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} icon={<CircleCheck className="w-4 h-4" />}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {def.fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} hint={f.hint} className={cn(f.span === 2 && 'sm:col-span-2', f.type === 'toggle' && 'sm:col-span-2')}>
            {f.type === 'select' ? (
              <Select value={v[f.key] ?? ''} onChange={(x) => set(f.key, x)} options={f.options!(db)} placeholder={f.options!(db).some((o) => o.value === '') ? undefined : 'Choose'} />
            ) : f.type === 'number' || f.type === 'money' || f.type === 'pct' ? (
              <NumberInput value={v[f.key] ?? ''} onChange={(x) => set(f.key, x)} prefix={f.type === 'money' ? '₹' : undefined} suffix={f.type === 'pct' ? '%' : undefined} />
            ) : f.type === 'date' ? (
              <Input type="date" value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.type === 'textarea' ? (
              <Textarea value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.type === 'toggle' ? (
              <Toggle checked={!!v[f.key]} onChange={(x) => set(f.key, x)} />
            ) : (
              <Input value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
      {def.coll === 'stores' && (
        <div className="mt-6">
          <Section title="Tanks and stockpiles (for daily dips)" action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setLocs([...locs, { name: '', materialId: '', capacity: '', unit: '' }])}>Add tank / stockpile</Button>}>
            <div className="space-y-2">
              {locs.map((l, i) => {
                const up = (p: Partial<typeof l>) => setLocs(locs.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input value={l.name} onChange={(e) => up({ name: e.target.value })} placeholder="Bitumen tank 1" />
                    <Select value={l.materialId} onChange={(x) => up({ materialId: x, unit: db.materials.find((m) => m.id === x)?.unit || '' })} placeholder="Material" options={db.materials.filter((m) => m.kind !== 'OUTPUT' || m.category === 'Bitumen').map((m) => ({ value: m.id, label: m.name }))} />
                    <NumberInput value={l.capacity} onChange={(x) => up({ capacity: x })} suffix={l.unit || 'capacity'} />
                    <Button size="sm" variant="ghost" onClick={() => setLocs(locs.filter((_, j) => j !== i))}>Remove</Button>
                  </div>
                );
              })}
              {!locs.length && <p className="text-sm text-muted">Add the bitumen / LDO / diesel tanks and aggregate stockpiles that are dipped or measured daily.</p>}
            </div>
          </Section>
        </div>
      )}
      {def.coll === 'plants' && (
        <div className="mt-6">
          <Section title="In-charge (with effective date)" action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setInCharges([...inCharges, { name: '', from: '' }])}>Change in-charge</Button>}>
            <div className="space-y-2">
              {inCharges.length === 0 && <p className="text-xs text-muted">Not set.</p>}
              {inCharges.map((h, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-6"><Input value={h.name} onChange={(e) => setInCharges(inCharges.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Name" aria-label="In-charge name" /></div>
                  <div className="col-span-5"><Input type="date" value={h.from} onChange={(e) => setInCharges(inCharges.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)))} aria-label="Effective from" /></div>
                  <div className="col-span-1"><Button variant="ghost" size="icon" onClick={() => setInCharges(inCharges.filter((_, j) => j !== i))} aria-label="Remove in-charge" title="Remove"><Trash2 className="w-4 h-4" /></Button></div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
      {def.coll === 'vehicles' && (
        <div className="mt-6">
          <Section title="Documents — insurance, fitness, permit, PUC, road tax" action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setDocs([...docs, { type: 'Insurance', number: '', expiry: '' }])}>Add</Button>}>
            <div className="space-y-2">
              {docs.map((d, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-4"><Select value={d.type} onChange={(x) => setDocs(docs.map((y, j) => (j === i ? { ...y, type: x as VehicleDoc['type'] } : y)))} options={['Insurance', 'Fitness', 'Permit', 'PUC', 'Road Tax', 'Driver Licence'].map((x) => ({ value: x, label: x }))} /></div>
                  <div className="col-span-4"><Input value={d.number} onChange={(e) => setDocs(docs.map((y, j) => (j === i ? { ...y, number: e.target.value } : y)))} placeholder="Number" /></div>
                  <div className="col-span-3"><Input type="date" value={d.expiry} onChange={(e) => setDocs(docs.map((y, j) => (j === i ? { ...y, expiry: e.target.value } : y)))} /></div>
                  <div className="col-span-1"><Button variant="ghost" size="icon" onClick={() => setDocs(docs.filter((_, j) => j !== i))} aria-label="Remove document" title="Remove"><Trash2 className="w-4 h-4" /></Button></div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </Drawer>
  );
}

/* ---------- Recipes / BOM ---------- */
function RecipesTab() {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <>
      <Callout className="mb-4">For each plant product or work item: raw materials and quantity per unit — e.g. per MT of bituminous mix, per cum of M25 concrete. A site- or client-specific job mix can override the default.</Callout>
      <div className="flex justify-end mb-3">{s.can('masters', 'add') && <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({ code: '', name: '', productId: '', perUnit: 'MT', lines: [{ materialId: '', qty: 0 }] })}>Add recipe</Button>}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 stagger">
        {db.recipes.map((r) => (
          <Card key={r.id} hover className="p-4 cursor-pointer" onClick={() => s.can('masters', 'edit') && setEdit(r)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-muted">{r.code}</div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-fg-2">{r.productId ? `${lk.material[r.productId]?.name} · ` : 'Work item · '}per {r.perUnit}</div>
              </div>
              {r.siteId ? <Badge tone="violet">{lk.site[r.siteId]?.short}</Badge> : r.split ? <Badge tone="info">Crusher split</Badge> : <Badge>Default</Badge>}
            </div>
            <div className="mt-3 space-y-1">
              {(r.split || r.lines).map((l: any) => (
                <div key={l.materialId} className="flex justify-between text-[13px]">
                  <span className="text-fg-2">{lk.material[l.materialId]?.name}</span>
                  <span className="num font-medium">{'pct' in l ? `${l.pct}%` : `${l.qty} ${lk.material[l.materialId]?.unit}`}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {edit && <RecipeForm rec={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RecipeForm({ rec, onClose }: { rec: any; onClose: () => void }) {
  const db = useDB();
  const [v, setV] = useState({ ...rec, lines: rec.lines.map((l: any) => ({ ...l })) });
  const save = () => {
    if (!v.code || !v.name) return toast.error('Code and name are required');
    const lines = v.lines.filter((l: any) => l.materialId && Number(l.qty) > 0).map((l: any) => ({ materialId: l.materialId, qty: Number(l.qty) }));
    if (rec.id) update('recipes', rec.id, { ...v, lines }, `Recipe ${v.code} updated`, 'Recipe');
    else insert('recipes', { ...v, lines }, `Recipe ${v.code} added`, 'Recipe');
    toast.success('Recipe saved');
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={rec.id ? rec.name : 'New recipe'} subtitle="bill of materials" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Code" required><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
          <Field label="Per unit"><Select value={v.perUnit} onChange={(x) => setV({ ...v, perUnit: x })} options={['MT', 'CUM', 'SQM', 'RMT', 'NOS'].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Name" required className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Plant product (blank for a work item)"><Combo value={v.productId} onChange={(x) => setV({ ...v, productId: x })} options={[{ value: '', label: '— Work item —' }, ...materialOptions(db, (m) => m.kind !== 'RAW')]} /></Field>
          <Field label="Site-specific for"><Select value={v.siteId || ''} onChange={(x) => setV({ ...v, siteId: x || undefined })} options={[{ value: '', label: 'All sites (default)' }, ...db.sites.map((s) => ({ value: s.id, label: s.short }))]} /></Field>
        </div>
        <Section title="Materials per unit" action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setV({ ...v, lines: [...v.lines, { materialId: '', qty: 0 }] })}>Add</Button>}>
          {v.lines.map((l: any, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-2 mb-2">
              <div className="col-span-7"><Combo value={l.materialId} onChange={(x) => setV({ ...v, lines: v.lines.map((y: any, j: number) => (j === i ? { ...y, materialId: x } : y)) })} options={materialOptions(db)} /></div>
              <div className="col-span-4"><NumberInput value={l.qty} onChange={(x) => setV({ ...v, lines: v.lines.map((y: any, j: number) => (j === i ? { ...y, qty: x } : y)) })} suffix={db.materials.find((m) => m.id === l.materialId)?.unit} /></div>
              <div className="col-span-1"><Button variant="ghost" size="icon" onClick={() => setV({ ...v, lines: v.lines.filter((_: any, j: number) => j !== i) })} aria-label="Remove"><Trash2 className="w-4 h-4" /></Button></div>
            </div>
          ))}
        </Section>
      </div>
    </Drawer>
  );
}

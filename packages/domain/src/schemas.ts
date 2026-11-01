import { z } from 'zod';
import type { CollectionKey } from './types.js';

/**
 * Server-side validation of every record the web app sends (one schema per collection).
 * Unknown keys are stripped; numbers must be finite; strings are length-capped.
 */

const id = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, 'invalid id');
const optId = id.optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const month = z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM');
const ts = z.string().max(40);
const s = (max = 200) => z.string().max(max);
const num = z.number().finite();
const nn = num.min(0, 'must not be negative');
const pct = num.min(0).max(100);
const rec = (v: z.ZodTypeAny) => z.record(z.string().max(64), v);
const status = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED']);
const payMode = z.enum(['BANK', 'CHEQUE', 'UPI', 'CASH']);
const costHeads = z.object({ MATERIAL: num, LABOUR: num, SUBCONTRACT: num, VEHICLE: num, MISC: num, OVERHEAD: num });

const base = {
  id,
  createdAt: ts.optional(),
  createdBy: s(64).optional(),
  active: z.boolean().optional(),
};

const trade = z.enum(['Mason', 'Helper', 'Carpenter', 'Bar Bender', 'Operator', 'Driver', 'Electrician', 'Supervisor']);
const qtyLine = z.object({ materialId: id, qty: nn });
const poLine = z.object({ materialId: id, qty: nn, rate: nn, gstPct: pct });
const optDate = z.union([date, z.literal('')]).default('');
/** small image as a data URL (logo, signature) — about 300 KB at most */
const image = z.string().max(400_000).regex(/^(|data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+)$/, 'image must be PNG, JPEG, WebP or SVG');
const contact = z.object({ designation: s(60).default(''), name: s(120).default(''), phone: s(30).default('') });
const deductions = z.object({
  gstTdsPct: pct, gstTdsThreshold: nn, itTdsPct: pct, itTdsOnGst: z.boolean(), labourCessPct: pct, labourCessOnGst: z.boolean(), tcsPct: pct,
  others: z.array(z.object({ head: s(100), pct: pct.default(0), basis: z.enum(['GROSS', 'TAXABLE', 'FIXED']).default('GROSS'), amount: nn.optional() })).max(20).default([]),
});
const guarantee = {
  amount: nn.default(0), mode: z.enum(['BG', 'FDR', 'EBG', 'ONLINE', 'EXEMPTED', '']).default(''), bank: s(120).default(''), number: s(60).default(''),
  issueDate: optDate, validity: optDate, claimDate: optDate,
};
const stage = z.enum(['BID_SUBMITTED', 'LOA_RECEIVED', 'AGREEMENT_SIGNED', 'IN_PROGRESS', 'STOPPED', 'PHYSICALLY_COMPLETE', 'FINAL_BILL_SUBMITTED', 'FINAL_BILL_PAID', 'DLP', 'SECURITY_RELEASED', 'CLOSED']);

export const schemas: Record<CollectionKey, z.ZodTypeAny> = {
  firms: z.object({
    ...base, code: z.string().regex(/^[A-Za-z0-9-]{1,10}$/, 'code: 1–10 letters or digits'), legalName: s(200), tradeName: s(200).default(''),
    constitution: z.enum(['PROPRIETOR', 'PARTNERSHIP', 'LLP', 'COMPANY']).default('PROPRIETOR'),
    gstin: z.string().regex(/^(|[0-9]{2}[A-Z0-9]{13})$/, 'GSTIN must be 15 characters').default(''), gstRegType: s(60).optional(), gstLiableFrom: optDate,
    pan: z.string().regex(/^(|[A-Z]{5}[0-9]{4}[A-Z])$/, 'PAN must look like ABCDE1234F').default(''), tan: s(10).default(''), udyam: s(40).default(''),
    enlistment: z.object({ dept: s(120).default(''), no: s(60).default(''), cls: s(30).default(''), limit: nn.default(0), validTo: optDate }).default({}),
    address: s(500).default(''), places: z.array(z.object({ name: s(120), address: s(500) })).max(10).default([]),
    contactName: s(120).default(''), phone: s(30).default(''), email: s(120).default(''),
    labourLicence: z.object({ no: s(60).default(''), authority: s(200).default(''), validTo: optDate, note: s(300).default('') }).default({}),
    epfCode: s(40).default(''), esicCode: s(40).default(''),
    banks: z.array(z.object({ bank: s(200), account: s(40), ifsc: s(20), branch: s(120).optional() })).max(10).default([]),
    logo: image.optional(), signature: image.optional(), invoicePrefix: z.string().regex(/^[A-Za-z0-9/-]{0,20}$/, 'invoice prefix: letters, digits, / or -').default(''),
  }),
  sites: z.object({
    ...base, code: s(30).default(''), name: s(300), short: s(60).default(''), clientId: id, workOrderNo: s(100).default(''), workOrderDate: z.union([date, z.literal('')]).default(''),
    contractValue: nn, location: s(200).default(''), gps: s(60).default(''), startDate: z.union([date, z.literal('')]).default(''), scheduledCompletion: z.union([date, z.literal('')]).default(''),
    actualCompletion: date.optional(), engineerId: optId, status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED']), securityDeposit: nn.default(0), retentionPct: pct.default(5), gstPct: pct.default(18),
    workType: z.enum(['ROAD', 'BRIDGE', 'BUILDING', 'IRRIGATION']), budget: costHeads, openingCost: costHeads, openingAsOf: s(10).default(''),
    firmId: optId, officeId: optId, stage: stage.optional(),
    tender: z.object({ nitNo: s(120).default(''), nitDate: optDate, tenderId: s(60).default('') }).optional(),
    agreementNo: s(120).optional(), agreementDate: z.union([date, z.literal('')]).optional(), estimatedCost: nn.optional(),
    quoteType: z.enum(['ABOVE', 'BELOW', 'PAR', 'ITEM_RATE']).optional(), quotedPct: pct.optional(), gstIncluded: z.boolean().optional(),
    district: s(100).optional(), subDivision: s(100).optional(), block: s(100).optional(), chainageFrom: nn.optional(), chainageTo: nn.optional(), lengthKm: nn.optional(),
    timeAllowedMonths: nn.optional(), eots: z.array(z.object({ letterNo: s(120), date: date, newCompletion: date, reason: s(300).default('') })).max(30).optional(),
    clientEngineers: z.array(contact).max(20).optional(), supervisorName: s(120).optional(),
    emd: z.object({ ...guarantee, refundDate: optDate }).optional(), perfSecurity: z.object({ ...guarantee, pct: pct.default(0) }).optional(), addlPerfSecurity: z.object(guarantee).optional(),
    sdCeiling: nn.optional(), dlpMonths: z.number().int().min(0).max(120).optional(), deductions: deductions.optional(),
    advances: z.array(z.object({ kind: z.enum(['MOBILISATION', 'MACHINERY', 'SECURED']), amount: nn, interestPct: pct.default(0), recoveryPct: pct.default(0) })).max(10).optional(),
    priceAdjustment: z.object({ applicable: z.boolean(), baseDate: optDate, components: z.array(z.object({ name: s(60), basePrice: nn, unit: s(20).default(''), sharePct: pct.default(0) })).max(10).default([]) }).optional(),
    ld: z.object({ ratePct: pct, per: z.enum(['DAY', 'WEEK', 'MONTH']).default('WEEK'), maxPct: pct }).optional(),
    milestones: z.array(z.object({ date, targetPct: pct, label: s(120).default('') })).max(30).optional(),
    plantId: optId, openingWorkDone: nn.optional(), openingBilled: nn.optional(), openingReceived: nn.optional(),
  }),
  stores: z.object({ ...base, code: s(30), name: s(200), type: z.enum(['CENTRAL', 'SITE', 'PLANT']), siteId: optId, plantId: optId, address: s(500).optional(), holds: s(500).optional() }),
  plants: z.object({
    ...base, code: s(30), name: s(200), type: z.enum(['HOT_MIX', 'BATCHING', 'CRUSHER', 'WMM']), capacityPerHour: nn.default(0), capacityUnit: s(20).default(''), location: s(200).default(''),
    inChargeId: optId, storeId: id, costMode: z.enum(['ACTUAL', 'FIXED']).default('ACTUAL'), fixedRate: rec(nn).default({}),
    subType: z.enum(['DRUM_MIX', 'BATCH_MIX', '']).optional(), makeModel: s(120).optional(), consentedCapacity: nn.optional(), consentRef: s(200).optional(), firmId: optId,
    inCharges: z.array(z.object({ name: s(120), userId: optId, from: date })).max(50).optional(), equipment: s(1000).optional(), power: s(200).optional(), burnerFuel: s(60).optional(),
  }),
  materials: z.object({
    ...base, code: s(30), name: s(200),
    category: z.enum(['Cement', 'Steel', 'Aggregate', 'Bitumen', 'Sand', 'Bricks', 'Pipes', 'Electrical', 'Consumables', 'Spares', 'Fuel & Lubricants', 'Plant Output', 'Tools & Tackles', 'Others']),
    unit: s(10), altUnit: s(10).optional(), altFactor: num.positive().optional(), hsn: s(12).default(''), gstPct: pct.default(18), minStock: nn.default(0), reorderQty: nn.default(0),
    kind: z.enum(['RAW', 'OUTPUT', 'BOTH']), returnable: z.boolean().optional(), batchTracked: z.boolean().optional(), stdRate: nn.default(0), tolerancePct: pct.optional(),
  }),
  suppliers: z.object({
    ...base, code: s(30), name: s(200), gstin: s(15).default(''), pan: s(10).default(''), address: s(400).default(''), contact: s(100).default(''), phone: s(20).default(''), bank: s(200).default(''),
    materials: s(300).default(''), creditDays: z.number().int().min(0).max(365).default(30), openingBalance: num.default(0), kind: z.enum(['MATERIAL', 'FUEL_PUMP', 'VEHICLE_OWNER', 'SERVICE']).default('MATERIAL'),
  }),
  clients: z.object({
    ...base, code: s(30), name: s(200), gstin: s(15).default(''), address: s(400).default(''), billingContact: s(200).default(''), tdsPct: pct.default(2), retentionPct: pct.default(5), cessPct: pct.default(1),
    kind: z.enum(['GOVT', 'LOCAL_BODY', 'PRIVATE', 'BUYER']).optional(), email: s(120).optional(), phone: s(30).optional(),
    offices: z.array(z.object({ id, circle: s(120).default(''), division: s(160).default(''), subDivision: s(160).default(''), address: s(500).default(''), email: s(120).default(''), gstin: s(15).default(''), contacts: z.array(contact).max(20).default([]) })).max(100).optional(),
    deductions: deductions.optional(),
  }),
  subcons: z.object({
    ...base, code: s(30), name: s(200), kind: z.enum(['LABOUR_CONTRACTOR', 'SUB_CONTRACTOR']), pan: s(10).default(''), gstin: s(15).default(''), trade: s(100).default(''),
    rateType: z.enum(['PER_DAY', 'PER_UNIT', 'LUMP_SUM']), bank: s(200).default(''), phone: s(20).default(''), openingBalance: num.default(0), licenceNo: s(60).optional(), licenceExpiry: date.optional(),
    pfNo: s(40).optional(), esiNo: s(40).optional(), bocwNo: s(40).optional(), tradeRates: rec(nn).default({}),
  }),
  workers: z.object({
    ...base, code: s(30), name: s(200), phone: s(20).default(''), aadhaar: z.string().regex(/^(|XXXX-XXXX-\d{4})$/, 'Aadhaar must be stored masked').default(''), trade, wageRate: nn, otRate: nn.default(0),
    ownership: z.enum(['OWN', 'CONTRACTOR']), contractorId: optId, siteId: id, upi: s(100).default(''), joiningDate: z.union([date, z.literal('')]).default(''),
  }),
  vehicles: z.object({
    ...base, code: s(30), regNo: s(40), type: z.enum(['Tipper', 'Transit Mixer', 'JCB', 'Excavator', 'Roller', 'Paver', 'Grader', 'Tanker', 'Car', 'Generator', 'Loader', 'Paver Finisher', 'Compactor', 'Mobile Hot Mix', 'Bitumen Sprayer', 'Sweeper', 'Road Cleaner', 'Marking Machine', 'Concrete Mixer', 'Tractor', 'Other']),
    make: s(60).default(''), model: s(100).default(''), year: z.number().int().min(1950).max(2100).default(2020), ownership: z.enum(['OWNED', 'HIRED']), ownerName: s(200).optional(), ownerSupplierId: optId,
    hireBasis: z.enum(['PER_HOUR', 'PER_DAY', 'PER_MONTH', 'PER_TRIP', 'PER_KM']).optional(), hireRate: nn.optional(), hireWithFuel: z.boolean().optional(), minGuaranteedHours: nn.optional(),
    fuelType: z.enum(['HSD', 'Petrol']).default('HSD'), tankCapacity: nn.default(0), meterType: z.enum(['KM', 'HOURS', 'BOTH']), stdKmpl: nn.optional(), stdLph: nn.optional(), driver: s(100).default(''),
    siteId: optId, docs: z.array(z.object({ type: z.enum(['Insurance', 'Fitness', 'Permit', 'PUC', 'Road Tax', 'Driver Licence']), number: s(60), expiry: z.union([date, z.literal('')]) })).max(20).default([]),
    serviceEvery: nn.default(0), lastServiceAt: nn.default(0), internalRate: nn.default(0), emi: nn.default(0), driverSalary: nn.default(0), status: z.enum(['WORKING', 'IDLE', 'BREAKDOWN']).default('WORKING'),
  }),
  fuelSources: z.object({ ...base, code: s(30), name: s(200), type: z.enum(['OWN_TANK', 'BOWSER', 'OUTSIDE_PUMP']), capacity: nn.default(0), siteId: optId, supplierId: optId }),
  expenseHeads: z.object({ ...base, head: s(100), subHead: s(100) }),
  units: z.object({ id, code: s(10), name: s(60), base: s(10).optional(), factor: num.positive().optional() }),
  recipes: z.object({
    ...base, code: s(30), name: s(200), productId: z.union([id, z.literal('')]), siteId: optId, perUnit: s(10),
    lines: z.array(qtyLine).max(50), split: z.array(z.object({ materialId: id, pct })).max(20).optional(),
  }),
  boq: z.object({ ...base, siteId: id, itemNo: s(30), description: s(1000), unit: s(10), qty: nn, rate: nn, recipeId: optId, isExtra: z.boolean().optional(), approvalRef: s(200).optional() }),

  stockTxns: z.object({
    ...base, no: s(60), type: z.enum(['OPENING', 'ISSUE', 'GRN', 'PLANT_RECEIPT', 'CONSUMPTION', 'TRANSFER', 'RETURN', 'WASTAGE', 'ADJUSTMENT']), date,
    fromStoreId: optId, toStoreId: optId,
    lines: z.array(z.object({
      materialId: id, qty: num, rate: nn.default(0), enteredQty: num.optional(), enteredUnit: s(10).optional(), orderedQty: nn.optional(), rejectedQty: nn.optional(), rejectReason: s(300).optional(),
      systemQty: num.optional(), physicalQty: nn.optional(), batchNo: s(60).optional(),
    })).min(1).max(100),
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED', 'IN_TRANSIT', 'POSTED']),
    supplierId: optId, poId: optId, challanNo: s(100).optional(), vehicleNo: s(40).optional(), weighbridgeSlip: s(60).optional(), receivedBy: s(100).optional(), boqItemId: optId, workDone: s(500).optional(),
    location: s(300).optional(), reason: s(1000).optional(), condition: s(300).optional(), issueToVehicleId: optId, subContractorId: optId, dispatchId: optId, remark: s(1000).optional(),
    photos: z.number().int().min(0).max(50).optional(), receivedAt: ts.optional(), approvalNote: s(1000).optional(),
  }),
  requisitions: z.object({ ...base, no: s(60), date, storeId: id, requiredBy: date, purpose: s(500), lines: z.array(qtyLine).min(1).max(100), status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED', 'ORDERED']) }),
  quotations: z.object({
    ...base, no: s(60), date, requisitionId: optId, materialId: id, qty: nn,
    quotes: z.array(z.object({ supplierId: id, rate: nn, deliveryDays: nn, terms: s(200) })).min(1).max(5), selectedSupplierId: optId,
  }),
  pos: z.object({
    ...base, no: s(60), date, supplierId: id, deliveryStoreId: id, requisitionId: optId, lines: z.array(poLine).min(1).max(100), deliveryTerms: s(500).default(''), paymentTerms: s(500).default(''),
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED', 'OPEN', 'PARTIAL', 'CLOSED']),
  }),
  invoices: z.object({ ...base, no: s(60), supplierInvoiceNo: s(60), date, supplierId: id, poId: optId, grnIds: z.array(id).max(50), storeId: id, lines: z.array(poLine).min(1).max(100), dueDate: date }),
  payments: z.object({ ...base, no: s(60), date, partyType: z.enum(['SUPPLIER', 'SUBCON', 'WORKER']), partyId: id, amount: nn, tds: nn.default(0), mode: payMode, ref: s(100).default(''), kind: z.enum(['FULL', 'PART', 'ADVANCE']), siteId: optId, remark: s(500).optional() }),
  debitNotes: z.object({ ...base, no: s(60), date, supplierId: id, grnId: optId, materialId: id, qty: nn, rate: nn, reason: s(500) }),
  attendance: z.object({
    ...base, date, siteId: id, workerId: optId, status: z.enum(['P', 'A', 'H']).optional(), otHours: nn.default(0), contractorId: optId, trade: trade.optional(),
    headcount: z.number().int().min(0).max(2000).optional(), photo: z.boolean().optional(), gps: s(60).optional(), locked: z.boolean().optional(),
  }).refine((a) => a.otHours <= 24 * (a.workerId ? 1 : Math.max(1, a.headcount ?? 1)), { message: 'OT hours are more than 24 per person', path: ['otHours'] }),
  advances: z.object({ ...base, date, siteId: id, workerId: optId, contractorId: optId, amount: nn, mode: payMode, remark: s(300).default('') }),
  wageRuns: z.object({
    ...base, no: s(60), siteId: id, frequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY']), from: date, to: date,
    lines: z.array(z.object({ workerId: id, days: nn, otHours: nn, gross: nn, advance: nn, deduction: nn, net: num })).max(3000),
    status: z.enum(['DRAFT', 'APPROVED', 'PAID']), paidMode: payMode.optional(),
  }),
  workOrders: z.object({
    ...base, no: s(60), date, subContractorId: id, siteId: id, lines: z.array(z.object({ boqItemId: id, qty: nn, rate: nn })).min(1).max(100), start: date, end: date,
    retentionPct: pct, tdsPct: pct, status: z.enum(['ACTIVE', 'CLOSED']),
  }),
  subconBills: z.object({
    ...base, no: s(60), date, workOrderId: id, lines: z.array(z.object({ boqItemId: id, qty: nn, rate: nn })).min(1).max(100), materialRecovery: nn.default(0), advanceRecovery: nn.default(0), penalty: nn.default(0),
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED', 'PAID']),
  }),
  imprests: z.object({ ...base, no: s(60), date, siteId: id, amount: nn, kind: z.enum(['IMPREST', 'TOPUP_REQUEST']), mode: payMode, remark: s(500).default(''), status }),
  expenses: z.object({ ...base, no: s(60), date, siteId: id, headId: id, amount: nn, paidTo: s(200), mode: payMode, billNo: s(60).default(''), remark: s(1000).default(''), photo: z.boolean().default(false), status }),
  overheads: z.object({ ...base, month, head: s(200), amount: nn, basis: z.enum(['EQUAL', 'CONTRACT', 'BILLING', 'MANUAL']), manual: rec(nn).optional() }),
  fuelPurchases: z.object({ ...base, no: s(60), date, sourceId: id, supplierId: id, litres: nn, rate: nn, invoiceNo: s(60).default(''), dipBefore: nn.default(0), dipAfter: nn.default(0) }),
  fuelIssues: z.object({
    ...base, no: s(60), date, time: s(8).default(''), vehicleId: id, driver: s(100).default(''), siteId: id, sourceId: id, litres: nn.max(5000), rate: nn, odometer: nn.optional(), hourMeter: nn.optional(),
    fullTank: z.boolean(), slipPhoto: z.boolean().default(false), meterPhoto: z.boolean().default(false), status, flag: s(300).optional(),
  }),
  dips: z.object({ ...base, date, sourceId: id, litres: nn }),
  logs: z.object({
    ...base, date, vehicleId: id, siteId: id, driver: s(100).default(''), openKm: nn.optional(), closeKm: nn.optional(), openHr: nn.optional(), closeHr: nn.optional(), trips: z.number().int().min(0).max(500).default(0),
    route: s(300).default(''), material: s(100).optional(), materialQty: nn.optional(), idleHours: nn.max(24).default(0), idleReason: z.enum(['Breakdown', 'No work', 'Rain', 'No operator', '']).optional(),
    split: z.array(z.object({ siteId: id, share: num.min(0).max(1) })).max(5).optional(),
  }),
  jobCards: z.object({ ...base, no: s(60), date, vehicleId: id, type: z.enum(['SERVICE', 'BREAKDOWN', 'REPAIR']), complaint: s(1000), workDone: s(1000).default(''), sparesCost: nn.default(0), labourCost: nn.default(0), downtimeHours: nn.default(0), meterAt: nn.default(0), closed: z.boolean() }),
  tyres: z.object({ ...base, vehicleId: id, kind: z.enum(['TYRE', 'BATTERY']), serial: s(60), position: s(30), fitDate: date, meterAtFit: nn, removedDate: date.optional(), removedMeter: nn.optional(), reason: s(300).optional(), cost: nn }),
  production: z.object({
    ...base, no: s(60), date, shift: z.enum(['DAY', 'NIGHT']), plantId: id, productId: id, recipeId: id, qty: nn, runHours: nn.max(24), startMeter: nn, stopMeter: nn, dgUnits: nn.default(0), fuelUsed: nn.default(0),
    operator: s(100).default(''), actual: z.array(qtyLine).max(50).optional(), rejectedQty: nn.default(0), rejectReason: s(300).optional(),
  }),
  dispatches: z.object({
    ...base, no: s(60), date, time: s(8).default(''), plantId: id, productId: id, qty: nn, vehicleId: id, driver: s(100).default(''), siteId: optId, toPlantId: optId, customer: s(200).optional(), saleRate: nn.optional(),
    boqItemId: optId, chainage: s(200).default(''), temperature: num.min(0).max(300).optional(), weighbridgeSlip: s(60).default(''), status: z.enum(['DISPATCHED', 'RECEIVED', 'RETURNED']),
    receivedQty: nn.optional(), receivedAt: ts.optional(), returnReason: s(300).optional(),
  }),
  plantCosts: z.object({ ...base, plantId: id, month, labour: nn, power: nn, machinery: nn, maintenance: nn, overhead: nn }),
  stockpiles: z.object({ ...base, date, plantId: id, materialId: id, physicalQty: nn }),
  measurements: z.object({ ...base, date, siteId: id, boqItemId: id, chainage: s(200).default(''), length: nn.default(0), breadth: nn.default(0), depth: nn.default(0), nos: nn.default(0), qty: nn, mbNo: s(60).default('') }),
  raBills: z.object({
    ...base, no: s(60), seq: z.number().int().min(1), date, siteId: id,
    lines: z.array(z.object({ boqItemId: id, uptoQty: nn, prevQty: nn, thisQty: nn, rate: nn })).max(500), gstPct: pct,
    deductions: z.object({ securityDeposit: nn, retention: nn, tds: nn, cess: nn, gstTds: nn, royalty: nn, advanceRecovery: nn, materialRecovery: nn, penalty: nn }),
    status: z.enum(['DRAFT', 'SUBMITTED', 'CERTIFIED', 'PARTLY_PAID', 'PAID']), receipts: z.array(z.object({ date, amount: nn, utr: s(60) })).max(100), escalation: nn.optional(),
  }),
  roles: z.object({
    id, name: s(100), description: s(300).default(''),
    perms: rec(z.array(z.enum(['view', 'add', 'edit', 'delete', 'approve'])).max(5)),
    ratesVisible: z.boolean(), allSites: z.boolean(), approvalLimit: z.union([z.number().min(0), z.null()]).transform((v) => (v === null ? Infinity : v)),
  }),
  users: z.object({
    id, name: s(100), username: z.string().regex(/^[a-z0-9._-]{3,40}$/i, 'username: 3–40 letters, digits, . _ -'), phone: s(20), email: s(120).default(''), roleId: id,
    siteIds: z.array(id).max(200).default([]), plantIds: z.array(id).max(50).default([]), active: z.boolean().default(true), twoFactor: z.boolean().optional(), lastLogin: ts.optional(),
  }),
  audit: z.never(),
  notifications: z.object({ id, at: ts, title: s(200), body: s(1000), link: s(200), read: z.boolean(), tone: z.enum(['info', 'warn', 'bad', 'good']), userId: optId }),
};

export const settingsSchema = z.object({
  approvalLimits: z.object({ po: nn, issue: nn, expense: nn, fuel: nn }).partial(),
  backdateDays: z.number().int().min(0).max(365),
  editLockDays: z.number().int().min(0).max(365),
  tolerance: z.object({ default: pct, cement: pct, steel: pct, bitumen: pct, fuel: pct, plant: pct, dispatch: pct }).partial(),
  valuation: z.enum(['WAVG', 'FIFO']),
  excludePendingFromCost: z.boolean(),
  attendanceLockHour: z.number().int().min(0).max(23),
  allowNegativeOverride: z.boolean(),
  sessionTimeoutMin: z.number().int().min(5).max(24 * 60),
  notify: z.object({ sms: z.boolean(), whatsapp: z.boolean(), email: z.boolean() }).partial(),
  overheadBasis: z.enum(['EQUAL', 'CONTRACT', 'BILLING', 'MANUAL']),
}).partial();

export const companySchema = z.object({
  name: s(200), gstin: s(15), pan: s(10), address: s(500), phone: s(30), email: s(120), fy: s(10),
  banks: z.array(z.object({ bank: s(200), account: s(40), ifsc: s(20) })).max(10),
}).partial();

/** human-readable first error */
export function zodMessage(e: z.ZodError): string {
  const i = e.issues[0];
  if (!i) return 'Invalid data';
  return `${i.path.join('.') || 'record'}: ${i.message}`;
}

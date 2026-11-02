/* Domain model — every entity is tagged to a site, store or plant (spec §2). */

export type ID = string;
export type Status = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT_BACK' | 'CANCELLED';

export interface Base {
  id: ID;
  createdAt: string;
  createdBy: ID;
  active?: boolean;
}

/* ---------------- Masters (§3) ---------------- */

export interface Company {
  name: string;
  gstin: string;
  pan: string;
  address: string;
  phone: string;
  email: string;
  fy: string;
  banks: Array<{ bank: string; account: string; ifsc: string }>;
}

/* ---------- firms (PF-04): one login, more than one contracting firm ---------- */
export interface BankAccount {
  bank: string;
  account: string;
  ifsc: string;
  branch?: string;
}
export interface Firm extends Base {
  /** short code used in numbers, e.g. "SD" → SD/2026-27/001 */
  code: string;
  legalName: string;
  /** trade name, e.g. "M/s Saurajit Deb" (plant invoices) */
  tradeName: string;
  constitution: 'PROPRIETOR' | 'PARTNERSHIP' | 'LLP' | 'COMPANY';
  gstin: string;
  gstRegType?: string;
  gstLiableFrom?: string;
  pan: string;
  tan: string;
  udyam: string;
  enlistment: { dept: string; no: string; cls: string; limit: number; validTo: string };
  /** principal place of business */
  address: string;
  /** additional places of business registered under GST */
  places: Array<{ name: string; address: string }>;
  contactName: string;
  phone: string;
  email: string;
  labourLicence: { no: string; authority: string; validTo: string; note: string };
  epfCode: string;
  esicCode: string;
  banks: BankAccount[];
  /** small images as data URLs, printed on letters, bills and invoices */
  logo?: string;
  signature?: string;
  /** e.g. "SD/INV" → SD/INV/2026-27/0001 (a new series each financial year) */
  invoicePrefix: string;
}

/* ---------- deductions made by a client from RA bills (Query 2) ---------- */
export interface DeductionHead {
  head: string;
  pct: number;
  basis: 'GROSS' | 'TAXABLE' | 'FIXED';
  amount?: number;
}
export interface DeductionProfile {
  /** GST TDS (1% CGST + 1% SGST) on taxable value, only above the threshold contract value */
  gstTdsPct: number;
  gstTdsThreshold: number;
  /** income-tax TDS (s.393(1), earlier 194C) */
  itTdsPct: number;
  itTdsOnGst: boolean;
  labourCessPct: number;
  labourCessOnGst: boolean;
  /** kept at 0 today, can be switched on if the law changes */
  tcsPct: number;
  /** royalty, department material, time penalty … */
  others: DeductionHead[];
}
export interface Contact {
  designation: string;
  name: string;
  phone: string;
}
export interface ClientOffice {
  id: ID;
  circle: string;
  division: string;
  subDivision: string;
  address: string;
  email: string;
  gstin: string;
  contacts: Contact[];
}

/* ---------- works (Query 1) ---------- */
export type WorkStage =
  | 'BID_SUBMITTED'
  | 'LOA_RECEIVED'
  | 'AGREEMENT_SIGNED'
  | 'IN_PROGRESS'
  | 'STOPPED'
  | 'PHYSICALLY_COMPLETE'
  | 'FINAL_BILL_SUBMITTED'
  | 'FINAL_BILL_PAID'
  | 'DLP'
  | 'SECURITY_RELEASED'
  | 'CLOSED';
export interface Guarantee {
  amount: number;
  mode: 'BG' | 'FDR' | 'EBG' | 'ONLINE' | 'EXEMPTED' | '';
  bank: string;
  number: string;
  issueDate: string;
  validity: string;
  claimDate: string;
}
export interface Eot {
  letterNo: string;
  date: string;
  newCompletion: string;
  reason: string;
}
export interface WorkAdvance {
  kind: 'MOBILISATION' | 'MACHINERY' | 'SECURED';
  amount: number;
  interestPct: number;
  recoveryPct: number;
}
export interface PriceAdjustment {
  applicable: boolean;
  baseDate: string;
  components: Array<{ name: string; basePrice: number; unit: string; sharePct: number; method?: 'SHARE' | 'QUANTITY' }>;
}

export type SiteStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
export interface Site extends Base {
  code: string;
  name: string;
  short: string;
  clientId: ID;
  workOrderNo: string;
  workOrderDate: string;
  contractValue: number;
  location: string;
  gps: string;
  startDate: string;
  scheduledCompletion: string;
  actualCompletion?: string;
  engineerId?: ID;
  status: SiteStatus;
  securityDeposit: number;
  retentionPct: number;
  gstPct: number;
  workType: 'ROAD' | 'BRIDGE' | 'BUILDING' | 'IRRIGATION';
  budget: Record<CostHead, number>;
  /** cost incurred before go-live (data migration of opening balances) */
  openingCost: Record<CostHead, number>;
  openingAsOf: string;

  /* ---- Query 1 additions (all optional so older records stay valid) ---- */
  firmId?: ID;
  officeId?: ID;
  /** detailed stage; `status` is derived from it */
  stage?: WorkStage;
  tender?: { nitNo: string; nitDate: string; tenderId: string };
  agreementNo?: string;
  agreementDate?: string;
  estimatedCost?: number;
  quoteType?: 'ABOVE' | 'BELOW' | 'PAR' | 'ITEM_RATE';
  quotedPct?: number;
  /** contract value includes GST (else GST is extra) */
  gstIncluded?: boolean;
  district?: string;
  subDivision?: string;
  block?: string;
  chainageFrom?: number;
  chainageTo?: number;
  lengthKm?: number;
  timeAllowedMonths?: number;
  eots?: Eot[];
  clientEngineers?: Contact[];
  supervisorName?: string;
  emd?: Guarantee & { refundDate: string };
  perfSecurity?: Guarantee & { pct: number };
  addlPerfSecurity?: Guarantee;
  /** security deposit: % per bill is `retentionPct` */
  sdCeiling?: number;
  dlpMonths?: number;
  deductions?: DeductionProfile;
  advances?: WorkAdvance[];
  priceAdjustment?: PriceAdjustment;
  ld?: { ratePct: number; per: 'DAY' | 'WEEK' | 'MONTH'; maxPct: number };
  milestones?: Array<{ date: string; targetPct: number; label: string }>;
  plantId?: ID;
  /** figures up to go-live for running works (PF-06) */
  completionCertNo?: string;
  completionCertDate?: string;
  sdReleasedOn?: string;
  openingWorkDone?: number;
  openingBilled?: number;
  openingReceived?: number;
}

export type StoreType = 'CENTRAL' | 'SITE' | 'PLANT';
export interface Store extends Base {
  code: string;
  name: string;
  type: StoreType;
  siteId?: ID;
  plantId?: ID;
  address?: string;
  holds?: string;
  /** Query 3 rule 2: tanks and stockpiles inside the store, with daily dips */
  locations?: Array<{ name: string; materialId: ID; capacity: number; unit: string }>;
}

export type PlantType = 'HOT_MIX' | 'BATCHING' | 'CRUSHER' | 'WMM';
export interface Plant extends Base {
  code: string;
  name: string;
  type: PlantType;
  capacityPerHour: number;
  capacityUnit: string;
  location: string;
  inChargeId?: ID;
  storeId: ID;
  costMode: 'ACTUAL' | 'FIXED';
  fixedRate: Record<ID, number>; // productId -> internal rate
  /* ---- Query 4 additions ---- */
  subType?: 'DRUM_MIX' | 'BATCH_MIX' | '';
  makeModel?: string;
  consentedCapacity?: number;
  consentRef?: string;
  firmId?: ID;
  /** in-charge with effective dates; the latest one applies */
  inCharges?: Array<{ name: string; userId?: ID; from: string }>;
  equipment?: string;
  power?: string;
  burnerFuel?: string;
  /* HMP-02 norms and the materials used as fuel */
  burnerFuelId?: ID;
  dgFuelId?: ID;
  ldoPerMtNorm?: number;
  dieselPerMtNorm?: number;
}

export type MaterialCategory =
  | 'Cement'
  | 'Steel'
  | 'Aggregate'
  | 'Bitumen'
  | 'Sand'
  | 'Bricks'
  | 'Pipes'
  | 'Electrical'
  | 'Consumables'
  | 'Spares'
  | 'Fuel & Lubricants'
  | 'Plant Output'
  | 'Tools & Tackles'
  | 'Others';

export interface Material extends Base {
  code: string;
  name: string;
  category: MaterialCategory;
  unit: string;
  altUnit?: string;
  altFactor?: number; // 1 altUnit = altFactor unit
  hsn: string;
  gstPct: number;
  minStock: number;
  reorderQty: number;
  kind: 'RAW' | 'OUTPUT' | 'BOTH';
  returnable?: boolean; // MAT-15 tools & tackles
  batchTracked?: boolean; // STR-04
  stdRate: number;
  tolerancePct?: number;
}

export interface Supplier extends Base {
  code: string;
  name: string;
  gstin: string;
  pan: string;
  address: string;
  contact: string;
  phone: string;
  bank: string;
  materials: string;
  creditDays: number;
  openingBalance: number;
  kind: 'MATERIAL' | 'FUEL_PUMP' | 'VEHICLE_OWNER' | 'SERVICE';
  /** TDS (Query 2): entity type, TDS section ('' = none), transporter with ≤10 goods carriages and declaration */
  entityType?: PartyEntity;
  tdsCode?: string;
  transporter10?: boolean;
}
export type PartyEntity = 'INDIVIDUAL' | 'HUF' | 'FIRM' | 'LLP' | 'COMPANY' | 'OTHER';

export interface Client extends Base {
  code: string;
  name: string;
  gstin: string;
  address: string;
  billingContact: string;
  /** simple defaults used by billing; kept in step with `deductions` */
  tdsPct: number;
  retentionPct: number;
  cessPct: number;
  kind?: 'GOVT' | 'LOCAL_BODY' | 'PRIVATE' | 'BUYER';
  email?: string;
  phone?: string;
  offices?: ClientOffice[];
  deductions?: DeductionProfile;
}

export interface SubContractor extends Base {
  code: string;
  name: string;
  kind: 'LABOUR_CONTRACTOR' | 'SUB_CONTRACTOR';
  pan: string;
  gstin: string;
  trade: string;
  rateType: 'PER_DAY' | 'PER_UNIT' | 'LUMP_SUM';
  bank: string;
  phone: string;
  openingBalance: number;
  licenceNo?: string;
  licenceExpiry?: string;
  pfNo?: string;
  esiNo?: string;
  bocwNo?: string;
  tradeRates: Record<string, number>; // trade -> daily rate (labour contractor)
  entityType?: PartyEntity;
  tdsCode?: string;
}

export type Trade = 'Mason' | 'Helper' | 'Carpenter' | 'Bar Bender' | 'Operator' | 'Driver' | 'Electrician' | 'Supervisor';
export interface Worker extends Base {
  code: string;
  name: string;
  phone: string;
  aadhaar: string; // stored masked
  trade: Trade;
  wageRate: number;
  otRate: number;
  ownership: 'OWN' | 'CONTRACTOR';
  contractorId?: ID;
  siteId: ID;
  upi: string;
  joiningDate: string;
  /* LAB-01 / LAB-03 / LAB-04 */
  fatherName?: string;
  gender?: 'M' | 'F' | 'O';
  dob?: string;
  address?: string;
  bankAccount?: string;
  ifsc?: string;
  uan?: string;
  pfMember?: boolean;
  esiMember?: boolean;
  esicNo?: string;
  leftOn?: string;
}

export type VehicleType =
  | 'Tipper'
  | 'Transit Mixer'
  | 'JCB'
  | 'Excavator'
  | 'Roller'
  | 'Paver'
  | 'Grader'
  | 'Tanker'
  | 'Car'
  | 'Generator'
  | 'Loader'
  | 'Paver Finisher'
  | 'Compactor'
  | 'Mobile Hot Mix'
  | 'Bitumen Sprayer'
  | 'Sweeper'
  | 'Road Cleaner'
  | 'Marking Machine'
  | 'Concrete Mixer'
  | 'Tractor'
  | 'Other';

export interface VehicleDoc {
  type: 'Insurance' | 'Fitness' | 'Permit' | 'PUC' | 'Road Tax' | 'Driver Licence';
  number: string;
  expiry: string;
}

export interface Vehicle extends Base {
  code: string;
  regNo: string;
  type: VehicleType;
  make: string;
  model: string;
  year: number;
  ownership: 'OWNED' | 'HIRED';
  ownerName?: string;
  ownerSupplierId?: ID;
  hireBasis?: 'PER_HOUR' | 'PER_DAY' | 'PER_MONTH' | 'PER_TRIP' | 'PER_KM';
  hireRate?: number;
  hireWithFuel?: boolean;
  minGuaranteedHours?: number;
  fuelType: 'HSD' | 'Petrol';
  tankCapacity: number;
  meterType: 'KM' | 'HOURS' | 'BOTH';
  stdKmpl?: number;
  stdLph?: number;
  driver: string;
  siteId?: ID;
  docs: VehicleDoc[];
  serviceEvery: number; // km or hours
  lastServiceAt: number;
  internalRate: number; // VEH-05 per hour/km
  emi: number;
  driverSalary: number;
  status: 'WORKING' | 'IDLE' | 'BREAKDOWN';
}

export interface FuelSource extends Base {
  code: string;
  name: string;
  type: 'OWN_TANK' | 'BOWSER' | 'OUTSIDE_PUMP';
  capacity: number;
  siteId?: ID;
  supplierId?: ID;
}

export interface ExpenseHead extends Base {
  head: string;
  subHead: string;
}

export interface UnitDef {
  id: ID;
  code: string;
  name: string;
  base?: string;
  factor?: number;
}

export interface Recipe extends Base {
  code: string;
  name: string;
  productId: ID; // plant output material or a work item description
  siteId?: ID; // PLT-07 site-specific job mix
  perUnit: string;
  lines: Array<{ materialId: ID; qty: number }>;
  /** crusher split (PLT-08): output material -> % */
  split?: Array<{ materialId: ID; pct: number }>;
}

export interface BoqItem extends Base {
  siteId: ID;
  itemNo: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  recipeId?: ID;
  isExtra?: boolean;
  approvalRef?: string;
  /** BIL-01: rate in the department's estimate; `rate` is the contract rate after the tendered % */
  estRate?: number;
  /** BIL-04: rate analysis of an extra item */
  rateAnalysis?: string;
  approvalDate?: string;
}

/* ---------------- Inventory (§4, §5) ---------------- */

export type StockTxnType =
  | 'OPENING' // MAT-09
  | 'ISSUE' // central store -> site / plant / vehicle (STR-01) ; receipt at site (MAT-01)
  | 'GRN' // MAT-02 / PUR-04
  | 'PLANT_RECEIPT' // MAT-03 (generated from dispatch receipt)
  | 'CONSUMPTION' // MAT-04
  | 'TRANSFER' // MAT-05 site->site
  | 'RETURN' // MAT-06
  | 'WASTAGE' // MAT-07
  | 'ADJUSTMENT'; // MAT-08

export interface StockLine {
  materialId: ID;
  qty: number; // in base unit; negative allowed only for ADJUSTMENT
  rate: number;
  enteredQty?: number;
  enteredUnit?: string;
  orderedQty?: number;
  rejectedQty?: number;
  rejectReason?: string;
  systemQty?: number; // adjustment
  physicalQty?: number;
  batchNo?: string;
}

export interface StockTxn extends Base {
  no: string;
  type: StockTxnType;
  date: string;
  fromStoreId?: ID;
  toStoreId?: ID;
  lines: StockLine[];
  status: Status | 'IN_TRANSIT' | 'POSTED';
  supplierId?: ID;
  poId?: ID;
  challanNo?: string;
  vehicleNo?: string;
  weighbridgeSlip?: string;
  receivedBy?: string;
  boqItemId?: ID;
  workDone?: string;
  location?: string;
  reason?: string;
  condition?: string;
  issueToVehicleId?: ID;
  subContractorId?: ID;
  dispatchId?: ID;
  remark?: string;
  photos?: number;
  receivedAt?: string;
  approvalNote?: string;
  /** PUR-01/02: tanker / truck receipt details */
  receipt?: GoodsReceipt;
}
export interface GoodsReceipt {
  /** quantity on the supplier's invoice / challan (to find the shortage) */
  invoiceQty?: number;
  weighGross?: number;
  weighTare?: number;
  temperature?: number;
  /** tank stock by dip before and after unloading */
  dipBefore?: number;
  dipAfter?: number;
  tankerNo?: string;
  depot?: string;
  royaltyPassNo?: string;
  passPhotos?: number;
}

/* ---------------- Purchase (§5) ---------------- */

export interface Requisition extends Base {
  no: string;
  date: string;
  storeId: ID;
  requiredBy: string;
  purpose: string;
  lines: Array<{ materialId: ID; qty: number }>;
  status: Status | 'ORDERED';
}

export interface Quotation extends Base {
  no: string;
  date: string;
  requisitionId?: ID;
  materialId: ID;
  qty: number;
  quotes: Array<{ supplierId: ID; rate: number; deliveryDays: number; terms: string }>;
  selectedSupplierId?: ID;
}

export interface POLine {
  materialId: ID;
  qty: number;
  rate: number;
  gstPct: number;
}
export interface PurchaseOrder extends Base {
  no: string;
  date: string;
  supplierId: ID;
  deliveryStoreId: ID;
  requisitionId?: ID;
  lines: POLine[];
  deliveryTerms: string;
  paymentTerms: string;
  status: Status | 'OPEN' | 'PARTIAL' | 'CLOSED';
}

export interface PurchaseInvoice extends Base {
  no: string;
  supplierInvoiceNo: string;
  date: string;
  supplierId: ID;
  poId?: ID;
  grnIds: ID[];
  storeId: ID;
  lines: POLine[];
  dueDate: string;
  /** PUR-03: GST input credit eligible or blocked */
  itc?: 'ELIGIBLE' | 'BLOCKED';
  itcReason?: string;
}

export type PayMode = 'BANK' | 'CHEQUE' | 'UPI' | 'CASH';
export interface Payment extends Base {
  no: string;
  date: string;
  partyType: 'SUPPLIER' | 'SUBCON' | 'WORKER';
  partyId: ID;
  amount: number;
  tds: number;
  mode: PayMode;
  ref: string;
  kind: 'FULL' | 'PART' | 'ADVANCE';
  siteId?: ID;
  remark?: string;
  /** TDS rule applied (section code and rate) */
  tdsCode?: string;
  tdsRate?: number;
}

export interface DebitNote extends Base {
  no: string;
  date: string;
  supplierId: ID;
  grnId?: ID;
  materialId: ID;
  qty: number;
  rate: number;
  reason: string;
}

/* ---------------- Labour (§6) ---------------- */

export type AttStatus = 'P' | 'A' | 'H';
export interface Attendance extends Base {
  date: string;
  siteId: ID;
  workerId?: ID; // own labour (LAB-02)
  status?: AttStatus;
  otHours: number;
  contractorId?: ID; // headcount mode
  trade?: Trade;
  headcount?: number;
  photo?: boolean;
  gps?: string;
  locked?: boolean;
}

export interface LabourAdvance extends Base {
  date: string;
  siteId: ID;
  workerId?: ID;
  contractorId?: ID;
  amount: number;
  mode: PayMode;
  remark: string;
}

export interface WageRun extends Base {
  no: string;
  siteId: ID;
  frequency: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
  from: string;
  to: string;
  lines: Array<{
    workerId: ID;
    days: number;
    otHours: number;
    gross: number;
    advance: number;
    deduction: number;
    net: number;
  }>;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  paidMode?: PayMode;
}

export interface WorkOrder extends Base {
  no: string;
  date: string;
  subContractorId: ID;
  siteId: ID;
  lines: Array<{ boqItemId: ID; qty: number; rate: number }>;
  start: string;
  end: string;
  retentionPct: number;
  tdsPct: number;
  status: 'ACTIVE' | 'CLOSED';
}

export interface SubconBill extends Base {
  no: string;
  date: string;
  workOrderId: ID;
  lines: Array<{ boqItemId: ID; qty: number; rate: number }>;
  materialRecovery: number;
  advanceRecovery: number;
  penalty: number;
  status: Status | 'PAID';
}

/* ---------------- Expenses (§7) ---------------- */

export interface Imprest extends Base {
  no: string;
  date: string;
  siteId: ID;
  amount: number;
  kind: 'IMPREST' | 'TOPUP_REQUEST';
  mode: PayMode;
  remark: string;
  status: Status;
}

export interface Expense extends Base {
  no: string;
  date: string;
  siteId: ID;
  headId: ID;
  amount: number;
  paidTo: string;
  mode: PayMode;
  billNo: string;
  remark: string;
  photo: boolean;
  status: Status;
}

export interface Overhead extends Base {
  month: string; // yyyy-mm
  head: string;
  amount: number;
  basis: 'EQUAL' | 'CONTRACT' | 'BILLING' | 'MANUAL';
  manual?: Record<ID, number>;
}

/* ---------------- Fleet (§8) ---------------- */

export interface FuelPurchase extends Base {
  no: string;
  date: string;
  sourceId: ID;
  supplierId: ID;
  litres: number;
  rate: number;
  invoiceNo: string;
  dipBefore: number;
  dipAfter: number;
}

export interface FuelIssue extends Base {
  no: string;
  date: string;
  time: string;
  vehicleId: ID;
  driver: string;
  siteId: ID;
  sourceId: ID;
  litres: number;
  rate: number;
  odometer?: number;
  hourMeter?: number;
  fullTank: boolean;
  slipPhoto: boolean;
  meterPhoto: boolean;
  status: Status;
  flag?: string;
}

export interface DipReading extends Base {
  date: string;
  sourceId: ID;
  litres: number;
}

export interface LogEntry extends Base {
  date: string;
  vehicleId: ID;
  siteId: ID;
  driver: string;
  openKm?: number;
  closeKm?: number;
  openHr?: number;
  closeHr?: number;
  trips: number;
  route: string;
  material?: string;
  materialQty?: number;
  idleHours: number;
  idleReason?: 'Breakdown' | 'No work' | 'Rain' | 'No operator' | '';
  split?: Array<{ siteId: ID; share: number }>; // VEH-02
  /** FLT-03: each trip, charged to its work */
  tripRows?: TripRow[];
  /** FLT-04: working for an outside party on hire (not charged to works) */
  hiredOut?: boolean;
  /** FLT-02: imported from Tata Fleet Edge */
  source?: 'MANUAL' | 'FLEET_EDGE';
  fuelLitres?: number;
}
export interface TripRow {
  siteId: ID;
  material: string;
  from: string;
  to: string;
  qty: number;
  unit: string;
  chainage: string;
}

export interface JobCard extends Base {
  no: string;
  date: string;
  /** a vehicle / machine, or plant equipment (HMP-07) */
  vehicleId?: ID;
  plantId?: ID;
  equipment?: string;
  type: 'SERVICE' | 'BREAKDOWN' | 'REPAIR';
  complaint: string;
  workDone: string;
  sparesCost: number;
  labourCost: number;
  downtimeHours: number;
  meterAt: number;
  closed: boolean;
}

export interface TyreRecord extends Base {
  vehicleId: ID;
  kind: 'TYRE' | 'BATTERY';
  serial: string;
  position: string;
  fitDate: string;
  meterAtFit: number;
  removedDate?: string;
  removedMeter?: number;
  reason?: string;
  cost: number;
}

/* ---------------- Plant (§9) ---------------- */

export interface Production extends Base {
  no: string;
  date: string;
  shift: 'DAY' | 'NIGHT';
  plantId: ID;
  productId: ID;
  recipeId: ID;
  qty: number;
  runHours: number;
  startMeter: number;
  stopMeter: number;
  dgUnits: number;
  fuelUsed: number;
  operator: string;
  actual?: Array<{ materialId: ID; qty: number }>; // PLT-06 override
  rejectedQty: number;
  rejectReason?: string;
  /* HMP-01 */
  startTime?: string;
  stopTime?: string;
  mixTemp?: number;
  dgHours?: number;
  lotNo?: string;
}

export interface Dispatch extends Base {
  no: string;
  date: string;
  time: string;
  plantId: ID;
  productId: ID;
  qty: number;
  vehicleId: ID;
  driver: string;
  siteId?: ID;
  toPlantId?: ID; // crusher output sent to another plant
  customer?: string; // PLT-12 outside sale
  saleRate?: number;
  boqItemId?: ID;
  chainage: string;
  temperature?: number;
  weighbridgeSlip: string;
  status: 'DISPATCHED' | 'RECEIVED' | 'RETURNED';
  /* HMP-03 challan: weighbridge, site confirmation */
  tare?: number;
  gross?: number;
  buyerId?: ID;
  arrivalTime?: string;
  arrivalTemp?: number;
  salesInvoiceId?: ID;
  receivedQty?: number;
  receivedAt?: string;
  returnReason?: string;
}

export interface PlantCost extends Base {
  plantId: ID;
  month: string;
  labour: number;
  power: number;
  machinery: number;
  maintenance: number;
  overhead: number;
  /* HMP-05 */
  depreciation?: number;
  interest?: number;
}

export interface StockpileReading extends Base {
  date: string;
  plantId: ID;
  materialId: ID;
  physicalQty: number;
}

/* ---------------- Contract & billing (§10) ---------------- */

export interface Measurement extends Base {
  date: string;
  siteId: ID;
  boqItemId: ID;
  chainage: string;
  length: number;
  breadth: number;
  depth: number;
  nos: number;
  qty: number;
  mbNo: string;
  /** BIL-02: a deduction entry (openings, overlaps) — its quantity is subtracted */
  deduction?: boolean;
  remarks?: string;
  photos?: number;
  /** JE check status */
  jeStatus?: 'PENDING' | 'CHECKED' | 'QUERY';
  jeRemark?: string;
  jeAt?: string;
}

export type BillStatus = 'DRAFT' | 'SUBMITTED' | 'CERTIFIED' | 'PARTLY_PAID' | 'PAID';
/** one deduction on a bill, with how it was worked out */
export interface BillDeduction {
  code: string;
  head: string;
  pct: number;
  base: number;
  amount: number;
  note?: string;
}
/** BIL-05: one price adjustment component on a bill */
export interface PaLine {
  name: string;
  method: 'SHARE' | 'QUANTITY';
  basePrice: number;
  currentPrice: number;
  sharePct: number;
  qty: number;
  amount: number;
}
export interface RaBill extends Base {
  no: string;
  seq: number;
  date: string;
  siteId: ID;
  lines: Array<{ boqItemId: ID; uptoQty: number; prevQty: number; thisQty: number; rate: number }>;
  gstPct: number;
  deductions: {
    securityDeposit: number;
    retention: number;
    tds: number;
    cess: number;
    gstTds: number;
    royalty: number;
    advanceRecovery: number;
    materialRecovery: number;
    penalty: number;
  };
  status: BillStatus;
  receipts: Array<{ date: string; amount: number; utr: string }>;
  escalation?: number;
  /* ---- Phase 2 ---- */
  kind?: 'RA' | 'FINAL';
  /** itemised deductions from the work's profile (replaces `deductions` when present) */
  ded?: BillDeduction[];
  priceAdj?: PaLine[];
  firmId?: ID;
  /** GST tax invoice no. from the firm's series (BIL-08) */
  invoiceNo?: string;
  /** BIL-06 tracking */
  submittedOn?: string;
  passedOn?: string;
  passedGross?: number;
  /** deductions as actually made by the division, per code */
  actualDed?: Array<{ code: string; amount: number }>;
  remarks?: string;
}

/* ---------------- Guarantees and deposits (SEC-01…04) ---------------- */
export type GuaranteeKind = 'EMD' | 'PS' | 'APS' | 'SD' | 'ADVANCE' | 'OTHER';
export interface GuaranteeRec extends Base {
  kind: GuaranteeKind;
  instrument: 'BG' | 'EBG' | 'FDR' | 'DD' | 'ONLINE' | 'CASH';
  number: string;
  bank: string;
  branch: string;
  amount: number;
  issueDate: string;
  expiryDate: string;
  claimDate: string;
  siteId?: ID;
  tenderRef?: string;
  beneficiary: string;
  status: 'ACTIVE' | 'EXTENDED' | 'RELEASED' | 'ENCASHED';
  /** margin kept with the bank against a BG */
  marginPct: number;
  extensions: Array<{ date: string; expiry: string; claim: string; letterNo: string }>;
  releasedOn?: string;
  remarks: string;
}
export interface BankFacility extends Base {
  bank: string;
  branch: string;
  bgLimit: number;
  /** default margin % on new BGs */
  marginPct: number;
  /** FDRs kept under lien with the bank (other than those in the register) */
  fdrUnderLien: number;
  remarks: string;
}

/* ---------------- Tax credits received (BIL-09) ---------------- */
export interface TaxCredit extends Base {
  /** GSTR-7A = GST TDS certificate; AS26 = income-tax TDS in Form 26AS / AIS */
  kind: 'GSTR7A' | 'AS26';
  date: string;
  deductor: string;
  deductorId: string;
  amount: number;
  /** taxable value / amount paid on which it was deducted */
  base: number;
  certNo: string;
  billId?: ID;
  siteId?: ID;
}

/* ---------------- TDS on payments we make (Query 2) ---------------- */
export interface TdsSection {
  code: string;
  label: string;
  /** individual / HUF */
  rateInd: number;
  /** firm, LLP, company */
  rateOther: number;
  rateNoPan: number;
  /** TDS applies when one payment is above this … */
  single: number;
  /** … or the year's total to the party is above this */
  annual: number;
}

/* ---------------- Admin ---------------- */

export type ModuleKey =
  | 'dashboard'
  | 'masters'
  | 'inventory'
  | 'purchase'
  | 'labour'
  | 'expenses'
  | 'fleet'
  | 'plant'
  | 'contract'
  | 'reports'
  | 'approvals'
  | 'alerts'
  | 'admin';

export type Perm = 'view' | 'add' | 'edit' | 'delete' | 'approve';

export interface Role {
  id: ID;
  name: string;
  description: string;
  perms: Record<ModuleKey, Perm[]>;
  ratesVisible: boolean;
  allSites: boolean;
  approvalLimit: number;
}

export interface User {
  id: ID;
  name: string;
  username: string;
  phone: string;
  email: string;
  roleId: ID;
  siteIds: ID[];
  plantIds: ID[];
  active: boolean;
  twoFactor?: boolean;
  lastLogin?: string;
}

export interface Settings {
  approvalLimits: { po: number; issue: number; expense: number; fuel: number };
  backdateDays: number;
  editLockDays: number;
  tolerance: { default: number; cement: number; steel: number; bitumen: number; fuel: number; plant: number; dispatch: number };
  valuation: 'WAVG' | 'FIFO';
  excludePendingFromCost: boolean;
  attendanceLockHour: number;
  allowNegativeOverride: boolean;
  sessionTimeoutMin: number;
  notify: { sms: boolean; whatsapp: boolean; email: boolean };
  overheadBasis: 'EQUAL' | 'CONTRACT' | 'BILLING' | 'MANUAL';
  /** Query 2: TDS master and on/off per financial year */
  tds?: { enabledFy: Record<string, boolean>; sections: TdsSection[] };
  /** ACC-03: Tally company and ledger names */
  tally?: { company: string; ledgers: Record<string, string> };
  /** LAB-05: minimum wage per day by trade */
  minWages?: Record<string, number>;
}

export interface AuditEntry {
  id: ID;
  at: string;
  userId: ID;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'CANCEL' | 'LOGIN' | 'DEACTIVATE';
  entity: string;
  entityId: ID;
  label: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface Notification {
  id: ID;
  at: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  tone: 'info' | 'warn' | 'bad' | 'good';
  /** recipient; empty = everyone */
  userId?: ID;
}

export type CostHead = 'MATERIAL' | 'LABOUR' | 'SUBCONTRACT' | 'VEHICLE' | 'MISC' | 'OVERHEAD';

export interface DB {
  version: number;
  seededOn: string;
  company: Company;
  firms: Firm[];
  sites: Site[];
  stores: Store[];
  plants: Plant[];
  materials: Material[];
  suppliers: Supplier[];
  clients: Client[];
  subcons: SubContractor[];
  workers: Worker[];
  vehicles: Vehicle[];
  fuelSources: FuelSource[];
  expenseHeads: ExpenseHead[];
  units: UnitDef[];
  recipes: Recipe[];
  boq: BoqItem[];
  stockTxns: StockTxn[];
  requisitions: Requisition[];
  quotations: Quotation[];
  pos: PurchaseOrder[];
  invoices: PurchaseInvoice[];
  payments: Payment[];
  debitNotes: DebitNote[];
  attendance: Attendance[];
  advances: LabourAdvance[];
  wageRuns: WageRun[];
  workOrders: WorkOrder[];
  subconBills: SubconBill[];
  imprests: Imprest[];
  expenses: Expense[];
  overheads: Overhead[];
  fuelPurchases: FuelPurchase[];
  fuelIssues: FuelIssue[];
  dips: DipReading[];
  logs: LogEntry[];
  jobCards: JobCard[];
  tyres: TyreRecord[];
  production: Production[];
  dispatches: Dispatch[];
  plantCosts: PlantCost[];
  stockpiles: StockpileReading[];
  measurements: Measurement[];
  raBills: RaBill[];
  guarantees: GuaranteeRec[];
  bankFacilities: BankFacility[];
  taxCredits: TaxCredit[];
  tankDips: TankDip[];
  salesInvoices: SalesInvoice[];
  labTests: LabTest[];
  safety: SafetyRec[];
  siteRegisters: SiteRegister[];
  dprs: Dpr[];
  hireOuts: HireOut[];
  loans: Loan[];
  subsidyClaims: SubsidyClaim[];
  roles: Role[];
  users: User[];
  settings: Settings;
  audit: AuditEntry[];
  notifications: Notification[];
  seq: Record<string, number>;
}

export type CollectionKey = {
  [K in keyof DB]: DB[K] extends Array<{ id: string }> ? K : never;
}[keyof DB];

/* ================= Phase 3 (Operations) ================= */

/** Query 3 rule 2 / Phase 3 test 1: physical stock of a tank or stockpile */
export interface TankDip extends Base {
  date: string;
  storeId: ID;
  materialId: ID;
  location: string;
  /** reading as taken (cm / m), for the record */
  reading?: number;
  qty: number;
  remarks: string;
}

/** HMP-04: hot mix sold to an outside buyer */
export interface SalesInvoice extends Base {
  no: string;
  date: string;
  firmId?: ID;
  buyerId: ID;
  plantId: ID;
  dispatchIds: ID[];
  lines: Array<{ productId: ID; description: string; hsn: string; qty: number; unit: string; rate: number; gstPct: number }>;
  eway: { vehicleNo: string; distanceKm: number; transporter: string; transporterId: string; ewbNo: string; ewbDate: string };
  receipts: Array<{ date: string; amount: number; utr: string }>;
  status: 'ISSUED' | 'PARTLY_PAID' | 'PAID' | 'CANCELLED';
  remarks: string;
}

/** HMP-06 / DPR-03: plant lot and site quality tests */
export interface LabTest extends Base {
  date: string;
  kind: 'MARSHALL' | 'BITUMEN_CONTENT' | 'GRADATION' | 'DENSITY' | 'CUBE' | 'FDD' | 'SOIL' | 'OTHER';
  plantId?: ID;
  siteId?: ID;
  productionId?: ID;
  boqItemId?: ID;
  lot: string;
  sampleRef: string;
  lab: string;
  nabl: boolean;
  reportNo: string;
  results: Record<string, number>;
  /** cube tests: cast date, grade and strengths at 7 / 28 days */
  cube?: { castDate: string; grade: string; nos: number; d7?: number; d28?: number };
  pass?: boolean;
  remarks: string;
  photos?: number;
}

/** LAB-07 */
export interface SafetyRec extends Base {
  kind: 'PPE' | 'TOOLBOX' | 'ACCIDENT';
  date: string;
  siteId: ID;
  workerId?: ID;
  item?: string;
  qty?: number;
  topic?: string;
  attendees?: number;
  person?: string;
  injury?: string;
  severity?: 'NEAR_MISS' | 'MINOR' | 'MAJOR' | 'FATAL';
  action?: string;
  reportedTo?: string;
  remarks: string;
}

/** DPR-02: hindrance register and site order book */
export interface SiteRegister extends Base {
  kind: 'HINDRANCE' | 'SITE_ORDER';
  siteId: ID;
  no: string;
  date: string;
  ref: string;
  by: string;
  description: string;
  fromDate?: string;
  toDate?: string;
  compliance: string;
  closedOn?: string;
}

/** DPR-01 */
export interface Dpr extends Base {
  siteId: ID;
  date: string;
  weather: 'CLEAR' | 'CLOUDY' | 'RAIN' | 'HEAVY_RAIN';
  manpower: number;
  manpowerNote: string;
  machines: string;
  materials: string;
  work: Array<{ boqItemId?: ID; description: string; qty: number; unit: string; chainage: string }>;
  remarks: string;
  hindrance: string;
  photos?: number;
}

/** FLT-04: own machine hired out, with a hire bill */
export interface HireOut extends Base {
  no: string;
  date: string;
  vehicleId: ID;
  party: string;
  clientId?: ID;
  from: string;
  to: string;
  basis: 'HOUR' | 'DAY' | 'MONTH' | 'TRIP' | 'KM';
  units: number;
  rate: number;
  gstPct: number;
  receipts: Array<{ date: string; amount: number; utr: string }>;
  status: 'BILLED' | 'PARTLY_PAID' | 'PAID';
  remarks: string;
}

/** HMP-08 / ACC-05: term and vehicle loans with their EMI schedule */
export interface Loan extends Base {
  lender: string;
  kind: 'TERM' | 'VEHICLE' | 'OTHER';
  purpose: string;
  sanctionNo: string;
  sanctionDate: string;
  amount: number;
  ratePct: number;
  /** first EMI date */
  startDate: string;
  tenureMonths: number;
  moratoriumMonths: number;
  /** interest subsidy % of interest (e.g. under TIIPIS) */
  subsidyPct: number;
  vehicleId?: ID;
  plantId?: ID;
}

/** HMP-08: TIIPIS claims — SGST paid in cash on outside sales, and loan interest subsidy */
export interface SubsidyClaim extends Base {
  kind: 'SGST' | 'INTEREST';
  month: string;
  /** SGST on outside sales that month (worked out) / interest paid (worked out) */
  base: number;
  /** SGST actually paid in cash as per GSTR-3B */
  cashPaid: number;
  claimAmount: number;
  loanId?: ID;
  claimRef: string;
  filedOn?: string;
  receivedOn?: string;
  receivedAmount?: number;
  remarks: string;
}

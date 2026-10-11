import { z } from 'zod';
import { LocationType, VoucherStatus, VoucherType, CostHead, PartyType, PlantType, VehicleOwnership, VehicleMeterType } from '../enums.js';

// --- Auth Schemas ---
export const LoginPasswordSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});
export type LoginPasswordDto = z.infer<typeof LoginPasswordSchema>;

export const RequestOtpSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Valid 10-digit Indian mobile number required'),
});
export type RequestOtpDto = z.infer<typeof RequestOtpSchema>;

export const VerifyOtpSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  otp: z.string().length(6),
});
export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

// --- Master Schemas ---

export const CompanySchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(3).max(150),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format').optional().nullable(),
  registeredAddress: z.string().min(5),
  state: z.string().min(2),
  isActive: z.boolean().default(true),
});
export type CompanyDto = z.infer<typeof CompanySchema>;

export const SiteSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(3).max(150),
  clientName: z.string().optional(),
  contractNumber: z.string().optional(),
  locationAddress: z.string().min(3),
  chainageStartKm: z.number().nonnegative().optional(),
  chainageEndKm: z.number().nonnegative().optional(),
  sanctionedBudget: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  isActive: z.boolean().default(true),
});
export type SiteDto = z.infer<typeof SiteSchema>;

export const LocationSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(3).max(150),
  type: z.nativeEnum(LocationType),
  siteId: z.string().uuid().optional().nullable(),
  plantId: z.string().uuid().optional().nullable(),
  currentSiteId: z.string().uuid().optional().nullable(), // For movable Bowser
  address: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type LocationDto = z.infer<typeof LocationSchema>;

export const PlantSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(3).max(150),
  type: z.nativeEnum(PlantType),
  address: z.string().min(3),
  capacityTph: z.number().positive().optional(),
  isActive: z.boolean().default(true),
});
export type PlantDto = z.infer<typeof PlantSchema>;

export const ItemConversionSchema = z.object({
  unitCode: z.string().min(1).max(10),
  conversionFactor: z.string().regex(/^\d+(\.\d{1,4})?$/), // 1 [unitCode] = factor * [baseUnit]
});

export const ItemSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  category: z.string().min(2).max(50),
  baseUnitCode: z.string().min(1).max(10),
  hsnCode: z.string().max(10).optional(),
  reorderLevel: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0'),
  conversions: z.array(ItemConversionSchema).optional().default([]),
  isActive: z.boolean().default(true),
});
export type ItemDto = z.infer<typeof ItemSchema>;

export const SupplierSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN').optional().nullable(),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN').optional().nullable(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().nullable(),
  address: z.string().min(3),
  state: z.string().min(2),
  paymentTermsDays: z.number().int().nonnegative().default(30),
  isActive: z.boolean().default(true),
});
export type SupplierDto = z.infer<typeof SupplierSchema>;

export const ClientSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  department: z.string().optional(), // NHAI, MoRTH, PWD
  address: z.string().min(3),
  state: z.string().min(2),
  isActive: z.boolean().default(true),
});
export type ClientDto = z.infer<typeof ClientSchema>;

export const ExpenseHeadSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  category: z.nativeEnum(CostHead),
  parentHeadId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
});
export type ExpenseHeadDto = z.infer<typeof ExpenseHeadSchema>;

// Additional Master Skeletons
export const SubcontractorSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  pan: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  specialisation: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const WorkerSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  trade: z.string().min(2), // Mason, Barbender, Carpenter, Helper
  aadhaarMasked: z.string().regex(/^XXXX-XXXX-\d{4}$/, 'Format: XXXX-XXXX-1234').optional(),
  dailyWageRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const VehicleSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  registrationNumber: z.string().min(4).max(20),
  assetName: z.string().min(2).max(100),
  ownership: z.nativeEnum(VehicleOwnership),
  meterType: z.nativeEnum(VehicleMeterType),
  standardKmpl: z.string().optional(),
  standardLph: z.string().optional(),
  insuranceExpiryDate: z.string().optional().nullable(),
  fitnessExpiryDate: z.string().optional().nullable(),
  taxTokenExpiryDate: z.string().optional().nullable(),
  pucExpiryDate: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const FuelSourceSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(100),
  isExternalPump: z.boolean().default(false),
  locationId: z.string().uuid().optional().nullable(), // If internal tank/bowser
  supplierId: z.string().uuid().optional().nullable(), // If external pump
  isActive: z.boolean().default(true),
});

export const RecipeSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(100),
  plantType: z.nativeEnum(PlantType),
  outputItemId: z.string().uuid(),
  batchSize: z.string().regex(/^\d+(\.\d{1,4})?$/).default('1'),
  items: z.array(
    z.object({
      rawMaterialItemId: z.string().uuid(),
      standardQtyPerBatch: z.string().regex(/^\d+(\.\d{1,4})?$/),
      tolerancePercent: z.number().nonnegative().default(2),
    }),
  ),
  isActive: z.boolean().default(true),
});

export const BoqItemSchema = z.object({
  companyId: z.string().uuid(),
  siteId: z.string().uuid(),
  itemNumber: z.string().min(1).max(30),
  description: z.string().min(3),
  unitCode: z.string().min(1).max(10),
  tenderQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  tenderRate: z.string().regex(/^\d+(\.\d{1,4})?$/),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  isActive: z.boolean().default(true),
});

// --- Voucher Schemas ---

export const PoLineSchema = z.object({
  itemId: z.string().uuid(),
  enteredQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  enteredUnitCode: z.string().min(1).max(10),
  unitRate: z.string().regex(/^\d+(\.\d{1,4})?$/),
  gstPercent: z.number().nonnegative().default(18),
  remarks: z.string().optional(),
});

export const CreatePoSchema = z.object({
  companyId: z.string().uuid(),
  financialYearId: z.string().uuid(),
  supplierId: z.string().uuid(),
  deliveryLocationId: z.string().uuid(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  remarks: z.string().optional(),
  lines: z.array(PoLineSchema).min(1),
});
export type CreatePoDto = z.infer<typeof CreatePoSchema>;

export const GrnLineSchema = z.object({
  poLineId: z.string().uuid().optional().nullable(),
  itemId: z.string().uuid(),
  receivedQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  acceptedQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  rejectedQty: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0'),
  enteredUnitCode: z.string().min(1).max(10),
  unitRate: z.string().regex(/^\d+(\.\d{1,4})?$/),
  gstPercent: z.number().nonnegative().default(18),
  remarks: z.string().optional(),
});

export const CreateGrnSchema = z.object({
  companyId: z.string().uuid(),
  financialYearId: z.string().uuid(),
  poId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid(),
  locationId: z.string().uuid(), // Receiving central store or site store
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierChallanNo: z.string().min(1),
  supplierChallanDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vehicleNumber: z.string().min(4),
  weighbridgeSlipNo: z.string().optional(),
  grossWeightKg: z.string().optional(),
  tareWeightKg: z.string().optional(),
  netWeightKg: z.string().optional(),
  remarks: z.string().optional(),
  lines: z.array(GrnLineSchema).min(1),
});
export type CreateGrnDto = z.infer<typeof CreateGrnSchema>;

export const TransferIssueLineSchema = z.object({
  itemId: z.string().uuid(),
  enteredQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  enteredUnitCode: z.string().min(1).max(10),
  remarks: z.string().optional(),
});

export const CreateTransferIssueSchema = z.object({
  companyId: z.string().uuid(),
  financialYearId: z.string().uuid(),
  fromLocationId: z.string().uuid(), // e.g., Central Store
  toLocationId: z.string().uuid(), // e.g., Site Store
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vehicleNumber: z.string().min(4),
  driverName: z.string().optional(),
  driverMobile: z.string().optional(),
  challanNo: z.string().min(1),
  remarks: z.string().optional(),
  lines: z.array(TransferIssueLineSchema).min(1),
});
export type CreateTransferIssueDto = z.infer<typeof CreateTransferIssueSchema>;

export const ConfirmTransferReceiptSchema = z.object({
  transferIssueId: z.string().uuid(),
  receivedLocationId: z.string().uuid(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remarks: z.string().optional(),
  lines: z.array(
    z.object({
      transferLineId: z.string().uuid(),
      acceptedQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
      rejectedQty: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0'),
      remarks: z.string().optional(),
    }),
  ).min(1),
});
export type ConfirmTransferReceiptDto = z.infer<typeof ConfirmTransferReceiptSchema>;

export const ConsumptionLineSchema = z.object({
  itemId: z.string().uuid(),
  enteredQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  enteredUnitCode: z.string().min(1).max(10),
  boqItemId: z.string().uuid().optional().nullable(),
  chainageText: z.string().optional(),
  purpose: z.string().optional(),
});

export const CreateConsumptionSchema = z.object({
  companyId: z.string().uuid(),
  financialYearId: z.string().uuid(),
  siteId: z.string().uuid(),
  locationId: z.string().uuid(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workSection: z.string().optional(),
  remarks: z.string().optional(),
  lines: z.array(ConsumptionLineSchema).min(1),
});
export type CreateConsumptionDto = z.infer<typeof CreateConsumptionSchema>;

export const WastageLineSchema = z.object({
  itemId: z.string().uuid(),
  enteredQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  enteredUnitCode: z.string().min(1).max(10),
  reason: z.string().min(3),
});

export const CreateWastageSchema = z.object({
  companyId: z.string().uuid(),
  financialYearId: z.string().uuid(),
  locationId: z.string().uuid(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reasonDescription: z.string().min(5),
  remarks: z.string().optional(),
  lines: z.array(WastageLineSchema).min(1),
});
export type CreateWastageDto = z.infer<typeof CreateWastageSchema>;

export const AdjustmentLineSchema = z.object({
  itemId: z.string().uuid(),
  systemQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  physicalQty: z.string().regex(/^\d+(\.\d{1,4})?$/),
  varianceQty: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
  enteredUnitCode: z.string().min(1).max(10),
  reason: z.string().min(3),
});

export const CreateAdjustmentSchema = z.object({
  companyId: z.string().uuid(),
  financialYearId: z.string().uuid(),
  locationId: z.string().uuid(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remarks: z.string().optional(),
  lines: z.array(AdjustmentLineSchema).min(1),
});
export type CreateAdjustmentDto = z.infer<typeof CreateAdjustmentSchema>;

export const ApprovalActionSchema = z.object({
  voucherId: z.string().uuid(),
  voucherType: z.nativeEnum(VoucherType),
  action: z.enum(['APPROVE', 'REJECT', 'SEND_BACK']),
  remark: z.string().optional(),
});
export type ApprovalActionDto = z.infer<typeof ApprovalActionSchema>;

export const CancelVoucherSchema = z.object({
  reason: z.string().min(5, 'Cancellation reason is mandatory (SEC-03)'),
});
export type CancelVoucherDto = z.infer<typeof CancelVoucherSchema>;

// Reports Filter Schema
export const ReportFilterSchema = z.object({
  companyId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(['json', 'excel', 'pdf']).default('json'),
});
export type ReportFilterDto = z.infer<typeof ReportFilterSchema>;

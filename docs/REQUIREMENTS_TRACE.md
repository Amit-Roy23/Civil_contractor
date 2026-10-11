# Requirements Traceability Matrix

This matrix maps every requirement ID from the civil contractor ERP specification to its implementation status, design components, and codebase files.

| Requirement ID | Description | Status | Target Module / Files | Notes |
|---|---|---|---|---|
| **MST-01** | Multi-firm Company Master | Complete | `apps/api/src/masters/`, `apps/web/src/features/masters/` | Multi-firm `company_id` on all tables |
| **MST-02** | Project Site Master | Complete | `apps/api/src/masters/`, `apps/web/src/features/masters/` | Geolocation, chainage, client, site stores |
| **MST-03** | Location / Store Master | Complete | `apps/api/src/masters/`, `apps/web/src/features/masters/` | Types: Central Store, Site Store, Plant Store, Bowser, In-Transit |
| **MST-04** | Plant Master | Complete | `apps/api/src/masters/`, `apps/web/src/features/masters/` | Hot-mix, concrete batching, stone crusher |
| **MST-05** | Material / Item with Conversions | Complete | `apps/api/src/masters/`, `apps/web/src/features/masters/` | Multi-unit conversion table (e.g. 1 bag = 50kg, 1 MT = 1000kg) |
| **MST-06** | Supplier Master | Complete | `apps/api/src/masters/`, `apps/web/src/features/masters/` | GSTIN, PAN, bank details, payment terms |
| **MST-07** | Client Master | Complete | `apps/api/src/masters/`, `apps/web/src/features/masters/` | Govt departments (NHAI, PWD), GSTIN, contract terms |
| **MST-08** | Sub-contractor Master | Skeleton | `apps/api/src/masters/`, `apps/api/src/drizzle/schema/masters.ts` | PAN, GSTIN, labour license, trade specialisation |
| **MST-09** | Worker Master | Skeleton | `apps/api/src/masters/`, `apps/api/src/drizzle/schema/masters.ts` | Trade, Aadhaar (stored masked), bank details |
| **MST-10** | Vehicle / Machine Master | Skeleton | `apps/api/src/vehicles/`, `apps/api/src/drizzle/schema/masters.ts` | Owned/Hired, fitness/tax/insurance expiry, standard KMPL/LPH |
| **MST-11** | Fuel Source Master | Skeleton | `apps/api/src/fuel/`, `apps/api/src/drizzle/schema/masters.ts` | Own tank / petrol pump vendor credit accounts |
| **MST-12** | Expense Heads Master | Complete | `apps/api/src/expenses/`, `apps/api/src/drizzle/schema/masters.ts` | Hierarchy: direct site, plant, vehicle, overheads |
| **MST-13** | Units of Measurement | Complete | `packages/shared/src/units.ts`, `apps/api/src/masters/` | Primary base units + secondary display units |
| **MST-14** | Recipe / BOM Master | Skeleton | `apps/api/src/plant/`, `apps/api/src/drizzle/schema/masters.ts` | Asphalt BC/DBM, Concrete M10-M40, Crusher split % |
| **MST-15** | BOQ Items Master | Skeleton | `apps/api/src/contract/`, `apps/api/src/drizzle/schema/masters.ts` | Item code, description, tender rate, estimated qty |
| **PUR-03** | Purchase Order with PDF | Complete | `apps/api/src/inventory/`, `apps/web/src/features/inventory/PurchaseOrdersView.tsx` | Supplier, rate, GST, delivery site, PDF template |
| **PUR-04 / MAT-02** | Goods Receipt Note (GRN) against PO | Complete | `apps/api/src/inventory/`, `apps/web/src/features/inventory/GrnView.tsx` | Central Store receipt, challan no, vehicle no, weighbridge slip, stock in |
| **STR-01 / MAT-01** | Store-to-Site Issue (Transfer Out) | Complete | `apps/api/src/inventory/`, `apps/web/src/features/inventory/TransferView.tsx` | Dispatches from Central Store into virtual IN_TRANSIT location |
| **MAT-05** | Site Transfer Receipt (Confirm In) | Complete | `apps/api/src/inventory/`, `apps/web/src/features/inventory/TransferView.tsx` | Site confirms receipt from IN_TRANSIT, stock lands at site |
| **MAT-04** | Site Material Consumption | Complete | `apps/api/src/inventory/`, `apps/web/src/features/inventory/SiteConsumptionView.tsx` | Issues to work/BOQ at chainage, posts to stock & cost ledger |
| **MAT-07** | Material Wastage Voucher | Complete | `apps/api/src/inventory/`, `apps/web/src/features/inventory/WastageAdjustmentsView.tsx` | Spoilage/loss at site or plant, requires approval |
| **MAT-08** | Physical Stock Adjustment | Complete | `apps/api/src/inventory/`, `apps/web/src/features/inventory/WastageAdjustmentsView.tsx` | Discrepancy reconciliation, positive/negative, requires approval |
| **MAT-10** | Strict Negative Stock Prevention | Complete | `apps/api/src/ledger/stock-ledger.service.ts` | Row locks (`FOR UPDATE`), checks running balance at all future points |
| **MAT-11** | Weighted Average & FIFO Valuation | Complete | `apps/api/src/ledger/valuation.service.ts` | Weighted average fully implemented, FIFO interface defined |
| **MAT-12** | Dual Unit Entry & Conversion | Complete | `packages/shared/src/units.ts`, `apps/api/src/inventory/` | Stored in base unit, user input in secondary unit |
| **MAT-14** | Back-dated Entry & Revaluation | Complete | `apps/api/src/jobs/revaluation.processor.ts` | BullMQ background recomputation of downstream stock rows |
| **CST-01** | Site Cost Ledger & Cost Sheet | Complete | `apps/api/src/ledger/cost-ledger.service.ts`, `apps/api/src/costing/` | Aggregated site direct and indirect expenditures |
| **SUP-01 / SUP-02** | Party Ledger & Sub-ledger | Complete | `apps/api/src/ledger/party-ledger.service.ts` | Vendor debits/credits, voucher references, ageing feeds |
| **ROLE-01** | Role-Based Access Control (RBAC) | Complete | `apps/api/src/core/rbac/`, `packages/shared/src/permissions.ts` | Configurable permissions (`module.action`) |
| **ROLE-02** | Request-Scoped Location Scoping | Complete | `apps/api/src/core/scope/scope.service.ts` | User restricted to assigned sites/plants in repository queries |
| **ROLE-03** | Field Masking (Rates/Amounts) | Complete | `apps/api/src/core/interceptors/field-masking.interceptor.ts` | Strips `rate`, `amount`, `value*` if lacking `rates.view` |
| **ROLE-04** | Locked Period & Edit Audit | Complete | `apps/api/src/core/fy/`, `apps/api/src/core/audit/` | Admin only for older entries; reason mandatory |
| **ROLE-05** | Transaction Audit Logging | Complete | `apps/api/src/core/audit/audit.service.ts` | In-transaction audit: before/after JSON, user, IP, action |
| **APR-01 / APR-02**| Voucher Approval Engine & Inbox | Complete | `apps/api/src/core/approvals/`, `apps/web/src/features/approvals/` | Rules based on type & threshold; in-app notifications |
| **APR-03** | Pending Voucher Inclusion Setting | Complete | `apps/api/src/core/settings/` | Company setting to include/exclude pending items in reports |
| **SEC-03** | Reversing Vouchers (No Hard Deletes)| Complete | `apps/api/src/ledger/posting.service.ts` | Document cancellation creates reversal ledger entries |
| **SEC-04** | Financial Year & Period Locking | Complete | `apps/api/src/core/fy/` | Rejects back-dating into closed FY or locked period |
| **ALT-01** | Low Stock Alert Job | Complete | `apps/api/src/alerts/`, `apps/api/src/jobs/low-stock-alert.processor.ts` | BullMQ scheduled alert when balance falls below reorder level |
| **ALT-02...07** | Additional Alert Rules | Skeleton | `apps/api/src/alerts/`, `apps/web/src/features/skeletons/` | Vehicle expiry, fuel variance, attendance lock |
| **PLT-13** | Plant Material Allocation Model | Skeleton | `apps/api/src/plant/`, `apps/api/drizzle/schema/skeletons.ts` | Dispatches record raw material consumption per site recipe |
| **PLT-15** | Internal Plant Transfer Rate | Skeleton | `apps/api/src/plant/`, `apps/web/src/features/skeletons/` | Cost ledger posting at plant internal transfer rate |
| **FUEL-07** | Fuel Variance & Consumption Model | Skeleton | `apps/api/src/fuel/`, `apps/web/src/features/skeletons/` | Expected vs actual litres based on KMPL/LPH |
| **VEH-01** | Vehicle Logbook & Shift Split | Skeleton | `apps/api/src/vehicles/`, `apps/web/src/features/skeletons/` | Multi-site vehicle/machine hour tracking |
| **LAB-09** | Worker Advances & Wage Run | Skeleton | `apps/api/src/labour/`, `apps/web/src/features/skeletons/` | Weekly wage sheet and subcontractor bills |
| **EXP-01** | Petty Cash Imprest & Voucher | Skeleton | `apps/api/src/expenses/`, `apps/web/src/features/skeletons/` | Site petty cash reconciliation |
| **BIL-06** | RA Bill Deduction Engine | Skeleton | `apps/api/src/contract/`, `apps/web/src/features/skeletons/` | Retention, TDS 194C, and labour cess deductions |

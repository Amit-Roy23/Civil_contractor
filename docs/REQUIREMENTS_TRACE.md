# Requirements traceability

Every requirement ID in *Works Contract Management Software — Requirements Specification* mapped to where it can be
demonstrated in the web app (`apps/web`) with the built-in sample data, and to the backend (`apps/api`) status.

- **Web** — screen path in the web app. All of these work today in demo mode (data generated in the browser).
- **API** — `Done` = implemented in the NestJS API with tests; `Schema` = tables / controller skeleton only; `—` = not yet in the API.

## 2. Roles, access and approvals

| ID | Requirement | Web | API |
|---|---|---|---|
| ROLE-01 | Admin creates roles; per-module view / add / edit / delete / approve | Administration › Roles & permissions (`/admin/roles`) | Done |
| ROLE-02 | Users limited to sites / plants | Administration › Users; site picker and every list honour it — sign in as *Site Engineer* | Done |
| ROLE-03 | Rates and amounts hidden from selected roles | Role toggle *Rates & amounts visible*; tables show “Rates hidden”, amounts show •••• | Done |
| ROLE-04 | Old or approved entries editable only by Admin with a reason | Back-dating rule on every entry form; cancel voucher (Admin, reason required) | Done |
| ROLE-05 | Audit log: who, when, old value, new value | Administration › Audit log (`/admin/audit`) | Done |
| APR-01 | PO, issues, expenses, fuel above limits need approval | Limits in Administration › Settings; entries above them go to Approvals | Done |
| APR-02 | Approve / reject / send back with remark; notification | Approvals (`/approvals`), bell notifications | Done |
| APR-03 | Unapproved entries pending and excluded from final cost | Setting *Exclude pending entries from final cost*; site cost sheet | Done |

## 3. Masters (`/masters/*`)

| ID | Master | Web | API |
|---|---|---|---|
| MST-01 | Company / firm | Masters › Company | Done |
| MST-02 | Site / project | Masters › Sites | Done |
| MST-03 | Store / godown | Masters › Stores | Done |
| MST-04 | Plant | Masters › Plants | Done |
| MST-05 | Material (alt unit, HSN, GST, min / reorder, raw / output) | Masters › Materials | Done |
| MST-06 | Supplier / vendor | Masters › Suppliers | Done |
| MST-07 | Client / department (TDS, retention) | Masters › Clients | Done |
| MST-08 | Sub-contractor / labour contractor | Masters › Contractors | Schema |
| MST-09 | Worker (Aadhaar stored masked) | Masters › Workers | Schema |
| MST-10 | Vehicle / machine with documents | Masters › Vehicles | Schema |
| MST-11 | Fuel source | Masters › Fuel sources | Schema |
| MST-12 | Expense head / sub-head | Masters › Expense heads | Done |
| MST-13 | Units with conversions | Masters › Units | Done |
| MST-14 | Bill of materials / recipe (site-specific mixes) | Masters › Recipes | Schema |
| MST-15 | BOQ items | Masters › BOQ items; Contracts › BOQ | Schema |
| — | Add, edit, deactivate (no delete once used), search, Excel import / export | Every master tab: *Import* (CSV from Excel), *Export* (.xlsx / PDF), *Deactivate* | Done |

## 4. Site-wise material inventory (`/inventory/*`)

| ID | Requirement | Web | API |
|---|---|---|---|
| MAT-01 | Receipt from central store | Purchase › Central store › *Issue material* → Inventory › In transit › *Confirm receipt* | Done |
| MAT-02 | Direct GRN from supplier (ordered / received / accepted / rejected) | Purchase › GRN | Done |
| MAT-03 | Receipt from plant | Inventory › In transit (plant dispatches) | Schema |
| MAT-04 | Consumption tagged to BOQ item / work done | Inventory › Transactions › *Consumption* | Done |
| MAT-05 | Site-to-site transfer, leaves sender on confirmation | Inventory › Transactions › *Transfer* | Done |
| MAT-06 | Return to central store | Inventory › Transactions › *Return* | Done |
| MAT-07 | Wastage / damage / theft with approval | Inventory › Transactions › *Wastage* | Done |
| MAT-08 | Stock adjustment (system vs physical) | Inventory › Transactions › *Adjustment* | Done |
| MAT-09 | Opening stock | Opening vouchers in Transactions (filter *Opening stock*) | Done |
| MAT-10 | Stock never negative (incl. later dates for back-dated entries) | Live check on every material line | Done |
| MAT-11 | Weighted average (default) or FIFO | Administration › Settings › Valuation | Done (WAVG) |
| MAT-12 | Unit conversion (bags ↔ MT) | Unit selector on material lines | Done |
| MAT-13 | Photos / challan on entries | Attachment field on entry forms | Done |
| MAT-14 | Back-dating within limit, beyond needs approval | Settings › *Back-dating allowed*; note on forms | Done |
| MAT-15 | Tools & tackles | Inventory › Tools & tackles | — |
| MAT-16/17 | Theoretical vs actual consumption | Inventory › Theoretical vs actual | — |
| MAT-18 | Tolerance alert | Alerts (ALT-02) | — |
| 4.4 | Stock register, item ledger, daily report, in transit | Inventory › Stock register / Item ledger / Daily material report / In transit | Done |

## 5. Central store and purchase (`/purchase/*`)

| ID | Requirement | Web | API |
|---|---|---|---|
| PUR-01 | Material requisition with approval | Purchase › Requisitions | — |
| PUR-02 | Quotation comparison (up to 5, lowest highlighted) | Purchase › Quotations | — |
| PUR-03 | Purchase order, PDF, WhatsApp / email | Purchase › Purchase orders (*Print / PDF*, *WhatsApp*) | Done |
| PUR-04 | GRN against PO, partial deliveries, pending balance | Purchase › GRN; PO drawer shows ordered vs received | Done |
| PUR-05 | Invoice with 3-way match | Purchase › Invoices | — |
| PUR-06 | Payments (full / part / advance, mode, TDS) | Purchase › Payments | — |
| PUR-07 | Purchase return / debit note | Purchase › Debit notes (auto-raised for rejected GRN qty) | — |
| STR-01 | Central store transactions; issue to site / plant / vehicle | Purchase › Central store › *Issue material* | Done |
| STR-02 | Live stock with minimum level and reorder alerts | Purchase › Central store › Stock statement | Done |
| STR-03 | Stock ageing 90 / 180 / 365 days | Purchase › Central store › Stock ageing | — |
| STR-04 | Batch / lot tracking | Batch field on GRN for batch-tracked materials | — |
| STR-05 | Spares to vehicles posted to vehicle cost | Issue to *Vehicle / machine*; Fleet › Vehicle cost | — |
| SUP-01 | Supplier ledger | Purchase › Supplier ledger | Done |
| SUP-02 | Payables ageing | Purchase › Payables ageing | Done |
| SUP-03 | Purchase register with GST breakup | Purchase › Purchase register (GST) | — |

## 6. Labour (`/labour/*`)

| ID | Requirement | Web |
|---|---|---|
| LAB-01/02 | Attendance by worker or by contractor headcount per trade | Labour › Attendance |
| LAB-03 | Gang photo with GPS and time | Attendance › *Gang photo* / *Capture GPS* |
| LAB-04 | Worker shifted between sites | Attendance › *Worker from another site* |
| LAB-05 | Attendance locks next day at set time | Settings › *Attendance locks next day at* |
| LAB-06 | Wage calculation | Labour › Wage sheets › *Generate* |
| LAB-07 | Advances recovered in wage runs | Labour › Advances |
| LAB-08 | Wage sheet and payslip printable; payment mode | Wage sheet drawer › *Print sheet*, *Slip*, *Mark paid* |
| LAB-09 | Labour contractor ledger | Labour › Contractor ledgers |
| LAB-10 | Work order to sub-contractor | Labour › Sub-contract work › *New work order* |
| LAB-11 | Sub-contractor bill with deductions | Sub-contract work › *New bill* |
| LAB-12 | Material recovery above norm | Suggested recovery on the sub-contractor bill |
| LAB-13 | Licence, PF / ESI, BOCW with expiry alerts | Labour › Compliance; Alerts |

API status for §6–§10: tables and controller skeletons only (`apps/api/src/{labour,expenses,fuel,vehicles,plant,contract,costing}`).

## 7. Expenses and petty cash (`/expenses/*`)

| ID | Requirement | Web |
|---|---|---|
| EXP-01 | Petty cash account per site | Expenses › Petty cash book |
| EXP-02 | Expense entry with bill photo | Expenses › Expenses › *Add expense* |
| EXP-03 | Expenses above limit need approval | Settings › Approval limits › Expense |
| EXP-04 | Cash top-up request approved by owner | Petty cash › *Request top-up* |
| EXP-05 | HO overheads allocated by basis | Expenses › HO overheads |
| EXP-06 | Standard heads | Masters › Expense heads |
| EXP-07 | Petty cash book and expense register | Expenses › Expense register |

## 8. Vehicles and machinery (`/fleet/*`)

| ID | Requirement | Web |
|---|---|---|
| FUEL-01 | Fuel purchase into own tank with dip before / after | Fleet › Tank & bowser › *Fuel purchase* |
| FUEL-02 | Tank stock with daily dip and variance | Fleet › Tank & bowser |
| FUEL-03 | Mobile bowser | Tank & bowser › BW-01 / BW-02 |
| FUEL-04 | Fuel load entry | Fleet › Fuel issue |
| FUEL-05 | Outside pump credit to pump ledger | Supplier ledger for IOCL Jagiroad / HP Dibrugarh |
| FUEL-06 | Meter must increase; odd jumps flagged | Fuel issue form validation |
| FUEL-07/08 | Efficiency between full-tank fills; variance alert | Fleet › Fuel efficiency; Alerts |
| FUEL-09 | Fuel cost charged to the site where the vehicle worked | Site cost sheet › Vehicles |
| FUEL-10 | Consumption report per vehicle / driver / site / month | Fleet › Fuel efficiency (by vehicle, fill-to-fill, monthly) |
| VEH-01 | Daily logbook | Fleet › Logbook |
| VEH-02 | Two sites in a day — split | Logbook form › *Worked at two sites today* |
| VEH-03/04 | Cost per vehicle; per km / hour / trip / MT | Fleet › Vehicle cost |
| VEH-05 | Internal hire rate charged to sites | Vehicle master; site cost sheet |
| HIRE-01/02 | Hire terms and hire bills from logbook | Fleet › Hire bills |
| MNT-01 | Service schedule with alerts | Fleet › Maintenance › Service schedule |
| MNT-02 | Job cards | Maintenance › Job cards |
| MNT-03 | Tyre and battery register | Maintenance › Tyres & batteries |
| MNT-04 | Breakdown, machine availability % | Fleet overview; Vehicle cost › Availability |
| DOC-01/02 | Documents with 30 / 15 / 7 day alerts | Fleet › Documents |

## 9. Plant (`/plant/*`)

| ID | Requirement | Web |
|---|---|---|
| PLT-01/02 | Plant store and raw-material ledger | Plants › Raw-material ledger |
| PLT-03 | Weighbridge slip | Dispatch and GRN forms |
| PLT-04 | Dip / stockpile measurements vs book | Raw-material ledger › *Stockpile / dip* |
| PLT-05 | Production entry | Plants › Production |
| PLT-06 | Recipe-based consumption with actual override | Production form › *From recipe / Actual printout* |
| PLT-07 | Site / client specific job mix | Recipes with a site; dispatch uses the receiving site’s recipe |
| PLT-08 | Crusher mode with % split, yield and loss | Production form for CRS-01 |
| PLT-09 | Rejections / returned loads | Production *Rejected*; dispatch status *Returned* |
| PLT-10 | Dispatch slip per trip | Plants › Dispatch › *Dispatch slip* |
| PLT-11 | Site confirms receipt; differences flagged | Inventory › In transit |
| PLT-12 | Sale to outside parties | Dispatch slip › *Sale to outside party* |
| PLT-13 | Raw material allocated to receiving site | Plants › Site-wise allocation |
| PLT-14 | Plant cost per unit | Plants › Plant cost sheet |
| PLT-15 | Site charged at plant cost or fixed internal rate | Plant cost sheet › *Actual / Fixed rate* |
| PLT-16 | Reconciliation — unexplained loss | Plants › Reconciliation |

## 10. Contract, BOQ, billing and costing (`/contract/*`)

| ID | Requirement | Web |
|---|---|---|
| BOQ-01 | Import BOQ from Excel; extra items with approval ref | Contracts › BOQ & progress (*Import*, *Extra / deviation item*) |
| BOQ-02 | Measurement entry L × B × D × nos | Contracts › Measurement book |
| BOQ-03 | Executed vs BOQ, % complete, balance | Contracts › BOQ & progress |
| BIL-01 | RA bill from measurements | Contracts › RA bills › *Prepare RA bill* |
| BIL-02 | Deductions | RA bill drawer |
| BIL-03 | GST per site; tax invoice printable | Site master GST %; RA bill › *Tax invoice* |
| BIL-04 | Bill status and receipts with UTR | RA bill › *Mark certified*, *Record receipt* |
| BIL-05 | Escalation | Escalation field on RA bill |
| BIL-06 | Client ledger with receivables ageing | Contracts › Client ledger |
| CST-01 | Live site cost sheet from every source module | Contracts › Site profitability |
| CST-02 | Compare with value of work done, billed, received | Site profitability |
| CST-03 | Budget vs actual | Contracts › Budget vs actual |
| CST-04 | Cost per BOQ item | Contracts › Cost per BOQ item |

## 11. Reports, dashboard and alerts

| ID | Requirement | Web |
|---|---|---|
| 11.1 | Owner dashboard | Dashboard (`/`) |
| 11.2 | Report list, filters, Excel and PDF export | Reports (`/reports`); *Export* on every table |
| ALT-01 | Stock below minimum | Alerts |
| ALT-02 | Consumption variance (material, plant, fuel) | Alerts |
| ALT-03 | Document / licence expiry, service due | Alerts |
| ALT-04 | Approvals pending over 24 hours | Alerts; Approvals |
| ALT-05 | Daily entries missing | Alerts; site engineer’s checklist on the dashboard |
| ALT-06 | Cost over budget or over work done | Alerts |
| ALT-07 | Payables and receivables overdue | Alerts |

## 12. Technical

| ID | Requirement | Web |
|---|---|---|
| TEC-01 | Browser app for desktop, laptop and tablet | Responsive down to phone width |
| TEC-02 | Fast daily entry screens | *+* quick-entry sheet on phones; `Ctrl K` search |
| TEC-05 | Hindi / Assamese labels | Phase 2 |
| TEC-06 | Photo attachments ≤ 10 MB | Attachment field |
| TEC-07 | Excel import for masters / BOQ; Excel / PDF export | CSV import on masters and BOQ; real `.xlsx` export; print-to-PDF |
| TEC-08 | Tally, weighbridge, GPS, WhatsApp hooks | WhatsApp share on PO; others phase 3 |
| SEC-01 | Mobile OTP or username + password; 2FA for Admin | Login screen (demo OTP / 2FA code `123456`) |
| SEC-02 | Role / site access; session timeout | Settings › Session timeout |
| SEC-03 | Audit log; cancel with reason, no hard delete | Voucher drawer › *Cancel voucher* |
| SEC-04 | Financial year closing and locked periods | Settings › Financial year & data (API enforces) |

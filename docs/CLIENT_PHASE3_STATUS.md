# WCM — Phase 3 (Operations): build status

Built on 2 Nov 2026, after Phase 2. As agreed in the build order, Phase 3 is handed to you for testing after you accept Phases 1 and 2.

## What Phase 3 does

### Hot mix plant

| ID | Requirement | Status |
|---|---|---|
| HMP-01 | Daily production log | Done. Each entry records the mix, quantity, start and stop time, meter hours, mixing temperature, lot no., operator, DG hours, burner LDO and DG diesel. The LDO and diesel are taken out of the plant store with the bitumen and aggregates. |
| HMP-02 | Ratio check | Done. Each entry is checked live against the job-mix formula (bitumen %) and against the plant's burner-fuel and DG norms (L / MT). Anything outside tolerance is flagged on the form and in Alerts. |
| HMP-03 | Dispatch challan | Done. Each load records weighbridge gross and tare (net worked out), vehicle, BOQ item, chainage and temperature. The site enters arrival time, temperature at site and where the load was laid. A mix arriving below 120 °C is flagged. |
| HMP-04 | Outside sales | Done. The tax invoice is made from delivered loads to a buyer. It uses the firm's invoice series, HSN 2715, and CGST + SGST within Tripura (IGST otherwise). Also: e-way bill Excel, receipts, buyer ledger, and cancellation by Admin with a reason. |
| HMP-05 | Cost per MT by mix | Done. Material and fuel come from the store at average cost. Labour, power, repairs, depreciation, interest and overheads are shared by tonnes. |
| HMP-06 | Lab register | Done. Marshall, bitumen extraction and gradation results per lot, with lab name, NABL, report no., and pass / fail. |
| HMP-07 | Plant maintenance | Done. Job cards for burner, DG, bag filter and other equipment, with downtime and cost. |
| HMP-08 | TIIPIS and loans | Done. The SGST claim on outside sales (the lower of the SGST on sales and the cash SGST in GSTR-3B), the interest-subsidy claim, and loans with their EMI schedule, including moratorium. Each claim is tracked as filed and received. |

### Stores and purchase

| ID | Requirement | Status |
|---|---|---|
| Query 3 rule 2 | Tanks, stockpiles and daily dips | Done. Each store lists its tanks and stockpiles. The plant's day sheet is: opening + received + produced − used − dispatched = book closing, compared with the dip. A dip can be corrected later, and any difference shows on the sheet and in Alerts. |
| PUR-05 | Bulk receipt | Done. Bitumen, fuel and aggregate GRNs record the supplier's invoice qty (shortage worked out), weighbridge gross / tare, temperature, tank dip before / after, tanker no., depot and royalty pass. |
| PUR-03 | GST input credit | Done. Each purchase invoice is marked eligible, or blocked with a reason. |
| PUR-06 | Rate comparison | Done. Rates paid and quoted, by material and supplier. Shows the lowest latest rate and the weighted average. |

### Vehicles and machinery

| ID | Requirement | Status |
|---|---|---|
| FLT-03 | Trips charged to the right work | Done. A logbook can be entered trip by trip: work, material, quantity, from and chainage. The day's running cost and fuel are shared by trips. A Fleet Edge (or other telematics) daily export can be imported from Excel. |
| FLT-04 | Own machines hired out | Done. A day marked "hired out" is charged to no work. Hire-out bills (per hour / day / month / trip / km) take their units from those logbook days, with GST, print and receipts. |

### Labour

| ID | Requirement | Status |
|---|---|---|
| LAB-02 | Wage register, slips, bank file | Done. Form XVII wage register, Form XIX wage slips, and a bank transfer Excel. Workers without a bank account are listed for cash or UPI payment. |
| LAB-03 | Muster roll and half-yearly return | Done. Form XVI muster roll by work and month, and half-yearly return data for SWAAGAT / CLRA: days worked, highest number on any day, men and women, man-days, wages. |
| LAB-04 | EPF and ESI | Done. EPF is 12% on wages up to ₹15,000, split EPS 8.33% plus the employer's EPF share. ESI is 0.75% employee and 3.25% employer up to ₹21,000. Downloads: EPFO ECR 2.0 text file, and the ESIC monthly Excel. The worker master holds UAN, PF / ESI membership, ESIC no., bank, father's name, gender and date of birth. |
| LAB-05 | Minimum wages | Done. Rates are kept per trade, and anyone paid below them is flagged. **Needs the current Tripura notification rates from you.** |
| LAB-06 | Licences | Done. Your own CLRA licence and each contractor's, with expiry alerts. |
| LAB-07 | Safety | Done. PPE issue, toolbox talks, and an accident / near-miss register. |
| SUB-03 | Sub-contractor vs department | Done. Quantities sub-contractors have billed, against the up-to-date quantity in the latest RA bill. Anything over is flagged. |

### Site progress

| ID | Requirement | Status |
|---|---|---|
| DPR-01 | Daily progress report | Done. Filled from the day's attendance, logbooks, store issues, hot mix received and measurements. The engineer checks it and adds weather and remarks, then prints or shares it on WhatsApp. |
| DPR-02 | Hindrance register and site order book | Done. Numbered HR-01 / SO-01. Hindrance days are counted for the extension-of-time case. |
| DPR-03 | Quality tests | Done. Cubes, field dry density (FDD), density and soil tests per work. Reminders when 7-day and 28-day cubes are due. |
| DPR-04 | Programme vs actual | Done. Planned % from the start date, milestones and completion date, against the value of work measured. Shows projected completion, likely delay and time-penalty risk. |

## Your Phase 3 acceptance tests: results on your company setup

1. **One day's hot mix production and dispatch reconciles bitumen stock with the tank dip.**
   - IOCL bitumen GRN of 20 MT with weighbridge, temperature and dips.
   - 200 MT DBM produced, using 9 MT bitumen (4.5%, matches the JMF), 1,700 L LDO (8.5 L/MT) and 450 L DG diesel.
   - Day sheet: opening 18.5 + received 20 − used 9 = **29.5 MT book, dip 29.5 MT: matches.**
2. **An outside sale prints a correct GST invoice.**
   - Load DSP-H/26-27/0001: gross 38.0 − tare 12.5 = 25.5 MT to Tripura Builders.
   - Invoice SD/INV/2026-27/0002: 25.5 MT × ₹6,200 = **₹1,58,100 + CGST ₹14,229 + SGST ₹14,229 = ₹1,86,558**, HSN 2715, on your letterhead.
3. **One month of labour gives the muster roll, wage register and EPF ECR.** October 2026 for two workers:
   - Bikash Das: 26 days and 8 h OT. Gross ₹13,600; EPF ₹1,560; ESI ₹102; advance ₹1,000; **net ₹10,938**.
   - ECR line: `100123456789#~#BIKASH DAS#~#13600#~#13000#~#13000#~#13000#~#1560#~#1083#~#477#~#1#~#0`.
   - Rina Debbarma (ESI only, paid by UPI) is listed for cash or UPI payment.
4. **Tipper trips and fuel are charged to the right work.**
   - TR05K1886 made 4 trips: 3 to Kadamtala Rd and 1 to Panisagar Rd BC.
   - 36 L diesel (₹3,312) charged **₹2,484 to Kadamtala and ₹828 to Panisagar**.

## What we need from you

- **Minimum wage rates** per trade from the current Tripura notification.
- **EPFO establishment code and ESIC employer code.** Then upload one month's ECR and ESIC file on the portals to confirm they are accepted.
- **A one-day Fleet Edge export** (Excel), to match its column names exactly.
- **The TIIPIS claim format** used by the Industries department, and the NEDFi sanction letter (rate, moratorium, subsidy %).
- **Your JMF and plant norms:** bitumen %, LDO and diesel L/MT. Also your tank calibration (dip) charts.
- Still open from earlier phases:
  - **WhatsApp Business API account** for automatic messages.
  - **Approval to add the library that reads old .xls files.** Until then, save .xls as .xlsx before importing.

## Tested

- **Rule tests:** 108 automated checks, covering:
  - tank reconciliation and production ratios;
  - sales invoice GST;
  - wage register, EPF / ESI and the ECR line;
  - bank file and minimum wage;
  - trip split and hired-out days;
  - DPR draft, hindrance days and programme;
  - cubes due, cost per MT, loan schedule and SGST claim.
- **Server tests:** 24.
- **Browser:** all four acceptance tests above, on your company setup.
- **Screen sweep:** all 93 screens open without errors on desktop and phone, for Owner and Site Engineer.

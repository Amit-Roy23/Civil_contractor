# WCM — Phase 1 (Foundation): reply to Saurajit Deb's requirements of 30 Oct 2026

As agreed in your build order, Phase 1 comes first and we start Phase 2 only after you have tested it on your real data. This note covers:
- what Phase 1 delivers;
- how each of your acceptance tests was checked;
- where every requirement ID stands;
- what we need from you.

## 1. Your masters (Queries 1–4)

| Query | Status |
|---|---|
| **1 — Works** | **Done.** No sample works are loaded; you enter each work yourself. The works form has every field in your table: auto work code (SD/2026-27/001, editable, shown small), full and short name, client + circle / division / sub-division, executing firm, NIT/DNIT no. and date, tender ID, LOA, agreement, estimated cost, quoted % above / below / par / item rate, contract value with an "includes GST" switch, GST %, district / sub-division / block / GPS, chainage from–to and length, start date, time allowed, stipulated and actual completion, extension-of-time log, client engineers (EE / AE / SDO / JE with phones), our engineer and supervisor, the 11-step status, EMD, performance security, additional performance security, security deposit % / ceiling / defect liability (release date calculated), deductions profile copied from the client and editable per work, advances, price adjustment components, time penalty and milestones, and linked hot mix plant. The site store is created automatically with the work. Excel import uses the same column names as your table. |
| **2 — Firm, clients, tax** | **Done.** Firm "SAURAJIT DEB" (trade name M/s Saurajit Deb, GSTIN 16BGXPD9663C1Z0, PAN, Udyam, PWD (R&B) Class-III enlistment up to ₹3.5 crore valid to 31/07/2031, both places of business, contact, labour licence note, invoice series SD/INV). More firms can be added, each with its own GSTIN, letterhead (logo and signature), invoice series and work numbering. Client "PWD (R&B), Government of Tripura" with the Dharmanagar Division office and default deductions: GST TDS 2% above ₹2.5 lakh, income-tax TDS 1% (with / without GST setting), labour cess 1%, TCS 0%, plus your own deduction heads. **Left for you:** TAN, bank accounts, EPF code, licence numbers, the client GSTIN from GSTR-7A, and the circle name. |
| **3 — Stores** | **Done.** "Central Godown — Chandrapur" and "Plant Store — Kalikapur" (with address and what each holds). A site store is created for each work. A work cannot be **closed** while its site store still holds stock or has a transfer in transit — the screen lists what must be sent back or written off first. Store names are shown in plain words. Valuation is weighted average. Tank / stockpile sub-locations with daily dips are Phase 3 (stores and bitumen). |
| **4 — Plant** | **Done.** "Hot Mix Plant — Kalikapur": drum-mix, PRIMAX PDM-50, 60–90 TPH, consented 415 MT/day (SPCB CTO 30/04/2026), Khatian / Dag / Mouza, equipment, 125 kVA DG, LDO / diesel burner fuel. The in-charge is kept as a history with effective dates (currently Saurajit Deb). Your two mobile hot mix units are in the machines list. Your machines from FLT-01 are loaded **provisionally** — please confirm or correct the list. Your mixes (DBM, BC) and job-mix formulae: you enter them. A starter material list for the plant and godown is loaded (bitumen VG-30, emulsion, aggregates 20/10/6 mm, stone dust, filler, sand, LDO, HSD, cement, TMT); rates are blank for you to fill. |

## 2. Gaps you found — now fixed

1. **No server:** every entry from every phone or PC is saved on the server, and dashboards show the same figures everywhere.
2. **Sample company:** your company starts empty with your own masters.
3. **Codes on screen:** plants, machines, stores and alerts are shown by name. Internal codes (HMP-01, PVR-01, ALT-03) and our requirement numbers are no longer shown to users.
4. **Modules not in the menus:** see the table in section 4 — they are in Phases 2–4.
5. **Offline entry:** done, see PF-03.
6. **Unlabelled icon buttons:** every icon-only button now has a label (read out by screen readers, shown on hover). An automatic check found none left unlabelled.

## 3. Phase 1 acceptance tests

| Your test | How it was checked | Result |
|---|---|---|
| Two phones and one PC enter data for the same work, and all three show the same figures | Two phone browsers (Android and iPhone size) and one PC each made an entry on the same work. Each device showed all three entries, and the server held exactly one copy of each. | **Pass** |
| A phone with no network saves entries and sends them later, with no duplicates | The phone was taken offline and an entry saved ("Offline · 1 unsent" is shown). The app was reloaded **with no network**: it opened and still showed the entry. When the network returned, it was sent automatically and the server had it once. Also tested: the server saves an entry but the phone never receives the answer. The phone retries, and the server recognises the repeat and does **not** save it twice. | **Pass** |
| My masters (Queries 1–4) load from Excel without retyping, and no sample data remains | Your masters were loaded from a setup file with no sample data. Works and opening stock were imported from Excel. A wrong file lists every problem by row and column, and nothing is saved until the whole file is correct. | **Pass** |
| A site engineer sees only his works, and cannot see rates when they are hidden | An engineer assigned to one work saw only that work, with "Rates hidden" and no amounts. The server does not send him other works' details or any rates. | **Pass** |
| A backup is restored once on a test copy | Administration › Backups & data › "Restore to a test copy" restored a backup into a separate company and confirmed that every record type matched (88 of 88 records). You can sign in to the copy with its company code to look around; your live data is not touched. | **Pass** |

Please repeat these tests yourself on your real data — that is your acceptance of Phase 1.

## 4. Every requirement ID

**Phase 1 — Foundation (this delivery)**

| ID | Status |
|---|---|
| PF-01 Server database and API | Done |
| PF-02 Logins: password, mobile OTP, roles, access per work | Done. SMS for OTP needs an MSG91 account (see section 6); password login works now. |
| PF-03 Offline entry, automatic sync, no duplicates | Done |
| PF-04 More than one firm | Done: firm master with its own GSTIN, letterhead, invoice series and work numbering. Reports split by firm come with RPT-05 (Phase 4). |
| PF-05 Approval lock and audit log with old and new values | Done |
| PF-06 Empty start; Excel import of opening stock, party balances, running works, pending bills | Done. Running works carry work done / billed / received and cost up to go-live, so pending bills = billed − received. Bill-by-bill pending RA bills come with BIL-03 (Phase 2). |
| PF-07 Daily backup, tested restore, full Excel export | Done. Daily automatic backup kept 30 days, restore to a test copy, download, and "Export all data" to Excel. An off-site copy to cloud storage is ready to switch on (BACKUP_S3=on) but has not yet been tried against a real storage bucket. |
| PF-08 Installable app, compressed photos, Bengali labels | Installable app: done ("Add to home screen"; opens without network). Photo compression comes with the document and photo storage (Phase 4, CMP-02). Bengali labels: Phase 4 — please send the terms your site staff use. |
| XL-04 Excel templates for every master, all errors listed before saving | Done for works, clients, suppliers, sub-contractors, materials, workers, machines, BOQ, opening stock and party balances |
| XL-05 Export every list to Excel | Done for masters and all data. Every report to Excel and PDF is RPT-05 (Phase 4). |

**Phase 2 — Money:** BIL-01 to BIL-10, SEC-01 to SEC-04, ACC-03 (Tally), PUR-04 TDS on payments, SUB-02, XL-06 (department BOQ .xls with hidden sheets) and TND-04.

**Phase 3 — Operations:** PUR-01 to PUR-03, HMP-01 to HMP-08, FLT-01 (final list) to FLT-04, LAB-01 to LAB-07, SUB-01, SUB-03, DPR-01 to DPR-04, store sub-locations and tank dips.

**Phase 4 — Control:** TND-01 to TND-08, CMP-01 to CMP-03, LTR-01 and LTR-02, ACC-01 to ACC-06, RPT-01 to RPT-05, NOT-01, XL-01 to XL-03 and XL-07, PF-08 (Bengali).

Several of these already exist in the app in a simpler form, from your requirements of 9 Oct: RA bills, measurement book, hot mix production and dispatch, fleet, labour and wages, petty cash. Each phase will bring them up to this document.

## 5. Excel toolkit (XL-01)

We could not open the Facebook video from our side. Please send the toolkit Excel file itself, or the video as a file. We will then send you the mapping table you asked for before building anything: each sheet, and whether it becomes a calculator, a register or a template. The eight calculators you listed are planned for Phase 4, matched to your 10 test inputs each.

## 6. What we need from you

1. **Firm details:** TAN, bank accounts, EPF / ESIC codes, labour licence number and validity, logo and signature images.
2. **Client:** PWD (R&B) GSTIN from your GSTR-7A, circle name, and the EE / AE / JE names and phones of the Dharmanagar Division.
3. **Machines:** confirm the FLT-01 list, with registration numbers.
4. **Your works:** enter them, or fill the Works Excel template (Masters › Import & export).
5. **Opening data:** opening stock and party balances as on your go-live date (templates provided).
6. **Your users:** for each user, the name, mobile number and role. For site engineers, also the works each one handles.
7. **SMS for OTP:** an MSG91 account (auth key and an OTP template with an `##otp##` variable). Until then, staff sign in with passwords.
8. **Excel toolkit:** the file (see section 5).

## 7. Ownership and handover

Source code is in your GitHub repository. Database tables and the API are described in `docs/SERVER_MODE.md`, which will be expanded into full table documentation at handover. Moving the hosting and database accounts into your name, training, the user manual, the bug-fix period and the annual maintenance charge go in the quotation.

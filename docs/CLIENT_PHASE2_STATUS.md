# WCM — Phase 2 (Money): build status

Built on 1 Nov 2026 after Phase 1. As agreed in the build order, Phase 2 is handed to you for testing only after you accept Phase 1.

## What Phase 2 does

| ID | Requirement | Status |
|---|---|---|
| BIL-01 | BOQ per work with tendered % applied | Done. Each item keeps the department's estimate rate; the contract rate is worked out from the work's quoted % (above / below / at par / item rate). |
| XL-06, TND-04 | Import the department's BOQ Excel, including hidden sheets; check total against estimated cost | Done for **.xlsx**. Every sheet is searched, hidden ones too; group headings and totals are skipped; the BOQ total is compared with the estimated cost and any difference is shown. An old **.xls** file must be saved as .xlsx first — reading .xls directly needs one extra library (awaiting approval). |
| BIL-02 | Measurement book | Done. Nos × L × B × D with blank dimensions ignored; deduction entries; MB no./page, chainage, remarks; JE check status (to check / checked / query with the JE's remark). Entries under a JE query are kept out of bills. |
| BIL-03 | RA bill | Done. Previous / this-bill / up-to-date quantities from the measurement book. Deductions come from the work's profile: security deposit (with ceiling), GST TDS (only above the ₹2.5 lakh threshold), income-tax TDS and labour cess (on value with or without GST, as set), TCS, your own heads, advance recovery until cleared, interest, department material and time penalty. Net payable. Draft or submit; final bill. **Print in the division's exact format needs your sample bills.** |
| BIL-04 | Deviations and extra items | Done. Quantities above BOQ are flagged with % on the BOQ and in the bill; extra items carry rate analysis, approval letter no. and date. |
| BIL-05 | Price adjustment | Done. Per component, from the work's base date and base prices: by share of work value, or by quantity used (e.g. bitumen MT × price rise). |
| BIL-06 | Bill tracking and deduction check | Done. Submitted → passed (date, passed amount, the division's actual deductions) → paid. Differences from the expected deductions are flagged on the bill and in Alerts. Net receivable follows the division's actual figures. |
| BIL-07 | Receivables ageing | Done. By work and by division, from the date of submission. |
| BIL-08 | GST tax invoice for every RA bill; GSTR-1 data | Done. Invoice no. from the firm's series (SD/INV/2026-27/0001), CGST + SGST within Tripura (IGST otherwise), SAC 9954, firm letterhead, logo and signature. GSTR-1 B2B Excel by month. |
| BIL-09 | GST TDS ↔ GSTR-7A, income-tax TDS ↔ 26AS / AIS, labour cess per work and year | Done. Credits entered or imported from Excel; each credit suggests its bill by amount; month-wise and bill-wise comparison with differences. |
| BIL-10 | Final bill and closure | Done. Final bill moves the work to "final bill submitted" and, when paid, "final bill paid"; completion certificate no. and date; release due from the defect liability period; security deposit release letter on your letterhead. |
| SEC-01 | Guarantee and deposit register | Done. EMD, performance security, additional PS, SD, advance BGs, FDRs: number, bank, amount, issue, expiry and claim dates, work or tender, status (active / extended / released / encashed), extension history. |
| SEC-02 | Alerts 60 / 30 / 15 / 7 days before expiry, BG extension letter | Done in the app (Alerts and the register) with a ready extension request letter and one-tap WhatsApp share. **Automatic WhatsApp sending needs a WhatsApp Business API account** (NOT-01). |
| SEC-03 | Bank limits | Done. BG limit, used, available, margin money, FDRs under lien. |
| SEC-04 | Money blocked per work on the dashboard | Done. EMD and FDRs in full, BG margin, security deposit held from bills. |
| PUR-04, SUB-02 | TDS on payments | Done. 1% individual / HUF, 2% firm or company, 20% without PAN, nil for a transporter with ≤10 goods carriages and declaration; only above ₹30,000 per payment or ₹1 lakh per year; on/off per financial year; extra heads (rent, professional fees) can be added. Sub-contractor payments added. TDS return (Form 140, earlier 26Q) Excel by quarter. |
| ACC-03 | Tally export | Done. RA bills (sales), department deductions (journal), receipts, purchase bills and payments, as TallyPrime XML (ledger masters + vouchers), with your own ledger names. **To be confirmed by importing one month into your accountant's TallyPrime.** |

## Your Phase 2 acceptance tests — what is needed

1. **One real RA bill matches the division's bill exactly.** Send 2–3 sample bills of your division; we will match the printed layout.
2. **One quarter of GST TDS and income-tax TDS agrees with GSTR-7A and 26AS / AIS.** Send one quarter's GSTR-7A and 26AS.
3. **A BG expiring within 30 days shows an alert and sends a WhatsApp message.** The alert, letter and share work now; automatic sending needs a WhatsApp Business API account.
4. **One month of vouchers imports into TallyPrime.** Send your accountant's ledger names, or let them import the test file.

## Tested

- 94 automated checks on the rules (deduction amounts, thresholds, ceiling, advance recovery, price adjustment, invoice numbering, passing and payment, final bill, GST split, TDS limits and rates, guarantee alerts and extension, money blocked, bank limits, reconciliation, GSTR-1 and balanced Tally vouchers, department BOQ in a hidden sheet).
- End-to-end in the browser on your company setup. It covered:
  - department BOQ (hidden sheet) → measurements with a deduction and a JE query → RA bill with the expected deductions → tax invoice print → passed with the division's royalty flagged as a difference → payment;
  - BG with alert at 24 days and the extension letter;
  - GSTR-7A credit matched to its bill;
  - GSTR-1 and Tally files;
  - sub-contractor payment with 1% TDS.

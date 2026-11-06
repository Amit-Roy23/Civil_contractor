# Change request: sale of goods and party-wise item-wise ledger

Asked for on 6 Nov 2026. Built and tested on your company setup the same day.

## 1. Sale of goods (Store & Purchase › Sale of goods)

Goods can now be sold to outside parties from any store or site store: aggregates, stone dust, cement, steel, bitumen, scrap and so on. Hot mix sold from the plant stays in Plants › Outside sales.

- **Tax invoice.**
  - **Number:** from your firm's one GST series. RA bills, hot mix and goods share it.
  - **Lines:** each line carries the item, HSN, quantity, unit, rate, GST % (from the item, can be changed) and GST amount.
  - **Tax:** CGST + SGST within Tripura, IGST outside.
  - **Print:** on your letterhead, with the total in words.
- **Stock.** The goods leave the chosen store on the invoice date, valued at the store's average cost. The sale is refused if the stock is not there on that date, or if it would make a later day's stock negative.
- **Checks.**
  - The rate must be entered.
  - The GST rate must be a GST slab.
  - Every item needs an HSN code, set in Masters › Materials.
  - An e-way bill reminder shows above ₹50,000.
- **Receipts.** Part and full receipts are recorded against the invoice. Receipts above the invoice total are refused.
- **Cancel.** An invoice can be cancelled by Admin only, with a reason, and only while no receipt is recorded. Cancelling puts the goods back into the store.
- **Reports.**
  - **Stock register:** gets a new **Sold** column.
  - **Plant reconciliation:** no longer counts sold material as loss.
  - **GSTR-1:** gives one row per invoice and GST rate.
  - **Tally export:** books goods to a "Sale of Goods" ledger. You can rename this ledger in settings.
  - **E-way bill:** Excel for goods sales.
- **Access.**
  - Needs Store & Purchase permission and rate visibility.
  - A store keeper sees sales of their own stores only.

## 2. Party item ledger (Store & Purchase › Party item ledger)

**One party, item by item.** For a chosen party and period, every item is listed with:

- an opening line;
- each voucher:
  - **Purchase:** from purchase bills, including diesel bought from a pump;
  - **Purchase return:** from debit notes;
  - **Sale:** from tax invoices, both hot mix and goods;
- the voucher's quantity in or out, rate, taxable value, GST and total;
- the running net quantity (in − out);
- a closing line.

Above each item: quantity bought, returned and sold, with average and last rates. Also shown:

- goods received on a GRN but **not billed yet**;
- plant loads delivered but **not invoiced yet**.

The party card shows:

- purchases net of returns, sales, and GST input / output;
- what you owe the party and what the party owes you today, from the supplier ledger and buyer ledger;
- the net between the two.

**One party for both sides.** A supplier and a buyer with the **same GSTIN** are treated as one party. So a firm you buy aggregates from and sell hot mix or goods to shows in one ledger, with one net balance.

**All parties × items.** One row per party and item for the period, filterable to bought only or sold only, and by item. Click a row to open that party's ledger. Both views export to Excel.

Payments and receipts are kept party-wise, not split by item, as in Tally.

## Tested

- **119 rule tests** cover:
  - stock out at average cost;
  - stock checks on the date and on later days;
  - cancellation;
  - receipts;
  - GSTR-1 rows by rate and the Tally voucher;
  - who can see sales;
  - merging parties by GSTIN;
  - item rows, opening and closing, unbilled GRNs and money balances.
- **24 server tests.**
- **In the browser, on your company setup:**
  - Sold 10 MT 20 mm aggregate @ ₹1,600 and 5 MT stone dust @ ₹1,000 from the plant store to Jampui Stone Crushers.
  - The invoice was SD/INV/2026-27/0003: ₹21,000 + CGST ₹525 + SGST ₹525 = ₹22,050, total in words printed.
  - Plant store stock of 20 mm fell from 190 to 180 MT.
  - Jampui is both supplier and buyer. Their ledger shows the purchases (80 MT 10 mm, 120 MT 20 mm), the 3 MT return and the sales.
  - The party card shows ₹3,03,975 we owe them and ₹22,050 they owe us.
- **All 95 screens** open without errors on desktop and phone.

## Not included (say if you need it)

- **Sales returns / credit notes for part of an invoice.** Today a wrong invoice is cancelled in full and re-issued.
- **Matching a supplier and a buyer without a GSTIN.** Unregistered parties are matched only when they are the same master record.

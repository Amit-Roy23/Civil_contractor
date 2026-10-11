# Architectural & Implementation Decisions

This document records the architectural and design decisions, rationale, and chosen defaults for the Works Contract Management ERP.

## DEC-001: Decimal Arithmetic Standard
- **Context**: JavaScript native `number` is IEEE 754 floating-point, leading to precision loss (e.g., `0.1 + 0.2 !== 0.3`).
- **Decision**: Store all amounts as `numeric(18,2)` in PostgreSQL, all quantities and rates as `numeric(18,4)`. On the Node.js/NestJS backend, perform all arithmetic strictly with `decimal.js`. Transmit over JSON as strings or serialized fixed decimals to prevent client-side float corruption.
- **Trace**: Non-negotiable rule #1.

## DEC-002: Base Unit Storage with Dual Display Representation
- **Context**: Site receipts and issues happen in bags, brass, metric tonnes (MT), cum, kg, litres, trips, or numbers.
- **Decision**: Every stock movement row in `stock_ledger` and `stock_balance` stores quantity strictly normalized to the item's primary base unit (`qty_in`, `qty_out`, `running_qty`). The voucher line preserves `entered_qty` and `entered_unit_id` along with the conversion multiplier for audit and display faithfulness.
- **Trace**: MAT-12, Non-negotiable rule #2.

## DEC-003: Location-Centric Multi-Entity Topology
- **Context**: Civil contractors operate across head office central stores, highway/bridge sites (each with site stores), stone crushers, hot-mix asphalt plants, concrete batching plants, mobile bowsers, and fuel storage tanks.
- **Decision**: Centralize all spatial stock & cost points into a unified `locations` table with types: `CENTRAL_STORE`, `SITE_STORE`, `PLANT_STORE`, `FUEL_TANK`, `FUEL_BOWSER`, and `IN_TRANSIT`. Bowser locations track `current_site_id`. Every plant and site receives a dedicated virtual `IN_TRANSIT` location to model inter-site and store-to-site dispatches cleanly.
- **Trace**: MST-03, Section 4.1.

## DEC-004: Strict Append-Only Double-Entry-Style Ledgers
- **Context**: Erasures, hard-deletions, and in-place mutations of posted vouchers undermine audit integrity, statutory scrutiny, and cost reconciliation.
- **Decision**:
  1. `stock_ledger`: Append-only recording of quantity & valuation changes.
  2. `stock_balance`: Row-locked (`SELECT ... FOR UPDATE`) materialized table keeping current balances for fast queries and atomic negative stock prevention.
  3. `cost_ledger`: Append-only recording of direct & indirect site costs.
  4. `party_ledger`: Append-only financial ledger tracking supplier, subcontractor, and client debits/credits.
  Posted vouchers can never be hard deleted (SEC-03). A cancellation generates reversing entries with a mandatory reason audit.
- **Trace**: SEC-03, CST-01, MAT-10.

## DEC-005: Valuation Engine & Back-Dated Revaluation Queue
- **Context**: In construction, site receipts and issue challans frequently arrive out-of-order or back-dated (e.g., weighbridge slips entered 2 days later).
- **Decision**: Support weighted average valuation (default) and FIFO behind a uniform valuation interface. When an entry is posted with a back-dated `txn_date`, the system synchronously enforces that stock does not go negative at any point in time between the back-dated date and the present. It then schedules a BullMQ background job to recompute `running_qty`, `running_value`, and `valuation_rate` for all subsequent transactions and re-prices downstream consumption entries.
- **Trace**: MAT-11, MAT-14.

## DEC-006: Centralized Request-Scoped Location Scoping & Field Masking
- **Context**: Site engineers and plant in-charges must only see their assigned locations. Furthermore, non-commercial personnel (site supervisors, store keepers) must not see unit rates or monetary values (ROLE-03).
- **Decision**: Implement a request-scoped `ScopeService` injected into queries to enforce `user_location_scope` at the database query level. Implement a NestJS response interceptor (`FieldMaskingInterceptor`) that recursively removes `rate`, `amount`, `unit_rate`, and `value_*` fields if the user lacks the `rates.view` permission key.
- **Trace**: ROLE-02, ROLE-03.

## DEC-007: Approval Workflow Architecture
- **Context**: Discrepancies, wastages, and stock adjustments require managerial authorization.
- **Decision**: Voucher status flow: `DRAFT -> PENDING_APPROVAL -> POSTED -> CANCELLED` (or `REJECTED` / `SENT_BACK`). Vouchers enter `POSTED` status only after required role approvals are met. Wastage and Physical Stock Adjustments default to requiring Project Manager / Admin approval.
- **Trace**: APR-01, APR-02, MAT-07, MAT-08.

## DEC-008: Indian Locale & Regulatory Defaults
- **Context**: Road and civil works in India require INR currency format (`en-IN` lakh/crore: `₹ 12,34,567.00`), GST rates (0%, 5%, 12%, 18%, 28%), TDS deductions, financial years running April 1 to March 31, and Asia/Kolkata timezone (`DD-MM-YYYY` dates).
- **Decision**: Encapsulate all formatting in `@civil/shared` and enforce standard FY calculations based on April 1 boundaries.

# Works Contract Management ERP (Web)

A production-grade, full-stack ERP scaffold built from scratch for an **Indian road & civil works contractor**.

---

## 1. Executive Summary & Business Context

Civil and highway contractors operate across multiple concurrent project sites, a central supply godown, asphalt hot mix plants, concrete batching plants, mobile fuel bowsers, and a heavy machinery fleet.

This system provides live **site-wise stock, cost, and profit/loss** governance, strictly enforcing Indian construction regulatory and operational norms:
- **Currency**: INR (`₹`) formatted according to the Indian numbering system (`en-IN` lakh/crore grouping: `₹ 12,34,567.00`).
- **Taxes & Compliance**: GST (0%, 5%, 12%, 18%, 28%), TDS deduction u/s 194C (2%), Labour Welfare Cess (1%).
- **Financial Calendar**: Financial Year running April 1 to March 31, timezone `Asia/Kolkata`, dates formatted as `DD-MM-YYYY`.
- **Connectivity Resilient**: Built for site engineers working in remote highway stretches with slow/flaky 2G/3G connectivity via client-side IndexedDB draft autosave (`idb-keyval`).

---

## 2. Tech Stack

- **Monorepo**: Turborepo + `pnpm workspaces`, strict TypeScript throughout.
- **Backend (`apps/api`)**:
  - **Node.js 22 LTS + NestJS 11**: Modular architecture with DI, request-scoped providers, and interceptors.
  - **PostgreSQL**: Relational integrity, `numeric` precision, row-level locks (`SELECT ... FOR UPDATE`), and foreign keys.
  - **Drizzle ORM**: SQL-first migrations and schema definitions (`drizzle-kit`).
  - **Decimal.js**: Exact arbitrary-precision arithmetic for all monetary and quantity calculations. Never uses native JS floats.
  - **Redis 7 + BullMQ**: Asynchronous background jobs for inventory revaluation (`revaluation-queue`) and low-stock alerts (`ALT-01`).
  - **Security & Scoping**: Argon2 password hashing, JWT authentication, `ScopeService` request-scoped location isolation (ROLE-02), and `FieldMaskingInterceptor` commercial rate stripping (ROLE-03).
  - **Pino & Swagger**: Structured JSON logging and OpenAPI documentation served at `/api/docs`.
- **Frontend (`apps/web`)**:
  - **React 19 + Vite SPA**: Route-level code splitting, lightweight initial bundle (~118 KB gzipped).
  - **TanStack Query v5**: Server state caching, background refetching, and offline resiliency.
  - **Tailwind CSS v4 + Radix UI + Lucide React**: Dark modern theme with responsive tablet touch targets.
  - **IndexedDB Draft Persistence**: Uses `idb-keyval` to autosave uncommitted daily vouchers on every keystroke.
- **Shared Packages (`packages/*`)**:
  - `@civil/shared`: Zod DTO schemas, enums, permission keys, Decimal helpers, unit conversion tables.
  - `@civil/ui`: Shared UI components, input formatters, and status badges.
  - `@civil/config`: Shared TSConfig presets.

---

## 3. Non-Negotiable Data Rules

1. **Money & Quantity Storage**:
   - Money is stored as `numeric(18,2)`.
   - Quantities and rates are stored as `numeric(18,4)`.
   - Arithmetic is computed strictly via `Decimal.js`.
2. **Base Unit Storage (MAT-12)**: Every item movement is stored in the item's primary base unit (e.g., KG, LTR, MT, CUM), with entered display unit and quantity preserved on voucher lines.
3. **No Hard Deletes (SEC-03)**: Posted vouchers can never be deleted. Cancellation creates reversing ledger rows that restore inventory and balance sheets to net zero.
4. **In-Transaction Audit Trail (ROLE-05)**: Every create, update, delete, and status change records before/after JSON, user, IP, and reason within the same DB transaction.
5. **Row-Level Concurrency Locks**: Stock postings acquire `SELECT ... FOR UPDATE` locks on `stock_balance`, eliminating concurrent double-issue race conditions.
6. **Strict Negative Stock Block (MAT-10)**: Stock can never drop below zero at any point in time. Back-dated entries validate all subsequent historical balances.
7. **Multi-Firm Isolation (MST-01)**: All tables carry `company_id`.
8. **Period Locking & Back-Dating (SEC-04 / MAT-14)**: Dates in closed financial years or locked periods are rejected. Backdating beyond company limits requires `backdate.beyond_limit` approval.

---

## 4. Getting Started

### Prerequisites
- Node.js 22 LTS
- pnpm 10+ (`npm install -g pnpm`)
- PostgreSQL 16+ running locally or via Docker
- Redis 7 running locally or via Docker

### Quick Start with Docker
```bash
# 1. Start PostgreSQL, Redis, and MinIO
docker compose up -d

# 2. Install workspace dependencies
pnpm install

# 3. Apply Drizzle database migrations
pnpm db:migrate

# 4. Seed company, users, 25 materials, and 1 month of realistic civil transactions
pnpm db:seed

# 5. Launch both API and Web apps concurrently
pnpm dev
```

The apps will be available at:
- **Frontend SPA**: `http://localhost:5173`
- **Backend API**: `http://localhost:3000`
- **OpenAPI Swagger Docs**: `http://localhost:3000/api/docs`

---

## 5. Seeded Demo Logins

The database seeder populates realistic Indian civil contractor roles with password `Password@123`:

| Role | Username | Password | Scope & Privileges |
|---|---|---|---|
| **Owner / Director** | `owner` | `Password@123` | Full unrestricted company access, rates visible, approval authority |
| **Site Engineer** | `engineer_nh31` | `Password@123` | Scoped to **NH-31 Highway Site (`ST-NH31`)**, rates masked, daily consumption entry |
| **Head Accountant** | `accountant` | `Password@123` | Commercial rate access, cost sheets, party ledgers, period locks |
| **Central Store Keeper** | `storekeeper` | `Password@123` | Scoped to **Central Godown (`CS-01`)**, GRN receipts, store transfers |

> **Pro-Tip**: The web application header features an **instant role switcher** that lets you switch between Owner, Site Engineer, Accountant, and Store Keeper with one click to test RBAC and rate masking live!

---

## 6. End-to-End Vertical Slice

The vertical slice proves the entire architecture:

1. **Purchase Order (PUR-03)**: Issue PO to UltraTech Cement or Tata Steel with delivery store, unit rates, GST, and printable PDF voucher.
2. **Goods Receipt Note (PUR-04 / MAT-02)**: Inward receipt at Central Godown with supplier challan no, vehicle no, weighbridge slip, and gross/tare/net weight verification. Posts to `stock_ledger` and `party_ledger`.
3. **Store-to-Site Transfer (STR-01 / MAT-01)**: Dispatch cement from Central Store into virtual `IN_TRANSIT` location. Stock leaves the central store immediately.
4. **Site Receipt Confirmation (MAT-05)**: Stock lands in the destination site yard ONLY when the site engineer acknowledges delivery.
5. **Daily Site Consumption (MAT-04)**: Site engineer logs cement and rebar against culvert box chainage. Deducts stock at weighted average valuation rate and posts direct cost to `cost_ledger` under `MATERIAL` head.
6. **Wastage & Adjustments (MAT-07 / MAT-08)**: Material spoilage (rain damage) entered in `PENDING_APPROVAL` status.
7. **Approvals Inbox (APR-01)**: Approver signs off or returns vouchers with remarks.
8. **Cancellation & Reversals (SEC-03)**: Cancelling a posted consumption restores stock balance and posts negative balancing cost rows.
9. **Reports (MAT-06)**: Site Stock Register (Opening, Received, Consumed, Transferred, Wasted, Closing) and Item Running Ledgers with Excel and PDF export triggers.

---

## 7. Module Skeletons (Section 7)

Interactive UI, Drizzle database schemas, and API controllers are scaffolded for:
- **Fuel & Bowser (FUEL-07)**: Mobile bowser locations, fuel purchases, dip readings, and KMPL/LPH variance calculation between full-tank fills.
- **Vehicles & Machines (MST-10)**: Daily logbook with multi-site hour split, hire contracts, tyre tracking, and document expiry scans.
- **Labour Workforce (LAB-09)**: Attendance by trade, masked Aadhaar storage (MST-09), weekly wage sheets, and subcontractor work orders.
- **Petty Cash & Imprest (MST-12)**: Imprest advances to site engineers, bill attachments, and overhead cost allocation.
- **Asphalt & Concrete Plants (PLT-13 / PLT-15)**: Raw-material decomposition per site recipe, crusher split, and site raw-material allocation reporting.
- **Contracts & RA Bills (BIL-06)**: Tender BOQ import, joint measurements, progressive RA bills with 5% retention, 2% TDS u/s 194C, and 1% cess deductions.
- **Site Cost Sheet (CST-01)**: Consolidated P&L comparing cumulative site expenditures against certified client bill revenue.
- **Alert Engines (ALT-01...07)**: BullMQ background scheduled workers scanning low inventory, document expiry, and attendance locking.

---

## 8. Test Suite Verification

Run the comprehensive Vitest test suite verifying ledger mathematical invariants and security constraints:

```bash
# Run tests across workspace
pnpm test

# Run tests in API specifically
pnpm --filter @civil/api test
```

### Verified Test Invariants (20 Passing Tests):
- Weighted average rate calculations after successive receipts at varying rates.
- Back-dated entry recalculations and downstream issue repricing.
- Unit conversion round-trips without float drift (Bags ↔ KG ↔ MT, Brass ↔ Cu.m).
- In-transit virtual location isolation.
- Site consumption posting to stock ledger and cost ledger.
- Append-only cancellation reversal restoring balances to net zero.
- Strict point-in-time negative stock prevention with row-level locks (`SELECT ... FOR UPDATE`).
- Request-scoped location and site isolation (`ScopeService`).
- Response field masking (`FieldMaskingInterceptor`) stripping commercial values for non-privileged users.
- Financial Year boundary checks and locked period constraints (`SEC-04`).

---

## 9. Documentation Index

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): Ledger engines, posting sequences, valuation math, and Mermaid flow diagrams.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): Architectural decisions log (DEC-001 through DEC-012).
- [`docs/REQUIREMENTS_TRACE.md`](docs/REQUIREMENTS_TRACE.md): Traceability matrix mapping every requirement ID to its code files and status.

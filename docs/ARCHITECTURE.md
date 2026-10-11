# Works Contract Management ERP — Architecture Specification

This document details the system design, core ledger engines, valuation mechanisms, security scoping, and transaction lifecycles for the Indian Works Contract ERP.

---

## 1. High-Level Monorepo Architecture

The system is structured as a Turborepo monorepo with strict TypeScript typing across frontend, backend, and shared libraries.

```mermaid
graph TD
    subgraph Frontend ["Frontend (apps/web)"]
        UI["React 19 + Vite SPA"]
        TQ["TanStack Query (Cache/Offline)"]
        IDB["IndexedDB (idb-keyval Drafts)"]
        UI --> TQ
        UI --> IDB
    end

    subgraph Backend ["Backend (apps/api)"]
        Nest["NestJS 11 Engine"]
        Guards["AuthGuard + RbacGuard"]
        Scope["ScopeService (ROLE-02)"]
        Mask["FieldMaskingInterceptor (ROLE-03)"]
        Ledger["PostingService & StockLedgerService"]
        Bull["BullMQ Workers (Redis 7)"]
        Nest --> Guards
        Guards --> Scope
        Scope --> Ledger
        Nest --> Mask
        Ledger --> Bull
    end

    subgraph Storage ["Data Layer"]
        PG[("PostgreSQL 18")]
        Redis[("Redis 7 (Jobs/Queue)")]
        S3[("S3 / MinIO (Attachments)")]
    end

    subgraph Shared ["Shared Workspaces (packages)"]
        SharedPkg["@civil/shared (Schemas, Zod, Units, Money)"]
        UiPkg["@civil/ui (Radix, Inputs, StatusBadges)"]
    end

    UI --> SharedPkg
    UI --> UiPkg
    Nest --> SharedPkg
    Nest --> PG
    Bull --> Redis
    Nest --> S3
```

---

## 2. Location-Centric Multi-Entity Topology (Section 4.1)

Every physical or logical site where stock can sit or cost can occur is represented in `locations`:

- `CENTRAL_STORE`: Central Godown / Base Depot
- `SITE_STORE`: Project Site Camp Yard
- `PLANT_STORE`: Asphalt Hot Mix / Concrete Batching / Stone Crusher Raw Yard
- `FUEL_TANK`: Stationary Bulk Diesel Storage Tank
- `FUEL_BOWSER`: Mobile Bowser Tanker (`current_site_id` tracks active location)
- `IN_TRANSIT`: Virtual staging point for goods on the road

```mermaid
graph LR
    Vendor[External Supplier] -->|GRN PUR-04| CS[Central Godown]
    CS -->|Dispatch Issue STR-01| Transit[(Virtual IN_TRANSIT)]
    Transit -->|Site Confirm MAT-05| SS[NH-31 Site Yard]
    SS -->|Site Consumption MAT-04| SiteWork[Culvert / Road Bed]
    Tank[Bulk Fuel Tank] -->|Fuel Load| Bowser[Mobile Bowser]
    Bowser -->|Dispense FUEL-07| Fleet[Excavators & Tippers]
```

---

## 3. The Core Ledger Engine (Heart of the System)

### 3.1 Append-Only Ledgers

1. **`stock_ledger`**: Append-only movement log (`qty_in`, `qty_out`, `rate`, `value_in`, `value_out`, `running_qty`, `running_value`, `valuation_rate`).
2. **`stock_balance`**: Materialized balance per `(location_id, item_id)` protected with `SELECT ... FOR UPDATE` row-level locks.
3. **`cost_ledger`**: Append-only recording of site costs under standard heads (`MATERIAL`, `LABOUR`, `SUBCONTRACT`, `VEHICLE_FUEL`, `VEHICLE_HIRE`, `MISC_EXPENSE`, `OVERHEAD`).
4. **`party_ledger`**: General sub-ledger for suppliers, clients, subcontractors, and worker advances.

### 3.2 Atomic Posting Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Site Engineer
    participant API as InventoryService
    participant PS as PostingService
    participant SL as StockLedgerService
    participant SB as stock_balance (Table)
    participant CL as CostLedgerService

    User->>API: Submit Site Consumption (MAT-04)
    API->>PS: postSiteConsumption(voucherId, userId)
    PS->>PS: Begin DB Transaction
    PS->>SL: postMovement(location, item, qtyOut)
    SL->>SB: SELECT * FROM stock_balance WHERE location_id AND item_id FOR UPDATE
    Note over SL,SB: Row-level lock acquired (Prevents race conditions)
    SL->>SL: Verify currentQty >= qtyOut (Negative Stock Check MAT-10)
    SL->>SL: Compute Valuation (calculateIssue MAT-11)
    SL->>SB: UPDATE stock_balance SET currentQty = currentQty - qtyOut
    SL->>SL: INSERT INTO stock_ledger (qty_out, running_qty, valuation_rate)
    PS->>CL: postCost(siteId, CostHead.MATERIAL, totalValue)
    PS->>PS: INSERT INTO audit_logs (ROLE-05)
    PS->>PS: Commit DB Transaction
    PS-->>User: HTTP 200 { voucherNo, status: 'POSTED' }
```

---

## 4. Weighted Average Valuation & Back-Dating (MAT-11 / MAT-14)

### Weighted Average Receipt Formula
$$\text{New Qty} = \text{Current Qty} + \text{Received Qty}$$
$$\text{New Value} = \text{Current Value} + (\text{Received Qty} \times \text{Received Rate})$$
$$\text{New Valuation Rate} = \frac{\text{New Value}}{\text{New Qty}}$$

### Back-Dating Revaluation Cycle
When a receipt or adjustment is entered with a historical `txn_date`:
1. **Synchronous Validation**: Verifies that inserting the entry will not cause stock to drop below zero at any point between `txn_date` and current date.
2. **Asynchronous Job**: Enqueues a job in BullMQ (`revaluation-queue`). The processor steps through all subsequent ledger entries in chronological order, updates running balances, recomputes average rates, and updates downstream consumption entries in `cost_ledger`.

```mermaid
graph TD
    Entry[Back-Dated Receipt Txn] --> Validate{Check All Future Dates Stock >= 0?}
    Validate -->|No| Reject[Throw BadRequest: Stock would drop negative MAT-10]
    Validate -->|Yes| Insert[Insert into stock_ledger with historical txn_date]
    Insert --> Queue[BullMQ: revaluation-queue]
    Queue --> Worker[RevaluationProcessor]
    Worker --> Recalc[Recalculate running_qty & valuation_rate forward]
    Recalc --> Reprice[Reprice downstream consumption & cost_ledger rows]
```

---

## 5. Security: Scoping, RBAC, and Field Masking

```mermaid
graph TD
    Request[HTTP Request] --> AuthGuard[AuthGuard: JWT + Argon2 Session]
    AuthGuard --> RbacGuard[RbacGuard: Module & Action Permissions]
    RbacGuard --> Scope[ScopeService: Location Scoping ROLE-02]
    Scope --> DB[(PostgreSQL Restricted Query)]
    DB --> Service[Service Response]
    Service --> Masking[FieldMaskingInterceptor ROLE-03]
    Masking --> Check{User Has 'rates.view'?}
    Check -->|Yes| Full[Return Full JSON with rates & amounts]
    Check -->|No| Stripped[Strip unitRate, lineAmount, grandTotal, etc.]
    Stripped --> Client[Client SPA / API Consumer]
```

- **ScopeService (ROLE-02)**: Request-scoped provider injected into queries. Site engineers can only access data belonging to their assigned site IDs and location IDs.
- **FieldMaskingInterceptor (ROLE-03)**: Automatically strips sensitive commercial values (`unitRate`, `lineAmount`, `grandTotal`, `valuationRate`, `debit`, `credit`) before response serialization if the user lacks commercial permissions.

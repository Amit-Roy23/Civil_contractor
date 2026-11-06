# Server mode (Stage 1)

The web app runs in one of two modes:

| | Demo mode (default) | Server mode |
|---|---|---|
| Turned on by | nothing | `VITE_DATA_MODE=api` on the web build |
| Where data lives | the visitor's browser | PostgreSQL, through the API |
| Logins | role cards, any password | real passwords (argon2), mobile OTP, 2FA by OTP |
| Business rules | checked in the browser | **checked again on the server**; the browser cannot bypass them |
| Shared between users | no | yes; every user sees everyone's entries within their access |

## How it works

```
apps/web  ──(same screens)──▶  data/store.ts ──▶ POST /api/v2/data/commands  ──▶  @civil/domain/policy
                                     ▲                                               │ permission, site scope,
                                     └──── GET /api/v2/data/snapshot (per-user view) │ validation, stock, limits,
                                                                                     ▼ numbering, audit
                                                                               PostgreSQL (wcm_* tables)
```

- **`packages/domain`** (`@civil/domain`) is the single copy of the business model: types, stock ledger, costing,
  selectors, sample data, and the server rules (`schemas.ts`, `policy.ts`, `visibility.ts`). The web app and the
  API both use it, so a screen and the server can never disagree about a calculation.
- Every change from a screen is a **command** (`insert`, `update`, `decide`, `settings`, `company`, `markRead`).
  The server decides voucher numbers, statuses (posted / pending approval / in transit), rates (from the PO or
  work order), the approval route, and writes the audit trail. It rejects anything that breaks a rule, such as:
  - stock going negative (MAT-10)
  - back-dating beyond the limit, which goes for approval instead (MAT-14)
  - an entry for a site the user is not assigned to (ROLE-02)
  - an amount or rate entered by a role that cannot see rates (ROLE-03)
  - approving your own entry, or approving above your limit (APR-01/02)
  - editing locked attendance (LAB-05)
  - cancelling without a reason, or by anyone other than Admin (SEC-03)
- Each user downloads **only what they may see**. A site engineer receives only their sites, with rates and amounts
  zeroed. Payments, overheads and the audit log never reach roles that should not see them.
- The screen updates instantly, then shows the server's answer (the final number and status). If the server refuses,
  the user sees the reason and the screen reloads from the server. Every 20 seconds, and whenever the tab gets focus,
  the app checks for other users' changes.
- Writes are serialised per company with a PostgreSQL advisory lock, so two people saving at once never lose an
  entry or skip a voucher number. The tables are created automatically when the API starts (`CREATE TABLE IF NOT EXISTS`).

## Deploying

**Recommended: one server on your own domain with Docker and automatic HTTPS — see [DEPLOY.md](DEPLOY.md).** The options below host the app and the API separately.

### API (Render)

- **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm turbo run build --filter=@civil/api`
  (this builds `@civil/domain` first).
- **Start command:** `pnpm --filter @civil/api start`
- **Environment:**
  - `DATABASE_URL`, `JWT_SECRET` (long random string), `JWT_REFRESH_SECRET`, `REDIS_HOST`/`REDIS_PORT`
    (used by the v1 alert jobs), and the S3 variables already required by the API.
  - `CORS_ORIGIN`: the Vercel URL. A comma-separated list is allowed, e.g. `https://wcm.vercel.app,http://localhost:5173`.
  - `BUSINESS_TZ=Asia/Kolkata`.
  - Demo server: `DEMO_COMPANY=demo`, `DEMO_PASSWORD=...`.
  - Client server: `DEMO_COMPANY=off`.
  - OTP by SMS: `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID` (an MSG91 Flow template with an `##otp##` variable).
    Until these are set, password login works, and OTP login returns "SMS is not set up" in production.

### Web (Vercel)

- Environment: `VITE_DATA_MODE=api`, `VITE_API_URL=https://<your-render-app>.onrender.com/api`.
- Leave `VITE_DATA_MODE` empty for a pure in-browser demo, which needs no server at all.

## Offline use, backups and Excel (Phase 1)

- **Offline (PF-03):** every change goes into an outbox on the device (IndexedDB) and is sent in order when there is network. The header shows "Offline · N unsent" or "Sending N…". Each entry carries a unique id; the server keeps a log of applied ids (`wcm_command_log`, 60 days), so a retry after a lost answer is never saved twice. The last data received is cached, so the app opens and shows data without network. A service worker (`public/sw.js`) keeps the app's own files; it never caches API data.
- **Backups (PF-07):** each client company is backed up once a day into `wcm_backups` (kept `BACKUP_KEEP_DAYS`, default 30; set `BACKUP_DAILY=off` to stop). With `BACKUP_S3=on` a copy also goes to `BACKUP_S3_BUCKET` (or `S3_BUCKET`); this has not yet been tried against a real bucket. Administration › Backups & data offers "Back up now", download, and "Restore to a test copy", which restores into a separate company (`<code>-test-<id>`, never chosen at sign-in by default) and compares every collection. From the command line:
  - `pnpm --filter @civil/api backup -- create --code sd`
  - `pnpm --filter @civil/api backup -- restore --file F --code new-code`
  - Add `--replace` only for disaster recovery.
- **Excel (XL-04 / PF-06):** Masters › Import & export has a template, an export and an import for works (Query 1 column names), clients, suppliers, sub-contractors, materials, workers, machines, BOQ, opening stock and party balances. Every row is checked in the browser first. The server applies the whole file in one transaction (all or nothing) and reports any failure by row.

## Setting up a real client

On the API server (Render shell), after a build:

From a setup file of the client's own masters (firm, clients, stores, plant, machines, materials), for example Saurajit Deb:

```bash
pnpm --filter @civil/api company:create -- --code sd --from setup/saurajit-deb.json --owner-password 'choose-a-strong-one'
# check the file first without saving:  ... --dry-run
```

Or a bare company:

```bash
pnpm --filter @civil/api company:create -- --code acme --name "Acme Infra Pvt Ltd" \
  --owner-name "Owner Name" --owner-username owner --owner-phone 9800000000 --owner-password 'choose-a-strong-one'
```

This creates an empty company with:
- the standard roles (Owner, Accountant, Store Keeper, Site Engineer, Plant In-charge, Fleet In-charge)
- standard units, expense heads and settings

The owner then signs in and enters, or imports, sites, stores, materials, suppliers, workers and vehicles in
**Masters**, and creates users (with passwords) in **Admin → Users**.

If one server hosts several clients, users type their company code on the login page. Alternatively, set
`DEFAULT_COMPANY` on a single-client server.

## API reference (v2)

| Method | Path | |
|---|---|---|
| GET | `/api/v2/auth/config` | login page options (demo users for the role cards) |
| POST | `/api/v2/auth/login` | `{ username, password, company? }` → token, or `{ otpRequired, ticket }` for 2FA |
| POST | `/api/v2/auth/otp/request` | `{ login, company? }` (mobile number or username) → ticket |
| POST | `/api/v2/auth/otp/verify` | `{ ticket, code }` → token |
| POST | `/api/v2/auth/demo` | `{ userId }`: one-click sign-in, demo company only |
| POST | `/api/v2/auth/password` | change own password `{ current, next }` |
| GET | `/api/v2/data/snapshot` | everything this user may see, plus `rev` |
| GET | `/api/v2/data/rev` | current revision (cheap; used for polling) |
| POST | `/api/v2/data/commands` | `{ cmd }` → `{ rev, record, changes }` |
| POST | `/api/v2/admin/users/:id/password` | Admin sets a user's password |
| POST | `/api/v2/admin/reset-demo` | Admin of the demo company restores the sample data |

Security details:
- Tokens last 12 hours (`SESSION_HOURS`), and each request re-checks that the user is still active.
- Five wrong passwords lock the account for 15 minutes.
- Logins and OTPs are rate-limited.

The older `/api/...` (v1) endpoints are unchanged.

## Tests

- `pnpm --filter @civil/domain test`: schemas accept every sample record, and rule tests cover stock, scope,
  masking, approvals, limits, attendance lock and RA bills.
- `pnpm --filter @civil/api test`: includes `v2-store.spec.ts`, which checks the persistence round-trip, that
  12 concurrent writes produce gapless numbers, and that a failed command changes nothing. Needs PostgreSQL.

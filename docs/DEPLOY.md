# Going live on your own domain

WCM runs on one server as five containers:

| Container | What it does |
|---|---|
| **caddy** | Serves the app on your domain with free HTTPS (Let's Encrypt, renewed automatically) and sends `/api` to the API |
| **api** | The server and all business rules |
| **postgres** | The database. Not reachable from the internet. |
| **redis** | The alert job queue. Not reachable from the internet. |
| **backup** | A full database backup every night at 02:30 IST, kept 14 days |

The app and the API share one address (`https://your-domain/api`), so you need only one domain or sub-domain. No cross-site settings are needed.

## What you need

1. **A server.**
   - **Specification:** Ubuntu 24.04 (or Debian 12), with at least 2 vCPU, 4 GB RAM and 40 GB disk.
   - **Mumbai region, for speed in Tripura:** any of these will do:
     - AWS Lightsail (₹1,700–2,000 / month);
     - DigitalOcean Bangalore;
     - Hetzner (cheapest, Europe);
     - Hostinger / E2E Networks VPS.
2. **A domain**, e.g. `saurajitdeb.in`, from GoDaddy, Hostinger, Namecheap or BigRock. A sub-domain such as `erp.saurajitdeb.in` is fine.
3. **Ports 80 and 443 open** on the server (the installer opens them in `ufw`). In AWS / Lightsail, also open them in the provider's firewall.

## Step 1 — point the domain to the server

In your domain provider's DNS settings, add an **A record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `erp` (or `@` for the bare domain) | your server's public IP | 600 |

Wait until it resolves. Check with `ping erp.saurajitdeb.in` from your computer, or with dnschecker.org. HTTPS cannot be issued until the name points to the server.

**Both `www` and the bare domain:** add an A record for each name, and put both names in `DOMAIN`, separated by a comma (`DOMAIN=saurajitdeb.in, www.saurajitdeb.in`).

## Step 2 — install

Log in to the server over SSH and run:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/Amit-Roy23/Civil_contractor.git wcm
cd wcm
sudo ./deploy/install.sh --domain erp.saurajitdeb.in --email you@saurajitdeb.in --company sd
```

If the repository is private, `git clone` asks for your GitHub username and a **personal access token** (GitHub › Settings › Developer settings › Fine-grained tokens, read-only access to this repository) in place of the password.

The installer:

1. installs Docker;
2. writes `deploy/.env` with new random passwords and secrets;
3. opens the firewall;
4. builds the app;
5. starts the five containers and waits until the API is healthy.

The first build takes about 5 minutes.

## Step 3 — create the company and its owner login (once)

```bash
cd deploy
./create-company.sh --code sd --from setup/saurajit-deb.json --owner-password 'choose-a-strong-password'
```

This loads Saurajit Deb's masters: firm, client offices, stores, plant, machines and materials. For another firm, use the bare form:

```bash
./create-company.sh --code acme --name "Acme Infra Pvt Ltd" --owner-name "Owner Name" \
  --owner-username owner --owner-phone 9800000000 --owner-password 'choose-a-strong-password'
```

Open `https://erp.saurajitdeb.in` and sign in. For Saurajit Deb, the username is `saurajit`. Then add the other users in **Administration › Users**.

`DEFAULT_COMPANY=sd` in `deploy/.env` means staff never type a company code. Other companies on the same server sign in with "Sign in to another company".

## Day-to-day

| Task | Command (in `deploy/`) |
|---|---|
| See status | `docker compose ps` |
| API logs | `docker compose logs -f api` |
| Back up now | `./backup-now.sh` (files go to `deploy/backups/`) |
| Restore everything from a backup | `./restore-db.sh backups/wcm-20261106-023000.dump` (makes a safety copy first, asks you to type RESTORE) |
| Update to the latest version | `./update.sh` (backs up first, pulls, rebuilds, restarts) |
| Restart | `docker compose restart` |

**Backups.** There are three layers:

1. **Nightly full database dump** in `deploy/backups/`, kept `DB_BACKUP_KEEP_DAYS` (14) days.
2. **The app's own daily backup** of each company, with "Restore to a test copy", in **Administration › Backups & data**.
3. **Your own off-site copy.** Copy `deploy/backups/` off the server regularly: download it, or set `BACKUP_S3=on` with an S3 bucket in `.env`. A backup on the same server does not protect against losing the server. Most providers also offer daily server snapshots for a small fee; turn them on.

**Health.** `https://your-domain/health` answers `{"status":"ok","database":"ok"}` only when the database is reachable. Point a free monitor at it (UptimeRobot, Better Stack) to get an e-mail or SMS if the site goes down.

## Settings (`deploy/.env`)

| Setting | Meaning |
|---|---|
| `DOMAIN` | Your address, one or more names separated by commas |
| `ACME_EMAIL` | Let's Encrypt certificate notices (optional) |
| `DEFAULT_COMPANY` | Company code used at sign-in |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` | Generated by the installer. Never share them; never change the JWT ones casually (everyone is signed out). |
| `DEMO_COMPANY=off` | No demo company on a live server |
| `SESSION_HOURS` | How long a sign-in lasts (default 12) |
| `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` | Turn on OTP sign-in by SMS |
| `BACKUP_S3`, `S3_*` | Off-site backup copy |
| `API_DOCS=on` | Show the API reference at `/api/docs` (off by default) |

After changing `.env`, run `docker compose up -d`.

## Security built in

- **HTTPS only.** HTTP redirects to HTTPS, with HSTS. Security headers are set: a strict Content-Security-Policy with no inline scripts, clickjacking protection, no MIME sniffing.
- **Safe start-up.** The API refuses to start in production with weak or sample secrets, a default database password, a localhost address, or the demo company left on.
- **Database and queue stay private.** Neither is exposed to the internet; only ports 80 and 443 are open.
- **Logins.**
  - Passwords are hashed with argon2.
  - Five wrong passwords lock the account for 15 minutes.
  - Logins and OTPs are rate-limited per visitor, using the real client IP passed on by Caddy.
- **Sessions** expire after `SESSION_HOURS`, and every request re-checks that the user is still active.
- **Containers** run as a non-root user and restart automatically. Logs are rotated (5 × 10 MB per container).

## Tested

The full stack was built from this repository and run with `DOMAIN=localhost`, where Caddy uses its local certificate. The test covered:

- HTTPS served the app;
- HTTP redirected to HTTPS;
- the security headers were present, and `/api/docs` was off;
- the health check reached the database;
- the production safety checks refused to start with an unsafe setting;
- the company was created from the setup file;
- all 95 screens opened without errors, on desktop and phone width, for Saurajit Deb's company and for a brand-new empty company, with no security-policy violations;
- PDF printing worked;
- the installed app opened offline;
- the nightly backup ran;
- a full restore brought the database back to the backup.

## Other ways to host

- **Vercel + MongoDB Atlas:** see [VERCEL_MONGODB.md](VERCEL_MONGODB.md). No server to look after; set-up from the browser.

- **Vercel (app) + Render (API) + a managed PostgreSQL:** see `docs/SERVER_MODE.md`. No server to look after, but two domains to set up, and a monthly cost per service.
- **Behind Cloudflare:** set the DNS record to "DNS only" (grey cloud). If you want the orange-cloud proxy, set SSL to "Full (strict)".

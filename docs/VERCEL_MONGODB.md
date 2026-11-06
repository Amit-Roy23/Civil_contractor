# Going live on Vercel with MongoDB Atlas (saurajitdeb.online)

The app and its server both run on Vercel, and all data is kept in MongoDB Atlas. There is no demo data: the first visit shows a one-time set-up screen that creates the client's company and the owner's login.

```
Browser / phone ──https──▶ Vercel: the app (static files) + /api (one serverless function)
                                                    │  same business rules as every other version
                                                    ▼
                                    MongoDB Atlas (database "wcm")
```

## 1. Create the database (MongoDB Atlas, about 10 minutes)

1. Sign up at **mongodb.com/atlas** and create a project, e.g. "WCM".
2. **Create a cluster.**
   - **Provider and region:** AWS, **Mumbai (ap-south-1)**.
   - **Tier:**
     - **M10 or higher** for the client's daily use: it includes Atlas's own continuous backups.
     - **M0 (free)** is fine for trying it out: it has no Atlas backups, but the app still keeps its own daily backups (step 6).
3. **Database Access** › Add New Database User.
   - Username: `wcm`.
   - Password: click **Autogenerate** and save it.
   - Role: "Read and write to any database".
4. **Network Access** › Add IP Address › **Allow access from anywhere (0.0.0.0/0)**. Vercel's servers have changing addresses; the password and TLS protect the database.
5. **Connect** › Drivers › copy the connection string. Then:
   - Replace `<password>` with the password from step 3.
   - Put the database name `wcm` after the host, before the `?`.

   It looks like:

   ```
   mongodb+srv://wcm:YOUR-PASSWORD@cluster0.abcde.mongodb.net/wcm?retryWrites=true&w=majority
   ```

## 2. Put the app on Vercel

1. At **vercel.com** › Add New › Project › import the GitHub repository `Amit-Roy23/Civil_contractor`.
2. **Root Directory:** `apps/web`. **Framework Preset:** Other. Leave the build and install commands empty; `apps/web/vercel.json` sets them.
3. **Environment Variables:** add these before the first deploy.

| Name | Value |
|---|---|
| `MONGODB_URI` | the connection string from step 1.5 |
| `JWT_SECRET` | a long random value: run `openssl rand -hex 32`, or use 64 random letters and digits |
| `SETUP_KEY` | a password of your own (12+ characters), used once on the set-up screen |
| `CRON_SECRET` | another random value (16+ characters); switches on the daily backup |
| `DEFAULT_COMPANY` | `sd` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses the same pnpm version as the project) |

4. **Settings › General › Node.js Version:** 22.x.
5. Deploy. When it is done, open the `….vercel.app` address. It should show **First-time set-up**.

Check the server at `https://<your-address>/health`. It must say `"status":"ok","database":"ok"`. Anything else names what is missing.

## 3. Connect saurajitdeb.online

1. In Vercel: Project › **Settings › Domains** › add `saurajitdeb.online`, then `www.saurajitdeb.online`. Choose to redirect `www` to the main name.
2. Vercel shows the DNS records to create, usually:

| Type | Name | Value |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

   Use exactly what Vercel shows if it differs.

3. In **Hostinger** › Domains › saurajitdeb.online › **DNS / Nameservers**:
   - Delete the existing "parked" A record for `@` and any CNAME for `www`.
   - Add the two records above.
4. Within a few minutes to an hour, Vercel marks both names **Valid Configuration** and issues the HTTPS certificate automatically.

## 4. Create the company (once)

Open **https://saurajitdeb.online** and fill in the First-time set-up form:

- **Set-up key:** the `SETUP_KEY` from step 2.
- **Start from:** *M/s Saurajit Deb*. This loads the firm, the PWD offices, stores, plant, machines and materials.
- **Company code:** `sd`.
- **Owner password:** twice.

Click **Create company**, then sign in as **saurajit** with that password. The set-up screen never appears again.

Then:

- add each person in **Administration › Users**, limited to their works;
- load the opening data from Excel in **Masters › Import & export**.

## 5. Daily use

- **Shared data:** every phone and PC works on the same data. Changes appear on the others within 20 seconds.
- **Offline:** entries made without network are sent when it returns, and are never saved twice.
- **Sign-in protection:** five wrong passwords lock that login for 15 minutes, and sign-in attempts are rate-limited.
- **OTP sign-in by SMS:** add `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID` to the Vercel variables and redeploy.

## 6. Backups

- **Daily, automatic.** At 02:30 IST, Vercel Cron backs up every company inside MongoDB and keeps 30 days (`BACKUP_KEEP_DAYS`). This needs `CRON_SECRET`.
- **Manual.** In Administration › Backups & data you can:
  - **Back up now**;
  - **Download** a backup file;
  - **Restore to a test copy**, which proves a backup is complete.
- **Your own copy.** Download a backup **every week** and keep it off the server, for example in Google Drive.
- **Atlas backups.** On M10 and higher, Atlas keeps its own continuous backups with point-in-time restore. Turn them on in the cluster's Backup tab.

## If the sign-in page says "Cannot reach the server" or "The server is not running at /api"

Open `https://<your-site>/health` in the browser and look at what it shows.

| `/health` shows | Meaning | Fix |
|---|---|---|
| `{"status":"ok","database":"ok"}` | The server is fine. | Clear the browser cache, or press Ctrl+Shift+R, and sign in. |
| `{"status":"down","problems":[…]}` | A Vercel variable is missing. | Add what it names (`MONGODB_URI`, `JWT_SECRET`), then **Redeploy**. |
| `{"status":"down","database":"unreachable"}` | MongoDB refuses the connection. | In Atlas, check **Network Access** has `0.0.0.0/0`, and check the password inside `MONGODB_URI`. |
| The sign-in page itself, or "404" | Only the web pages were deployed, not the server. | See the checklist below. |

**Checklist in Vercel** (Project › Settings):

1. **Environment Variables:** delete `VITE_API_URL` and `VITE_DATA_MODE` if they are there, left from an older set-up. Then add `MONGODB_URI`, `JWT_SECRET`, `SETUP_KEY`, `CRON_SECRET`, `DEFAULT_COMPANY=sd` and `ENABLE_EXPERIMENTAL_COREPACK=1`.
2. **Build and Deployment:**
   - **Framework Preset:** Other.
   - **Build Command, Output Directory and Install Command:** switch the **Override** toggles **off**. The repository's `vercel.json` sets them.
   - **Root Directory:** either the repository root or `apps/web` works.
3. **Redeploy.** Go to Deployments › ⋯ › Redeploy, and untick "Use existing Build Cache".
4. **Check the build.** In the build log, the last lines must say `✓ Vercel output written to .vercel/output (static app + /api function …)`.

## Limits worth knowing

- **Vercel plan.** The Hobby (free) plan is for non-commercial use. For a client's business, use **Vercel Pro**.
- **Upload size.** One upload is limited to 4.5 MB. Very large Excel imports, beyond a few thousand rows, should be split into two files.
- **First request after idle.** It can take 2–3 seconds while the server starts. After that it is fast.
- **Moving from the Docker / PostgreSQL version.** Passwords cannot be carried over (the password formats differ). Restore the data from a backup, then set each user's password again in Administration › Users.

## Tested before release

The deployable function was built from a clean copy with Vercel's own install command. It was then run against a MongoDB replica set, which is the setup Atlas uses. The tests covered:

- **Set-up screen:** a wrong key was refused. The company was then created from the Saurajit Deb template, and a second set-up was refused.
- **Sign-in:** the owner signed in. The password was stored as a hash, never in the data.
- **Two devices:** a supplier added on one device appeared on another.
- **All 95 screens:** opened without errors.
- **Parallel saves:** 12 simultaneous saves across two server instances got numbers 0001–0012, with no gaps or duplicates, and both instances showed the same data.
- **Retries:** an entry re-sent after a lost answer was saved once. An entry refused by a business rule changed nothing.
- **Site engineer:** saw only his work and no payments.
- **Lockout:** five wrong passwords locked the login.
- **Backups:**
  - a manual backup, then a restore test (all records matched), then a download;
  - the daily job refused calls without `CRON_SECRET`, and ran once per day;
  - the test copy was removed afterwards.
- **Health check:** `/health` answered from the database.

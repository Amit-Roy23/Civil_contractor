/**
 * Set up a real client company (blank data + standard roles, units, expense heads and settings).
 *
 *   pnpm --filter @civil/api company:create -- --code acme --name "Acme Infra Pvt Ltd" \
 *     --owner-name "Owner Name" --owner-username owner --owner-phone 9800000000 --owner-password '********'
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { buildMasters } from '@civil/domain/seed-masters';
import { emptyDB } from '@civil/domain/demo';
import { fyCode } from '@civil/domain/format';
import { V2Store } from './store.js';
import { clock } from './clock.js';

function arg(name: string, required = true) {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v && required) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return v || '';
}

async function main() {
  const code = arg('code').toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(code)) throw new Error('--code: 2–30 lowercase letters, digits or dashes');
  const password = arg('owner-password');
  if (password.length < 8) throw new Error('--owner-password: at least 8 characters');
  const store = new V2Store();
  await store.ensureSchema();
  if (await store.company(code)) throw new Error(`Company ${code} already exists`);
  const { today } = clock();
  const m = buildMasters(today);
  const db = emptyDB({ name: arg('name'), gstin: arg('gstin', false), pan: arg('pan', false), address: arg('address', false), phone: arg('owner-phone', false), email: arg('email', false), fy: fyCode(today), banks: [] }, m.settings, m.roles);
  db.units = m.units;
  db.expenseHeads = m.expenseHeads;
  db.seededOn = today;
  db.users = [{ id: 'u1', name: arg('owner-name'), username: arg('owner-username').toLowerCase(), phone: arg('owner-phone', false), email: arg('email', false), roleId: 'owner', siteIds: [], plantIds: [], active: true }];
  await store.replaceAll(code, db.company.name, false, db);
  await store.setPassword(code, 'u1', await argon2.hash(password, { type: argon2.argon2id }));
  console.log(`✅ Company "${code}" created. Sign in as ${db.users[0]!.username}.`);
  await store.sql.end();
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

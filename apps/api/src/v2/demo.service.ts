import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { buildDemoDB } from '@civil/domain/demo';
import { V2Store } from './store.js';
import { clock } from './clock.js';

/**
 * The demo company: generated sample data (dated around "today") for showing the software to clients.
 * Created at start-up when DEMO_COMPANY is set (default "demo"; set DEMO_COMPANY=off to disable).
 */
@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private log = new Logger('Demo');
  constructor(private store: V2Store) {}

  id() {
    const v = (process.env.DEMO_COMPANY ?? 'demo').trim().toLowerCase();
    return v === 'off' || v === 'false' || v === '' ? '' : v;
  }
  /** role cards on the login page */
  oneClick() {
    return !!this.id() && process.env.DEMO_ONE_CLICK !== 'false';
  }

  async onApplicationBootstrap() {
    const id = this.id();
    if (!id) return;
    const existing = await this.store.company(id);
    if (!existing) await this.seed(id);
  }

  async seed(id: string) {
    const t0 = Date.now();
    const db = buildDemoDB(clock().today);
    await this.store.replaceAll(id, db.company.name, true, db);
    const hash = await argon2.hash(process.env.DEMO_PASSWORD || 'demo@123', { type: argon2.argon2id });
    for (const u of db.users) await this.store.setPassword(id, u.id, hash);
    this.log.log(`Demo company "${id}" seeded in ${Date.now() - t0} ms`);
  }
}

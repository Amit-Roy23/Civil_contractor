import { Controller, Get, HttpCode, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { V2Store } from './v2/store.js';

@Controller()
export class AppController {
  constructor(private readonly store: V2Store) {}

  @Get()
  root(@Res() res: Response) {
    return res.redirect(process.env.NODE_ENV === 'production' && process.env.API_DOCS !== 'on' ? '/health' : '/api/docs');
  }

  /** for the load balancer / container health check: up only when the database answers */
  @Get('health')
  @HttpCode(200)
  async health() {
    const t0 = Date.now();
    try {
      await this.store.sql`select 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'down', database: 'unreachable' });
    }
    return { status: 'ok', database: 'ok', dbMs: Date.now() - t0, uptimeSec: Math.round(process.uptime()), timestamp: new Date().toISOString() };
  }
}

import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class AppController {
  @Get()
  root(@Res() res: Response) {
    return res.redirect('/api/docs');
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'Civil Contractor Works ERP API',
      docsUrl: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }
}

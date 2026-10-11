import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';
import { CostLedgerService } from '../ledger/cost-ledger.service.js';

@ApiTags('Costing')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('costing')
export class CostingController {
  constructor(private readonly costLedgerService: CostLedgerService) {}

  @Get('site/:siteId/summary')
  @ApiOperation({ summary: 'Site Cost Sheet summary grouped by Cost Head (CST-01)' })
  async getSiteCostSummary(
    @Param('siteId') siteId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.costLedgerService.getSiteCostSummary(siteId, fromDate, toDate);
  }
}

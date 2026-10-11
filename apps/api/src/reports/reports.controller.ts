import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../core/auth/auth.guard.js';
import { RbacGuard, RequirePermissions } from '../core/rbac/rbac.guard.js';
import { ReportsService } from './reports.service.js';
import { ReportFilterDto, ReportFilterSchema, PERMISSION_KEYS } from '@civil/shared';
import { Response } from 'express';
import { JwtUserPayload } from '../core/auth/auth.types.js';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(AuthGuard, RbacGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('stock-register')
  @RequirePermissions(PERMISSION_KEYS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Site Stock Register (Opening, In, Out, Closing Qty & Value) (Section 6.6)' })
  async getStockRegister(
    @Query() query: ReportFilterDto,
    @CurrentUser() user: JwtUserPayload,
    @Res() res: Response,
  ) {
    const validated = ReportFilterSchema.parse({
      ...query,
      companyId: user.companyId,
    });

    if (validated.format === 'excel') {
      const buffer = await this.reportsService.exportStockRegisterExcel(validated);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="stock_register.xlsx"');
      return res.send(buffer);
    } else if (validated.format === 'pdf') {
      const data = await this.reportsService.getSiteStockRegister(validated);
      const dateRange = `${validated.fromDate || 'Start'} to ${validated.toDate || 'Present'}`;
      const html = this.reportsService.generateStockRegisterHtml(data, dateRange);
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } else {
      const data = await this.reportsService.getSiteStockRegister(validated);
      return res.json(data);
    }
  }

  @Get('item-ledger')
  @RequirePermissions(PERMISSION_KEYS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Item Ledger with running balance movements (Section 6.6)' })
  async getItemLedger(
    @Query() query: ReportFilterDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const validated = ReportFilterSchema.parse({
      ...query,
      companyId: user.companyId,
    });
    return this.reportsService.getItemLedger(validated);
  }

  @Get('in-transit')
  @RequirePermissions(PERMISSION_KEYS.REPORTS_VIEW)
  @ApiOperation({ summary: 'In-Transit Transfer Dispatches Report (Section 6.6)' })
  async getInTransit(@CurrentUser() user: JwtUserPayload) {
    return this.reportsService.getInTransitReport(user.companyId);
  }
}

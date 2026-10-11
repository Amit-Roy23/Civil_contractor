import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';

@ApiTags('Contract & Billing Skeletons')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('contract')
export class ContractController {
  @Post('boq/import')
  @ApiOperation({ summary: 'TODO(BIL-01): Tender BOQ schedule Excel import' })
  async importBoq() {
    return { status: 'TODO(BIL-01)', message: 'BOQ import scaffolded' };
  }

  @Post('measurement')
  @ApiOperation({ summary: 'TODO(BIL-02): Measurement Book (MB) entry against BOQ items' })
  async recordMeasurement() {
    return { status: 'TODO(BIL-02)', message: 'Measurement Book scaffolded' };
  }

  @Post('ra-bill')
  @ApiOperation({ summary: 'TODO(BIL-06): Running Account (RA) Bill with retention, TDS, and GST-TDS deductions' })
  async generateRaBill() {
    return { status: 'TODO(BIL-06)', message: 'Client RA Bill generator scaffolded' };
  }
}

import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';

@ApiTags('Vehicles & Fleet Skeletons')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('vehicles')
export class VehiclesController {
  @Post('logbook')
  @ApiOperation({ summary: 'TODO(VEH-01): Daily vehicle logbook entry with multi-site split' })
  async recordLogbook() {
    return { status: 'TODO(VEH-01)', message: 'Daily vehicle logbook scaffolded' };
  }

  @Get('hire-bills')
  @ApiOperation({ summary: 'TODO(VEH-02): Hired vehicle billing & log reconciliation' })
  async getHireBills() {
    return { status: 'TODO(VEH-02)', message: 'Hired fleet bills scaffolded' };
  }

  @Post('job-cards')
  @ApiOperation({ summary: 'TODO(VEH-03): Workshop maintenance job card & spare parts consumption' })
  async createJobCard() {
    return { status: 'TODO(VEH-03)', message: 'Maintenance job card scaffolded' };
  }

  @Get('document-expiry')
  @ApiOperation({ summary: 'TODO(VEH-04): Fitness, tax, insurance, PUC expiry alerts' })
  async getDocumentExpiry() {
    return { status: 'TODO(VEH-04)', message: 'Fleet document compliance monitor scaffolded' };
  }
}

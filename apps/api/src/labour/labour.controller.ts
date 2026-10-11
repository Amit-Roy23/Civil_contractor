import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';

@ApiTags('Labour & Attendance Skeletons')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('labour')
export class LabourController {
  @Post('attendance')
  @ApiOperation({ summary: 'TODO(LAB-01): Daily worker & trade headcount attendance' })
  async recordAttendance() {
    return { status: 'TODO(LAB-01)', message: 'Daily attendance scaffolded' };
  }

  @Get('wage-runs')
  @ApiOperation({ summary: 'TODO(LAB-02): Periodic wage generation & cash/bank payment sheets' })
  async getWageRuns() {
    return { status: 'TODO(LAB-02)', message: 'Wage sheet generator scaffolded' };
  }

  @Post('subcontractor-bills')
  @ApiOperation({ summary: 'TODO(LAB-03): Labour subcontractor work order & measurement bills' })
  async recordSubcontractorBill() {
    return { status: 'TODO(LAB-03)', message: 'Subcontractor RA bill scaffolded' };
  }
}

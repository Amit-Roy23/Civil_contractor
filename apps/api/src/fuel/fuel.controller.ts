import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';

@ApiTags('Fuel Skeletons')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('fuel')
export class FuelController {
  @Get('tanks')
  @ApiOperation({ summary: 'TODO(FUEL-01): Fuel tanks and bowsers as locations' })
  async getFuelLocations() {
    return { status: 'TODO(FUEL-01)', message: 'Fuel storage locations' };
  }

  @Post('purchases')
  @ApiOperation({ summary: 'TODO(FUEL-02): Bulk fuel purchase into tank/bowser' })
  async recordFuelPurchase() {
    return { status: 'TODO(FUEL-02)', message: 'Bulk HSD receipt scaffolded' };
  }

  @Post('loads')
  @ApiOperation({ summary: 'TODO(FUEL-07): Fuel load with odometer/hour validation & variance' })
  async recordFuelLoad() {
    return {
      status: 'TODO(FUEL-07)',
      message: 'Fuel issue with expected litres = distance/kmpl and variance calculation scaffolded',
    };
  }

  @Get('dip-readings')
  @ApiOperation({ summary: 'TODO(FUEL-03): Daily dip readings & calibration chart variance' })
  async getDipReadings() {
    return { status: 'TODO(FUEL-03)', message: 'Tank dip measurement scaffolded' };
  }
}

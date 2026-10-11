import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';

@ApiTags('Plant Operations Skeletons')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('plant')
export class PlantController {
  @Post('production')
  @ApiOperation({ summary: 'TODO(PLT-01): Record plant batch production with theoretical vs actual raw material consumption' })
  async recordProduction() {
    return { status: 'TODO(PLT-01)', message: 'Plant production batching scaffolded' };
  }

  @Post('dispatch')
  @ApiOperation({ summary: 'TODO(PLT-13, PLT-15): Dispatch asphalt/concrete to site with site-wise raw-material allocation' })
  async recordDispatch() {
    return {
      status: 'TODO(PLT-13, PLT-15)',
      message: 'Plant dispatch recording site_id, recipe_id, and raw material breakdown (e.g. BC containing bitumen) at internal transfer rate',
    };
  }

  @Get('crusher-split')
  @ApiOperation({ summary: 'TODO(PLT-03): Stone crusher output % split (40mm, 20mm, 10mm, stone dust)' })
  async getCrusherSplit() {
    return { status: 'TODO(PLT-03)', message: 'Crusher recovery ratio scaffolded' };
  }
}

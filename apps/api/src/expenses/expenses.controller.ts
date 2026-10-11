import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';

@ApiTags('Expenses Skeletons')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('expenses')
export class ExpensesController {
  @Post('petty-cash')
  @ApiOperation({ summary: 'TODO(EXP-01): Site petty cash imprest voucher entry' })
  async createPettyCashEntry() {
    return { status: 'TODO(EXP-01)', message: 'Petty cash entry scaffolded' };
  }

  @Post('overhead-allocation')
  @ApiOperation({ summary: 'TODO(EXP-02): Head office overhead allocation to active sites' })
  async allocateOverheads() {
    return { status: 'TODO(EXP-02)', message: 'Overhead allocation scaffolded' };
  }
}

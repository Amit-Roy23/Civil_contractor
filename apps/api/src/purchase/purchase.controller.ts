import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../core/auth/auth.guard.js';

@ApiTags('Purchase Skeletons')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('purchase')
export class PurchaseController {
  @Get('requisitions')
  @ApiOperation({ summary: 'TODO(PUR-01): Purchase Requisitions list' })
  async getRequisitions() {
    return { status: 'TODO(PUR-01)', message: 'Requisition workflow scaffolded' };
  }

  @Get('quotations/comparison')
  @ApiOperation({ summary: 'TODO(PUR-02): Quotation comparison statement' })
  async getQuotationComparison() {
    return { status: 'TODO(PUR-02)', message: 'Comparative statement CS scaffolded' };
  }

  @Post('invoices')
  @ApiOperation({ summary: 'TODO(PUR-05): Purchase Invoice 3-way match (PO-GRN-Invoice)' })
  async createInvoice() {
    return { status: 'TODO(PUR-05)', message: '3-way match invoice scaffolded' };
  }

  @Get('debit-notes')
  @ApiOperation({ summary: 'TODO(PUR-06): Debit notes for rate difference or rejected goods' })
  async getDebitNotes() {
    return { status: 'TODO(PUR-06)', message: 'Debit notes scaffolded' };
  }
}

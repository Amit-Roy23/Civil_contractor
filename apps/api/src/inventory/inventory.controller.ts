import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../core/auth/auth.guard.js';
import { RbacGuard, RequirePermissions } from '../core/rbac/rbac.guard.js';
import { InventoryService } from './inventory.service.js';
import { PostingService } from '../ledger/posting.service.js';
import {
  CreatePoDto,
  CreatePoSchema,
  CreateGrnDto,
  CreateGrnSchema,
  CreateTransferIssueDto,
  CreateTransferIssueSchema,
  ConfirmTransferReceiptDto,
  ConfirmTransferReceiptSchema,
  CreateConsumptionDto,
  CreateConsumptionSchema,
  CreateWastageDto,
  CreateWastageSchema,
  CreateAdjustmentDto,
  CreateAdjustmentSchema,
  CancelVoucherDto,
  CancelVoucherSchema,
  PERMISSION_KEYS,
  VoucherType,
} from '@civil/shared';
import { JwtUserPayload } from '../core/auth/auth.types.js';

@ApiTags('Inventory & Vouchers')
@ApiBearerAuth()
@UseGuards(AuthGuard, RbacGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly postingService: PostingService,
  ) {}

  // --- PURCHASE ORDERS (PUR-03) ---
  @Post('purchase-orders')
  @RequirePermissions(PERMISSION_KEYS.PURCHASE_CREATE)
  @ApiOperation({ summary: 'Create Purchase Order (PUR-03)' })
  async createPo(@Body() body: CreatePoDto, @CurrentUser() user: JwtUserPayload) {
    const validated = CreatePoSchema.parse(body);
    return this.inventoryService.createPurchaseOrder(validated, user.userId, user.permissions);
  }

  @Get('purchase-orders')
  @RequirePermissions(PERMISSION_KEYS.PURCHASE_VIEW)
  @ApiOperation({ summary: 'List Purchase Orders' })
  async getPos(@CurrentUser() user: JwtUserPayload) {
    return this.inventoryService.getPurchaseOrders(user.companyId);
  }

  // --- GRN (PUR-04 / MAT-02) ---
  @Post('grn')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_CREATE)
  @ApiOperation({ summary: 'Create & Post Goods Receipt Note against PO (PUR-04, MAT-02)' })
  async createGrn(@Body() body: CreateGrnDto, @CurrentUser() user: JwtUserPayload) {
    const validated = CreateGrnSchema.parse(body);
    return this.inventoryService.createGrn(validated, user.userId, user.permissions);
  }

  @Get('grn')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List GRNs' })
  async getGrns(@CurrentUser() user: JwtUserPayload) {
    return this.inventoryService.getGrns(user.companyId);
  }

  // --- TRANSFER ISSUE (STR-01 / MAT-01) ---
  @Post('transfers/issue')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_CREATE)
  @ApiOperation({ summary: 'Dispatch Issue from Central Store to In-Transit (STR-01, MAT-01)' })
  async createTransferIssue(
    @Body() body: CreateTransferIssueDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const validated = CreateTransferIssueSchema.parse(body);
    return this.inventoryService.createTransferIssue(validated, user.userId, user.permissions);
  }

  @Get('transfers/issue')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List Transfer Issues' })
  async getTransferIssues(@CurrentUser() user: JwtUserPayload) {
    return this.inventoryService.getTransferIssues(user.companyId);
  }

  // --- CONFIRM TRANSFER RECEIPT (MAT-05) ---
  @Post('transfers/confirm')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_CREATE)
  @ApiOperation({ summary: 'Site Confirms Receipt from In-Transit (MAT-05)' })
  async confirmTransferReceipt(
    @Body() body: ConfirmTransferReceiptDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const validated = ConfirmTransferReceiptSchema.parse(body);
    return this.inventoryService.confirmTransferReceipt(validated, user.userId, user.permissions);
  }

  // --- SITE CONSUMPTION (MAT-04) ---
  @Post('consumption')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_CREATE)
  @ApiOperation({ summary: 'Post Site Material Consumption to Stock & Cost Ledger (MAT-04, CST-01)' })
  async createConsumption(
    @Body() body: CreateConsumptionDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const validated = CreateConsumptionSchema.parse(body);
    return this.inventoryService.createConsumption(validated, user.userId, user.permissions);
  }

  @Get('consumption')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'List Site Consumptions' })
  async getConsumptions(@CurrentUser() user: JwtUserPayload) {
    return this.inventoryService.getConsumptions(user.companyId);
  }

  // --- WASTAGE (MAT-07) ---
  @Post('wastage')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_CREATE)
  @ApiOperation({ summary: 'Submit Material Wastage for Approval (MAT-07)' })
  async createWastage(@Body() body: CreateWastageDto, @CurrentUser() user: JwtUserPayload) {
    const validated = CreateWastageSchema.parse(body);
    return this.inventoryService.createWastage(validated, user.userId, user.permissions);
  }

  // --- PHYSICAL ADJUSTMENT (MAT-08) ---
  @Post('adjustment')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_CREATE)
  @ApiOperation({ summary: 'Submit Physical Stock Adjustment for Approval (MAT-08)' })
  async createAdjustment(
    @Body() body: CreateAdjustmentDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const validated = CreateAdjustmentSchema.parse(body);
    return this.inventoryService.createStockAdjustment(validated, user.userId, user.permissions);
  }

  // --- CANCELLATION WITH REVERSAL (SEC-03) ---
  @Post('cancel/:type/:id')
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_CANCEL)
  @ApiOperation({ summary: 'Cancel posted voucher with reason and full reversal (SEC-03)' })
  async cancelVoucher(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: CancelVoucherDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const validated = CancelVoucherSchema.parse(body);
    const canOverrideNeg = user.permissions.includes('stock.override_negative');

    if (type.toUpperCase() === 'GRN') {
      return this.postingService.cancelGrn(id, validated.reason, user.userId, canOverrideNeg);
    } else if (type.toUpperCase() === 'CONSUMPTION') {
      return this.postingService.cancelSiteConsumption(id, validated.reason, user.userId, canOverrideNeg);
    } else {
      return { success: false, message: `Cancellation for type ${type} not implemented` };
    }
  }
}

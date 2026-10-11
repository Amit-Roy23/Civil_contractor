import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../core/auth/auth.guard.js';
import { RbacGuard, RequirePermissions } from '../core/rbac/rbac.guard.js';
import { MastersService } from './masters.service.js';
import { ExcelMasterService } from './excel-master.service.js';
import {
  CompanyDto,
  CompanySchema,
  SiteDto,
  SiteSchema,
  LocationDto,
  LocationSchema,
  PlantDto,
  PlantSchema,
  ItemDto,
  ItemSchema,
  SupplierDto,
  SupplierSchema,
  ClientDto,
  ClientSchema,
  ExpenseHeadDto,
  ExpenseHeadSchema,
  PERMISSION_KEYS,
} from '@civil/shared';
import { Response } from 'express';
import { JwtUserPayload } from '../core/auth/auth.types.js';

@ApiTags('Masters')
@ApiBearerAuth()
@UseGuards(AuthGuard, RbacGuard)
@Controller('masters')
export class MastersController {
  constructor(
    private readonly mastersService: MastersService,
    private readonly excelService: ExcelMasterService,
  ) {}

  // --- COMPANIES ---
  @Get('companies')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List all companies (MST-01)' })
  async getCompanies() {
    return this.mastersService.getCompanies();
  }

  @Post('companies')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create new company (MST-01)' })
  async createCompany(@Body() body: CompanyDto) {
    const validated = CompanySchema.parse(body);
    return this.mastersService.createCompany(validated);
  }

  // --- SITES ---
  @Get('sites')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List project sites scoped to user (MST-02, ROLE-02)' })
  async getSites(@CurrentUser() user: JwtUserPayload) {
    return this.mastersService.getSites(user.companyId);
  }

  @Post('sites')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create new project site (MST-02)' })
  async createSite(@Body() body: SiteDto) {
    const validated = SiteSchema.parse(body);
    return this.mastersService.createSite(validated);
  }

  // --- LOCATIONS ---
  @Get('locations')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List locations scoped to user (MST-03, ROLE-02)' })
  async getLocations(@CurrentUser() user: JwtUserPayload) {
    return this.mastersService.getLocations(user.companyId);
  }

  @Post('locations')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create new store/location (MST-03)' })
  async createLocation(@Body() body: LocationDto) {
    const validated = LocationSchema.parse(body);
    return this.mastersService.createLocation(validated);
  }

  // --- PLANTS ---
  @Get('plants')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List production plants (MST-04)' })
  async getPlants(@CurrentUser() user: JwtUserPayload) {
    return this.mastersService.getPlants(user.companyId);
  }

  @Post('plants')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create new production plant (MST-04)' })
  async createPlant(@Body() body: PlantDto) {
    const validated = PlantSchema.parse(body);
    return this.mastersService.createPlant(validated);
  }

  // --- ITEMS & CONVERSIONS ---
  @Get('items')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List items with multi-unit conversions (MST-05, MAT-12)' })
  async getItems(@CurrentUser() user: JwtUserPayload) {
    return this.mastersService.getItems(user.companyId);
  }

  @Post('items')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create item with unit conversion factors (MST-05)' })
  async createItem(@Body() body: ItemDto) {
    const validated = ItemSchema.parse(body);
    return this.mastersService.createItem(validated);
  }

  // --- SUPPLIERS ---
  @Get('suppliers')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List suppliers (MST-06)' })
  async getSuppliers(@CurrentUser() user: JwtUserPayload) {
    return this.mastersService.getSuppliers(user.companyId);
  }

  @Post('suppliers')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create supplier (MST-06)' })
  async createSupplier(@Body() body: SupplierDto) {
    const validated = SupplierSchema.parse(body);
    return this.mastersService.createSupplier(validated);
  }

  // --- CLIENTS ---
  @Get('clients')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List clients / departments (MST-07)' })
  async getClients(@CurrentUser() user: JwtUserPayload) {
    return this.mastersService.getClients(user.companyId);
  }

  @Post('clients')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create client (MST-07)' })
  async createClient(@Body() body: ClientDto) {
    const validated = ClientSchema.parse(body);
    return this.mastersService.createClient(validated);
  }

  // --- EXPENSE HEADS ---
  @Get('expense-heads')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List expense heads hierarchy (MST-12)' })
  async getExpenseHeads(@CurrentUser() user: JwtUserPayload) {
    return this.mastersService.getExpenseHeads(user.companyId);
  }

  @Post('expense-heads')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_CREATE)
  @ApiOperation({ summary: 'Create expense head (MST-12)' })
  async createExpenseHead(@Body() body: ExpenseHeadDto) {
    const validated = ExpenseHeadSchema.parse(body);
    return this.mastersService.createExpenseHead(validated);
  }

  // --- UNITS ---
  @Get('units')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_VIEW)
  @ApiOperation({ summary: 'List standard units of measurement (MST-13)' })
  getUnits() {
    return this.mastersService.getStandardUnits();
  }

  // --- EXCEL TEMPLATES & BULK EXPORT / IMPORT ---
  @Get('templates/:masterName')
  @ApiOperation({ summary: 'Download blank Excel template for master' })
  async downloadTemplate(@Param('masterName') masterName: string, @Res() res: Response) {
    let columns = [
      { header: 'Code', key: 'code', sample: 'CEM-01' },
      { header: 'Name', key: 'name', sample: 'OPC 53 Grade Cement' },
      { header: 'Category', key: 'category', sample: 'Cement' },
      { header: 'Base Unit', key: 'baseUnitCode', sample: 'KG' },
      { header: 'HSN', key: 'hsnCode', sample: '25232910' },
      { header: 'Reorder Level', key: 'reorderLevel', sample: '5000' },
    ];

    const buffer = await this.excelService.generateTemplate(masterName, columns);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${masterName}_template.xlsx"`);
    res.send(buffer);
  }

  @Get('export/:masterName')
  @ApiOperation({ summary: 'Export master records to Excel' })
  async exportMaster(
    @Param('masterName') masterName: string,
    @CurrentUser() user: JwtUserPayload,
    @Res() res: Response,
  ) {
    let data: any[] = [];
    let columns: Array<{ header: string; key: string }> = [];

    if (masterName === 'items') {
      data = await this.mastersService.getItems(user.companyId);
      columns = [
        { header: 'Code', key: 'code' },
        { header: 'Name', key: 'name' },
        { header: 'Category', key: 'category' },
        { header: 'Base Unit', key: 'baseUnitCode' },
        { header: 'Reorder Level', key: 'reorderLevel' },
      ];
    } else if (masterName === 'suppliers') {
      data = await this.mastersService.getSuppliers(user.companyId);
      columns = [
        { header: 'Code', key: 'code' },
        { header: 'Name', key: 'name' },
        { header: 'GSTIN', key: 'gstin' },
        { header: 'PAN', key: 'pan' },
        { header: 'Phone', key: 'phone' },
      ];
    } else {
      throw new BadRequestException(`Export for master ${masterName} not supported`);
    }

    const buffer = await this.excelService.exportToExcel(masterName, columns, data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${masterName}_export.xlsx"`);
    res.send(buffer);
  }

  @Post('deactivate/:entity/:id')
  @RequirePermissions(PERMISSION_KEYS.MASTERS_DELETE)
  @ApiOperation({ summary: 'Deactivate master (Rule #3)' })
  async deactivateMaster(@Param('entity') entity: string, @Param('id') id: string) {
    await this.mastersService.deactivateMaster(entity, id);
    return { success: true, message: `${entity} deactivated successfully` };
  }
}

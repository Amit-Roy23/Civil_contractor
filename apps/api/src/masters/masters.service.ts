import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import {
  companies,
  sites,
  locations,
  plants,
  items,
  itemUnitConversions,
  suppliers,
  clients,
  subcontractors,
  workers,
  vehicles,
  fuelSources,
  expenseHeads,
  recipes,
  recipeItems,
  boqItems,
} from '../drizzle/schema/masters.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  CompanyDto,
  SiteDto,
  LocationDto,
  PlantDto,
  ItemDto,
  SupplierDto,
  ClientDto,
  ExpenseHeadDto,
  STANDARD_UNITS,
  ItemSchema,
} from '@civil/shared';
import { ScopeService } from '../core/scope/scope.service.js';

@Injectable()
export class MastersService {
  constructor(private readonly scopeService: ScopeService) {}

  // --- COMPANIES (MST-01) ---
  async getCompanies() {
    return db.query.companies.findMany({ orderBy: [desc(companies.createdAt)] });
  }

  async createCompany(dto: CompanyDto) {
    const [row] = await db.insert(companies).values(dto).returning();
    return row;
  }

  async updateCompany(id: string, dto: Partial<CompanyDto>) {
    const [row] = await db
      .update(companies)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return row;
  }

  // --- SITES (MST-02) ---
  async getSites(companyId: string) {
    const scopedSiteIds = this.scopeService.getScopedSiteIds();
    const rows = await db.query.sites.findMany({
      where: (s: any, { eq, and, inArray }: any) =>
        scopedSiteIds.length > 0 && !this.scopeService.isUnrestricted()
          ? and(eq(s.companyId, companyId), inArray(s.id, scopedSiteIds))
          : eq(s.companyId, companyId),
      orderBy: [sites.name],
    });
    return rows;
  }

  async createSite(dto: SiteDto) {
    const [row] = await db
      .insert(sites)
      .values({
        ...dto,
        chainageStartKm: dto.chainageStartKm !== undefined ? String(dto.chainageStartKm) : undefined,
        chainageEndKm: dto.chainageEndKm !== undefined ? String(dto.chainageEndKm) : undefined,
      })
      .returning();
    return row;
  }

  async updateSite(id: string, dto: Partial<SiteDto>) {
    this.scopeService.assertSiteAllowed(id);
    const [row] = await db
      .update(sites)
      .set({
        ...dto,
        chainageStartKm: dto.chainageStartKm !== undefined ? String(dto.chainageStartKm) : undefined,
        chainageEndKm: dto.chainageEndKm !== undefined ? String(dto.chainageEndKm) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(sites.id, id))
      .returning();
    return row;
  }

  // --- LOCATIONS / STORES (MST-03) ---
  async getLocations(companyId: string) {
    const allowedIds = await this.scopeService.getAllowedLocationIds();
    return db.query.locations.findMany({
      where: (l: any, { eq, and, inArray }: any) =>
        allowedIds
          ? and(eq(l.companyId, companyId), inArray(l.id, allowedIds.length > 0 ? allowedIds : ['00000000-0000-0000-0000-000000000000']))
          : eq(l.companyId, companyId),
      orderBy: [locations.name],
    });
  }

  async createLocation(dto: LocationDto) {
    const [row] = await db.insert(locations).values(dto).returning();
    return row;
  }

  async updateLocation(id: string, dto: Partial<LocationDto>) {
    await this.scopeService.assertLocationAllowed(id);
    const [row] = await db
      .update(locations)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();
    return row;
  }

  // --- PLANTS (MST-04) ---
  async getPlants(companyId: string) {
    return db.query.plants.findMany({
      where: eq(plants.companyId, companyId),
      orderBy: [plants.name],
    });
  }

  async createPlant(dto: PlantDto) {
    const [row] = await db
      .insert(plants)
      .values({
        ...dto,
        capacityTph: dto.capacityTph !== undefined ? String(dto.capacityTph) : undefined,
      })
      .returning();
    return row;
  }

  // --- MATERIALS / ITEMS (MST-05) ---
  async getItems(companyId: string) {
    const itemRows = await db.query.items.findMany({
      where: eq(items.companyId, companyId),
      orderBy: [items.category, items.name],
    });

    const conversions = await db.query.itemUnitConversions.findMany();

    return itemRows.map((item: any) => ({
      ...item,
      conversions: conversions.filter((c: any) => c.itemId === item.id),
    }));
  }

  async createItem(dto: ItemDto) {
    return db.transaction(async (tx: any) => {
      const [itemRow] = await tx
        .insert(items)
        .values({
          companyId: dto.companyId,
          code: dto.code,
          name: dto.name,
          category: dto.category,
          baseUnitCode: dto.baseUnitCode,
          hsnCode: dto.hsnCode,
          reorderLevel: dto.reorderLevel,
          isActive: dto.isActive,
        })
        .returning();

      if (dto.conversions && dto.conversions.length > 0) {
        for (const conv of dto.conversions) {
          await tx.insert(itemUnitConversions).values({
            itemId: itemRow.id,
            unitCode: conv.unitCode,
            conversionFactor: conv.conversionFactor,
          });
        }
      }

      return itemRow;
    });
  }

  // --- SUPPLIERS (MST-06) ---
  async getSuppliers(companyId: string) {
    return db.query.suppliers.findMany({
      where: eq(suppliers.companyId, companyId),
      orderBy: [suppliers.name],
    });
  }

  async createSupplier(dto: SupplierDto) {
    const [row] = await db.insert(suppliers).values(dto).returning();
    return row;
  }

  // --- CLIENTS (MST-07) ---
  async getClients(companyId: string) {
    return db.query.clients.findMany({
      where: eq(clients.companyId, companyId),
      orderBy: [clients.name],
    });
  }

  async createClient(dto: ClientDto) {
    const [row] = await db.insert(clients).values(dto).returning();
    return row;
  }

  // --- EXPENSE HEADS (MST-12) ---
  async getExpenseHeads(companyId: string) {
    return db.query.expenseHeads.findMany({
      where: eq(expenseHeads.companyId, companyId),
      orderBy: [expenseHeads.category, expenseHeads.name],
    });
  }

  async createExpenseHead(dto: ExpenseHeadDto) {
    const [row] = await db.insert(expenseHeads).values(dto).returning();
    return row;
  }

  // --- STANDARD UNITS (MST-13) ---
  getStandardUnits() {
    return Object.values(STANDARD_UNITS);
  }

  // --- BASIC CRUD FOR REMAINING MASTERS (MST-08 TO MST-15) ---
  async getSubcontractors(companyId: string) {
    return db.query.subcontractors.findMany({ where: eq(subcontractors.companyId, companyId) });
  }

  async getWorkers(companyId: string) {
    return db.query.workers.findMany({ where: eq(workers.companyId, companyId) });
  }

  async getVehicles(companyId: string) {
    return db.query.vehicles.findMany({ where: eq(vehicles.companyId, companyId) });
  }

  async getFuelSources(companyId: string) {
    return db.query.fuelSources.findMany({ where: eq(fuelSources.companyId, companyId) });
  }

  async getRecipes(companyId: string) {
    return db.query.recipes.findMany({ where: eq(recipes.companyId, companyId) });
  }

  async getBoqItems(companyId: string, siteId?: string) {
    return db.query.boqItems.findMany({
      where: (b: any, { eq, and }: any) => (siteId ? and(eq(b.companyId, companyId), eq(b.siteId, siteId)) : eq(b.companyId, companyId)),
    });
  }

  /**
   * Deactivate master (Rule #3: Masters are deactivated once used, never deleted)
   */
  async deactivateMaster(entity: string, id: string) {
    switch (entity) {
      case 'sites':
        return db.update(sites).set({ isActive: false }).where(eq(sites.id, id));
      case 'locations':
        return db.update(locations).set({ isActive: false }).where(eq(locations.id, id));
      case 'items':
        return db.update(items).set({ isActive: false }).where(eq(items.id, id));
      case 'suppliers':
        return db.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, id));
      default:
        throw new BadRequestException(`Deactivation for entity ${entity} not supported`);
    }
  }

  /**
   * Excel Bulk Import with Row-Level Zod Validation
   */
  async importItemsFromExcel(companyId: string, rows: Array<Record<string, any>>) {
    const errors: Array<{ rowNumber: number; errors: any }> = [];
    const validItems: ItemDto[] = [];

    rows.forEach((row, idx) => {
      const parsed = ItemSchema.safeParse({
        companyId,
        code: String(row['Code'] || row['code'] || ''),
        name: String(row['Name'] || row['name'] || ''),
        category: String(row['Category'] || row['category'] || 'General'),
        baseUnitCode: String(row['Base Unit'] || row['baseUnitCode'] || 'KG'),
        hsnCode: row['HSN'] ? String(row['HSN']) : undefined,
        reorderLevel: row['Reorder Level'] ? String(row['Reorder Level']) : '0',
        isActive: true,
      });

      if (!parsed.success) {
        errors.push({ rowNumber: idx + 2, errors: parsed.error.format() });
      } else {
        validItems.push(parsed.data);
      }
    });

    if (errors.length > 0) {
      return { success: false, importedCount: 0, errors };
    }

    // Commit all valid rows
    for (const item of validItems) {
      await this.createItem(item);
    }

    return { success: true, importedCount: validItems.length, errors: [] };
  }
}

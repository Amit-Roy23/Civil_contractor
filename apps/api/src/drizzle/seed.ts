import * as argon2 from 'argon2';
import { db, client } from './db.js';
import {
  companies,
  financialYears,
  companySettings,
  roles,
  rolePermissions,
  users,
  userRoles,
  userLocationScopes,
  sites,
  plants,
  locations,
  items,
  itemUnitConversions,
  suppliers,
  clients,
  expenseHeads,
  voucherSeries,
  transferIssueLines,
} from './schema/index.js';
import { eq, sql } from 'drizzle-orm';
import { DEFAULT_ROLE_PERMISSIONS } from '@civil/shared';
import { PostingService } from '../ledger/posting.service.js';
import { StockLedgerService } from '../ledger/stock-ledger.service.js';
import { CostLedgerService } from '../ledger/cost-ledger.service.js';
import { PartyLedgerService } from '../ledger/party-ledger.service.js';
import { ValuationService } from '../ledger/valuation.service.js';
import { AuditService } from '../core/audit/audit.service.js';
import { NumberingService } from '../core/numbering/numbering.service.js';
import { FinancialYearService } from '../core/fy/fy.service.js';
import { ApprovalsService } from '../core/approvals/approvals.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ScopeService } from '../core/scope/scope.service.js';

async function seed() {
  console.log('🌱 Starting database seeding for Civil Contractor ERP...');

  // Clean existing tables for idempotent fresh seeding
  await db.execute(
    sql`TRUNCATE TABLE users, roles, role_permissions, user_roles, user_location_scopes, financial_years, period_locks, company_settings, companies, sites, plants, locations, items, item_unit_conversions, suppliers, clients, expense_heads, purchase_orders, purchase_order_lines, grn_headers, grn_lines, transfer_issues, transfer_issue_lines, transfer_receipts, transfer_receipt_lines, site_consumptions, site_consumption_lines, wastage_vouchers, wastage_voucher_lines, stock_adjustments, stock_adjustment_lines, stock_ledger, stock_balance, cost_ledger, party_ledger, voucher_series, approval_rules, approval_requests, notifications, audit_logs CASCADE;`,
  );

  // 1. Company
  console.log('-> Seeding Company...');
  const [company] = await db
    .insert(companies)
    .values({
      code: 'AROHON',
      name: 'Arohon Infra & Construction Private Limited',
      pan: 'AABCA1234F',
      gstin: '19AABCA1234F1Z5',
      registeredAddress: 'Sector V, Salt Lake City, Kolkata, West Bengal 700091',
      state: 'West Bengal',
      isActive: true,
    })
    .returning();

  // 2. Financial Year
  console.log('-> Seeding Financial Year 2026-2027...');
  const [fy] = await db
    .insert(financialYears)
    .values({
      companyId: company.id,
      code: '2026-2027',
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      isClosed: false,
    })
    .returning();

  // 3. Company Settings
  await db.insert(companySettings).values({
    companyId: company.id,
    valuationMethod: 'WEIGHTED_AVERAGE',
    maxBackdateDays: 3,
    includePendingInReports: false,
    consumptionTolerancePercent: 5,
    fuelVarianceTolerancePercent: 10,
    attendanceLockTime: '12:00',
  });

  // 4. Roles & Permissions (ROLE-01)
  console.log('-> Seeding Roles & Permissions...');
  const seededRoles: Record<string, string> = {};

  for (const [code, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const [role] = await db
      .insert(roles)
      .values({
        companyId: company.id,
        code,
        name: code.replace('_', ' '),
        description: `Standard system role for ${code}`,
        isSystem: true,
      })
      .returning();

    seededRoles[code] = role.id;

    for (const p of perms) {
      await db.insert(rolePermissions).values({
        roleId: role.id,
        permissionKey: p,
      });
    }
  }

  // 5. Users
  console.log('-> Seeding Users with Argon2 password hashes...');
  const defaultPasswordHash = await argon2.hash('Password@1234');

  const [adminUser] = await db
    .insert(users)
    .values({
      companyId: company.id,
      username: 'admin',
      fullName: 'Amit Roy (Managing Director)',
      email: 'amit.roy@arohoninfra.com',
      mobile: '9876543210',
      passwordHash: defaultPasswordHash,
      isActive: true,
    })
    .returning();
  await db.insert(userRoles).values({ userId: adminUser.id, roleId: seededRoles['ADMIN'] });

  const [accountantUser] = await db
    .insert(users)
    .values({
      companyId: company.id,
      username: 'accountant',
      fullName: 'Suresh Sen (Chief Accountant)',
      email: 'suresh@arohoninfra.com',
      mobile: '9876543211',
      passwordHash: defaultPasswordHash,
      isActive: true,
    })
    .returning();
  await db.insert(userRoles).values({ userId: accountantUser.id, roleId: seededRoles['ACCOUNTANT'] });

  const [storeUser] = await db
    .insert(users)
    .values({
      companyId: company.id,
      username: 'storekeeper',
      fullName: 'Ramesh Das (Central Store Keeper)',
      email: 'ramesh.store@arohoninfra.com',
      mobile: '9876543212',
      passwordHash: defaultPasswordHash,
      isActive: true,
    })
    .returning();
  await db.insert(userRoles).values({ userId: storeUser.id, roleId: seededRoles['STORE_KEEPER'] });

  const [siteEngUser] = await db
    .insert(users)
    .values({
      companyId: company.id,
      username: 'site_eng',
      fullName: 'Vikram Sharma (Site Engineer - NH31)',
      email: 'vikram.site@arohoninfra.com',
      mobile: '9876543213',
      passwordHash: defaultPasswordHash,
      isActive: true,
    })
    .returning();
  await db.insert(userRoles).values({ userId: siteEngUser.id, roleId: seededRoles['SITE_ENGINEER'] });

  const [plantUser] = await db
    .insert(users)
    .values({
      companyId: company.id,
      username: 'plant_mgr',
      fullName: 'Kalyan Ghosh (Plant Incharge)',
      email: 'kalyan.plant@arohoninfra.com',
      mobile: '9876543214',
      passwordHash: defaultPasswordHash,
      isActive: true,
    })
    .returning();
  await db.insert(userRoles).values({ userId: plantUser.id, roleId: seededRoles['PLANT_INCHARGE'] });

  const [fleetUser] = await db
    .insert(users)
    .values({
      companyId: company.id,
      username: 'fleet_mgr',
      fullName: 'Manoj Yadav (Fleet Incharge)',
      email: 'manoj.fleet@arohoninfra.com',
      mobile: '9876543215',
      passwordHash: defaultPasswordHash,
      isActive: true,
    })
    .returning();
  await db.insert(userRoles).values({ userId: fleetUser.id, roleId: seededRoles['FLEET_INCHARGE'] });

  // 6. Project Sites (MST-02)
  console.log('-> Seeding 3 Project Sites...');
  const [site1] = await db
    .insert(sites)
    .values({
      companyId: company.id,
      code: 'SITE-NH31',
      name: 'NH-31 Highway 4-Laning (Km 120-165)',
      clientName: 'National Highways Authority of India (NHAI)',
      contractNumber: 'NHAI/PIU/SLG/2025/34',
      locationAddress: 'Siliguri to Dalkhola Corridor, NH-31',
      chainageStartKm: '120.000',
      chainageEndKm: '165.000',
      sanctionedBudget: '1450000000.00', // 145 Crores
    })
    .returning();

  const [site2] = await db
    .insert(sites)
    .values({
      companyId: company.id,
      code: 'SITE-GANGA',
      name: 'Ganga Bridge Approach Road & Culverts',
      clientName: 'Public Works Department (PWD)',
      contractNumber: 'PWD/R&B/DIV-3/BR-09',
      locationAddress: 'Maldah Ghat Approach Road',
      chainageStartKm: '0.000',
      chainageEndKm: '12.500',
      sanctionedBudget: '480000000.00', // 48 Crores
    })
    .returning();

  const [site3] = await db
    .insert(sites)
    .values({
      companyId: company.id,
      code: 'SITE-SH14',
      name: 'State Highway 14 Bypass Section',
      clientName: 'State Highway Development Corp (SHDC)',
      contractNumber: 'SHDC/EXP/PKG-2/101',
      locationAddress: 'Burdwan Bypass Alignment',
      chainageStartKm: '45.000',
      chainageEndKm: '72.000',
      sanctionedBudget: '890000000.00', // 89 Crores
    })
    .returning();

  // Scope site engineer to Site 1 (ROLE-02)
  await db.insert(userLocationScopes).values({
    userId: siteEngUser.id,
    siteId: site1.id,
  });

  // 7. Plant (MST-04)
  console.log('-> Seeding Hot Mix Plant...');
  const [plant1] = await db
    .insert(plants)
    .values({
      companyId: company.id,
      code: 'PLANT-HMP01',
      name: 'Sonarpur Batch Mix Asphalt Plant 120 TPH',
      type: 'HOT_MIX',
      address: 'Industrial Plot 12, Sonarpur, South 24 Parganas',
      capacityTph: '120.00',
    })
    .returning();

  // 8. Locations / Stores (MST-03)
  console.log('-> Seeding Central Store, Site Stores, Plant Store, and Virtual In-Transit...');
  const [centralStore] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      code: 'CS-01',
      name: 'Central Godown & Base Yard',
      type: 'CENTRAL_STORE',
      address: 'Kona Expressway Logistic Park, Howrah',
    })
    .returning();

  const [inTransitLocation] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      code: 'IN-TRANSIT',
      name: 'Company Virtual In-Transit',
      type: 'IN_TRANSIT',
    })
    .returning();

  const [site1Store] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      code: 'ST-NH31',
      name: 'NH-31 Site Main Yard Store',
      type: 'SITE_STORE',
      siteId: site1.id,
      address: 'Camp Km 132, NH-31',
    })
    .returning();

  const [site2Store] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      code: 'ST-GANGA',
      name: 'Ganga Bridge Base Store',
      type: 'SITE_STORE',
      siteId: site2.id,
      address: 'Camp Km 2, Maldah Ghat',
    })
    .returning();

  const [plantStore] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      code: 'ST-HMP01',
      name: 'Hot Mix Plant Raw Material Yard',
      type: 'PLANT_STORE',
      plantId: plant1.id,
      address: 'Sonarpur Plant Compound',
    })
    .returning();

  const [fuelTank] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      code: 'TANK-HSD01',
      name: 'Base Yard Underground HSD Tank 20KL',
      type: 'FUEL_TANK',
    })
    .returning();

  const [fuelBowser] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      code: 'BWSR-01',
      name: 'Mobile Fuel Bowser 6KL (WB-19-AB-1234)',
      type: 'FUEL_BOWSER',
      currentSiteId: site1.id,
    })
    .returning();

  // 9. Suppliers (MST-06)
  console.log('-> Seeding Suppliers...');
  const [supCement] = await db
    .insert(suppliers)
    .values({
      companyId: company.id,
      code: 'SUP-ULTRA',
      name: 'UltraTech Cement Limited',
      gstin: '19AAACU0147K1Z8',
      pan: 'AAACU0147K',
      contactPerson: 'Arunav Banerjee',
      phone: '9830112233',
      email: 'sales.kolkata@ultratech.com',
      address: 'Camac Street, Kolkata',
      state: 'West Bengal',
      paymentTermsDays: 30,
    })
    .returning();

  const [supSteel] = await db
    .insert(suppliers)
    .values({
      companyId: company.id,
      code: 'SUP-TATA',
      name: 'Tata Steel BSL Limited',
      gstin: '19AAACT0123A1Z2',
      pan: 'AAACT0123A',
      contactPerson: 'Debjit Mukherjee',
      phone: '9830223344',
      email: 'infra.sales@tatasteel.com',
      address: 'Tata Centre, J.L. Nehru Road, Kolkata',
      state: 'West Bengal',
      paymentTermsDays: 45,
    })
    .returning();

  const [supFuel] = await db
    .insert(suppliers)
    .values({
      companyId: company.id,
      code: 'SUP-IOCL',
      name: 'Indian Oil Corporation Limited',
      gstin: '19AAACI1681G1Z1',
      pan: 'AAACI1681G',
      contactPerson: 'Institutional Sales Div',
      phone: '9830334455',
      address: 'Indian Oil Bhavan, Gariahat, Kolkata',
      state: 'West Bengal',
      paymentTermsDays: 15,
    })
    .returning();

  const [supCrusher] = await db
    .insert(suppliers)
    .values({
      companyId: company.id,
      code: 'SUP-RAJMIN',
      name: 'Raj Mining & Stone Crusher Works',
      gstin: '20AABCR9876P1Z3',
      pan: 'AABCR9876P',
      contactPerson: 'Rajendra Singh',
      phone: '9431122334',
      address: 'Pakur Mining Zone, Jharkhand',
      state: 'Jharkhand',
      paymentTermsDays: 15,
    })
    .returning();

  const [supBitumen] = await db
    .insert(suppliers)
    .values({
      companyId: company.id,
      code: 'SUP-HPCL',
      name: 'Hindustan Petroleum Corporation Ltd (Bitumen)',
      gstin: '19AAACH1111H1Z9',
      pan: 'AAACH1111H',
      contactPerson: 'Bitumen Supply Desk',
      phone: '9830445566',
      address: 'HPCL Terminal, Budge Budge',
      state: 'West Bengal',
      paymentTermsDays: 30,
    })
    .returning();

  // 10. Realistic Materials (25 items with unit conversions) (MST-05, MAT-12)
  console.log('-> Seeding 25 Materials with unit conversions...');
  const materialsList = [
    { code: 'MAT-CEM-OPC53', name: 'OPC 53 Grade Cement', category: 'Cement', base: 'KG', conv: [{ unit: 'BAG', factor: '50' }, { unit: 'MT', factor: '1000' }], reorder: '10000' },
    { code: 'MAT-CEM-PPC', name: 'PPC Portland Pozzolana Cement', category: 'Cement', base: 'KG', conv: [{ unit: 'BAG', factor: '50' }, { unit: 'MT', factor: '1000' }], reorder: '10000' },
    { code: 'MAT-STL-TMT08', name: 'TMT Rebar 8mm Fe 550D', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '5000' },
    { code: 'MAT-STL-TMT10', name: 'TMT Rebar 10mm Fe 550D', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '5000' },
    { code: 'MAT-STL-TMT12', name: 'TMT Rebar 12mm Fe 550D', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '8000' },
    { code: 'MAT-STL-TMT16', name: 'TMT Rebar 16mm Fe 550D', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '8000' },
    { code: 'MAT-STL-TMT20', name: 'TMT Rebar 20mm Fe 550D', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '8000' },
    { code: 'MAT-STL-TMT25', name: 'TMT Rebar 25mm Fe 550D', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '5000' },
    { code: 'MAT-AGG-40MM', name: 'Crushed Stone Aggregate 40mm', category: 'Aggregates', base: 'MT', conv: [{ unit: 'BRASS', factor: '4.5' }], reorder: '100' },
    { code: 'MAT-AGG-20MM', name: 'Crushed Stone Aggregate 20mm', category: 'Aggregates', base: 'MT', conv: [{ unit: 'BRASS', factor: '4.5' }], reorder: '100' },
    { code: 'MAT-AGG-10MM', name: 'Crushed Stone Aggregate 10mm', category: 'Aggregates', base: 'MT', conv: [{ unit: 'BRASS', factor: '4.5' }], reorder: '100' },
    { code: 'MAT-AGG-DUST', name: 'Stone Dust / Quarry Dust', category: 'Aggregates', base: 'MT', conv: [{ unit: 'BRASS', factor: '4.5' }], reorder: '100' },
    { code: 'MAT-SND-ZONE2', name: 'River Coarse Sand (Zone II)', category: 'Sand', base: 'CUM', conv: [{ unit: 'BRASS', factor: '2.8317' }], reorder: '50' },
    { code: 'MAT-BIT-VG30', name: 'Bitumen Bulk VG-30', category: 'Bitumen', base: 'MT', conv: [], reorder: '20' },
    { code: 'MAT-BIT-VG10', name: 'Bitumen Packed Drums VG-10', category: 'Bitumen', base: 'MT', conv: [], reorder: '10' },
    { code: 'MAT-BIT-RS1', name: 'Bitumen Emulsion RS-1', category: 'Bitumen', base: 'LTR', conv: [{ unit: 'KL', factor: '1000' }], reorder: '2000' },
    { code: 'MAT-POL-HSD', name: 'High Speed Diesel (HSD)', category: 'Fuel', base: 'LTR', conv: [{ unit: 'KL', factor: '1000' }], reorder: '5000' },
    { code: 'MAT-CHM-PLAST', name: 'Superplasticizer Admixture', category: 'Chemicals', base: 'KG', conv: [], reorder: '500' },
    { code: 'MAT-FLYA-CLF', name: 'Fly Ash Class F', category: 'Pozzolana', base: 'MT', conv: [], reorder: '20' },
    { code: 'MAT-STL-MSPLT', name: 'MS Structural Steel Plates', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '1000' },
    { code: 'MAT-WIR-BIND', name: 'GI Binding Wire 18 Gauge', category: 'Steel', base: 'KG', conv: [{ unit: 'MT', factor: '1000' }], reorder: '200' },
    { code: 'MAT-PIP-PVC110', name: 'PVC Drainage Pipe 110mm', category: 'Pipes', base: 'RMT', conv: [], reorder: '100' },
    { code: 'MAT-GEO-FABRIC', name: 'Non-Woven Geotextile 250 GSM', category: 'Geosynthetics', base: 'SQM', conv: [], reorder: '1000' },
    { code: 'MAT-PNT-THERMO', name: 'Thermoplastic Road Paint White', category: 'Paint', base: 'KG', conv: [], reorder: '500' },
    { code: 'MAT-GLS-BEADS', name: 'Reflective Glass Beads Type 2', category: 'Paint', base: 'KG', conv: [], reorder: '200' },
  ];

  const seededItems: Record<string, string> = {};

  for (const m of materialsList) {
    const [it] = await db
      .insert(items)
      .values({
        companyId: company.id,
        code: m.code,
        name: m.name,
        category: m.category,
        baseUnitCode: m.base,
        reorderLevel: m.reorder,
        isActive: true,
      })
      .returning();

    seededItems[m.code] = it.id;

    for (const c of m.conv) {
      await db.insert(itemUnitConversions).values({
        itemId: it.id,
        unitCode: c.unit,
        conversionFactor: c.factor,
      });
    }
  }

  // 11. Expense Heads (MST-12)
  console.log('-> Seeding Expense Heads...');
  await db.insert(expenseHeads).values([
    { companyId: company.id, code: 'EXP-DIR-MAT', name: 'Direct Material Cost', category: 'MATERIAL' },
    { companyId: company.id, code: 'EXP-DIR-LAB', name: 'Direct Site Labour', category: 'LABOUR' },
    { companyId: company.id, code: 'EXP-DIR-SUB', name: 'Subcontractor Civil Works', category: 'SUBCONTRACT' },
    { companyId: company.id, code: 'EXP-FLT-FUEL', name: 'Vehicle & Machine Diesel', category: 'VEHICLE_FUEL' },
    { companyId: company.id, code: 'EXP-FLT-HIRE', name: 'Vehicle Hire Charges', category: 'VEHICLE_HIRE' },
    { companyId: company.id, code: 'EXP-PLT-PROD', name: 'Plant Bituminous Concrete', category: 'PLANT_PRODUCT' },
    { companyId: company.id, code: 'EXP-GEN-OVER', name: 'Site Administrative Overhead', category: 'OVERHEAD' },
  ]);

  // 12. Simulate 1 Month of End-to-End Vertical Slice Transactions!
  console.log('-> Simulating 1 Month of End-to-End Transactions...');
  const valuationService = new ValuationService();
  const stockLedgerService = new StockLedgerService(valuationService);
  const costLedgerService = new CostLedgerService();
  const partyLedgerService = new PartyLedgerService();
  const auditService = new AuditService();
  const numberingService = new NumberingService();
  const fyService = new FinancialYearService();
  const approvalsService = new ApprovalsService();
  const scopeService = new ScopeService({ user: { userId: adminUser.id, companyId: company.id, roles: ['ADMIN'] } });

  const inventoryService = new InventoryService(
    numberingService,
    fyService,
    new PostingService(stockLedgerService, costLedgerService, partyLedgerService, auditService),
    approvalsService,
    scopeService,
    auditService,
  );

  // Month 1: 2026-04-05 -> PO for Cement & Steel
  console.log('   - Step 1: PO for Cement & TMT Steel (PUR-03)');
  const po1 = await inventoryService.createPurchaseOrder(
    {
      companyId: company.id,
      financialYearId: fy.id,
      supplierId: supCement.id,
      deliveryLocationId: centralStore.id,
      txnDate: '2026-04-05',
      paymentTerms: '30 Days Net',
      lines: [
        {
          itemId: seededItems['MAT-CEM-OPC53'],
          enteredQty: '1000', // 1,000 Bags = 50,000 KG
          enteredUnitCode: 'BAG',
          unitRate: '380.00', // ₹380 per bag
          gstPercent: 28,
        },
      ],
    },
    adminUser.id,
  );

  // Month 1: 2026-04-07 -> GRN against PO at Central Store (adds stock!)
  console.log('   - Step 2: GRN at Central Store (PUR-04 / MAT-02)');
  const grn1 = await inventoryService.createGrn(
    {
      companyId: company.id,
      financialYearId: fy.id,
      supplierId: supCement.id,
      locationId: centralStore.id,
      txnDate: '2026-04-07',
      supplierChallanNo: 'CH-ULTRA-8891',
      supplierChallanDate: '2026-04-06',
      vehicleNumber: 'WB-23-C-4567',
      weighbridgeSlipNo: 'WB-00412',
      lines: [
        {
          itemId: seededItems['MAT-CEM-OPC53'],
          receivedQty: '1000',
          acceptedQty: '1000', // 50,000 KG
          rejectedQty: '0',
          enteredUnitCode: 'BAG',
          unitRate: '7.6000', // ₹7.60 per KG (equivalent to ₹380 per 50kg bag)
          gstPercent: 28,
        },
      ],
    },
    storeUser.id,
  );

  // Direct GRN for HSD Fuel into Tank
  console.log('   - Step 2b: GRN for 10,000 Litres HSD into Central Tank');
  await inventoryService.createGrn(
    {
      companyId: company.id,
      financialYearId: fy.id,
      supplierId: supFuel.id,
      locationId: fuelTank.id,
      txnDate: '2026-04-08',
      supplierChallanNo: 'IOCL-TANKER-991',
      vehicleNumber: 'WB-19-J-9821',
      lines: [
        {
          itemId: seededItems['MAT-POL-HSD'],
          receivedQty: '10000',
          acceptedQty: '10000',
          rejectedQty: '0',
          enteredUnitCode: 'LTR',
          unitRate: '92.5000', // ₹92.50/L
          gstPercent: 18,
        },
      ],
    },
    storeUser.id,
  );

  // Month 1: 2026-04-10 -> Issue from Central Store to Site 1 (STR-01 / MAT-01)
  console.log('   - Step 3: Issue 400 Bags Cement to NH-31 Site (In-Transit transfer)');
  const transfer1 = await inventoryService.createTransferIssue(
    {
      companyId: company.id,
      financialYearId: fy.id,
      fromLocationId: centralStore.id,
      toLocationId: site1Store.id,
      txnDate: '2026-04-10',
      challanNo: 'TRANS-CS-001',
      vehicleNumber: 'WB-11-F-7890',
      driverName: 'Sanjay Kumar',
      lines: [
        {
          itemId: seededItems['MAT-CEM-OPC53'],
          enteredQty: '400', // 400 bags = 20,000 KG
          enteredUnitCode: 'BAG',
        },
      ],
    },
    storeUser.id,
  );

  // Month 1: 2026-04-12 -> Site confirms receipt from In-Transit (MAT-05)
  console.log('   - Step 4: Site confirms receipt of 400 Bags (MAT-05)');
  const issueLines = await db.query.transferIssueLines.findMany({
    where: eq(transferIssueLines.transferIssueId, transfer1.id),
  });

  await inventoryService.confirmTransferReceipt(
    {
      transferIssueId: transfer1.id,
      receivedLocationId: site1Store.id,
      txnDate: '2026-04-12',
      lines: [
        {
          transferLineId: issueLines[0].id,
          acceptedQty: '400',
          rejectedQty: '0',
        },
      ],
    },
    siteEngUser.id,
  );

  // Month 1: 2026-04-15 -> Site Consumption at NH-31 Site (MAT-04)
  console.log('   - Step 5: Site consumption of 250 Bags for Culvert Box casting (MAT-04)');
  await inventoryService.createConsumption(
    {
      companyId: company.id,
      financialYearId: fy.id,
      siteId: site1.id,
      locationId: site1Store.id,
      txnDate: '2026-04-15',
      workSection: 'Culvert Box Cast-in-situ Km 124+500',
      lines: [
        {
          itemId: seededItems['MAT-CEM-OPC53'],
          enteredQty: '250', // 250 bags = 12,500 KG
          enteredUnitCode: 'BAG',
          chainageText: 'Km 124+500 LHS',
          purpose: 'M30 Concrete for bottom slab and wing walls',
        },
      ],
    },
    siteEngUser.id,
  );

  // Month 1: 2026-04-20 -> Wastage voucher (MAT-07)
  console.log('   - Step 6: Wastage voucher for 5 Bags rain damage (MAT-07) [Pending Approval]');
  await inventoryService.createWastage(
    {
      companyId: company.id,
      financialYearId: fy.id,
      locationId: site1Store.id,
      txnDate: '2026-04-20',
      reasonDescription: 'Sudden rainstorm damaged 5 bags of cement stack',
      lines: [
        {
          itemId: seededItems['MAT-CEM-OPC53'],
          enteredQty: '5',
          enteredUnitCode: 'BAG',
          reason: 'Water damaged / hardened',
        },
      ],
    },
    siteEngUser.id,
  );

  console.log('✅ Database seeded successfully with realistic Indian Civil Contractor data!');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });

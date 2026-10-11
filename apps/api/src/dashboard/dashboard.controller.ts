import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../core/auth/auth.guard.js';
import { db } from '../drizzle/db.js';
import { sites, locations, stockBalance, costLedger, grnHeaders, transferIssues, siteConsumptions } from '../drizzle/schema/index.js';
import { eq, sql, desc } from 'drizzle-orm';
import { Decimal, formatINR } from '@civil/shared';
import { JwtUserPayload } from '../core/auth/auth.types.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('dashboard')
export class DashboardController {
  @Get('owner')
  @ApiOperation({ summary: 'Owner Dashboard with real site cards wired to live stock values (Section 7)' })
  async getOwnerDashboard(@CurrentUser() user: JwtUserPayload) {
    const allSites: any[] = await db.query.sites.findMany({
      where: eq(sites.companyId, user.companyId),
    });

    const allLocations: any[] = await db.query.locations.findMany({
      where: eq(locations.companyId, user.companyId),
    });

    const allBalances: any[] = await db.query.stockBalance.findMany({
      where: eq(stockBalance.companyId, user.companyId),
    });

    let totalCompanyStockVal = new Decimal(0);

    const siteCards = allSites.map((site) => {
      // Find locations belonging to this site
      const siteLocs = allLocations.filter((l) => l.siteId === site.id);
      const siteLocIds = new Set(siteLocs.map((l) => l.id));

      let siteStockValue = new Decimal(0);
      let itemCount = 0;

      for (const bal of allBalances) {
        if (siteLocIds.has(bal.locationId)) {
          const val = new Decimal(bal.currentValue);
          siteStockValue = siteStockValue.plus(val);
          if (new Decimal(bal.currentQty).greaterThan(0)) {
            itemCount++;
          }
        }
      }

      totalCompanyStockVal = totalCompanyStockVal.plus(siteStockValue);

      return {
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        clientName: site.clientName,
        sanctionedBudget: site.sanctionedBudget,
        liveStockValue: siteStockValue.toFixed(2),
        liveStockValueDisplay: formatINR(siteStockValue),
        activeMaterialCount: itemCount,
        locationCount: siteLocs.length,
      };
    });

    // Central store valuation
    const centralStoreLocs = allLocations.filter((l) => l.type === 'CENTRAL_STORE');
    const centralLocIds = new Set(centralStoreLocs.map((l) => l.id));
    let centralStoreVal = new Decimal(0);
    for (const bal of allBalances) {
      if (centralLocIds.has(bal.locationId)) {
        centralStoreVal = centralStoreVal.plus(new Decimal(bal.currentValue));
      }
    }
    totalCompanyStockVal = totalCompanyStockVal.plus(centralStoreVal);

    // Recent activity
    const recentGrns = await db.query.grnHeaders.findMany({
      where: eq(grnHeaders.companyId, user.companyId),
      orderBy: [desc(grnHeaders.createdAt)],
      limit: 5,
    });

    const recentIssues = await db.query.transferIssues.findMany({
      where: eq(transferIssues.companyId, user.companyId),
      orderBy: [desc(transferIssues.createdAt)],
      limit: 5,
    });

    const recentConsumptions = await db.query.siteConsumptions.findMany({
      where: eq(siteConsumptions.companyId, user.companyId),
      orderBy: [desc(siteConsumptions.createdAt)],
      limit: 5,
    });

    return {
      totalCompanyInventoryValue: totalCompanyStockVal.toFixed(2),
      totalCompanyInventoryValueDisplay: formatINR(totalCompanyStockVal),
      centralStoreValue: centralStoreVal.toFixed(2),
      centralStoreValueDisplay: formatINR(centralStoreVal),
      activeSiteCount: allSites.length,
      siteCards,
      recentActivity: {
        grns: recentGrns,
        transferIssues: recentIssues,
        consumptions: recentConsumptions,
      },
    };
  }
}

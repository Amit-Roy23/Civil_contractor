import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import { stockBalance, items, locations, notifications, users, userRoles, roles } from '../drizzle/schema/index.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { Decimal } from '@civil/shared';

@Processor('alerts-queue')
@Injectable()
export class LowStockAlertProcessor extends WorkerHost {
  private readonly logger = new Logger(LowStockAlertProcessor.name);

  /**
   * Evaluates ALT-01 Low Stock Alert across all items and locations
   */
  async process(job: Job): Promise<any> {
    this.logger.log('Executing ALT-01 Low Stock Alert Scan...');

    // Fetch all stock balances joined with items
    const balances = await db
      .select({
        locationId: stockBalance.locationId,
        itemId: stockBalance.itemId,
        currentQty: stockBalance.currentQty,
        itemName: items.name,
        itemCode: items.code,
        reorderLevel: items.reorderLevel,
        companyId: items.companyId,
        locationName: locations.name,
      })
      .from(stockBalance)
      .innerJoin(items, eq(stockBalance.itemId, items.id))
      .innerJoin(locations, eq(stockBalance.locationId, locations.id));

    let alertedCount = 0;

    for (const bal of balances) {
      const current = new Decimal(bal.currentQty);
      const reorder = new Decimal(bal.reorderLevel);

      if (reorder.greaterThan(0) && current.lessThanOrEqualTo(reorder)) {
        alertedCount++;
        this.logger.warn(
          `[ALT-01 ALERT] Low stock for ${bal.itemName} at ${bal.locationName}! Current: ${current.toFixed(4)}, Reorder Level: ${reorder.toFixed(4)}`,
        );

        // Notify Admins & Store Keepers for this company
        const adminRoles = await db.query.roles.findMany({
          where: and(
            eq(roles.companyId, bal.companyId),
            inArray(roles.code, ['ADMIN', 'STORE_KEEPER']),
          ),
        });
        const roleIds = adminRoles.map((r: any) => r.id);

        if (roleIds.length > 0) {
          const uRoles = await db.query.userRoles.findMany({
            where: inArray(userRoles.roleId, roleIds),
          });
          const targetUserIds = Array.from(new Set(uRoles.map((u: any) => u.userId)));

          for (const uId of targetUserIds) {
            await db.insert(notifications).values({
              companyId: bal.companyId,
              userId: uId,
              title: `⚠️ Low Stock Alert: ${bal.itemName}`,
              message: `Current stock at ${bal.locationName} is ${current.toFixed(4)}, which is at or below the reorder level (${reorder.toFixed(4)}). Please generate a Purchase Requisition.`,
              link: `/inventory/stock-register?itemId=${bal.itemId}&locationId=${bal.locationId}`,
            });
          }
        }
      }
    }

    return { alertedCount };
  }
}

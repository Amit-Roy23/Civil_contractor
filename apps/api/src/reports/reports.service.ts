import { Injectable } from '@nestjs/common';
import { db } from '../drizzle/db.js';
import { stockLedger, stockBalance, items, locations, transferIssues, transferIssueLines, sites } from '../drizzle/schema/index.js';
import { eq, and, gte, lte, asc, desc, sql } from 'drizzle-orm';
import { Decimal, formatINR, formatQtyDisplay, ReportFilterDto, toMoney, toQty } from '@civil/shared';
import { ExcelMasterService } from '../masters/excel-master.service.js';

@Injectable()
export class ReportsService {
  constructor(private readonly excelService: ExcelMasterService) {}

  /**
   * Site Stock Register (Section 6.6)
   * Opening / Received / Consumed / Transferred / Wasted / Closing (Qty & Value)
   */
  async getSiteStockRegister(filter: ReportFilterDto) {
    const locId = filter.locationId;
    const fromDate = filter.fromDate || '2000-01-01';
    const toDate = filter.toDate || '2099-12-31';

    // Fetch items
    const allItems = await db.query.items.findMany();

    const registerRows = [];

    for (const item of allItems) {
      if (filter.itemId && item.id !== filter.itemId) continue;

      // 1. Opening Balance (all movements prior to fromDate)
      const openingMovements = await db.query.stockLedger.findMany({
        where: (sl: any, { eq, and, lt }: any) =>
          locId
            ? and(eq(sl.locationId, locId), eq(sl.itemId, item.id), lt(sl.txnDate, fromDate))
            : and(eq(sl.itemId, item.id), lt(sl.txnDate, fromDate)),
      });

      let openingQty = new Decimal(0);
      let openingValue = new Decimal(0);
      for (const m of openingMovements) {
        openingQty = openingQty.plus(m.qtyIn).minus(m.qtyOut);
        openingValue = openingValue.plus(m.valueIn).minus(m.valueOut);
      }

      // 2. Range Movements
      const rangeMovements = await db.query.stockLedger.findMany({
        where: (sl: any, { eq, and, gte, lte }: any) =>
          locId
            ? and(eq(sl.locationId, locId), eq(sl.itemId, item.id), gte(sl.txnDate, fromDate), lte(sl.txnDate, toDate))
            : and(eq(sl.itemId, item.id), gte(sl.txnDate, fromDate), lte(sl.txnDate, toDate)),
      });

      let receivedQty = new Decimal(0);
      let receivedValue = new Decimal(0);
      let consumedQty = new Decimal(0);
      let consumedValue = new Decimal(0);
      let transferredQty = new Decimal(0);
      let transferredValue = new Decimal(0);
      let wastedQty = new Decimal(0);
      let wastedValue = new Decimal(0);

      for (const m of rangeMovements) {
        const qIn = new Decimal(m.qtyIn);
        const vIn = new Decimal(m.valueIn);
        const qOut = new Decimal(m.qtyOut);
        const vOut = new Decimal(m.valueOut);

        if (m.voucherType === 'GRN' || m.voucherType === 'TRANSFER_RECEIPT') {
          receivedQty = receivedQty.plus(qIn);
          receivedValue = receivedValue.plus(vIn);
        } else if (m.voucherType === 'SITE_CONSUMPTION') {
          consumedQty = consumedQty.plus(qOut);
          consumedValue = consumedValue.plus(vOut);
        } else if (m.voucherType === 'TRANSFER_ISSUE') {
          transferredQty = transferredQty.plus(qOut);
          transferredValue = transferredValue.plus(vOut);
        } else if (m.voucherType === 'WASTAGE') {
          wastedQty = wastedQty.plus(qOut);
          wastedValue = wastedValue.plus(vOut);
        }
      }

      const closingQty = openingQty.plus(receivedQty).minus(consumedQty).minus(transferredQty).minus(wastedQty);
      const closingValue = openingValue.plus(receivedValue).minus(consumedValue).minus(transferredValue).minus(wastedValue);

      // Include if there was activity or non-zero balance
      if (!openingQty.isZero() || !receivedQty.isZero() || !consumedQty.isZero() || !closingQty.isZero()) {
        registerRows.push({
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          category: item.category,
          baseUnitCode: item.baseUnitCode,
          openingQty: openingQty.toFixed(4),
          openingValue: openingValue.toFixed(2),
          receivedQty: receivedQty.toFixed(4),
          receivedValue: receivedValue.toFixed(2),
          consumedQty: consumedQty.toFixed(4),
          consumedValue: consumedValue.toFixed(2),
          transferredQty: transferredQty.toFixed(4),
          transferredValue: transferredValue.toFixed(2),
          wastedQty: wastedQty.toFixed(4),
          wastedValue: wastedValue.toFixed(2),
          closingQty: closingQty.toFixed(4),
          closingValue: closingValue.toFixed(2),
        });
      }
    }

    return registerRows;
  }

  /**
   * Item Ledger with Running Balance (Section 6.6)
   */
  async getItemLedger(filter: ReportFilterDto) {
    if (!filter.itemId) throw new Error('itemId is required for Item Ledger');

    const fromDate = filter.fromDate || '2000-01-01';
    const toDate = filter.toDate || '2099-12-31';

    return db.query.stockLedger.findMany({
      where: (sl: any, { eq, and, gte, lte }: any) =>
        filter.locationId
          ? and(
              eq(sl.locationId, filter.locationId),
              eq(sl.itemId, filter.itemId!),
              gte(sl.txnDate, fromDate),
              lte(sl.txnDate, toDate),
            )
          : and(eq(sl.itemId, filter.itemId!), gte(sl.txnDate, fromDate), lte(sl.txnDate, toDate)),
      orderBy: [asc(stockLedger.txnDate), asc(stockLedger.createdAt)],
    });
  }

  /**
   * In-Transit Report (Section 6.6)
   */
  async getInTransitReport(companyId: string) {
    const activeTransfers = await db.query.transferIssues.findMany({
      where: eq(transferIssues.companyId, companyId),
      orderBy: [desc(transferIssues.txnDate)],
    });

    const report = [];
    for (const t of activeTransfers) {
      const lines = await db.query.transferIssueLines.findMany({
        where: eq(transferIssueLines.transferIssueId, t.id),
      });

      for (const line of lines) {
        const item = await db.query.items.findFirst({ where: eq(items.id, line.itemId) });
        const fromLoc = await db.query.locations.findFirst({ where: eq(locations.id, t.fromLocationId) });
        const toLoc = await db.query.locations.findFirst({ where: eq(locations.id, t.toLocationId) });

        const pendingQty = new Decimal(line.baseQty).minus(line.confirmedQty);
        report.push({
          voucherNo: t.voucherNo,
          txnDate: t.txnDate,
          challanNo: t.challanNo,
          vehicleNumber: t.vehicleNumber,
          fromLocation: fromLoc?.name,
          toLocation: toLoc?.name,
          itemCode: item?.code,
          itemName: item?.name,
          dispatchedQty: line.baseQty,
          confirmedQty: line.confirmedQty,
          inTransitQty: pendingQty.toFixed(4),
          unit: line.enteredUnitCode,
          valuationRate: line.valuationRate,
          status: pendingQty.isZero() ? 'DELIVERED' : 'IN_TRANSIT',
        });
      }
    }

    return report;
  }

  /**
   * Export Stock Register to Excel (Section 6.6)
   */
  async exportStockRegisterExcel(filter: ReportFilterDto) {
    const data = await this.getSiteStockRegister(filter);
    const columns = [
      { header: 'Item Code', key: 'itemCode' },
      { header: 'Item Name', key: 'itemName' },
      { header: 'Unit', key: 'baseUnitCode' },
      { header: 'Opening Qty', key: 'openingQty' },
      { header: 'Opening Value (₹)', key: 'openingValue' },
      { header: 'Received Qty', key: 'receivedQty' },
      { header: 'Received Value (₹)', key: 'receivedValue' },
      { header: 'Consumed Qty', key: 'consumedQty' },
      { header: 'Consumed Value (₹)', key: 'consumedValue' },
      { header: 'Closing Qty', key: 'closingQty' },
      { header: 'Closing Value (₹)', key: 'closingValue' },
    ];

    return this.excelService.exportToExcel('Stock Register', columns, data);
  }

  /**
   * HTML Print Template for Stock Register (Section 6.6)
   */
  generateStockRegisterHtml(data: any[], dateRange: string) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Site Stock Register</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; font-size: 12px; }
          h2 { margin-bottom: 4px; color: #1e3a8a; }
          .meta { color: #64748b; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
          th { background: #f1f5f9; font-weight: 600; color: #1e293b; }
          .num { text-align: right; }
          .total { font-weight: bold; background: #f8fafc; }
        </style>
      </head>
      <body>
        <h2>SITE STOCK REGISTER</h2>
        <div class="meta">Period: ${dateRange} | Generated: ${new Date().toLocaleDateString('en-IN')}</div>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Material / Item</th>
              <th>Unit</th>
              <th class="num">Opening Qty</th>
              <th class="num">Received Qty</th>
              <th class="num">Consumed Qty</th>
              <th class="num">Closing Qty</th>
              <th class="num">Closing Value (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (r) => `
              <tr>
                <td>${r.itemCode}</td>
                <td>${r.itemName}</td>
                <td>${r.baseUnitCode}</td>
                <td class="num">${r.openingQty}</td>
                <td class="num">${r.receivedQty}</td>
                <td class="num">${r.consumedQty}</td>
                <td class="num font-bold">${r.closingQty}</td>
                <td class="num font-bold">${formatINR(r.closingValue)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }
}

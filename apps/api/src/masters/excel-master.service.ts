import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

@Injectable()
export class ExcelMasterService {
  /**
   * Generates a downloadable blank Excel template with headers and sample data
   */
  async generateTemplate(masterName: string, columns: Array<{ header: string; key: string; sample?: string }>) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${masterName} Template`);

    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: Math.max(col.header.length + 5, 18),
    }));

    // Header styling
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' }, // Dark Blue
    };

    // Add sample row if provided
    const sampleRow: Record<string, string> = {};
    for (const col of columns) {
      if (col.sample) sampleRow[col.key] = col.sample;
    }
    if (Object.keys(sampleRow).length > 0) {
      sheet.addRow(sampleRow);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Exports an array of entities to an Excel workbook
   */
  async exportToExcel(sheetName: string, columns: Array<{ header: string; key: string }>, data: any[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: Math.max(col.header.length + 5, 18),
    }));

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Teal
    };

    for (const row of data) {
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Parses an uploaded Excel buffer into an array of objects
   */
  async parseExcelBuffer(buffer: Buffer): Promise<Array<Record<string, any>>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const rows: Array<Record<string, any>> = [];
    const headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => {
          headers.push(String(cell.value || '').trim());
        });
      } else {
        const rowData: Record<string, any> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      }
    });

    return rows;
  }
}

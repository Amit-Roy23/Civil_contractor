import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';
import { ExcelMasterService } from '../masters/excel-master.service.js';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ExcelMasterService],
  exports: [ReportsService],
})
export class ReportsModule {}

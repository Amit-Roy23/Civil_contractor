import { Module } from '@nestjs/common';
import { MastersService } from './masters.service.js';
import { MastersController } from './masters.controller.js';
import { ExcelMasterService } from './excel-master.service.js';

@Module({
  controllers: [MastersController],
  providers: [MastersService, ExcelMasterService],
  exports: [MastersService, ExcelMasterService],
})
export class MastersModule {}

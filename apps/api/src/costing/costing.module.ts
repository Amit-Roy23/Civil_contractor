import { Module } from '@nestjs/common';
import { CostingController } from './costing.controller.js';

@Module({
  controllers: [CostingController],
})
export class CostingModule {}

import { Module } from '@nestjs/common';
import { FuelController } from './fuel.controller.js';

@Module({
  controllers: [FuelController],
})
export class FuelModule {}

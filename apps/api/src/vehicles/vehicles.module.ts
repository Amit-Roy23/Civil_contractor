import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller.js';

@Module({
  controllers: [VehiclesController],
})
export class VehiclesModule {}

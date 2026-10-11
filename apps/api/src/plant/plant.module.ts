import { Module } from '@nestjs/common';
import { PlantController } from './plant.controller.js';

@Module({
  controllers: [PlantController],
})
export class PlantModule {}

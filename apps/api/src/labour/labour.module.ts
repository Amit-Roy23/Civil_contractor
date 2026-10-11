import { Module } from '@nestjs/common';
import { LabourController } from './labour.controller.js';

@Module({
  controllers: [LabourController],
})
export class LabourModule {}

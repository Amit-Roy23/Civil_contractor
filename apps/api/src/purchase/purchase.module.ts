import { Module } from '@nestjs/common';
import { PurchaseController } from './purchase.controller.js';

@Module({
  controllers: [PurchaseController],
})
export class PurchaseModule {}

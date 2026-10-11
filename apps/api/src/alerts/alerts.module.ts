import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LowStockAlertProcessor } from './low-stock-alert.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'alerts-queue',
    }),
  ],
  providers: [LowStockAlertProcessor],
  exports: [LowStockAlertProcessor],
})
export class AlertsModule {}

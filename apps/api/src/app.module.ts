import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule } from './core/core.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { MastersModule } from './masters/masters.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { PurchaseModule } from './purchase/purchase.module.js';
import { FuelModule } from './fuel/fuel.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { LabourModule } from './labour/labour.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { PlantModule } from './plant/plant.module.js';
import { ContractModule } from './contract/contract.module.js';
import { CostingModule } from './costing/costing.module.js';
import { AlertsModule } from './alerts/alerts.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                },
              }
            : undefined,
      },
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
      },
    }),
    CoreModule,
    LedgerModule,
    MastersModule,
    InventoryModule,
    ReportsModule,
    DashboardModule,
    PurchaseModule,
    FuelModule,
    VehiclesModule,
    LabourModule,
    ExpensesModule,
    PlantModule,
    ContractModule,
    CostingModule,
    AlertsModule,
  ],
})
export class AppModule {}

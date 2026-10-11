import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller.js';

@Module({
  controllers: [ExpensesController],
})
export class ExpensesModule {}

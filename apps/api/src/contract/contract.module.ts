import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller.js';

@Module({
  controllers: [ContractController],
})
export class ContractModule {}

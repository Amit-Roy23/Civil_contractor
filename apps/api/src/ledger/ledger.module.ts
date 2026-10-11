import { Module, Global } from '@nestjs/common';
import { ValuationService } from './valuation.service.js';
import { StockLedgerService } from './stock-ledger.service.js';
import { CostLedgerService } from './cost-ledger.service.js';
import { PartyLedgerService } from './party-ledger.service.js';
import { PostingService } from './posting.service.js';
import { RevaluationProcessor } from './revaluation.processor.js';
import { BullModule } from '@nestjs/bullmq';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'revaluation-queue',
    }),
  ],
  providers: [
    ValuationService,
    StockLedgerService,
    CostLedgerService,
    PartyLedgerService,
    PostingService,
    RevaluationProcessor,
  ],
  exports: [
    ValuationService,
    StockLedgerService,
    CostLedgerService,
    PartyLedgerService,
    PostingService,
  ],
})
export class LedgerModule {}

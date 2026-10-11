import { Decimal } from '@civil/shared';

export interface StockValuationResult {
  newRunningQty: Decimal;
  newRunningValue: Decimal;
  newValuationRate: Decimal;
  issueCostRate: Decimal;
  issueTotalValue: Decimal;
}

export interface IValuationEngine {
  calculateReceipt(
    currentQty: Decimal,
    currentValue: Decimal,
    receivedQty: Decimal,
    receivedRate: Decimal,
  ): { newQty: Decimal; newValue: Decimal; newRate: Decimal };

  calculateIssue(
    currentQty: Decimal,
    currentValue: Decimal,
    currentRate: Decimal,
    issuedQty: Decimal,
  ): StockValuationResult;
}

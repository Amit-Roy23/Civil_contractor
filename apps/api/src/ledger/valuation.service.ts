import { Injectable } from '@nestjs/common';
import { Decimal, toMoney, toQty, toRate } from '@civil/shared';
import { IValuationEngine, StockValuationResult } from './valuation.interface.js';

@Injectable()
export class ValuationService implements IValuationEngine {
  /**
   * Weighted Average Receipt Calculation (MAT-11)
   * Formula:
   * newQty = currentQty + receivedQty
   * newValue = currentValue + (receivedQty * receivedRate)
   * newRate = newValue / newQty
   */
  calculateReceipt(
    currentQty: Decimal,
    currentValue: Decimal,
    receivedQty: Decimal,
    receivedRate: Decimal,
  ): { newQty: Decimal; newValue: Decimal; newRate: Decimal } {
    const cQty = new Decimal(currentQty);
    const cVal = new Decimal(currentValue);
    const rQty = new Decimal(receivedQty);
    const rRate = new Decimal(receivedRate);

    const receiptValue = toMoney(rQty.times(rRate));
    const newQty = toQty(cQty.plus(rQty));
    const newValue = toMoney(cVal.plus(receiptValue));

    let newRate = rRate;
    if (newQty.greaterThan(0)) {
      newRate = toRate(newValue.dividedBy(newQty));
    }

    return {
      newQty,
      newValue,
      newRate,
    };
  }

  /**
   * Weighted Average Issue Calculation (MAT-11)
   * Formula:
   * issueRate = currentValuationRate
   * issueValue = issuedQty * issueRate
   * newRunningQty = currentQty - issuedQty
   * newRunningValue = currentValue - issueValue
   */
  calculateIssue(
    currentQty: Decimal,
    currentValue: Decimal,
    currentRate: Decimal,
    issuedQty: Decimal,
  ): StockValuationResult {
    const cQty = new Decimal(currentQty);
    const cVal = new Decimal(currentValue);
    const rate = new Decimal(currentRate);
    const iQty = new Decimal(issuedQty);

    const issueTotalValue = toMoney(iQty.times(rate));
    const newRunningQty = toQty(cQty.minus(iQty));
    const newRunningValue = toMoney(cVal.minus(issueTotalValue));

    let newValuationRate = rate;
    if (newRunningQty.greaterThan(0)) {
      newValuationRate = toRate(newRunningValue.dividedBy(newRunningQty));
    } else {
      newValuationRate = rate;
    }

    return {
      newRunningQty,
      newRunningValue,
      newValuationRate,
      issueCostRate: rate,
      issueTotalValue,
    };
  }

  // TODO(MAT-11-FIFO): FIFO layer consumption implementation
  calculateFifoIssue(
    _layers: Array<{ qtyRemaining: Decimal; rate: Decimal }>,
    _issuedQty: Decimal,
  ): StockValuationResult {
    throw new Error('FIFO valuation layers engine pending activation; use WEIGHTED_AVERAGE');
  }
}

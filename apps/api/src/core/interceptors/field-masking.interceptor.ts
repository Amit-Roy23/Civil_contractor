import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { JwtUserPayload } from '../auth/auth.types.js';
import { PERMISSION_KEYS } from '@civil/shared';

const SENSITIVE_RATE_KEYS = new Set([
  'rate',
  'unitrate',
  'unit_rate',
  'amount',
  'lineamount',
  'line_amount',
  'subtotal',
  'sub_total',
  'taxtotal',
  'tax_total',
  'grandtotal',
  'grand_total',
  'totalvalue',
  'total_value',
  'valuein',
  'value_in',
  'valueout',
  'value_out',
  'runningvalue',
  'running_value',
  'valuationrate',
  'valuation_rate',
  'variancevalue',
  'variance_value',
  'dailywagerate',
  'daily_wage_rate',
  'debit',
  'credit',
]);

@Injectable()
export class FieldMaskingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtUserPayload | undefined;

    // Check if user has rates.view permission or is Admin
    const canViewRates =
      user?.roles?.includes('ADMIN') ||
      user?.roles?.includes('ACCOUNTANT') ||
      user?.permissions?.includes(PERMISSION_KEYS.RATES_VIEW);

    return next.handle().pipe(
      map((data) => {
        if (canViewRates || !data) {
          return data;
        }
        return this.maskSensitiveFields(data);
      }),
    );
  }

  private maskSensitiveFields(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.maskSensitiveFields(item));
    }
    if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      const masked: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_RATE_KEYS.has(key.toLowerCase())) {
          // Exclude field entirely or set null so client never sees financial values (ROLE-03)
          continue;
        }
        masked[key] = this.maskSensitiveFields(value);
      }
      return masked;
    }
    return obj;
  }
}

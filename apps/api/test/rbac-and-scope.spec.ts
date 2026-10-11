import { describe, it, expect } from 'vitest';
import { FieldMaskingInterceptor } from '../src/core/interceptors/field-masking.interceptor.js';
import { ScopeService } from '../src/core/scope/scope.service.js';
import { of, firstValueFrom } from 'rxjs';

describe('ROLE-02 / ROLE-03 - RBAC Scoping & Field Masking', () => {
  describe('FieldMaskingInterceptor (ROLE-03)', () => {
    const interceptor = new FieldMaskingInterceptor();

    it('strips rates, amounts, and unit values for users without rates.view permission', async () => {
      const mockExecutionContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: 'engineer-1',
              roles: ['SITE_ENGINEER'],
              permissions: ['inventory.view', 'inventory.create'], // Missing rates.view!
            },
          }),
        }),
      };

      const testData = {
        id: 'grn-123',
        voucherNo: 'GRN/SITE/26-27/0001',
        txnDate: '2026-04-10',
        supplierName: 'UltraTech Cement Ltd',
        lines: [
          {
            itemId: 'item-1',
            itemName: 'OPC 53 Grade Cement',
            acceptedQty: '400.0000',
            unitRate: '350.0000', // sensitive!
            lineAmount: '140000.00', // sensitive!
            taxTotal: '25200.00', // sensitive!
            grandTotal: '165200.00', // sensitive!
            remarks: 'Received in good condition',
          },
        ],
      };

      const nextHandler: any = {
        handle: () => of(testData),
      };

      const result$ = interceptor.intercept(mockExecutionContext, nextHandler);
      const maskedData = await firstValueFrom(result$);

      // Verify non-financial fields are preserved
      expect(maskedData.id).toBe('grn-123');
      expect(maskedData.voucherNo).toBe('GRN/SITE/26-27/0001');
      expect(maskedData.lines[0].acceptedQty).toBe('400.0000');
      expect(maskedData.lines[0].remarks).toBe('Received in good condition');

      // Verify financial fields are completely omitted from response
      expect(maskedData.lines[0].unitRate).toBeUndefined();
      expect(maskedData.lines[0].lineAmount).toBeUndefined();
      expect(maskedData.lines[0].taxTotal).toBeUndefined();
      expect(maskedData.lines[0].grandTotal).toBeUndefined();
    });

    it('allows rates and amounts for users with rates.view permission or Admin/Accountant role', async () => {
      const mockExecutionContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: 'admin-1',
              roles: ['ADMIN'],
              permissions: ['*'],
            },
          }),
        }),
      };

      const testData = {
        unitRate: '350.0000',
        lineAmount: '140000.00',
      };

      const nextHandler: any = {
        handle: () => of(testData),
      };

      const result$ = interceptor.intercept(mockExecutionContext, nextHandler);
      const unmaskedData = await firstValueFrom(result$);

      expect(unmaskedData.unitRate).toBe('350.0000');
      expect(unmaskedData.lineAmount).toBe('140000.00');
    });
  });

  describe('ScopeService (ROLE-02)', () => {
    it('identifies unrestricted access for ADMIN and ACCOUNTANT', () => {
      const adminScope = new ScopeService({
        user: { id: 'u1', roles: ['ADMIN'], scopedSiteIds: [], scopedLocationIds: [] },
      });
      expect(adminScope.isUnrestricted()).toBe(true);

      const acctScope = new ScopeService({
        user: { id: 'u2', roles: ['ACCOUNTANT'], scopedSiteIds: [], scopedLocationIds: [] },
      });
      expect(acctScope.isUnrestricted()).toBe(true);
    });

    it('identifies restricted access and enforces site checks for SITE_ENGINEER', () => {
      const site1Id = '11111111-1111-1111-1111-111111111111';
      const site2Id = '22222222-2222-2222-2222-222222222222';

      const engineerScope = new ScopeService({
        user: {
          id: 'u3',
          roles: ['SITE_ENGINEER'],
          scopedSiteIds: [site1Id],
          scopedLocationIds: [],
        },
      });

      expect(engineerScope.isUnrestricted()).toBe(false);
      expect(engineerScope.getScopedSiteIds()).toEqual([site1Id]);

      // Assert site allowed should succeed for site 1
      expect(() => engineerScope.assertSiteAllowed(site1Id)).not.toThrow();

      // Assert site allowed should throw ForbiddenException for site 2
      expect(() => engineerScope.assertSiteAllowed(site2Id)).toThrowError(/Access denied/);
    });
  });
});

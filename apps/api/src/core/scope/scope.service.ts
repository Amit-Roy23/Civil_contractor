import { Injectable, Scope, Inject, ForbiddenException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { JwtUserPayload } from '../auth/auth.types.js';
import { db } from '../../drizzle/db.js';
import { locations } from '../../drizzle/schema/masters.js';
import { inArray, eq } from 'drizzle-orm';

@Injectable({ scope: Scope.REQUEST })
export class ScopeService {
  constructor(@Inject(REQUEST) private readonly request: any) {}

  private get user(): JwtUserPayload | undefined {
    return this.request.user;
  }

  isUnrestricted(): boolean {
    if (!this.user) return true;
    if (this.user.roles?.includes('ADMIN') || this.user.roles?.includes('ACCOUNTANT')) {
      return true;
    }
    const hasSiteScope = (this.user.scopedSiteIds?.length ?? 0) > 0;
    const hasLocScope = (this.user.scopedLocationIds?.length ?? 0) > 0;
    const hasPlantScope = (this.user.scopedPlantIds?.length ?? 0) > 0;
    return !hasSiteScope && !hasLocScope && !hasPlantScope;
  }

  getScopedSiteIds(): string[] {
    return this.user?.scopedSiteIds || [];
  }

  getScopedLocationIds(): string[] {
    return this.user?.scopedLocationIds || [];
  }

  /**
   * Resolves all location IDs that this user is permitted to see/transact in
   * based on their directly assigned locations + their assigned sites and plants (ROLE-02).
   */
  async getAllowedLocationIds(): Promise<string[] | null> {
    if (this.isUnrestricted()) {
      return null; // Null indicates no restriction
    }

    const directLocIds = this.getScopedLocationIds();
    const siteIds = this.getScopedSiteIds();
    const plantIds = this.user?.scopedPlantIds || [];

    const matchedLocations = await db
      .select({ id: locations.id })
      .from(locations)
      .where(
        siteIds.length > 0 || plantIds.length > 0
          ? inArray(locations.siteId, siteIds.length > 0 ? siteIds : ['00000000-0000-0000-0000-000000000000'])
          : eq(locations.companyId, this.user?.companyId || ''),
      );

    const derivedIds = matchedLocations.map((l) => l.id);
    const combined = Array.from(new Set([...directLocIds, ...derivedIds]));
    return combined;
  }

  async assertLocationAllowed(locationId: string): Promise<void> {
    if (this.isUnrestricted()) return;
    const allowed = await this.getAllowedLocationIds();
    if (allowed && !allowed.includes(locationId)) {
      throw new ForbiddenException(
        `Access denied: You do not have permission for location ${locationId} (ROLE-02)`,
      );
    }
  }

  assertSiteAllowed(siteId: string): void {
    if (this.isUnrestricted()) return;
    const scoped = this.getScopedSiteIds();
    if (scoped.length > 0 && !scoped.includes(siteId)) {
      throw new ForbiddenException(
        `Access denied: You do not have permission for site ${siteId} (ROLE-02)`,
      );
    }
  }
}

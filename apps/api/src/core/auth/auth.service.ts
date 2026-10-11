import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { db } from '../../drizzle/db.js';
import { users, userRoles, roles, rolePermissions, userLocationScopes } from '../../drizzle/schema/core.js';
import { eq, inArray } from 'drizzle-orm';
import { JwtUserPayload } from './auth.types.js';

@Injectable()
export class AuthService {
  // In-memory OTP storage for dev / demonstration (maps mobile -> { otp, expiresAt })
  private otpStore = new Map<string, { otp: string; expiresAt: number }>();

  private get jwtSecret(): string {
    return process.env.JWT_SECRET || 'civil-erp-development-jwt-access-token-secret-key-32chars';
  }

  private get jwtRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || 'civil-erp-development-jwt-refresh-token-secret-key-32chars';
  }

  async loginWithPassword(username: string, pass: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials or user is inactive');
    }

    const isMatch = await argon2.verify(user.passwordHash, pass);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = await this.buildUserPayload(user.id);
    return this.issueTokens(payload);
  }

  async requestOtp(mobile: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.mobile, mobile),
    });
    if (!user || !user.isActive) {
      throw new BadRequestException('No active user registered with this mobile number');
    }

    // Generate 6 digit OTP (in dev we can log it clearly)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins
    this.otpStore.set(mobile, { otp, expiresAt });

    console.log(`\n========================================`);
    console.log(`🔑 [DEV SMS / OTP MOCK]`);
    console.log(`📱 Mobile: ${mobile}`);
    console.log(`🔢 OTP Code: ${otp} (valid for 5 mins)`);
    console.log(`========================================\n`);

    return { message: 'OTP sent successfully (check console in development)' };
  }

  async verifyOtp(mobile: string, otp: string) {
    const stored = this.otpStore.get(mobile);
    if (!stored || stored.expiresAt < Date.now() || stored.otp !== otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    this.otpStore.delete(mobile);

    const user = await db.query.users.findFirst({
      where: eq(users.mobile, mobile),
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account inactive');
    }

    const payload = await this.buildUserPayload(user.id);
    return this.issueTokens(payload);
  }

  async refreshTokens(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as { userId: string };
      const user = await db.query.users.findFirst({
        where: eq(users.id, decoded.userId),
      });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User no longer active');
      }

      const payload = await this.buildUserPayload(user.id);
      return this.issueTokens(payload);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async buildUserPayload(userId: string): Promise<JwtUserPayload> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Fetch user roles
    const uRoles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    const roleIds = uRoles.map((r) => r.roleId);

    let roleCodes: string[] = [];
    let permissionKeys: string[] = [];

    if (roleIds.length > 0) {
      const rolesList = await db.select().from(roles).where(inArray(roles.id, roleIds));
      roleCodes = rolesList.map((r) => r.code);

      const perms = await db
        .select()
        .from(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds));
      permissionKeys = Array.from(new Set(perms.map((p) => p.permissionKey)));
    }

    // Fetch user location scopes (ROLE-02)
    const scopes = await db
      .select()
      .from(userLocationScopes)
      .where(eq(userLocationScopes.userId, userId));

    const scopedLocationIds = scopes
      .map((s) => s.locationId)
      .filter((id): id is string => Boolean(id));
    const scopedSiteIds = scopes.map((s) => s.siteId).filter((id): id is string => Boolean(id));
    const scopedPlantIds = scopes.map((s) => s.plantId).filter((id): id is string => Boolean(id));

    return {
      userId: user.id,
      companyId: user.companyId,
      username: user.username,
      fullName: user.fullName,
      roles: roleCodes,
      permissions: permissionKeys,
      scopedLocationIds,
      scopedSiteIds,
      scopedPlantIds,
    };
  }

  issueTokens(payload: JwtUserPayload) {
    const accessToken = jwt.sign(payload, this.jwtSecret, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId: payload.userId }, this.jwtRefreshSecret, {
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: payload,
    };
  }
}

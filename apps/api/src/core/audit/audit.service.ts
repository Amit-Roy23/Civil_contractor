import { Injectable } from '@nestjs/common';
import { db } from '../../drizzle/db.js';
import { auditLogs } from '../../drizzle/schema/core.js';

export interface AuditEntryParams {
  companyId?: string;
  userId?: string;
  username?: string;
  entity: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';
  beforeJson?: any;
  afterJson?: any;
  reason?: string;
  ip?: string;
  tx?: any; // Pass transaction if inside an active DB transaction
}

@Injectable()
export class AuditService {
  async log(params: AuditEntryParams): Promise<void> {
    const executor = params.tx || db;
    await executor.insert(auditLogs).values({
      companyId: params.companyId,
      userId: params.userId,
      username: params.username,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      beforeJson: params.beforeJson ?? null,
      afterJson: params.afterJson ?? null,
      reason: params.reason ?? null,
      ip: params.ip ?? null,
    });
  }

  async getLogsForEntity(entity: string, entityId: string) {
    return db.query.auditLogs.findMany({
      where: (logs, { eq, and }) => and(eq(logs.entity, entity), eq(logs.entityId, entityId)),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    });
  }
}

import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '../../drizzle/db.js';
import { attachments } from '../../drizzle/schema/core.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AttachmentsService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'civil-erp-attachments';
    this.s3Client = new S3Client({
      region: process.env.S3_REGION || 'ap-south-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      forcePathStyle: true, // Required for MinIO
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadminpassword',
      },
    });
  }

  /**
   * Generates a presigned URL for direct client upload (Section 4.8)
   */
  async getPresignedUploadUrl(
    companyId: string,
    entityType: string,
    entityId: string,
    fileName: string,
    mimeType: string,
  ) {
    const s3Key = `${companyId}/${entityType}/${entityId}/${uuidv4()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 }); // 15 mins
    return { uploadUrl, s3Key };
  }

  /**
   * Saves uploaded attachment metadata into database
   */
  async recordAttachment(params: {
    companyId: string;
    entityType: string;
    entityId: string;
    s3Key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: string;
  }) {
    const [record] = await db
      .insert(attachments)
      .values({
        companyId: params.companyId,
        entityType: params.entityType,
        entityId: params.entityId,
        s3Key: params.s3Key,
        fileName: params.fileName,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        uploadedBy: params.uploadedBy,
      })
      .returning();

    return record;
  }

  /**
   * Generates presigned GET download URL
   */
  async getPresignedDownloadUrl(s3Key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  async getAttachmentsForEntity(entityType: string, entityId: string) {
    const records = await db.query.attachments.findMany({
      where: and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)),
    });

    return Promise.all(
      records.map(async (r) => ({
        ...r,
        downloadUrl: await this.getPresignedDownloadUrl(r.s3Key),
      })),
    );
  }
}

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as schema from './schema/index.js';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/civil_erp';

export const client = postgres(connectionString, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type AppDatabase = typeof db;

import { z } from 'zod';

export const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(10),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string().default('civil-erp-attachments'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadminpassword'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/** secrets that ship in examples, tests or development defaults must never run a live server */
const WEAK = /change[-_ ]?me|development|test-super-secret|example|password|secret-key|^(.)\1+$/i;

/** extra checks for a live server: strong secrets, no demo company by accident, a real web address */
export function productionProblems(c: Record<string, unknown>): string[] {
  if (c.NODE_ENV !== 'production') return [];
  const out: string[] = [];
  for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = String(c[k] || '');
    if (v.length < 32) out.push(`${k} must be at least 32 characters (generate one with: openssl rand -hex 32)`);
    else if (WEAK.test(v)) out.push(`${k} looks like a sample value — generate a new one with: openssl rand -hex 32`);
  }
  if (c.JWT_SECRET && c.JWT_SECRET === c.JWT_REFRESH_SECRET) out.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  const db = String(c.DATABASE_URL || '');
  if (/:(postgrespassword|postgres|password)@/.test(db)) out.push('DATABASE_URL uses a default database password');
  const cors = String(c.CORS_ORIGIN || '');
  // the development default (http://localhost…) means CORS_ORIGIN was never set; https://localhost is a deliberate local trial
  if (!cors || cors.split(',').every((o) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(o.trim()))) out.push('CORS_ORIGIN must be your site address, e.g. https://wcm.example.com');
  const demo = String(c.DEMO_COMPANY ?? 'demo').trim().toLowerCase();
  if (demo !== 'off' && demo !== '' && !c.DEMO_PASSWORD) out.push('DEMO_COMPANY is on with the default password — set DEMO_COMPANY=off for a client server, or set DEMO_PASSWORD');
  return out;
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    console.error('❌ Environment validation failed:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  const problems = productionProblems(config);
  if (problems.length) {
    console.error(`❌ Not safe to start in production:\n - ${problems.join('\n - ')}`);
    throw new Error('Unsafe production configuration');
  }
  return result.data;
}

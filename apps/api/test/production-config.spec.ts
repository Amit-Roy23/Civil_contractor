import { describe, expect, it } from 'vitest';
import { productionProblems } from '../src/core/config/env.validation.js';

const good = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a3f9c2e17b4d8e06f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7a8',
  JWT_REFRESH_SECRET: '0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
  DATABASE_URL: 'postgresql://wcm:Xq81LmZp0rT4vW9s@postgres:5432/wcm',
  CORS_ORIGIN: 'https://wcm.example.in',
  DEMO_COMPANY: 'off',
};

describe('production start-up checks', () => {
  it('accepts a proper production configuration', () => {
    expect(productionProblems(good)).toEqual([]);
  });
  it('does nothing outside production', () => {
    expect(productionProblems({ NODE_ENV: 'development' })).toEqual([]);
  });
  it('refuses short, sample or shared secrets, default DB passwords, localhost CORS and the default demo', () => {
    const p = productionProblems({ ...good, JWT_SECRET: 'short', JWT_REFRESH_SECRET: 'test-super-secret-jwt-key-minimum-32-chars-long!', DATABASE_URL: 'postgresql://postgres:postgrespassword@db:5432/x', CORS_ORIGIN: 'http://localhost:5173', DEMO_COMPANY: 'demo' });
    expect(p.join('\n')).toMatch(/JWT_SECRET must be at least 32/);
    expect(p.join('\n')).toMatch(/JWT_REFRESH_SECRET looks like a sample/);
    expect(p.join('\n')).toMatch(/default database password/);
    expect(p.join('\n')).toMatch(/CORS_ORIGIN must be your site address/);
    expect(p.join('\n')).toMatch(/DEMO_COMPANY is on/);
    expect(productionProblems({ ...good, JWT_REFRESH_SECRET: good.JWT_SECRET })).toEqual(['JWT_SECRET and JWT_REFRESH_SECRET must be different']);
  });
});

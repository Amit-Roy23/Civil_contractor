import { randomBytes } from 'node:crypto';

export const newId = (p = 'r') => `${p}${randomBytes(9).toString('base64url')}`;

const TZ = process.env.BUSINESS_TZ || 'Asia/Kolkata';
/** business date, timestamp and hour in the company's time zone */
export function clock(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), now: d.toISOString() };
}

import { randomBytes } from 'node:crypto';

export const newId = (p = 'r') => `${p}${randomBytes(9).toString('base64url')}`;

/** business date, timestamp and hour in the company's time zone (India by default) */
export function clock(d = new Date()) {
  const tz = process.env.BUSINESS_TZ || 'Asia/Kolkata';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), now: d.toISOString() };
}

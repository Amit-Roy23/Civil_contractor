export function cn(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

export function sum<T>(arr: T[], fn: (x: T) => number): number {
  let s = 0;
  for (const x of arr) s += fn(x) || 0;
  return s;
}

export function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) (out[key(x)] ||= []).push(x);
  return out;
}

export function indexBy<T extends { id: string }>(arr: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const x of arr) out[x.id] = x;
  return out;
}

export function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

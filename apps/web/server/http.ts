/** an error with an HTTP status, shown to the user as { message } */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  ip: string;
}
export interface Res {
  status: number;
  json?: unknown;
  raw?: Buffer;
  headers?: Record<string, string>;
}

export const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v : '');
export const header = (r: Req, name: string) => {
  const v = r.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] || '' : v || '';
};

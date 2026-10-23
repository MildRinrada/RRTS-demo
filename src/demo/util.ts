/**
 * The server's helpers, ported for the browser. Instants are ISO strings; calendar dates are
 * YYYY-MM-DD strings, so both compare correctly as plain strings.
 */
import { ApiError } from '../api/errors';

const TZ = 'Asia/Bangkok';
const dateLong = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: TZ, day: 'numeric', month: 'short', year: '2-digit' });
const time = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const calLong = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const calShort = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const calWeekday = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'long' });

const asCal = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

export const thai = {
  date: (iso: string) => dateLong.format(new Date(iso)),
  dateShort: (iso: string) => dateShort.format(new Date(iso)),
  dateTime: (iso: string) => `${dateShort.format(new Date(iso))} ${time.format(new Date(iso))} น.`,
  cal: (ymd: string) => calLong.format(asCal(ymd)),
  calShort: (ymd: string) => calShort.format(asCal(ymd)),
  calWeekday: (ymd: string) => calWeekday.format(asCal(ymd)),
  baht: (n: number) => `${n.toLocaleString('th-TH')} บาท`,
};

export const DAY = 86400_000;

/** Today's calendar date in Bangkok, moved by `offsetDays`. */
export function todayCal(offsetDays = 0) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const d = asCal(ymd);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export const now = () => new Date().toISOString();

/** Days between two calendar dates. */
export const calDiff = (a: string, b: string) => Math.round((asCal(a).getTime() - asCal(b).getTime()) / DAY);

/** The web app's own address, so links and QR codes work wherever the demo is hosted. */
export const appLink = (path: string) => `${location.origin}${location.pathname}#${path}`;
export const statusLink = (publicToken: string) => appLink(`/j/${publicToken}`);
export const stickerLink = (stickerToken: string) => appLink(`/s/${stickerToken}`);

export function maskPhone(phone: string) {
  return phone.length >= 9 ? `${phone.slice(0, 2)}x-xxx-${phone.slice(-4)}` : 'xxx';
}

export function formatPhone(phone: string) {
  if (phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  if (phone.length === 9) return `${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`;
  return phone;
}

export function firstName(full: string) {
  return `คุณ${full.trim().split(/\s+/)[0]}`;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function randomString(length: number) {
  const out: string[] = [];
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 248) out.push(B62[b % 62]);
      if (out.length === length) break;
    }
  }
  return out.join('');
}
export const newToken = () => randomString(22);
export const isToken = (t: string) => /^[A-Za-z0-9]{22}$/.test(t);

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* errors with the same status, code and Thai message the real server sends */
export const notFound = (message = 'ไม่พบข้อมูล') => new ApiError(404, 'not_found', message);
export const forbidden = (message = 'ไม่มีสิทธิ์ทำรายการนี้') => new ApiError(403, 'forbidden', message);
export const conflict = (code: string, message: string, fields?: Record<string, string>) => new ApiError(409, code, message, fields);
export const badRequest = (code: string, message: string, fields?: Record<string, string>) => new ApiError(400, code, message, fields);
export const unauthorized = (message: string, code = 'unauthenticated') => new ApiError(401, code, message);

export function intParam(v: string, name = 'id') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('bad_param', `${name} ไม่ถูกต้อง`);
  return n;
}

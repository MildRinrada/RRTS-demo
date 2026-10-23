import type { Category, JobStatus, PayMethod, PhotoKind, Role } from '../api/types';

const TZ = 'Asia/Bangkok';
const BE = 'th-TH-u-ca-buddhist';
const dateLong = new Intl.DateTimeFormat(BE, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat(BE, { timeZone: TZ, day: 'numeric', month: 'short', year: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
/** Calendar dates ("2026-11-08") carry no time zone: format them in UTC so they never slip a day. */
const calLong = new Intl.DateTimeFormat(BE, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const calDM = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const calDML = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'long' });
const calWd = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'long' });
const calWdShort = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'short' });

const cal = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

export const fmt = {
  date: (iso: string) => dateLong.format(new Date(iso)),
  dateShort: (iso: string) => dateShort.format(new Date(iso)),
  dayMonth: (iso: string) => dayMonth.format(new Date(iso)),
  time: (iso: string) => `${time.format(new Date(iso))} น.`,
  dateTime: (iso: string) => `${dateShort.format(new Date(iso))} ${time.format(new Date(iso))} น.`,
  cal: (ymd: string) => calLong.format(cal(ymd)),
  calDM: (ymd: string) => calDM.format(cal(ymd)),
  calDML: (ymd: string) => calDML.format(cal(ymd)),
  calWeekday: (ymd: string) => calWd.format(cal(ymd)),
  calWeekdayShort: (ymd: string) => calWdShort.format(cal(ymd)),
  baht: (n: number) => n.toLocaleString('th-TH'),
  num: (n: number) => n.toLocaleString('th-TH'),
};

/** Today in Bangkok as YYYY-MM-DD, plus an offset in days. */
export function todayYmd(offset = 0) {
  const d = cal(new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()));
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Whole days from today to a calendar date: 0 today, 1 tomorrow, -2 two days late. */
export function daysFromToday(ymd: string) {
  return Math.round((cal(ymd).getTime() - cal(todayYmd()).getTime()) / 86400_000);
}

export function relDay(ymd: string) {
  const n = daysFromToday(ymd);
  if (n === 0) return 'วันนี้';
  if (n === 1) return 'พรุ่งนี้';
  if (n === -1) return 'เมื่อวาน';
  return n > 0 ? `อีก ${n} วัน` : `เลยมา ${-n} วัน`;
}

export function sinceDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

/**
 * The status colours are fixed across the whole system (design doc): waiting to be checked grey,
 * waiting for the customer yellow, repairing blue, waiting for parts orange, ready green, closed faded.
 */
export const STATUS_TONE: Record<JobStatus, 'grey' | 'yellow' | 'blue' | 'orange' | 'green' | 'faded'> = {
  received: 'grey',
  diagnosing: 'grey',
  awaiting_approval: 'yellow',
  repairing: 'blue',
  waiting_parts: 'orange',
  ready: 'green',
  delivered: 'faded',
  cancelled: 'faded',
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  received: 'รอตรวจ',
  diagnosing: 'กำลังตรวจเช็ค',
  awaiting_approval: 'รอลูกค้าอนุมัติ',
  repairing: 'กำลังซ่อม',
  waiting_parts: 'รออะไหล่',
  ready: 'เสร็จ รอรับ',
  delivered: 'ส่งมอบแล้ว',
  cancelled: 'ยกเลิก',
};

/** The verb on a button that moves a job into a status. */
export const MOVE_LABEL: Record<JobStatus, string> = {
  received: 'กลับไปรอตรวจ',
  diagnosing: 'เริ่มตรวจเช็ค',
  awaiting_approval: 'ส่งราคาให้ลูกค้า',
  repairing: 'เริ่มซ่อม',
  waiting_parts: 'รออะไหล่',
  ready: 'เสร็จ รอรับเครื่อง',
  delivered: 'ส่งมอบ',
  cancelled: 'ยกเลิกงาน',
};

export const CATEGORY_LABEL: Record<Category, string> = { phone: 'มือถือ/แท็บเล็ต', computer: 'คอมพิวเตอร์/โน้ตบุ๊ก', appliance: 'เครื่องใช้ไฟฟ้า' };
export const METHOD_LABEL: Record<PayMethod, string> = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', transfer: 'โอนเงิน', card: 'บัตร' };
export const PHOTO_LABEL: Record<PhotoKind, string> = { intake: 'ตอนรับเครื่อง', before: 'ก่อนซ่อม', after: 'หลังซ่อม', removed_part: 'อะไหล่ที่ถอดออก', other: 'อื่น ๆ' };
export const ROLE_LABEL: Record<Role, string> = { owner: 'เจ้าของร้าน', admin: 'ผู้จัดการ', staff: 'หน้าร้าน', technician: 'ช่าง' };
export const ITEM_LABEL = { part: 'อะไหล่', labor: 'ค่าแรง', inspection: 'ค่าตรวจเช็ค' } as const;

/** Absolute link inside the hash router. */
export function appUrl(path: string) {
  return `${location.origin}${location.pathname}#${path}`;
}

/** Phone digits as typed into a tel: link. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, '')}`;

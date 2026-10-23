/**
 * The demo's database: the same 12 tables as the real server, held as one object in this browser's
 * IndexedDB. Every tab shares it, and a change in one tab refreshes the others.
 */
import type { Category, ItemKind, JobResult, JobStatus, PayMethod, PhotoKind, QuoteStatus, Role } from '../api/types';

export interface Setting {
  shopName: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  lineOaUrl: string | null;
  promptpayImageUrl: string | null;
  termsText: string;
  termsVersion: string;
  defaultWarrantyDays: number;
  pickupReminderDays: number;
  inspectionFee: number;
  defaultEtaDays: number;
  lineLiffId: string | null;
  lineChannelId: string | null;
}

export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Customer {
  id: number;
  phone: string;
  fullName: string;
  lineUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface Device {
  id: number;
  customerId: number;
  category: Category;
  brand: string;
  model: string;
  serialOrImei: string | null;
  color: string | null;
  createdAt: string;
}

export interface Condition {
  checks: string[];
  powersOn: 'yes' | 'no' | 'unknown';
  note?: string | null;
}

export interface Job {
  id: number;
  jobNo: string;
  deviceId: number;
  customerId: number;
  reportedIssue: string;
  accessories: string[];
  condition: Condition;
  passcode: string | null;
  status: JobStatus;
  result: JobResult | null;
  waitingReason: string | null;
  waitingUntil: string | null;
  etaDate: string;
  assignedTo: number | null;
  publicToken: string;
  stickerToken: string;
  intakeSignatureUrl: string | null;
  termsVersion: string;
  termsText: string;
  preApprovedAmount: number | null;
  inspectionFee: number;
  callbackAt: string | null;
  receivedAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
  warrantyDays: number | null;
  warrantyUntil: string | null;
  deliverySignatureUrl: string | null;
  returnedItems: { items: string[]; missingNote: string | null } | null;
  receivedBy: number | null;
  updatedAt: string;
}

export interface JobEvent {
  id: number;
  jobId: number;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
  note: string | null;
  visibleToCustomer: boolean;
  actorId: number | null;
  actorLabel: string;
  createdAt: string;
}

export interface Photo {
  id: number;
  jobId: number;
  kind: PhotoKind;
  url: string;
  visibleToCustomer: boolean;
  takenBy: number | null;
  createdAt: string;
}

export interface Quote {
  id: number;
  jobId: number;
  version: number;
  status: QuoteStatus;
  total: number;
  note: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  respondedVia: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface QuoteItem {
  id: number;
  quoteId: number;
  kind: ItemKind;
  description: string;
  qty: number;
  unitPrice: number;
  sort: number;
}

export interface LaborPreset {
  id: number;
  category: Category | null;
  name: string;
  price: number;
  active: boolean;
  sort: number;
}

export interface Payment {
  id: number;
  jobId: number;
  amount: number;
  method: PayMethod;
  note: string | null;
  paidAt: string;
  receivedBy: number | null;
}

export interface AuditLog {
  id: number;
  actorUserId: number | null;
  actorLabel: string;
  action: string;
  entity: string;
  entityId: number | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

export interface Db {
  schema: number;
  seededAt: string;
  ids: Record<string, number>;
  counters: Record<string, number>;
  settings: Setting;
  users: User[];
  customers: Customer[];
  devices: Device[];
  jobs: Job[];
  events: JobEvent[];
  photos: Photo[];
  quotes: Quote[];
  items: QuoteItem[];
  presets: LaborPreset[];
  payments: Payment[];
  audit: AuditLog[];
}

/** Raised when the stored shape changes, so an old copy is replaced by fresh sample data. */
export const SCHEMA = 2;

/** Next autoincrement id for a table. */
export function nextId(db: Db, table: string) {
  db.ids[table] = (db.ids[table] ?? 0) + 1;
  return db.ids[table];
}

/* ---------------- persistence ---------------- */

const NAME = 'rrts-demo';
const STORE = 'kv';
const KEY = 'db';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let conn: Promise<IDBDatabase | null> | null = null;
const connection = () => (conn ??= open());

export async function readStored(): Promise<Db | null> {
  const idb = await connection();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const req = idb.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Db | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Without IndexedDB (some private windows) the demo still works, it just forgets on reload. */
export async function writeStored(db: Db): Promise<boolean> {
  const idb = await connection();
  if (!idb) return false;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(db, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

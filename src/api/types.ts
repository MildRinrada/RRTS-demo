export type Role = 'owner' | 'admin' | 'staff' | 'technician';
export type JobStatus = 'received' | 'diagnosing' | 'awaiting_approval' | 'repairing' | 'waiting_parts' | 'ready' | 'delivered' | 'cancelled';
export type JobResult = 'repaired' | 'not_repaired';
export type Category = 'phone' | 'computer' | 'appliance';
export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'callback';
export type ItemKind = 'part' | 'labor' | 'inspection';
export type PhotoKind = 'intake' | 'before' | 'after' | 'removed_part' | 'other';
export type PayMethod = 'cash' | 'promptpay' | 'transfer' | 'card';

export interface PublicConfig {
  shopName: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  lineOaUrl: string | null;
  liffId: string | null;
  devLiff: boolean;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface TeamMember {
  id: number;
  name: string;
  role: Role;
}

export interface BoardJob {
  id: number;
  jobNo: string;
  status: JobStatus;
  result: JobResult | null;
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  device: string;
  category: Category;
  reportedIssue: string;
  etaDate: string;
  overdue: boolean;
  waitingReason: string | null;
  waitingUntil: string | null;
  callback: boolean;
  quote: { status: QuoteStatus; total: number; version: number } | null;
  assignee: { id: number; name: string } | null;
  thumbUrl: string | null;
  receivedAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
}

export interface QuoteItem {
  id?: number;
  kind: ItemKind;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface Quote {
  id: number;
  version: number;
  status: QuoteStatus;
  total: number;
  note: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  respondedVia: string | null;
  createdBy: string | null;
  items: QuoteItem[];
}

export interface Money {
  charge: number | null;
  paid: number;
  due: number | null;
}

export interface JobDetail {
  id: number;
  jobNo: string;
  status: JobStatus;
  result: JobResult | null;
  statusLabel: string;
  customerStatusLabel: string;
  reportedIssue: string;
  accessories: string[];
  condition: { checks: string[]; powersOn: 'yes' | 'no' | 'unknown'; note?: string | null };
  hasPasscode: boolean;
  canSeePasscode: boolean;
  waitingReason: string | null;
  waitingUntil: string | null;
  etaDate: string;
  preApprovedAmount: number | null;
  inspectionFee: number;
  callbackAt: string | null;
  receivedAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
  warrantyDays: number | null;
  warrantyUntil: string | null;
  returnedItems: { items: string[]; missingNote: string | null } | null;
  termsVersion: string;
  termsText: string;
  queuePosition: number | null;
  statusUrl: string;
  stickerUrl: string;
  assignee: { id: number; name: string } | null;
  receivedBy: string | null;
  customer: { id: number; fullName: string; phone: string; note: string | null; lineLinked: boolean };
  device: { id: number; category: Category; brand: string; model: string; serialOrImei: string | null; color: string | null; label: string };
  events: { id: number; from: JobStatus | null; to: JobStatus | null; note: string | null; visibleToCustomer: boolean; actor: string; at: string }[];
  photos: { id: number; kind: PhotoKind; url: string; visibleToCustomer: boolean; takenBy: string | null; at: string }[];
  quotes: Quote[];
  latestQuoteStatus: QuoteStatus | null;
  payments: { id: number; amount: number; method: PayMethod; note: string | null; paidAt: string; receivedBy: string | null }[];
  money: Money | null;
  intakeSignatureUrl: string | null;
  deliverySignatureUrl: string | null;
  moves: JobStatus[];
  pickupReminderDays: number;
  defaultWarrantyDays: number;
}

export interface PublicJob {
  shop: PublicConfig & { promptpayImageUrl: string | null };
  jobNo: string;
  device: string;
  category: Category;
  customerName: string;
  phone: string;
  status: JobStatus;
  result: JobResult | null;
  statusLabel: string;
  open: boolean;
  etaDate: string;
  waitingReason: string | null;
  waitingUntil: string | null;
  queuePosition: number | null;
  callbackRequested: boolean;
  receivedAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
  warrantyDays: number | null;
  warrantyUntil: string | null;
  timeline: { id: number; at: string; status: JobStatus | null; text: string }[];
  photos: { id: number; kind: PhotoKind; url: string; at: string }[];
  pendingQuote: { id: number; version: number; status: QuoteStatus; total: number; sentAt: string; previousTotal: number | null; items: QuoteItem[] } | null;
  quotes: { version: number; status: QuoteStatus; total: number; respondedAt: string | null; respondedVia: string | null; items: QuoteItem[] }[];
  inspectionFee: number;
  money: Money | null;
  hasWarrantyPdf: boolean;
}

export interface CustomerLookup {
  customer: {
    id: number;
    fullName: string;
    phone: string;
    note: string | null;
    devices: { id: number; category: Category; brand: string; model: string; serialOrImei: string | null; color: string | null; label: string }[];
    recentJobs: { id: number; jobNo: string; device: string; status: JobStatus; statusLabel: string; receivedAt: string }[];
  } | null;
}

export interface LaborPreset {
  id: number;
  category: Category | null;
  name: string;
  price: number;
  active: boolean;
}

export interface IntakeConfig {
  termsText: string;
  termsVersion: string;
  inspectionFee: number;
  defaultEtaDays: number;
}

export interface Settings {
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

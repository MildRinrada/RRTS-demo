/**
 * Repair jobs and quotes: a line-by-line port of the server's JobsService and QuotesService,
 * with the same guards, events and audit entries. The database triggers' rules are checked here too.
 */
import type { JobResult, JobStatus, PayMethod, PhotoKind } from '../api/types';
import type { Customer, Db, Device, Job, Payment, Quote } from './db';
import { nextId } from './db';
import { badRequest, conflict, firstName, forbidden, formatPhone, maskPhone, newToken, notFound, now, statusLink, stickerLink, thai, todayCal } from './util';

export type Role = 'owner' | 'admin' | 'staff' | 'technician';
export type UserActor = { type: 'user'; id: number; role: Role; name: string; email: string };
export type Actor = UserActor | { type: 'me'; lineUserId: string; name: string };

const RANK: Record<Role, number> = { technician: 0, staff: 1, admin: 2, owner: 3 };
const NEED = { shop: 0, staff: 1, admin: 2, owner: 3 } as const;
export const hasRole = (role: Role, atLeast: keyof typeof NEED) => RANK[role] >= NEED[atLeast];

export function actorLabel(actor: Actor | undefined) {
  if (!actor) return 'ระบบ';
  if (actor.type === 'user') return actor.name;
  return `ลูกค้า (LINE ${actor.name})`;
}

/* ---------------- statuses ---------------- */

export const STATUSES: JobStatus[] = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'waiting_parts', 'ready', 'delivered', 'cancelled'];
export const OPEN_STATUSES: JobStatus[] = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'waiting_parts', 'ready'];
export const QUEUE_STATUSES: JobStatus[] = ['received', 'diagnosing'];

export const MANUAL_MOVES: Record<JobStatus, JobStatus[]> = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['repairing', 'ready', 'cancelled'],
  awaiting_approval: ['repairing', 'diagnosing', 'ready', 'cancelled'],
  repairing: ['waiting_parts', 'ready'],
  waiting_parts: ['repairing', 'ready'],
  ready: ['repairing'],
  delivered: [],
  cancelled: [],
};

const SHOP_LABEL: Record<JobStatus, string> = {
  received: 'รอตรวจ',
  diagnosing: 'กำลังตรวจเช็ค',
  awaiting_approval: 'รอลูกค้าอนุมัติ',
  repairing: 'กำลังซ่อม',
  waiting_parts: 'รออะไหล่',
  ready: 'เสร็จ รอรับ',
  delivered: 'ส่งมอบแล้ว',
  cancelled: 'ยกเลิก',
};

const CUSTOMER_LABEL: Record<JobStatus, string> = {
  received: 'รับเครื่องแล้ว รอคิวตรวจเช็ค',
  diagnosing: 'ช่างกำลังตรวจเช็คอาการ',
  awaiting_approval: 'รอคุณอนุมัติราคาก่อนเริ่มซ่อม',
  repairing: 'ช่างกำลังซ่อม',
  waiting_parts: 'รออะไหล่',
  ready: 'ซ่อมเสร็จแล้ว มารับเครื่องได้เลย',
  delivered: 'รับเครื่องคืนแล้ว',
  cancelled: 'ยกเลิกงานซ่อมแล้ว',
};

export function shopLabel(status: JobStatus, result?: JobResult | null) {
  if (status === 'ready' && result === 'not_repaired') return 'ไม่ซ่อม รอรับคืน';
  return SHOP_LABEL[status];
}

export function customerLabel(status: JobStatus, result?: JobResult | null) {
  if (status === 'ready' && result === 'not_repaired') return 'ไม่ได้ซ่อม มารับเครื่องคืนได้เลย';
  return CUSTOMER_LABEL[status];
}

/* ---------------- relations ---------------- */

export const deviceLabel = (d: Pick<Device, 'brand' | 'model' | 'color'>) => `${d.brand} ${d.model}${d.color ? ` สี${d.color}` : ''}`;
export const quoteTotal = (items: { qty: number; unitPrice: number }[]) => items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

const byTime =
  <T extends { id: number }>(key: keyof T) =>
  (a: T, b: T) =>
    a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : a.id - b.id;

export const rel = {
  customer: (db: Db, j: Job) => db.customers.find((c) => c.id === j.customerId) as Customer,
  device: (db: Db, j: Job) => db.devices.find((d) => d.id === j.deviceId) as Device,
  quotes: (db: Db, jobId: number) => db.quotes.filter((q) => q.jobId === jobId).sort((a, b) => b.version - a.version),
  items: (db: Db, quoteId: number) => db.items.filter((i) => i.quoteId === quoteId).sort((a, b) => a.sort - b.sort),
  payments: (db: Db, jobId: number) => db.payments.filter((p) => p.jobId === jobId).sort(byTime<Payment>('paidAt')),
  events: (db: Db, jobId: number) => db.events.filter((e) => e.jobId === jobId).sort(byTime('createdAt')),
  photos: (db: Db, jobId: number) => db.photos.filter((p) => p.jobId === jobId).sort(byTime('createdAt')),
  userName: (db: Db, id: number | null) => db.users.find((u) => u.id === id)?.name ?? null,
};

/** What the customer owes: the approved price when repaired, the inspection fee when not. */
export function moneyOf(job: Pick<Job, 'result' | 'inspectionFee' | 'status'>, quotes: Pick<Quote, 'status' | 'total' | 'version'>[], payments: Pick<Payment, 'amount'>[]) {
  const latest = [...quotes].sort((a, b) => b.version - a.version)[0];
  const approved = latest?.status === 'approved' ? latest.total : null;
  let charge: number | null;
  if (job.status === 'cancelled') charge = 0;
  else if (job.result === 'not_repaired') charge = job.inspectionFee;
  else charge = approved;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return { charge, paid, due: charge === null ? null : Math.max(0, charge - paid) };
}

export function audit(db: Db, actor: Actor | undefined, action: string, entity: string, entityId: number | null, diff?: Record<string, unknown>) {
  db.audit.push({
    id: nextId(db, 'audit'),
    actorUserId: actor?.type === 'user' ? actor.id : null,
    actorLabel: actorLabel(actor),
    action,
    entity,
    entityId,
    diff: diff ? (JSON.parse(JSON.stringify(diff)) as Record<string, unknown>) : null,
    createdAt: now(),
  });
}

function event(db: Db, jobId: number, actor: Actor | undefined, data: { from?: JobStatus | null; to?: JobStatus | null; note?: string | null; visible: boolean }) {
  db.events.push({
    id: nextId(db, 'events'),
    jobId,
    fromStatus: data.from ?? null,
    toStatus: data.to ?? null,
    note: data.note ?? null,
    visibleToCustomer: data.visible,
    actorId: actor?.type === 'user' ? actor.id : null,
    actorLabel: actorLabel(actor),
    createdAt: now(),
  });
}

/** The database rule from the real system: a job cannot be repairing unless its latest quote is approved. */
function setStatus(db: Db, job: Job, to: JobStatus) {
  if (to === 'repairing' && rel.quotes(db, job.id)[0]?.status !== 'approved') {
    throw conflict('quote_not_approved', 'ต้องมีใบเสนอราคาที่ลูกค้าอนุมัติแล้วก่อนเริ่มซ่อม');
  }
  job.status = to;
}

/* ---------------- access ---------------- */

export function canSee(job: Pick<Job, 'assignedTo' | 'status'>, actor: UserActor) {
  if (actor.role !== 'technician') return true;
  return job.assignedTo === actor.id || (job.assignedTo === null && QUEUE_STATUSES.includes(job.status));
}

export function load(db: Db, id: number, actor: UserActor) {
  const job = db.jobs.find((j) => j.id === id);
  if (!job || !canSee(job, actor)) throw notFound('ไม่พบงานซ่อมนี้');
  return job;
}

function nextJobNo(db: Db) {
  const yymm = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: '2-digit', month: '2-digit' }).format(new Date()).replace(/\D/g, '');
  const key = `job:${yymm}`;
  db.counters[key] = (db.counters[key] ?? 0) + 1;
  return `R${yymm}-${String(db.counters[key]).padStart(4, '0')}`;
}

export function queuePosition(db: Db, job: Pick<Job, 'status' | 'receivedAt'>) {
  if (!QUEUE_STATUSES.includes(job.status)) return null;
  return db.jobs.filter((j) => QUEUE_STATUSES.includes(j.status) && j.receivedAt < job.receivedAt).length + 1;
}

function assertAssignable(db: Db, userId: number) {
  const u = db.users.find((x) => x.id === userId);
  if (!u || !u.active) throw badRequest('bad_assignee', 'ไม่พบช่างคนนี้ หรือบัญชีถูกปิดอยู่');
}

/* ---------------- intake ---------------- */

export interface IntakeInput {
  customer: { phone: string; fullName: string; note?: string | null };
  deviceId?: number | null;
  device?: { category: Device['category']; brand: string; model: string; serialOrImei?: string | null; color?: string | null } | null;
  reportedIssue: string;
  accessories: string[];
  condition: { checks: string[]; powersOn: 'yes' | 'no' | 'unknown'; note?: string | null };
  passcode?: string | null;
  etaDate: string;
  preApprovedAmount?: number | null;
  assignedTo?: number | null;
  signature: string;
  termsVersion: string;
}

export function intake(db: Db, input: IntakeInput, photoUrls: string[], signature: string, actor: UserActor) {
  const s = db.settings;
  if (input.termsVersion !== s.termsVersion) throw conflict('terms_changed', 'เงื่อนไขของร้านเพิ่งถูกแก้ไข ให้ลูกค้าอ่านฉบับใหม่แล้วเซ็นอีกครั้ง');
  if (!photoUrls.length) throw badRequest('photo_required', 'ถ่ายรูปสภาพเครื่องอย่างน้อย 1 รูปก่อนบันทึก');
  if (input.etaDate < todayCal()) throw badRequest('eta_past', 'วันคาดว่าเสร็จต้องไม่ใช่วันที่ผ่านมาแล้ว', { etaDate: 'เลือกวันนี้หรือหลังจากนี้' });
  if (input.assignedTo) assertAssignable(db, input.assignedTo);

  const c = input.customer;
  let customer = db.customers.find((x) => x.phone === c.phone);
  if (customer) {
    customer.fullName = c.fullName;
    if (c.note !== undefined) customer.note = c.note || null;
  } else {
    customer = { id: nextId(db, 'customers'), phone: c.phone, fullName: c.fullName, note: c.note || null, lineUserId: null, createdAt: now() };
    db.customers.push(customer);
  }

  let deviceId: number;
  if (input.deviceId) {
    const d = db.devices.find((x) => x.id === input.deviceId);
    if (!d || d.customerId !== customer.id) throw badRequest('bad_device', 'เครื่องนี้ไม่ใช่ของลูกค้าคนนี้');
    deviceId = d.id;
  } else if (input.device) {
    const d = input.device;
    const same = d.serialOrImei ? db.devices.find((x) => x.customerId === customer!.id && x.serialOrImei === d.serialOrImei) : null;
    if (same) deviceId = same.id;
    else {
      deviceId = nextId(db, 'devices');
      db.devices.push({ id: deviceId, customerId: customer.id, category: d.category, brand: d.brand, model: d.model, serialOrImei: d.serialOrImei || null, color: d.color || null, createdAt: now() });
    }
  } else {
    throw badRequest('no_device', 'กรอกข้อมูลเครื่อง');
  }

  const at = now();
  const job: Job = {
    id: nextId(db, 'jobs'),
    jobNo: nextJobNo(db),
    deviceId,
    customerId: customer.id,
    reportedIssue: input.reportedIssue,
    accessories: input.accessories,
    condition: input.condition,
    passcode: input.passcode || null,
    status: 'received',
    result: null,
    waitingReason: null,
    waitingUntil: null,
    etaDate: input.etaDate,
    assignedTo: input.assignedTo ?? null,
    publicToken: newToken(),
    stickerToken: newToken(),
    intakeSignatureUrl: signature,
    termsVersion: s.termsVersion,
    termsText: s.termsText,
    preApprovedAmount: input.preApprovedAmount ?? null,
    inspectionFee: s.inspectionFee,
    callbackAt: null,
    receivedAt: at,
    completedAt: null,
    deliveredAt: null,
    warrantyDays: null,
    warrantyUntil: null,
    deliverySignatureUrl: null,
    returnedItems: null,
    receivedBy: actor.id,
    updatedAt: at,
  };
  db.jobs.push(job);
  for (const url of photoUrls) db.photos.push({ id: nextId(db, 'photos'), jobId: job.id, kind: 'intake', url, visibleToCustomer: true, takenBy: actor.id, createdAt: at });
  event(db, job.id, actor, { to: 'received', note: `รับเครื่องแล้ว อาการที่แจ้ง: ${input.reportedIssue}`, visible: true });
  audit(db, actor, 'job.intake', 'repair_job', job.id, { jobNo: job.jobNo, customerId: customer.id, deviceId, photos: photoUrls.length });
  return { id: job.id, jobNo: job.jobNo, publicToken: job.publicToken, statusUrl: statusLink(job.publicToken) };
}

/* ---------------- board and list ---------------- */

const has = (v: string | null | undefined, q: string) => Boolean(v && v.toLowerCase().includes(q.toLowerCase()));

export function list(db: Db, params: { status?: JobStatus[]; assignee?: number | 'none'; q?: string }, actor: UserActor) {
  const recent = new Date(Date.now() - 3 * 86400_000).toISOString();
  const tech = actor.role === 'technician';
  const q = params.q?.trim();
  const digits = q?.replace(/\D/g, '') ?? '';
  const jobs = db.jobs
    .filter((j) => {
      if (params.status?.length) {
        if (!params.status.includes(j.status)) return false;
      } else if (!(OPEN_STATUSES.includes(j.status) || (j.deliveredAt && j.deliveredAt >= recent) || (j.status === 'cancelled' && j.updatedAt >= recent))) return false;
      if (params.assignee === 'none' && j.assignedTo !== null) return false;
      if (typeof params.assignee === 'number' && j.assignedTo !== params.assignee) return false;
      if (tech && !(j.assignedTo === actor.id || (j.assignedTo === null && QUEUE_STATUSES.includes(j.status)))) return false;
      if (q) {
        const c = rel.customer(db, j);
        const d = rel.device(db, j);
        if (!(has(j.jobNo, q) || has(c.fullName, q) || (digits.length >= 3 && c.phone.includes(digits)) || has(d.model, q) || has(d.brand, q) || has(d.serialOrImei, q))) return false;
      }
      return true;
    })
    .sort((a, b) => (a.etaDate < b.etaDate ? -1 : a.etaDate > b.etaDate ? 1 : a.receivedAt < b.receivedAt ? -1 : 1))
    .slice(0, 400);
  const today = todayCal();
  return jobs.map((j) => {
    const c = rel.customer(db, j);
    const d = rel.device(db, j);
    const latest = rel.quotes(db, j.id)[0];
    const thumb = rel.photos(db, j.id).find((p) => p.kind === 'intake');
    const assignee = db.users.find((u) => u.id === j.assignedTo);
    return {
      id: j.id,
      jobNo: j.jobNo,
      status: j.status,
      result: j.result,
      statusLabel: shopLabel(j.status, j.result),
      customerName: tech ? firstName(c.fullName) : c.fullName,
      customerPhone: tech ? maskPhone(c.phone) : formatPhone(c.phone),
      device: deviceLabel(d),
      category: d.category,
      reportedIssue: j.reportedIssue,
      etaDate: j.etaDate,
      overdue: OPEN_STATUSES.includes(j.status) && j.status !== 'ready' && j.etaDate < today,
      waitingReason: j.waitingReason,
      waitingUntil: j.waitingUntil,
      callback: Boolean(j.callbackAt),
      quote: latest ? { status: latest.status, total: latest.total, version: latest.version } : null,
      assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      thumbUrl: thumb?.url ?? null,
      receivedAt: j.receivedAt,
      completedAt: j.completedAt,
      deliveredAt: j.deliveredAt,
    };
  });
}

/* ---------------- one job ---------------- */

export function detail(db: Db, id: number, actor: UserActor) {
  return view(db, load(db, id, actor), actor);
}

export function bySticker(db: Db, token: string, actor: UserActor) {
  const job = db.jobs.find((j) => j.stickerToken === token);
  if (!job) throw notFound('สติกเกอร์นี้ไม่ใช่ของงานซ่อมในร้าน');
  if (!canSee(job, actor)) throw forbidden('งานนี้เป็นของช่างคนอื่น');
  return { id: job.id };
}

function view(db: Db, j: Job, actor: UserActor) {
  const tech = actor.role === 'technician';
  const staff = hasRole(actor.role, 'staff');
  const customer = rel.customer(db, j);
  const device = rel.device(db, j);
  const quotes = rel.quotes(db, j.id);
  const payments = rel.payments(db, j.id);
  const assignee = db.users.find((u) => u.id === j.assignedTo);
  const latest = quotes[0];
  const s = db.settings;
  return {
    id: j.id,
    jobNo: j.jobNo,
    status: j.status,
    result: j.result,
    statusLabel: shopLabel(j.status, j.result),
    customerStatusLabel: customerLabel(j.status, j.result),
    reportedIssue: j.reportedIssue,
    accessories: j.accessories,
    condition: j.condition,
    hasPasscode: Boolean(j.passcode),
    canSeePasscode: Boolean(j.passcode) && j.assignedTo === actor.id,
    waitingReason: j.waitingReason,
    waitingUntil: j.waitingUntil,
    etaDate: j.etaDate,
    preApprovedAmount: j.preApprovedAmount,
    inspectionFee: j.inspectionFee,
    callbackAt: j.callbackAt,
    receivedAt: j.receivedAt,
    completedAt: j.completedAt,
    deliveredAt: j.deliveredAt,
    warrantyDays: j.warrantyDays,
    warrantyUntil: j.warrantyUntil,
    returnedItems: j.returnedItems,
    termsVersion: j.termsVersion,
    termsText: j.termsText,
    queuePosition: queuePosition(db, j),
    statusUrl: statusLink(j.publicToken),
    stickerUrl: stickerLink(j.stickerToken),
    assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
    receivedBy: rel.userName(db, j.receivedBy),
    customer: {
      id: customer.id,
      fullName: tech ? firstName(customer.fullName) : customer.fullName,
      phone: tech ? maskPhone(customer.phone) : formatPhone(customer.phone),
      note: tech ? null : customer.note,
      lineLinked: Boolean(customer.lineUserId),
    },
    device: { id: device.id, category: device.category, brand: device.brand, model: device.model, serialOrImei: device.serialOrImei, color: device.color, label: deviceLabel(device) },
    events: rel.events(db, j.id).map((e) => ({ id: e.id, from: e.fromStatus, to: e.toStatus, note: e.note, visibleToCustomer: e.visibleToCustomer, actor: e.actorLabel, at: e.createdAt })),
    photos: rel.photos(db, j.id).map((p) => ({ id: p.id, kind: p.kind, url: p.url, visibleToCustomer: p.visibleToCustomer, takenBy: rel.userName(db, p.takenBy), at: p.createdAt })),
    quotes: quotes.map((q) => ({
      id: q.id,
      version: q.version,
      status: q.status,
      total: q.total,
      note: q.note,
      sentAt: q.sentAt,
      respondedAt: q.respondedAt,
      respondedVia: q.respondedVia,
      createdBy: rel.userName(db, q.createdBy),
      items: rel.items(db, q.id).map((i) => ({ id: i.id, kind: i.kind, description: i.description, qty: i.qty, unitPrice: i.unitPrice })),
    })),
    latestQuoteStatus: latest?.status ?? null,
    payments: staff ? payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, note: p.note, paidAt: p.paidAt, receivedBy: rel.userName(db, p.receivedBy) })) : [],
    money: staff ? moneyOf(j, quotes, payments) : null,
    intakeSignatureUrl: j.intakeSignatureUrl,
    deliverySignatureUrl: j.deliverySignatureUrl,
    moves: MANUAL_MOVES[j.status],
    pickupReminderDays: s.pickupReminderDays,
    defaultWarrantyDays: s.defaultWarrantyDays,
  };
}

/* ---------------- status ---------------- */

export interface StatusInput {
  to: JobStatus;
  note?: string | null;
  visibleToCustomer: boolean;
  result?: JobResult | null;
  waitingReason?: string | null;
  waitingUntil?: string | null;
  etaDate?: string | null;
}

export function changeStatus(db: Db, id: number, input: StatusInput, actor: UserActor) {
  const job = load(db, id, actor);
  const from = job.status;
  const to = input.to;
  if (from === to) throw badRequest('same_status', 'งานอยู่ในสถานะนี้อยู่แล้ว');
  if (to === 'awaiting_approval') throw badRequest('use_quote', 'ส่งใบเสนอราคาให้ลูกค้า ระบบจะเปลี่ยนเป็นรออนุมัติให้เอง');
  if (to === 'delivered') throw badRequest('use_handover', 'ใช้หน้าส่งมอบเพื่อบันทึกการคืนเครื่อง');
  if (!MANUAL_MOVES[from].includes(to)) throw badRequest('bad_move', `เปลี่ยนจาก "${shopLabel(from, job.result)}" เป็น "${shopLabel(to)}" ไม่ได้`);

  const latest = rel.quotes(db, id)[0];
  const data: Partial<Job> = {};
  let note = input.note?.trim() || null;

  if (to === 'repairing') {
    if (latest?.status !== 'approved') {
      throw conflict('quote_not_approved', latest?.status === 'sent' ? 'ลูกค้ายังไม่ได้อนุมัติราคาล่าสุด เริ่มซ่อมไม่ได้' : 'ต้องมีใบเสนอราคาที่ลูกค้าอนุมัติแล้วก่อนเริ่มซ่อม');
    }
    data.result = null;
  }
  if (to === 'waiting_parts') {
    if (!input.waitingReason?.trim() || !input.waitingUntil) {
      throw badRequest('waiting_details', 'ใส่ว่ารออะไหล่อะไร และคาดว่าจะได้วันไหน', { waitingReason: 'บอกลูกค้าว่ารออะไร', waitingUntil: 'เลือกวันที่คาดว่าจะได้' });
    }
    data.waitingReason = input.waitingReason.trim();
    data.waitingUntil = input.waitingUntil;
    if (input.etaDate) data.etaDate = input.etaDate;
    note = note ?? `รอ${input.waitingReason.trim().replace(/^รอ/, '')} คาดว่าจะได้ ${thai.cal(input.waitingUntil)}`;
  }
  if (from === 'waiting_parts') {
    data.waitingReason = null;
    data.waitingUntil = null;
  }
  if (to === 'ready') {
    const result = input.result ?? 'repaired';
    if (result === 'repaired') {
      if (latest?.status === 'sent') throw conflict('quote_pending', 'มีใบเสนอราคาที่ลูกค้ายังไม่ตอบ ปิดงานไม่ได้จนกว่าจะอนุมัติ');
      if (latest?.status !== 'approved') throw conflict('quote_not_approved', 'ปิดงานว่าซ่อมเสร็จไม่ได้ เพราะยังไม่มีราคาที่ลูกค้าอนุมัติ');
    }
    data.result = result;
    data.completedAt = now();
    data.callbackAt = null;
  }
  if (to === 'cancelled') {
    if (!note) throw badRequest('reason_required', 'ใส่เหตุผลที่ยกเลิก', { note: 'ใส่เหตุผลที่ยกเลิก' });
    data.passcode = null;
    data.callbackAt = null;
  }
  if (input.etaDate && to !== 'waiting_parts') data.etaDate = input.etaDate;

  setStatus(db, job, to);
  Object.assign(job, data, { updatedAt: now() });
  event(db, id, actor, { from, to, note, visible: input.visibleToCustomer });
  audit(db, actor, 'job.status', 'repair_job', id, { from, to, result: data.result, note });
  return detail(db, id, actor);
}

/* ---------------- edits ---------------- */

export function patch(
  db: Db,
  id: number,
  input: {
    etaDate?: string;
    etaNote?: string | null;
    waitingReason?: string;
    waitingUntil?: string;
    assignedTo?: number | null;
    preApprovedAmount?: number | null;
    callbackDone?: boolean;
    passcode?: string | null;
  },
  actor: UserActor,
) {
  const job = load(db, id, actor);
  if (!OPEN_STATUSES.includes(job.status)) throw badRequest('closed', 'งานนี้ปิดแล้ว แก้ไขไม่ได้');
  const tech = actor.role === 'technician';
  const data: Partial<Job> = {};
  const changed: Record<string, unknown> = {};

  if (input.etaDate && input.etaDate !== job.etaDate) {
    if (input.etaDate < todayCal()) throw badRequest('eta_past', 'วันคาดว่าเสร็จต้องไม่ใช่วันที่ผ่านมาแล้ว');
    data.etaDate = input.etaDate;
    changed.etaDate = { from: job.etaDate, to: input.etaDate };
    const why = input.etaNote?.trim();
    event(db, id, actor, { note: `ปรับวันคาดว่าเสร็จเป็น${thai.calWeekday(input.etaDate)}ที่ ${thai.cal(input.etaDate)}${why ? ` เพราะ${why.replace(/^เพราะ/, '')}` : ''}`, visible: true });
  }
  if (input.waitingReason !== undefined || input.waitingUntil !== undefined) {
    if (job.status !== 'waiting_parts') throw badRequest('not_waiting', 'แก้เหตุผลการรอได้เฉพาะงานที่รออะไหล่');
    if (input.waitingReason !== undefined) data.waitingReason = input.waitingReason.trim();
    if (input.waitingUntil) data.waitingUntil = input.waitingUntil;
    changed.waiting = { reason: input.waitingReason, until: input.waitingUntil };
    event(db, id, actor, { note: `อัปเดตการรออะไหล่: ${(input.waitingReason ?? job.waitingReason ?? '').trim()} คาดว่าจะได้ ${thai.cal(input.waitingUntil ?? job.waitingUntil!)}`, visible: true });
  }
  if (input.assignedTo !== undefined) {
    if (tech) throw forbidden('ช่างเปลี่ยนผู้รับผิดชอบเองไม่ได้ ใช้ปุ่มรับงานแทน');
    if (input.assignedTo) assertAssignable(db, input.assignedTo);
    data.assignedTo = input.assignedTo;
    changed.assignedTo = { from: job.assignedTo, to: input.assignedTo };
  }
  if (input.preApprovedAmount !== undefined) {
    if (tech) throw forbidden();
    data.preApprovedAmount = input.preApprovedAmount;
    changed.preApprovedAmount = { from: job.preApprovedAmount, to: input.preApprovedAmount };
  }
  if (input.callbackDone) {
    data.callbackAt = null;
    changed.callbackDone = true;
    event(db, id, actor, { note: 'ร้านโทรหาลูกค้าแล้ว', visible: true });
  }
  if (input.passcode !== undefined) {
    if (tech) throw forbidden();
    data.passcode = input.passcode || null;
    changed.passcode = input.passcode ? 'changed' : 'cleared';
  }
  if (Object.keys(changed).length) {
    Object.assign(job, data, { updatedAt: now() });
    audit(db, actor, 'job.update', 'repair_job', id, changed);
  }
  return detail(db, id, actor);
}

export function claim(db: Db, id: number, actor: UserActor) {
  const job = load(db, id, actor);
  if (job.assignedTo !== actor.id) {
    if (job.assignedTo !== null) throw conflict('taken', 'งานนี้มีช่างรับไปแล้ว');
    job.assignedTo = actor.id;
    job.updatedAt = now();
    audit(db, actor, 'job.claim', 'repair_job', id);
  }
  return detail(db, id, actor);
}

export function addNote(db: Db, id: number, input: { note: string; visibleToCustomer: boolean }, actor: UserActor) {
  const job = load(db, id, actor);
  event(db, job.id, actor, { note: input.note.trim(), visible: input.visibleToCustomer });
  return detail(db, id, actor);
}

export function addPhotos(db: Db, id: number, urls: string[], kind: PhotoKind, visible: boolean, actor: UserActor) {
  const job = load(db, id, actor);
  if (!urls.length) throw badRequest('no_file', 'เลือกรูปอย่างน้อย 1 รูป');
  const at = now();
  for (const url of urls) db.photos.push({ id: nextId(db, 'photos'), jobId: job.id, kind, url, visibleToCustomer: kind === 'intake' ? true : visible, takenBy: actor.id, createdAt: at });
  audit(db, actor, 'photo.add', 'repair_job', job.id, { kind, count: urls.length, visible });
  return detail(db, id, actor);
}

export function setPhotoVisibility(db: Db, id: number, photoId: number, visible: boolean, actor: UserActor) {
  const job = load(db, id, actor);
  const photo = db.photos.find((p) => p.id === photoId && p.jobId === job.id);
  if (!photo) throw notFound('ไม่พบรูปนี้');
  if (photo.kind === 'intake' && !visible) throw badRequest('intake_visible', 'รูปตอนรับเครื่องต้องเปิดให้ลูกค้าเห็นเสมอ');
  photo.visibleToCustomer = visible;
  audit(db, actor, 'photo.visibility', 'repair_job', job.id, { photoId, visible });
  return detail(db, id, actor);
}

export function revealPasscode(db: Db, id: number, actor: UserActor) {
  const job = load(db, id, actor);
  if (!job.passcode) throw notFound('งานนี้ไม่มีรหัสปลดล็อก หรือถูกลบไปแล้วหลังส่งมอบ');
  if (job.assignedTo !== actor.id) throw forbidden('รหัสปลดล็อกดูได้เฉพาะช่างที่รับงานนี้');
  audit(db, actor, 'passcode.view', 'repair_job', id);
  return { passcode: job.passcode };
}

/* ---------------- money and handover ---------------- */

export function addPayment(db: Db, id: number, input: { amount: number; method: PayMethod; note?: string | null }, actor: UserActor) {
  const job = load(db, id, actor);
  if (job.status === 'cancelled' || job.status === 'delivered') throw badRequest('closed', 'งานนี้ปิดแล้ว');
  const m = moneyOf(job, rel.quotes(db, id), rel.payments(db, id));
  if (m.due !== null && input.amount > m.due) throw badRequest('overpay', `ยอดค้างชำระเหลือ ${thai.baht(m.due)} รับเกินไม่ได้`);
  db.payments.push({ id: nextId(db, 'payments'), jobId: id, amount: input.amount, method: input.method, note: input.note || null, paidAt: now(), receivedBy: actor.id });
  event(db, id, actor, { note: `รับชำระ ${thai.baht(input.amount)}`, visible: false });
  audit(db, actor, 'payment.add', 'repair_job', id, { amount: input.amount, method: input.method });
  return detail(db, id, actor);
}

export function deliver(
  db: Db,
  id: number,
  input: { returnedItems: string[]; missingNote?: string | null; payment?: { amount: number; method: PayMethod } | null; warrantyDays?: number | null },
  signature: string,
  actor: UserActor,
) {
  const s = db.settings;
  const job = load(db, id, actor);
  if (job.status !== 'ready') throw badRequest('not_ready', 'ส่งมอบได้เฉพาะงานที่เสร็จ รอรับเครื่อง');
  const missing = job.accessories.filter((a) => !input.returnedItems.includes(a));
  if (missing.length && !input.missingNote?.trim()) {
    throw badRequest('items_missing', `ยังไม่ได้ติ๊กคืน: ${missing.join(', ')} ใส่หมายเหตุถ้าลูกค้าไม่รับคืน`, { missingNote: 'ใส่หมายเหตุของที่ไม่ได้คืน' });
  }
  const quotes = rel.quotes(db, id);
  const payments = rel.payments(db, id);
  const extra: Payment[] = [];
  if (input.payment && input.payment.amount > 0) {
    const m0 = moneyOf(job, quotes, payments);
    if (m0.due !== null && input.payment.amount > m0.due) throw badRequest('overpay', `ยอดค้างชำระเหลือ ${thai.baht(m0.due)}`);
    extra.push({ id: 0, jobId: id, amount: input.payment.amount, method: input.payment.method, note: null, paidAt: now(), receivedBy: actor.id });
  }
  const m = moneyOf(job, quotes, [...payments, ...extra]);
  if (m.due === null) throw conflict('no_price', 'ยังไม่มีราคาที่ลูกค้าอนุมัติ ส่งมอบไม่ได้');
  if (m.due > 0) throw conflict('balance_due', `ยังค้างชำระ ${thai.baht(m.due)} รับเงินก่อนส่งมอบ`);

  // All checks passed: write everything at once, like the server's transaction.
  for (const p of extra) db.payments.push({ ...p, id: nextId(db, 'payments') });
  const days = job.result === 'repaired' ? (input.warrantyDays ?? s.defaultWarrantyDays) : 0;
  Object.assign(job, {
    status: 'delivered',
    deliveredAt: now(),
    deliverySignatureUrl: signature,
    returnedItems: { items: input.returnedItems, missingNote: input.missingNote?.trim() || null },
    warrantyDays: days || null,
    warrantyUntil: days ? todayCal(days) : null,
    passcode: null,
    callbackAt: null,
    updatedAt: now(),
  });
  event(db, id, actor, { from: 'ready', to: 'delivered', note: days ? `ส่งมอบเครื่องแล้ว รับประกัน ${days} วัน ถึง ${thai.cal(todayCal(days))}` : 'ส่งมอบเครื่องคืนแล้ว', visible: true });
  audit(db, actor, 'job.deliver', 'repair_job', id, { paid: m.paid, warrantyDays: days, missing });
  return detail(db, id, actor);
}

/* ---------------- messages ---------------- */

export function updateMessage(db: Db, id: number, actor: UserActor) {
  const job = load(db, id, actor);
  const s = db.settings;
  const latest = rel.quotes(db, id)[0];
  const lines = [
    `${s.shopName} แจ้งอัปเดตงานซ่อม`,
    `${firstName(rel.customer(db, job).fullName)} งาน ${job.jobNo} ${deviceLabel(rel.device(db, job))}`,
    `สถานะ: ${customerLabel(job.status, job.result)}`,
  ];
  if (job.status === 'waiting_parts' && job.waitingReason) lines.push(`รอ: ${job.waitingReason}${job.waitingUntil ? ` คาดว่าจะได้ ${thai.cal(job.waitingUntil)}` : ''}`);
  if (latest?.status === 'sent') lines.push(`ราคาที่รออนุมัติ ${thai.baht(latest.total)} กดอนุมัติหรือไม่ซ่อมได้ในลิงก์ด้านล่าง`);
  if (OPEN_STATUSES.includes(job.status) && job.status !== 'ready') lines.push(`คาดว่าเสร็จ: ${thai.calWeekday(job.etaDate)}ที่ ${thai.cal(job.etaDate)}`);
  if (job.status === 'ready') {
    const m = moneyOf(job, rel.quotes(db, id), rel.payments(db, id));
    if (m.due) lines.push(`ยอดชำระตอนรับเครื่อง ${thai.baht(m.due)}`);
    lines.push('นำใบรับเครื่องมาด้วยนะครับ');
  }
  lines.push(`ดูสถานะและรูปได้ที่ ${statusLink(job.publicToken)}`);
  if (s.phone) lines.push(`สอบถาม ${s.phone}`);
  return { text: lines.join('\n') };
}

export function unclaimed(db: Db, days?: number) {
  const n = days ?? db.settings.pickupReminderDays;
  const before = new Date(Date.now() - n * 86400_000).toISOString();
  const jobs = db.jobs.filter((j) => j.status === 'ready' && j.completedAt && j.completedAt < before).sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1));
  return {
    days: n,
    rows: jobs.map((j) => {
      const c = rel.customer(db, j);
      return {
        id: j.id,
        jobNo: j.jobNo,
        customerName: c.fullName,
        customerPhone: formatPhone(c.phone),
        device: deviceLabel(rel.device(db, j)),
        result: j.result,
        completedAt: j.completedAt,
        daysWaiting: Math.floor((Date.now() - new Date(j.completedAt!).getTime()) / 86400_000),
        due: moneyOf(j, rel.quotes(db, j.id), rel.payments(db, j.id)).due,
        statusUrl: statusLink(j.publicToken),
      };
    }),
  };
}

/* ---------------- quotes ---------------- */

const QUOTABLE: JobStatus[] = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'waiting_parts'];

export interface QuoteItemInput {
  kind: 'part' | 'labor' | 'inspection';
  description: string;
  qty: number;
  unitPrice: number;
}

export function createDraft(db: Db, jobId: number, actor: UserActor) {
  const job = load(db, jobId, actor);
  if (!QUOTABLE.includes(job.status)) throw badRequest('not_quotable', 'งานนี้เสร็จหรือปิดแล้ว ออกใบเสนอราคาใหม่ไม่ได้');
  const quotes = rel.quotes(db, jobId);
  if (!quotes.some((q) => q.status === 'draft')) {
    const last = quotes[0];
    const lastItems = last ? rel.items(db, last.id) : [];
    const q: Quote = {
      id: nextId(db, 'quotes'),
      jobId,
      version: (last?.version ?? 0) + 1,
      status: 'draft',
      total: quoteTotal(lastItems),
      note: null,
      sentAt: null,
      respondedAt: null,
      respondedVia: null,
      createdBy: actor.id,
      createdAt: now(),
    };
    db.quotes.push(q);
    for (const i of lastItems) db.items.push({ id: nextId(db, 'items'), quoteId: q.id, kind: i.kind, description: i.description, qty: i.qty, unitPrice: i.unitPrice, sort: i.sort });
    audit(db, actor, 'quote.draft', 'quote', q.id, { jobId, version: q.version });
  }
  return detail(db, jobId, actor);
}

function quoteFor(db: Db, quoteId: number, actor: UserActor) {
  const quote = db.quotes.find((q) => q.id === quoteId);
  if (!quote) throw notFound('ไม่พบใบเสนอราคา');
  return { quote, job: load(db, quote.jobId, actor) };
}

export function updateDraft(db: Db, quoteId: number, input: { items: QuoteItemInput[]; note?: string | null }, actor: UserActor) {
  const { quote } = quoteFor(db, quoteId, actor);
  if (quote.status !== 'draft') throw conflict('quote_locked', 'ใบเสนอราคาที่ส่งแล้วแก้ไม่ได้ ออกเวอร์ชันใหม่แทน');
  db.items = db.items.filter((i) => i.quoteId !== quoteId);
  input.items.forEach((i, sort) => db.items.push({ id: nextId(db, 'items'), quoteId, kind: i.kind, description: i.description.trim(), qty: i.qty, unitPrice: i.unitPrice, sort }));
  quote.note = input.note?.trim() || null;
  quote.total = quoteTotal(input.items);
  return detail(db, quote.jobId, actor);
}

export function deleteDraft(db: Db, quoteId: number, actor: UserActor) {
  const { quote } = quoteFor(db, quoteId, actor);
  if (quote.status !== 'draft') throw conflict('quote_locked', 'ลบได้เฉพาะฉบับร่าง');
  db.items = db.items.filter((i) => i.quoteId !== quoteId);
  db.quotes = db.quotes.filter((q) => q.id !== quoteId);
  return detail(db, quote.jobId, actor);
}

export function sendQuote(db: Db, quoteId: number, actor: UserActor) {
  const { quote, job } = quoteFor(db, quoteId, actor);
  if (quote.status !== 'draft') throw conflict('quote_locked', 'ใบเสนอราคานี้ส่งไปแล้ว');
  if (!QUOTABLE.includes(job.status)) throw badRequest('not_quotable', 'งานนี้เสร็จหรือปิดแล้ว');
  const items = rel.items(db, quoteId);
  if (!items.length) throw badRequest('quote_empty', 'เพิ่มรายการอย่างน้อย 1 รายการก่อนส่ง');
  const total = quoteTotal(items);
  const pre = job.preApprovedAmount !== null && total <= job.preApprovedAmount;
  const at = now();
  Object.assign(quote, pre ? { status: 'approved', total, sentAt: at, respondedAt: at, respondedVia: 'preapproved' } : { status: 'sent', total, sentAt: at });
  for (const q of db.quotes) {
    if (q.jobId === job.id && q.id !== quoteId && (q.status === 'sent' || q.status === 'callback')) Object.assign(q, { status: 'rejected', respondedAt: at, respondedVia: 'superseded' });
  }
  const lines = items.map((i) => `${i.description} ${thai.baht(i.qty * i.unitPrice)}`).join(', ');
  const from = job.status;
  if (pre) {
    const to: JobStatus = ['received', 'diagnosing', 'awaiting_approval'].includes(from) ? 'repairing' : from;
    setStatus(db, job, to);
    job.callbackAt = null;
    event(db, job.id, actor, {
      from,
      to: to !== from ? to : undefined,
      note: `ราคา ${thai.baht(total)} (${lines}) ไม่เกินวงเงิน ${thai.baht(job.preApprovedAmount!)} ที่ตกลงไว้ตอนรับเครื่อง เริ่มซ่อมได้เลย`,
      visible: true,
    });
  } else {
    setStatus(db, job, 'awaiting_approval');
    event(db, job.id, actor, {
      from,
      to: from !== 'awaiting_approval' ? 'awaiting_approval' : undefined,
      note: `${quote.version > 1 ? 'แจ้งราคาใหม่' : 'แจ้งราคา'} ${thai.baht(total)} (${lines}) รอลูกค้าอนุมัติก่อนซ่อม`,
      visible: true,
    });
  }
  job.updatedAt = at;
  audit(db, actor, 'quote.send', 'quote', quoteId, { jobId: job.id, version: quote.version, total, preapproved: pre });
  return detail(db, job.id, actor);
}

export type Decision = 'approve' | 'reject' | 'callback';

export function respond(db: Db, jobId: number, quoteId: number, decision: Decision, via: 'link' | 'liff' | 'phone', actor: Actor | undefined) {
  const job = db.jobs.find((j) => j.id === jobId);
  const latest = job ? rel.quotes(db, jobId)[0] : undefined;
  if (!job || !latest || latest.id !== quoteId) throw conflict('quote_outdated', 'ราคานี้ไม่ใช่ฉบับล่าสุดแล้ว เปิดหน้านี้ใหม่เพื่อดูราคาปัจจุบัน');
  if (latest.status !== 'sent' && latest.status !== 'callback') throw conflict('quote_answered', 'ตอบราคานี้ไปแล้ว');
  const at = now();
  const by = via === 'phone' ? ' (แจ้งร้านทางโทรศัพท์)' : '';
  if (decision === 'approve') {
    Object.assign(latest, { status: 'approved', respondedAt: at, respondedVia: via });
    const from = job.status;
    const to: JobStatus = from === 'awaiting_approval' ? 'repairing' : from;
    setStatus(db, job, to);
    job.callbackAt = null;
    event(db, jobId, actor, { from, to: to !== from ? to : undefined, note: `ลูกค้าอนุมัติราคา ${thai.baht(latest.total)}${by}`, visible: true });
  } else if (decision === 'reject') {
    Object.assign(latest, { status: 'rejected', respondedAt: at, respondedVia: via });
    job.callbackAt = null;
    event(db, jobId, actor, { note: `ลูกค้าเลือกไม่ซ่อมที่ราคา ${thai.baht(latest.total)}${by}`, visible: true });
  } else {
    Object.assign(latest, { status: 'callback', respondedAt: at, respondedVia: via });
    job.callbackAt = at;
    event(db, jobId, actor, { note: 'ลูกค้าขอให้ร้านโทรกลับก่อนตัดสินใจ', visible: true });
  }
  job.updatedAt = at;
  audit(db, actor, `quote.${decision}`, 'quote', quoteId, { jobId, via, total: latest.total });
}

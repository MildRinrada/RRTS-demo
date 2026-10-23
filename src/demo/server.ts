/**
 * The demo's backend. Every `/api` call the web app makes lands here instead of on the network:
 * the same routes, roles, validation and Thai error messages as the real NestJS server.
 * A failed request leaves the data exactly as it was, like the server's transactions.
 */
import { z, ZodError } from 'zod';
import { ApiError } from '../api/errors';
import type { JobStatus } from '../api/types';
import { type Db, nextId, readStored, SCHEMA, writeStored } from './db';
import { intakeDoc, receiptDoc, stickerDoc, type PrintDoc } from './documents';
import * as J from './jobs';
import { type Actor, audit, customerLabel, deviceLabel, hasRole, moneyOf, OPEN_STATUSES, rel, shopLabel, STATUSES, type UserActor } from './jobs';
import { buildSeed, DEMO_PASSWORD } from './seed';
import { badRequest, conflict, DAY, firstName, forbidden, formatPhone, intParam, isToken, maskPhone, notFound, now, sha256, statusLink, thai, todayCal, unauthorized } from './util';

/* ---------------- the database in memory ---------------- */

let db: Db | null = null;
let loading: Promise<Db> | null = null;

async function getDb(): Promise<Db> {
  if (db) return db;
  loading ??= (async () => {
    const stored = await readStored();
    if (stored && stored.schema === SCHEMA) return (db = stored);
    db = await buildSeed();
    await writeStored(db);
    return db;
  })();
  return loading;
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rrts-demo') : null;
const listeners = new Set<() => void>();

/** Called when another tab changed the data, so this tab can refetch. */
export function onDemoChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (channel) {
  channel.onmessage = async () => {
    const fresh = await readStored();
    if (fresh) db = fresh;
    listeners.forEach((fn) => fn());
  };
}

async function persist() {
  if (!db) return;
  await writeStored(db);
  channel?.postMessage('changed');
}

/** Puts the sample shop back as it was on first open. */
export async function resetDemo() {
  db = await buildSeed();
  loading = Promise.resolve(db);
  await persist();
  localStorage.removeItem(SID);
  localStorage.removeItem(ME);
}

/** For the demo's start page: the sample jobs a visitor can open as the customer. */
export async function demoJobs() {
  const d = await getDb();
  return d.jobs.map((j) => ({
    id: j.id,
    jobNo: j.jobNo,
    status: j.status,
    result: j.result,
    publicToken: j.publicToken,
    device: deviceLabel(rel.device(d, j)),
    customer: firstName(rel.customer(d, j).fullName),
    quote: rel.quotes(d, j.id)[0]?.status ?? null,
  }));
}

/* ---------------- sessions (the server's cookies) ---------------- */

const SID = 'rrts-demo-sid';
const ME = 'rrts-demo-me';

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* the session then lasts until reload */
    }
  },
};

type Access = 'shop' | 'staff' | 'admin' | 'owner' | 'me';

function resolveActor(d: Db, need: Access | null): Actor | undefined {
  if (!need) return undefined;
  if (need === 'me') {
    const raw = store.get(ME);
    const me = raw ? (JSON.parse(raw) as { lineUserId: string; name: string }) : null;
    if (!me) throw unauthorized('กรุณาเข้าสู่ระบบด้วย LINE');
    return { type: 'me', lineUserId: me.lineUserId, name: me.name };
  }
  const id = Number(store.get(SID));
  const user = d.users.find((u) => u.id === id);
  if (!user || !user.active) throw unauthorized('กรุณาเข้าสู่ระบบ');
  if (!hasRole(user.role, need)) throw forbidden();
  return { type: 'user', id: user.id, role: user.role, name: user.name, email: user.email };
}

const asUser = (a: Actor | undefined): UserActor => {
  if (a?.type !== 'user') throw forbidden();
  return a;
};

/* ---------------- validation (the server's zod schemas) ---------------- */

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  try {
    return schema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of e.issues) fields[issue.path.join('.') || '_'] = issue.message;
      throw new ApiError(400, 'validation', 'ข้อมูลไม่ครบหรือไม่ถูกต้อง', fields);
    }
    throw e;
  }
}

const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[^0-9]/g, ''))
  .refine((v) => /^0\d{8,9}$/.test(v), 'เบอร์โทรไม่ถูกต้อง ใช้ 9 หรือ 10 หลัก ขึ้นต้นด้วย 0');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ไม่ถูกต้อง');
const text = (max: number) => z.string().trim().max(max);
const money = z.number().int('ราคาเป็นบาทเต็ม').min(0, 'ราคาต้องไม่ติดลบ').max(10_000_000);
const method = z.enum(['cash', 'promptpay', 'transfer', 'card']);
const signature = z.string().min(30, 'ให้ลูกค้าเซ็นชื่อก่อน').max(900_000);
const PASSWORD = z.string().min(10, 'รหัสผ่านอย่างน้อย 10 ตัวอักษร').max(200);
const ROLE = z.enum(['owner', 'admin', 'staff', 'technician']);
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const intakeSchema = z.object({
  customer: z.object({ phone: phoneSchema, fullName: text(120).min(2, 'กรอกชื่อลูกค้า'), note: text(500).nullable().optional() }),
  deviceId: z.number().int().positive().nullable().optional(),
  device: z
    .object({
      category: z.enum(['phone', 'computer', 'appliance']),
      brand: text(60).min(1, 'กรอกยี่ห้อ'),
      model: text(80).min(1, 'กรอกรุ่น'),
      serialOrImei: text(60).nullable().optional(),
      color: text(40).nullable().optional(),
    })
    .nullable()
    .optional(),
  reportedIssue: text(1000).min(3, 'กรอกอาการที่ลูกค้าแจ้ง'),
  accessories: z.array(text(60).min(1)).max(20).default([]),
  condition: z.object({ checks: z.array(text(80).min(1)).max(30).default([]), powersOn: z.enum(['yes', 'no', 'unknown']), note: text(500).nullable().optional() }),
  passcode: text(64).nullable().optional(),
  etaDate: dateSchema,
  preApprovedAmount: money.nullable().optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
  signature,
  termsVersion: z.string().min(1),
});

const quoteItems = z.array(z.object({ kind: z.enum(['part', 'labor', 'inspection']), description: text(200).min(1, 'กรอกรายการ'), qty: z.number().int().min(1).max(99), unitPrice: money })).max(40);

/* ---------------- files ---------------- */

const MAX_PHOTO = 8 * 1024 * 1024;
const MAX_BRAND = 3 * 1024 * 1024;
const MAX_SIGNATURE = 600 * 1024;

/**
 * Stores an uploaded image as a data URL in the demo database, re-encoded through a canvas, which
 * drops EXIF the same way the server strips it. Kept smaller than the real system's 1600 px.
 */
async function saveImage(file: unknown, max: number, side: number) {
  if (!(file instanceof Blob)) throw badRequest('no_file', 'ไม่พบไฟล์ที่อัปโหลด');
  if (file.size > max) throw badRequest('too_large', `ไฟล์ใหญ่เกิน ${Math.round(max / 1024 / 1024)} MB`);
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') throw badRequest('bad_type', 'ใช้ไฟล์ JPG หรือ PNG');
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw badRequest('bad_image', `ไฟล์รูปเสียหรือไม่ใช่ ${file.type === 'image/png' ? 'PNG' : 'JPG'}`);
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.78);
}

function saveSignature(dataUrl: string) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest('bad_signature', 'ลายเซ็นไม่ถูกต้อง ให้ลูกค้าเซ็นใหม่');
  if ((m[1].length * 3) / 4 > MAX_SIGNATURE) throw badRequest('bad_signature', 'ลายเซ็นใหญ่เกินไป');
  return dataUrl;
}

/* ---------------- routes ---------------- */

interface Ctx {
  db: Db;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  actor: Actor | undefined;
}
type Handler = (c: Ctx) => unknown;
interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  access: Access | null;
  handler: Handler;
}

const routes: Route[] = [];
function route(method: string, path: string, access: Access | null, handler: Handler) {
  const keys: string[] = [];
  const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)'))}$`);
  routes.push({ method, re, keys, access, handler });
}

const form = (body: unknown) => (body instanceof FormData ? body : new FormData());

/* public: the customer's page from the QR */

function publicConfig(d: Db) {
  const s = d.settings;
  // No LINE channel in the demo: "sign in with LINE" uses a sample LINE account instead.
  return { shopName: s.shopName, logoUrl: s.logoUrl, phone: s.phone, address: s.address, lineOaUrl: s.lineOaUrl, liffId: null, devLiff: true };
}

function byToken(d: Db, token: string) {
  const job = isToken(token) ? d.jobs.find((j) => j.publicToken === token) : undefined;
  if (!job) throw notFound('ไม่พบงานซ่อมนี้ ตรวจลิงก์หรือสแกน QR บนใบรับเครื่องอีกครั้ง');
  return job;
}

function publicJob(d: Db, token: string) {
  const j = byToken(d, token);
  const s = d.settings;
  const customer = rel.customer(d, j);
  const device = rel.device(d, j);
  const quotes = rel.quotes(d, j.id).filter((q) => q.status !== 'draft');
  const payments = rel.payments(d, j.id);
  const latest = quotes[0];
  const pending = latest && (latest.status === 'sent' || latest.status === 'callback') ? latest : null;
  const money = moneyOf(j, quotes, payments);
  const atCounter = j.status === 'ready' || j.status === 'delivered';
  const items = (id: number) => rel.items(d, id).map((i) => ({ kind: i.kind, description: i.description, qty: i.qty, unitPrice: i.unitPrice }));
  return {
    shop: { ...publicConfig(d), promptpayImageUrl: j.status === 'ready' && money.due ? s.promptpayImageUrl : null },
    jobNo: j.jobNo,
    device: deviceLabel(device),
    category: device.category,
    customerName: firstName(customer.fullName),
    phone: maskPhone(customer.phone),
    status: j.status,
    result: j.result,
    statusLabel: customerLabel(j.status, j.result),
    open: OPEN_STATUSES.includes(j.status),
    etaDate: j.etaDate,
    waitingReason: j.status === 'waiting_parts' ? j.waitingReason : null,
    waitingUntil: j.status === 'waiting_parts' ? j.waitingUntil : null,
    queuePosition: J.queuePosition(d, j),
    callbackRequested: Boolean(j.callbackAt),
    receivedAt: j.receivedAt,
    completedAt: j.completedAt,
    deliveredAt: j.deliveredAt,
    warrantyDays: j.warrantyDays,
    warrantyUntil: j.warrantyUntil,
    timeline: rel
      .events(d, j.id)
      .filter((e) => e.visibleToCustomer)
      .map((e) => ({ id: e.id, at: e.createdAt, status: e.toStatus, text: e.note ?? customerLabel(e.toStatus ?? j.status) })),
    photos: rel
      .photos(d, j.id)
      .filter((p) => p.visibleToCustomer)
      .map((p) => ({ id: p.id, kind: p.kind, url: p.url, at: p.createdAt })),
    pendingQuote: pending
      ? {
          id: pending.id,
          version: pending.version,
          status: pending.status,
          total: pending.total,
          sentAt: pending.sentAt,
          previousTotal: quotes.find((q) => q.version < pending.version && q.status === 'approved')?.total ?? null,
          items: items(pending.id),
        }
      : null,
    quotes: quotes
      .filter((q) => q !== pending && q.respondedVia !== 'superseded')
      .map((q) => ({ version: q.version, status: q.status, total: q.total, respondedAt: q.respondedAt, respondedVia: q.respondedVia, items: items(q.id) })),
    inspectionFee: j.inspectionFee,
    money: atCounter ? money : null,
    hasWarrantyPdf: j.status === 'delivered',
  };
}

route('GET', '/public/config', null, ({ db }) => publicConfig(db));
route('GET', '/public/jobs/:token', null, ({ db, params }) => publicJob(db, params.token));
route('POST', '/public/jobs/:token/quotes/:quoteId/respond', null, ({ db, params, body }) => {
  const { decision } = parse(z.object({ decision: z.enum(['approve', 'reject', 'callback']) }), body);
  const j = byToken(db, params.token);
  const raw = store.get(ME);
  const me = raw ? (JSON.parse(raw) as { lineUserId: string; name: string }) : null;
  const lineUserId = rel.customer(db, j).lineUserId;
  const viaLiff = Boolean(me && lineUserId && me.lineUserId === lineUserId);
  J.respond(db, j.id, intParam(params.quoteId, 'quoteId'), decision, viaLiff ? 'liff' : 'link', viaLiff && me ? { type: 'me', ...me } : undefined);
  return publicJob(db, params.token);
});
route('GET', '/public/jobs/:token/doc/warranty', null, ({ db, params }) => {
  const j = byToken(db, params.token);
  if (j.status !== 'delivered') throw badRequest('not_delivered', 'ใบรับประกันออกให้หลังรับเครื่องคืน');
  return receiptDoc(db, j, 'a5');
});

/* auth: shop staff */

route('POST', '/auth/login', null, async ({ db, body }) => {
  const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'), password: z.string().min(1, 'กรอกรหัสผ่าน').max(200) }), body);
  const user = db.users.find((u) => u.email === email);
  if (!user || !user.active || user.passwordHash !== (await sha256(password))) throw unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'bad_credentials');
  user.lastLoginAt = now();
  store.set(SID, String(user.id));
  audit(db, { type: 'user', id: user.id, role: user.role, name: user.name, email: user.email }, 'auth.login', 'user', user.id);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});
route('POST', '/auth/logout', null, () => {
  store.set(SID, null);
  return { ok: true };
});
route('GET', '/auth/me', 'shop', ({ actor }) => {
  const a = asUser(actor);
  return { id: a.id, name: a.name, email: a.email, role: a.role };
});
route('POST', '/auth/password', 'shop', async ({ db, body, actor }) => {
  const a = asUser(actor);
  const { current, next } = parse(z.object({ current: z.string().min(1, 'กรอกรหัสผ่านเดิม'), next: z.string().min(10, 'รหัสผ่านใหม่อย่างน้อย 10 ตัวอักษร').max(200) }), body);
  const user = db.users.find((u) => u.id === a.id)!;
  if (user.passwordHash !== (await sha256(current))) throw badRequest('bad_password', 'รหัสผ่านเดิมไม่ถูกต้อง', { current: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  user.passwordHash = await sha256(next);
  audit(db, a, 'user.password', 'user', a.id);
  return { ok: true };
});

/* me: customers signed in with LINE */

route('POST', '/me/liff-login', null, () => {
  throw new ApiError(503, 'liff_off', 'เดโมนี้ไม่ได้เชื่อมกับ LINE จริง ใช้บัญชี LINE ตัวอย่างแทน');
});
route('POST', '/me/dev-login', null, ({ body }) => {
  const { lineUserId, name } = parse(z.object({ lineUserId: z.string().min(3).max(64), name: z.string().min(1).max(80) }), body);
  store.set(ME, JSON.stringify({ lineUserId, name }));
  return { name };
});
route('POST', '/me/logout', null, () => {
  store.set(ME, null);
  return { ok: true };
});
route('GET', '/me', 'me', ({ db, actor }) => {
  if (actor?.type !== 'me') return null;
  const c = db.customers.find((x) => x.lineUserId === actor.lineUserId);
  return { name: actor.name, linked: Boolean(c), customerName: c?.fullName ?? null };
});
route('POST', '/me/link-phone', 'me', ({ db, body, actor }) => {
  if (actor?.type !== 'me') return null;
  const { phone, jobNo } = parse(z.object({ phone: phoneSchema, jobNo: z.string().trim().toUpperCase().max(20) }), body);
  const job = db.jobs.find((j) => j.jobNo === jobNo && rel.customer(db, j).phone === phone);
  if (!job) throw new ApiError(400, 'no_match', 'เบอร์โทรกับเลขงานซ่อมไม่ตรงกัน ดูเลขงานได้ที่หัวใบรับเครื่อง เช่น R2611-0042', { jobNo: 'ไม่ตรงกับเบอร์นี้' });
  const customer = rel.customer(db, job);
  if (customer.lineUserId && customer.lineUserId !== actor.lineUserId) throw conflict('linked_other', 'เบอร์นี้ผูกกับ LINE บัญชีอื่นแล้ว ติดต่อร้านเพื่อย้ายบัญชี');
  for (const c of db.customers) if (c.lineUserId === actor.lineUserId && c.id !== customer.id) c.lineUserId = null;
  customer.lineUserId = actor.lineUserId;
  audit(db, actor, 'customer.link_line', 'customer', customer.id);
  return { ok: true };
});
route('GET', '/me/jobs', 'me', ({ db, actor }) => {
  if (actor?.type !== 'me') return [];
  const customer = db.customers.find((c) => c.lineUserId === actor.lineUserId);
  if (!customer) return [];
  const today = todayCal();
  return db.jobs
    .filter((j) => j.customerId === customer.id)
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    .slice(0, 100)
    .map((j) => ({
      jobNo: j.jobNo,
      device: deviceLabel(rel.device(db, j)),
      status: j.status,
      statusLabel: customerLabel(j.status, j.result),
      receivedAt: j.receivedAt,
      etaDate: j.etaDate,
      deliveredAt: j.deliveredAt,
      warrantyUntil: j.warrantyUntil,
      warrantyDaysLeft: j.warrantyUntil ? Math.max(0, Math.round((Date.parse(j.warrantyUntil) - Date.parse(today)) / DAY)) : null,
      statusUrl: statusLink(j.publicToken),
      publicToken: j.publicToken,
    }));
});

/* shop: jobs */

route('GET', '/shop/jobs', 'shop', ({ db, query, actor }) => {
  const status = query.get('status');
  const assignee = query.get('assignee');
  const statuses = status ? (status.split(',').filter((s) => STATUSES.includes(s as JobStatus)) as JobStatus[]) : undefined;
  const who = assignee === 'none' ? 'none' : assignee ? intParam(assignee, 'assignee') : undefined;
  return J.list(db, { status: statuses, assignee: who, q: query.get('q')?.slice(0, 80) }, asUser(actor));
});
route('POST', '/shop/jobs', 'staff', async ({ db, body, actor }) => {
  const f = form(body);
  let json: unknown;
  try {
    json = JSON.parse(String(f.get('data') ?? ''));
  } catch {
    throw badRequest('bad_body', 'ข้อมูลที่ส่งมาไม่ถูกต้อง');
  }
  const input = parse(intakeSchema, json);
  const user = asUser(actor);
  // Check the cheap rules before encoding photos, as the server does before writing files.
  if (input.termsVersion !== db.settings.termsVersion) throw conflict('terms_changed', 'เงื่อนไขของร้านเพิ่งถูกแก้ไข ให้ลูกค้าอ่านฉบับใหม่แล้วเซ็นอีกครั้ง');
  const files = f.getAll('photos').slice(0, 8);
  if (!files.length) throw badRequest('photo_required', 'ถ่ายรูปสภาพเครื่องอย่างน้อย 1 รูปก่อนบันทึก');
  const urls: string[] = [];
  for (const file of files) urls.push(await saveImage(file, MAX_PHOTO, 1280));
  return J.intake(db, input, urls, saveSignature(input.signature), user);
});
route('GET', '/shop/jobs/by-sticker/:token', 'shop', ({ db, params, actor }) => {
  if (!isToken(params.token)) throw badRequest('bad_sticker', 'QR นี้ไม่ใช่สติกเกอร์ของร้าน');
  return J.bySticker(db, params.token, asUser(actor));
});
route('GET', '/shop/jobs/:id', 'shop', ({ db, params, actor }) => J.detail(db, intParam(params.id), asUser(actor)));
route('PATCH', '/shop/jobs/:id', 'shop', ({ db, params, body, actor }) => {
  const input = parse(
    z.object({
      etaDate: dateSchema.optional(),
      etaNote: text(200).nullable().optional(),
      waitingReason: text(200).min(3, 'บอกลูกค้าว่ารออะไร').optional(),
      waitingUntil: dateSchema.optional(),
      assignedTo: z.number().int().positive().nullable().optional(),
      preApprovedAmount: money.nullable().optional(),
      callbackDone: z.boolean().optional(),
      passcode: text(64).nullable().optional(),
    }),
    body,
  );
  return J.patch(db, intParam(params.id), input, asUser(actor));
});
route('POST', '/shop/jobs/:id/status', 'shop', ({ db, params, body, actor }) => {
  const input = parse(
    z.object({
      to: z.enum(['received', 'diagnosing', 'awaiting_approval', 'repairing', 'waiting_parts', 'ready', 'delivered', 'cancelled']),
      note: text(500).nullable().optional(),
      visibleToCustomer: z.boolean().default(true),
      result: z.enum(['repaired', 'not_repaired']).nullable().optional(),
      waitingReason: text(200).nullable().optional(),
      waitingUntil: dateSchema.nullable().optional(),
      etaDate: dateSchema.nullable().optional(),
    }),
    body,
  );
  const user = asUser(actor);
  if (input.to === 'cancelled' && !hasRole(user.role, 'staff')) throw forbidden('ช่างยกเลิกงานเองไม่ได้ แจ้งหน้าร้าน');
  return J.changeStatus(db, intParam(params.id), input, user);
});
route('POST', '/shop/jobs/:id/notes', 'shop', ({ db, params, body, actor }) => {
  const input = parse(z.object({ note: text(1000).min(1, 'พิมพ์บันทึก'), visibleToCustomer: z.boolean() }), body);
  return J.addNote(db, intParam(params.id), input, asUser(actor));
});
route('POST', '/shop/jobs/:id/claim', 'shop', ({ db, params, actor }) => J.claim(db, intParam(params.id), asUser(actor)));
route('POST', '/shop/jobs/:id/photos', 'shop', async ({ db, params, body, actor }) => {
  const f = form(body);
  const input = parse(z.object({ kind: z.enum(['intake', 'before', 'after', 'removed_part', 'other']), visibleToCustomer: z.enum(['true', 'false']) }), {
    kind: f.get('kind'),
    visibleToCustomer: f.get('visibleToCustomer'),
  });
  const user = asUser(actor);
  J.load(db, intParam(params.id), user);
  const urls: string[] = [];
  for (const file of f.getAll('photos').slice(0, 8)) urls.push(await saveImage(file, MAX_PHOTO, 1280));
  return J.addPhotos(db, intParam(params.id), urls, input.kind, input.visibleToCustomer === 'true', user);
});
route('PATCH', '/shop/jobs/:id/photos/:photoId', 'shop', ({ db, params, body, actor }) => {
  const { visibleToCustomer } = parse(z.object({ visibleToCustomer: z.boolean() }), body);
  return J.setPhotoVisibility(db, intParam(params.id), intParam(params.photoId, 'photoId'), visibleToCustomer, asUser(actor));
});
route('POST', '/shop/jobs/:id/passcode', 'shop', ({ db, params, actor }) => J.revealPasscode(db, intParam(params.id), asUser(actor)));

route('POST', '/shop/jobs/:id/quotes', 'shop', ({ db, params, actor }) => J.createDraft(db, intParam(params.id), asUser(actor)));
route('PATCH', '/shop/quotes/:id', 'shop', ({ db, params, body, actor }) => {
  const input = parse(z.object({ items: quoteItems, note: text(500).nullable().optional() }), body);
  return J.updateDraft(db, intParam(params.id), input, asUser(actor));
});
route('DELETE', '/shop/quotes/:id', 'shop', ({ db, params, actor }) => J.deleteDraft(db, intParam(params.id), asUser(actor)));
route('POST', '/shop/quotes/:id/send', 'shop', ({ db, params, actor }) => J.sendQuote(db, intParam(params.id), asUser(actor)));
route('POST', '/shop/quotes/:id/respond', 'staff', ({ db, params, body, actor }) => {
  const { decision, jobId } = parse(z.object({ decision: z.enum(['approve', 'reject', 'callback']), jobId: z.number().int().positive() }), body);
  J.respond(db, jobId, intParam(params.id), decision, 'phone', actor);
  return J.detail(db, jobId, asUser(actor));
});

route('GET', '/shop/jobs/:id/update-message', 'shop', ({ db, params, actor }) => J.updateMessage(db, intParam(params.id), asUser(actor)));
route('POST', '/shop/jobs/:id/payments', 'staff', ({ db, params, body, actor }) => {
  const input = parse(z.object({ amount: money.min(1, 'จำนวนเงินต้องมากกว่า 0'), method, note: text(200).nullable().optional() }), body);
  return J.addPayment(db, intParam(params.id), input, asUser(actor));
});
route('POST', '/shop/jobs/:id/deliver', 'staff', ({ db, params, body, actor }) => {
  const input = parse(
    z.object({
      returnedItems: z.array(text(60)).max(20),
      missingNote: text(300).nullable().optional(),
      signature,
      payment: z.object({ amount: money, method }).nullable().optional(),
      warrantyDays: z.number().int().min(0).max(730).nullable().optional(),
    }),
    body,
  );
  return J.deliver(db, intParam(params.id), input, saveSignature(input.signature), asUser(actor));
});

/* shop: printed documents */

const paperOf = (q: URLSearchParams) => (q.get('size') === '80mm' ? '80mm' : 'a5');
route('GET', '/shop/jobs/:id/doc/intake', 'shop', ({ db, params, query, actor }) => intakeDoc(db, J.load(db, intParam(params.id), asUser(actor)), paperOf(query)));
route('GET', '/shop/jobs/:id/doc/sticker', 'shop', ({ db, params, actor }) => stickerDoc(db, J.load(db, intParam(params.id), asUser(actor))));
route('GET', '/shop/jobs/:id/doc/receipt', 'staff', ({ db, params, query, actor }) => receiptDoc(db, J.load(db, intParam(params.id), asUser(actor)), paperOf(query)));

/* shop: customers */

route('GET', '/shop/customers', 'staff', ({ db, query }) => {
  const phone = query.get('phone');
  if (phone !== null) {
    const c = db.customers.find((x) => x.phone === phone.replace(/\D/g, ''));
    if (!c) return { customer: null };
    const devices = db.devices.filter((d) => d.customerId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const jobs = db.jobs
      .filter((j) => j.customerId === c.id)
      .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
      .slice(0, 5);
    return {
      customer: {
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        note: c.note,
        devices: devices.map((d) => ({ id: d.id, category: d.category, brand: d.brand, model: d.model, serialOrImei: d.serialOrImei, color: d.color, label: deviceLabel(d) })),
        recentJobs: jobs.map((j) => ({ id: j.id, jobNo: j.jobNo, device: deviceLabel(rel.device(db, j)), status: j.status, statusLabel: shopLabel(j.status, j.result), receivedAt: j.receivedAt })),
      },
    };
  }
  const term = (query.get('q') ?? '').trim().slice(0, 80);
  if (term.length < 2) return { rows: [] };
  const digits = term.replace(/\D/g, '');
  const low = term.toLowerCase();
  const has = (v: string | null) => Boolean(v && v.toLowerCase().includes(low));
  const rows = db.customers
    .filter((c) => {
      const devices = db.devices.filter((d) => d.customerId === c.id);
      const jobs = db.jobs.filter((j) => j.customerId === c.id);
      return has(c.fullName) || (digits.length >= 3 && c.phone.includes(digits)) || devices.some((d) => has(d.serialOrImei) || has(d.model)) || jobs.some((j) => has(j.jobNo));
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 50);
  return {
    rows: rows.map((c) => {
      const jobs = db.jobs.filter((j) => j.customerId === c.id).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
      return { id: c.id, fullName: c.fullName, phone: formatPhone(c.phone), jobs: jobs.length, lastVisit: jobs[0]?.receivedAt ?? null, lineLinked: Boolean(c.lineUserId) };
    }),
  };
});

function customerDetail(db: Db, id: number) {
  const c = db.customers.find((x) => x.id === id);
  if (!c) throw notFound('ไม่พบลูกค้า');
  const devices = db.devices.filter((d) => d.customerId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const jobs = db.jobs.filter((j) => j.customerId === c.id).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  return {
    id: c.id,
    fullName: c.fullName,
    phone: formatPhone(c.phone),
    note: c.note,
    lineLinked: Boolean(c.lineUserId),
    createdAt: c.createdAt,
    devices: devices.map((d) => ({ id: d.id, label: deviceLabel(d), category: d.category, serialOrImei: d.serialOrImei, jobs: jobs.filter((j) => j.deviceId === d.id).length })),
    jobs: jobs.map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      deviceId: j.deviceId,
      device: deviceLabel(rel.device(db, j)),
      issue: j.reportedIssue,
      status: j.status,
      statusLabel: shopLabel(j.status, j.result),
      receivedAt: j.receivedAt,
      deliveredAt: j.deliveredAt,
      warrantyUntil: j.warrantyUntil,
      charge: moneyOf(j, rel.quotes(db, j.id), rel.payments(db, j.id)).charge,
    })),
  };
}

route('GET', '/shop/customers/:id', 'staff', ({ db, params }) => customerDetail(db, intParam(params.id)));
route('PATCH', '/shop/customers/:id', 'staff', ({ db, params, body, actor }) => {
  const input = parse(z.object({ fullName: z.string().trim().min(2).max(120).optional(), note: z.string().trim().max(500).nullable().optional() }), body);
  const cid = intParam(params.id);
  const c = db.customers.find((x) => x.id === cid);
  if (!c) throw notFound('ไม่พบลูกค้า');
  const before = c.fullName;
  if (input.fullName !== undefined) c.fullName = input.fullName;
  if (input.note !== undefined) c.note = input.note || null;
  audit(db, actor, 'customer.update', 'customer', cid, {
    fullName: input.fullName !== undefined ? { from: before, to: input.fullName } : undefined,
    note: input.note !== undefined ? 'changed' : undefined,
  });
  return customerDetail(db, cid);
});

/* shop: reports */

const METHOD: Record<string, string> = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', transfer: 'โอนเงิน', card: 'บัตร' };

/** A Bangkok calendar range [from, to] as instants: from 00:00 on the first day to 00:00 after the last. */
function range(from: string | null, to: string | null) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const end = to && re.test(to) ? to : todayCal();
  const start = from && re.test(from) ? from : todayCal(-29);
  if (start > end) throw badRequest('bad_range', 'วันเริ่มต้องไม่หลังวันสิ้นสุด');
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
  if (days > 366) throw badRequest('bad_range', 'เลือกช่วงได้ไม่เกิน 1 ปี');
  const gte = new Date(`${start}T00:00:00+07:00`).toISOString();
  const lt = new Date(new Date(`${end}T00:00:00+07:00`).getTime() + DAY).toISOString();
  return { start, end, days, gte, lt };
}

const bangkokDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));

route('GET', '/shop/reports/summary', 'admin', ({ db, query }) => {
  const r = range(query.get('from'), query.get('to'));
  const inRange = (iso: string | null) => Boolean(iso && iso >= r.gte && iso < r.lt);
  const payments = db.payments.filter((p) => inRange(p.paidAt));
  const byDay = new Map<string, { total: number; payments: number }>();
  for (const p of payments) {
    const k = bangkokDay(p.paidAt);
    const v = byDay.get(k) ?? { total: 0, payments: 0 };
    v.total += p.amount;
    v.payments += 1;
    byDay.set(k, v);
  }
  const days = Array.from({ length: r.days }, (_, i) => {
    const d = new Date(`${r.start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const k = d.toISOString().slice(0, 10);
    return { date: k, total: byDay.get(k)?.total ?? 0, payments: byDay.get(k)?.payments ?? 0 };
  });
  const methods = new Map<string, number>();
  for (const p of payments) methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount);
  const open = db.jobs.filter((j) => OPEN_STATUSES.includes(j.status));
  const completed = db.jobs.filter((j) => inRange(j.completedAt));
  const today = todayCal();
  const turnaround = completed.map((j) => (Date.parse(j.completedAt!) - Date.parse(j.receivedAt)) / DAY);
  const users = db.users.filter((u) => u.active || db.jobs.some((j) => j.assignedTo === u.id));
  const perTech = [...users, { id: 0, name: 'ยังไม่มีช่างรับ' }]
    .map((u) => ({
      id: u.id || null,
      name: u.name,
      completed: completed.filter((j) => (j.assignedTo ?? 0) === u.id && j.result === 'repaired').length,
      notRepaired: completed.filter((j) => (j.assignedTo ?? 0) === u.id && j.result === 'not_repaired').length,
      open: open.filter((j) => (j.assignedTo ?? 0) === u.id && j.status !== 'ready').length,
    }))
    .filter((t) => t.completed || t.notRepaired || t.open);
  return {
    from: r.start,
    to: r.end,
    revenue: days.reduce((s, d) => s + d.total, 0),
    days,
    methods: [...methods].map(([m, total]) => ({ method: m, label: METHOD[m], total })).sort((a, b) => b.total - a.total),
    received: db.jobs.filter((j) => inRange(j.receivedAt)).length,
    delivered: db.jobs.filter((j) => inRange(j.deliveredAt)).length,
    completed: completed.length,
    avgTurnaroundDays: turnaround.length ? Math.round((turnaround.reduce((a, b) => a + b, 0) / turnaround.length) * 10) / 10 : null,
    openByStatus: STATUSES.filter((s) => OPEN_STATUSES.includes(s)).map((s) => ({ status: s, label: shopLabel(s), count: open.filter((j) => j.status === s).length })),
    openTotal: open.length,
    overdue: open.filter((j) => j.status !== 'ready' && j.etaDate < today).length,
    perTech,
  };
});
route('GET', '/shop/reports/unclaimed', 'admin', ({ db, query }) => {
  const days = query.get('days');
  return J.unclaimed(db, days && /^\d{1,3}$/.test(days) ? Number(days) : undefined);
});

/** The rows of the Excel export; the workbook itself is built in xlsx.ts. */
route('GET', '/shop/reports/export', 'admin', ({ db, query }) => {
  const r = range(query.get('from'), query.get('to'));
  const inRange = (iso: string | null) => Boolean(iso && iso >= r.gte && iso < r.lt);
  const jobs = db.jobs.filter((j) => inRange(j.receivedAt)).sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));
  return {
    name: `งานซ่อม-${r.start}-ถึง-${r.end}.xlsx`,
    jobs: jobs.map((j) => {
      const c = rel.customer(db, j);
      const d = rel.device(db, j);
      const m = moneyOf(j, rel.quotes(db, j.id), rel.payments(db, j.id));
      return {
        jobNo: j.jobNo,
        received: thai.dateTime(j.receivedAt),
        customer: c.fullName,
        phone: formatPhone(c.phone),
        device: deviceLabel(d),
        serial: d.serialOrImei ?? '',
        issue: j.reportedIssue,
        status: shopLabel(j.status, j.result),
        tech: rel.userName(db, j.assignedTo) ?? '',
        eta: j.etaDate,
        completed: j.completedAt ? thai.dateTime(j.completedAt) : '',
        delivered: j.deliveredAt ? thai.dateTime(j.deliveredAt) : '',
        charge: m.charge ?? '',
        paid: m.paid,
        due: m.due ?? '',
        warranty: j.warrantyUntil ?? '',
      };
    }),
    payments: db.payments
      .filter((p) => inRange(p.paidAt))
      .sort((a, b) => (a.paidAt < b.paidAt ? -1 : 1))
      .map((p) => ({ at: thai.dateTime(p.paidAt), jobNo: db.jobs.find((j) => j.id === p.jobId)!.jobNo, method: METHOD[p.method], amount: p.amount })),
  };
});

/* shop: team, settings, users, audit */

route('GET', '/shop/team', 'shop', ({ db }) =>
  db.users
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th')),
);
route('GET', '/shop/intake-config', 'staff', ({ db }) => {
  const s = db.settings;
  return { termsText: s.termsText, termsVersion: s.termsVersion, inspectionFee: s.inspectionFee, defaultEtaDays: s.defaultEtaDays };
});
route('GET', '/shop/handover-config', 'staff', ({ db }) => ({ promptpayImageUrl: db.settings.promptpayImageUrl }));

const presetOrder = (a: { category: string | null; sort: number; name: string }, b: typeof a) =>
  (a.category ?? '').localeCompare(b.category ?? '') || a.sort - b.sort || a.name.localeCompare(b.name, 'th');
route('GET', '/shop/labor-presets', 'shop', ({ db, query }) => db.presets.filter((p) => query.get('all') || p.active).sort(presetOrder));
route('POST', '/shop/labor-presets', 'admin', ({ db, body, actor }) => {
  const input = parse(
    z.object({ category: z.enum(['phone', 'computer', 'appliance']).nullable(), name: z.string().trim().min(2, 'ตั้งชื่อรายการ').max(120), price: z.number().int().min(0).max(1_000_000) }),
    body,
  );
  const row = { id: nextId(db, 'presets'), ...input, active: true, sort: 0 };
  db.presets.push(row);
  audit(db, actor, 'labor_preset.create', 'labor_preset', row.id, input);
  return row;
});
route('PATCH', '/shop/labor-presets/:id', 'admin', ({ db, params, body, actor }) => {
  const input = parse(
    z.object({
      category: z.enum(['phone', 'computer', 'appliance']).nullable().optional(),
      name: z.string().trim().min(2).max(120).optional(),
      price: z.number().int().min(0).max(1_000_000).optional(),
      active: z.boolean().optional(),
    }),
    body,
  );
  const row = db.presets.find((p) => p.id === intParam(params.id));
  if (!row) throw notFound('ไม่พบรายการนี้');
  const before = { name: row.name, price: row.price, active: row.active };
  for (const [k, v] of Object.entries(input)) if (v !== undefined) Object.assign(row, { [k]: v });
  audit(db, actor, 'labor_preset.update', 'labor_preset', row.id, { before, after: input });
  return row;
});

const userRow = (u: Db['users'][number]) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });
function assertCanGrant(actor: Actor | undefined, role: string) {
  if (actor?.type !== 'user') throw forbidden();
  if (role === 'owner' && actor.role !== 'owner') throw forbidden('เฉพาะเจ้าของร้านที่กำหนดสิทธิ์เจ้าของได้');
}

route('GET', '/shop/users', 'admin', ({ db }) => db.users.map(userRow));
route('POST', '/shop/users', 'admin', async ({ db, body, actor }) => {
  const input = parse(z.object({ email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'), name: z.string().trim().min(1, 'กรอกชื่อ').max(120), role: ROLE, password: PASSWORD }), body);
  assertCanGrant(actor, input.role);
  if (db.users.some((u) => u.email === input.email)) throw conflict('email_taken', 'อีเมลนี้มีผู้ใช้แล้ว', { email: 'อีเมลนี้มีผู้ใช้แล้ว' });
  const user = { id: nextId(db, 'users'), email: input.email, name: input.name, role: input.role, passwordHash: await sha256(input.password), active: true, lastLoginAt: null, createdAt: now() };
  db.users.push(user);
  audit(db, actor, 'user.create', 'user', user.id, { email: user.email, role: user.role });
  return userRow(user);
});
route('PATCH', '/shop/users/:uid', 'admin', async ({ db, params, body, actor }) => {
  const id = intParam(params.uid);
  const input = parse(z.object({ name: z.string().trim().min(1).max(120).optional(), role: ROLE.optional(), active: z.boolean().optional(), password: PASSWORD.optional() }), body);
  const me = asUser(actor);
  const target = db.users.find((u) => u.id === id);
  if (!target) throw notFound('ไม่พบผู้ใช้');
  if (target.role === 'owner' || input.role === 'owner') assertCanGrant(actor, 'owner');
  if (input.role) assertCanGrant(actor, input.role);
  if (me.id === id && (input.active === false || (input.role && input.role !== target.role))) throw badRequest('self', 'เปลี่ยนสิทธิ์หรือปิดบัญชีของตัวเองไม่ได้');
  if (target.role === 'owner' && (input.active === false || (input.role && input.role !== 'owner'))) {
    if (db.users.filter((u) => u.role === 'owner' && u.active).length <= 1) throw badRequest('last_owner', 'ต้องมีเจ้าของร้านอย่างน้อย 1 คน');
  }
  if (input.name !== undefined) target.name = input.name;
  if (input.role !== undefined) target.role = input.role;
  if (input.active !== undefined) target.active = input.active;
  if (input.password) target.passwordHash = await sha256(input.password);
  // A closed account's open jobs go back to the queue, so nothing waits on someone who has left.
  if (input.active === false) for (const j of db.jobs) if (j.assignedTo === id && j.status !== 'delivered' && j.status !== 'cancelled') j.assignedTo = null;
  audit(db, actor, 'user.update', 'user', id, { email: target.email, role: input.role, active: input.active, password: input.password ? 'changed' : undefined });
  return userRow(target);
});

route('GET', '/shop/settings', 'owner', ({ db }) => db.settings);
route('PATCH', '/shop/settings', 'owner', ({ db, body, actor }) => {
  const input = parse(
    z.object({
      shopName: z.string().trim().min(2, 'ชื่อร้านอย่างน้อย 2 ตัวอักษร').max(120).optional(),
      logoUrl: opt(300_000),
      phone: opt(40),
      address: opt(300),
      lineOaUrl: opt(300),
      promptpayImageUrl: opt(300_000),
      termsText: z.string().trim().min(10, 'เงื่อนไขสั้นเกินไป').max(5000).optional(),
      defaultWarrantyDays: z.number().int().min(0).max(730).optional(),
      pickupReminderDays: z.number().int().min(1).max(365).optional(),
      inspectionFee: z.number().int().min(0).max(100_000).optional(),
      defaultEtaDays: z.number().int().min(0).max(90).optional(),
      lineLiffId: opt(100),
      lineChannelId: opt(100),
    }),
    body,
  );
  const before = db.settings;
  const data: Record<string, unknown> = { ...input };
  // Customers sign a specific wording. Editing it starts a new version; old slips keep the text they signed.
  if (input.termsText !== undefined && input.termsText !== before.termsText) {
    const n = Number(/^v(\d+)$/.exec(before.termsVersion)?.[1] ?? 1);
    data.termsVersion = `v${n + 1}`;
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  db.settings = { ...before, ...data };
  audit(db, actor, 'settings.update', 'settings', 1, { fields: Object.keys(data), termsVersion: data.termsVersion });
  return db.settings;
});
route('POST', '/shop/settings/upload', 'owner', async ({ body }) => ({ url: await saveImage(form(body).get('file'), MAX_BRAND, 720) }));
const AUDIT_PAGE = 25;

/** The filter chips on the audit page, as the actions each one covers. */
const AUDIT_KINDS: Record<string, string[]> = {
  job: ['job.intake', 'job.status', 'job.update', 'job.claim', 'job.deliver', 'photo.add', 'photo.visibility'],
  quote: ['quote.draft', 'quote.send', 'quote.approve', 'quote.reject', 'quote.callback'],
  money: ['payment.add'],
  passcode: ['passcode.view'],
  shop: ['auth.login', 'user.create', 'user.update', 'user.password', 'settings.update', 'labor_preset.create', 'labor_preset.update', 'customer.update', 'customer.link_line'],
};

/** One page of the log, newest first, with the job number or name each row is about. */
route('GET', '/shop/audit-logs', 'owner', ({ db, query }) => {
  const kind = query.get('kind');
  const actor = query.get('actor');
  const rows = db.audit
    .filter((a) => (kind && AUDIT_KINDS[kind] ? AUDIT_KINDS[kind].includes(a.action) : true))
    .filter((a) => (actor === 'customer' ? a.actorUserId === null : actor && /^\d+$/.test(actor) ? a.actorUserId === Number(actor) : true))
    .sort((a, b) => b.id - a.id);
  const pages = Math.max(1, Math.ceil(rows.length / AUDIT_PAGE));
  const asked = query.get('page');
  const page = Math.min(pages, asked && /^\d{1,6}$/.test(asked) ? Math.max(1, Number(asked)) : 1);
  const job = (id: number | undefined) => {
    const j = db.jobs.find((x) => x.id === id);
    return j ? { type: 'job' as const, id: j.id, label: j.jobNo } : null;
  };
  const subject = (a: (typeof rows)[number]) => {
    const id = a.entityId ?? undefined;
    if (a.entity === 'repair_job') return job(id);
    if (a.entity === 'quote') return job(db.quotes.find((q) => q.id === id)?.jobId);
    if (a.entity === 'customer') {
      const c = db.customers.find((x) => x.id === id);
      return c ? { type: 'customer' as const, id: c.id, label: c.fullName } : null;
    }
    if (a.entity === 'user') return { type: 'user' as const, id: id ?? null, label: rel.userName(db, id ?? null) ?? '' };
    if (a.entity === 'labor_preset') return { type: 'preset' as const, id: id ?? null, label: db.presets.find((x) => x.id === id)?.name ?? '' };
    if (a.entity === 'settings') return { type: 'settings' as const, id: null, label: 'ตั้งค่าร้าน' };
    return null;
  };
  return {
    page,
    pageSize: AUDIT_PAGE,
    total: rows.length,
    rows: rows
      .slice((page - 1) * AUDIT_PAGE, page * AUDIT_PAGE)
      .map((a) => ({ id: a.id, createdAt: a.createdAt, actorUserId: a.actorUserId, actorLabel: a.actorLabel, action: a.action, diff: a.diff, subject: subject(a) })),
  };
});

/* ---------------- dispatch ---------------- */

let queue: Promise<unknown> = Promise.resolve();

/** Requests run one at a time, so two clicks never interleave half-way, like the server's row locks. */
export function handle<T>(method: string, url: string, body?: unknown): Promise<T> {
  const run = queue.then(() => dispatch(method, url, body));
  queue = run.catch(() => undefined);
  return run as Promise<T>;
}

async function dispatch(method: string, url: string, body: unknown) {
  const d = await getDb();
  const [path, search = ''] = url.split('?');
  const r = routes.find((x) => x.method === method && x.re.test(path));
  if (!r) throw notFound('ไม่พบ');
  const m = r.re.exec(path)!;
  const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  const actor = resolveActor(d, r.access);
  const write = method !== 'GET' || path === '/auth/login';
  const snapshot = write ? structuredClone(d) : null;
  try {
    const result = await r.handler({ db: d, params, query: new URLSearchParams(search), body, actor });
    if (write) await persist();
    return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
  } catch (e) {
    if (snapshot) db = snapshot;
    throw e;
  }
}

export type { PrintDoc };
export { DEMO_PASSWORD };

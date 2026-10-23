import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import type { JobStatus, PayMethod, PhotoKind, Role } from '../../api/types';
import { Person } from '../../components/Person';
import { Empty, QueryState, Segmented } from '../../components/ui';
import { fmt, METHOD_LABEL, PHOTO_LABEL, ROLE_LABEL, STATUS_LABEL } from '../../lib/format';
import { RequireRole } from './ShopLayout';

type Diff = Record<string, unknown>;

interface Log {
  id: number;
  createdAt: string;
  actorUserId: number | null;
  actorLabel: string;
  action: string;
  diff: Diff | null;
  subject: { type: 'job' | 'customer' | 'user' | 'preset' | 'settings'; id: number | null; label: string } | null;
}

interface LogPage {
  page: number;
  pageSize: number;
  total: number;
  rows: Log[];
}

/** What each logged action means to an owner reading it later. */
const ACTION: Record<string, string> = {
  'auth.login': 'เข้าสู่ระบบ',
  'job.intake': 'รับเครื่อง',
  'job.status': 'เปลี่ยนสถานะงาน',
  'job.update': 'แก้ข้อมูลงาน',
  'job.claim': 'ช่างรับงาน',
  'job.deliver': 'ส่งมอบเครื่อง',
  'photo.add': 'เพิ่มรูป',
  'photo.visibility': 'เปลี่ยนการแสดงรูป',
  'passcode.view': 'ดูรหัสปลดล็อก',
  'payment.add': 'รับเงิน',
  'quote.draft': 'เริ่มใบเสนอราคา',
  'quote.send': 'ส่งราคาให้ลูกค้า',
  'quote.approve': 'อนุมัติราคา',
  'quote.reject': 'ไม่ซ่อม',
  'quote.callback': 'ขอให้โทรกลับ',
  'customer.update': 'แก้ข้อมูลลูกค้า',
  'customer.link_line': 'ผูก LINE',
  'labor_preset.create': 'เพิ่มค่าแรงมาตรฐาน',
  'labor_preset.update': 'แก้ค่าแรงมาตรฐาน',
  'user.create': 'เพิ่มพนักงาน',
  'user.update': 'แก้บัญชีพนักงาน',
  'user.password': 'เปลี่ยนรหัสผ่าน',
  'settings.update': 'แก้ตั้งค่าร้าน',
};

const KINDS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'job', label: 'งานซ่อม' },
  { value: 'quote', label: 'ราคา' },
  { value: 'money', label: 'รับเงิน' },
  { value: 'passcode', label: 'รหัสปลดล็อก' },
  { value: 'shop', label: 'ร้านและบัญชี' },
];

const VIA: Record<string, string> = { link: 'ลูกค้ากดในลิงก์', liff: 'ลูกค้ากดใน LINE', phone: 'ลูกค้าแจ้งทางโทรศัพท์' };

const FIELD: Record<string, string> = {
  shopName: 'ชื่อร้าน',
  logoUrl: 'โลโก้',
  phone: 'เบอร์โทร',
  address: 'ที่อยู่',
  lineOaUrl: 'LINE OA',
  promptpayImageUrl: 'QR พร้อมเพย์',
  termsText: 'เงื่อนไขการรับซ่อม',
  defaultWarrantyDays: 'วันรับประกัน',
  pickupReminderDays: 'วันเตือนรับเครื่อง',
  inspectionFee: 'ค่าตรวจเช็ค',
  defaultEtaDays: 'วันเสร็จโดยประมาณ',
  lineLiffId: 'LIFF ID',
  lineChannelId: 'LINE Channel ID',
};

const num = (v: unknown) => (typeof v === 'number' ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Diff) : null);
const baht = (v: unknown) => (num(v) === null ? '' : `${fmt.baht(num(v)!)} บาท`);
const ymd = (v: unknown) => (str(v) && /^\d{4}-\d{2}-\d{2}/.test(str(v)!) ? fmt.calDML(str(v)!.slice(0, 10)) : '');

/** The row's detail in plain Thai, from what the server recorded. */
function describe(action: string, d: Diff | null): string {
  if (!d) return '';
  const parts: string[] = [];
  switch (action) {
    case 'job.intake':
      if (num(d.photos)) parts.push(`รูปสภาพเครื่อง ${d.photos} รูป`);
      break;
    case 'job.status': {
      const from = STATUS_LABEL[d.from as JobStatus];
      const to = d.result === 'not_repaired' ? 'ไม่ซ่อม รอรับคืน' : STATUS_LABEL[d.to as JobStatus];
      if (from && to) parts.push(`จาก${from} เป็น${to}`);
      if (str(d.note)) parts.push(`หมายเหตุ ${d.note}`);
      break;
    }
    case 'job.update': {
      const eta = obj(d.etaDate);
      if (eta) parts.push(`เลื่อนวันเสร็จจาก ${ymd(eta.from)} เป็น ${ymd(eta.to)}`);
      const waiting = obj(d.waiting);
      if (waiting) parts.push(`รออะไหล่ ${str(waiting.reason) ?? ''}${waiting.until ? ` ถึง ${ymd(waiting.until)}` : ''}`.trim());
      if (d.assignedTo) parts.push('เปลี่ยนช่างที่รับผิดชอบ');
      const pre = obj(d.preApprovedAmount);
      if (pre) parts.push(pre.to === null ? 'ยกเลิกวงเงินซ่อมได้เลย' : `วงเงินซ่อมได้เลย ${baht(pre.to)}`);
      if (d.callbackDone) parts.push('โทรหาลูกค้าแล้ว');
      if (d.passcode) parts.push(d.passcode === 'cleared' ? 'ลบรหัสปลดล็อก' : 'แก้รหัสปลดล็อก');
      break;
    }
    case 'job.deliver': {
      parts.push(num(d.warrantyDays) ? `รับประกัน ${d.warrantyDays} วัน` : 'ไม่มีรับประกัน');
      const missing = Array.isArray(d.missing) ? (d.missing as string[]) : [];
      if (missing.length) parts.push(`ไม่ได้คืน ${missing.join(', ')}`);
      break;
    }
    case 'photo.add':
      parts.push(`${PHOTO_LABEL[d.kind as PhotoKind] ?? ''} ${d.count} รูป ${d.visible ? 'ลูกค้าเห็น' : 'เฉพาะร้าน'}`.trim());
      break;
    case 'photo.visibility':
      parts.push(d.visible ? 'เปิดให้ลูกค้าเห็น' : 'ซ่อนจากลูกค้า');
      break;
    case 'payment.add':
      parts.push(`${baht(d.amount)} ${METHOD_LABEL[d.method as PayMethod] ?? ''}`.trim());
      break;
    case 'quote.draft':
      parts.push(`ฉบับที่ ${d.version}`);
      break;
    case 'quote.send':
      parts.push(`ฉบับที่ ${d.version} ราคา ${baht(d.total)}`);
      if (d.preapproved) parts.push('อยู่ในวงเงิน อนุมัติทันที');
      break;
    case 'quote.approve':
    case 'quote.reject':
    case 'quote.callback':
      parts.push(`ราคา ${baht(d.total)}`);
      if (VIA[str(d.via) ?? '']) parts.push(VIA[str(d.via)!]);
      break;
    case 'customer.update': {
      const name = obj(d.fullName);
      if (name) parts.push(`แก้ชื่อจาก ${name.from} เป็น ${name.to}`);
      if (d.note) parts.push('แก้หมายเหตุ');
      break;
    }
    case 'labor_preset.create':
      parts.push(`${d.name} ${baht(d.price)}`);
      break;
    case 'labor_preset.update': {
      const before = obj(d.before);
      const after = obj(d.after);
      if (after && num(after.price) !== null && before?.price !== after.price) parts.push(`ราคาจาก ${baht(before?.price)} เป็น ${baht(after.price)}`);
      if (after && str(after.name) && before?.name !== after.name) parts.push(`ชื่อเป็น ${after.name}`);
      if (after?.active === false) parts.push('ปิดใช้');
      if (after?.active === true && before?.active === false) parts.push('เปิดใช้');
      break;
    }
    case 'user.create':
      parts.push(`${d.email} สิทธิ์${ROLE_LABEL[d.role as Role] ?? ''}`);
      break;
    case 'user.update':
      if (d.role) parts.push(`สิทธิ์เป็น${ROLE_LABEL[d.role as Role] ?? ''}`);
      if (d.active === false) parts.push('ปิดบัญชี');
      if (d.active === true) parts.push('เปิดบัญชี');
      if (d.password) parts.push('ตั้งรหัสผ่านใหม่');
      break;
    case 'settings.update': {
      const fields = Array.isArray(d.fields) ? (d.fields as string[]).filter((f) => f !== 'termsVersion').map((f) => FIELD[f] ?? f) : [];
      if (fields.length) parts.push(fields.join(', '));
      if (str(d.termsVersion)) parts.push(`เงื่อนไขเป็นฉบับ ${d.termsVersion}`);
      break;
    }
  }
  return parts.filter(Boolean).join(' ');
}

const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));
const weekday = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long' });

/** Page numbers to show: the first, the last, and two either side of the current one. */
function pageList(page: number, pages: number): (number | 'gap')[] {
  const keep = [...new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  keep.forEach((p, i) => {
    if (i && p - keep[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/** Append-only: nobody can edit or delete these rows, not even from the database console. */
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const kind = params.get('kind') ?? '';
  const actor = params.get('actor') ?? '';
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ id: number; name: string }[]>('/shop/users') });
  const q = useQuery({
    queryKey: ['audit', page, kind, actor],
    queryFn: () => api.get<LogPage>(`/shop/audit-logs?${new URLSearchParams({ page: String(page), ...(kind ? { kind } : {}), ...(actor ? { actor } : {}) })}`),
    placeholderData: keepPreviousData,
  });

  function set(next: { page?: number; kind?: string; actor?: string }) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === '' || v === 1) p.delete(k);
      else p.set(k, String(v));
    }
    if (next.page === undefined) p.delete('page');
    setParams(p);
    if (next.page !== undefined) window.scrollTo(0, 0);
  }

  const data = q.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const first = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const days: { key: string; at: string; rows: Log[] }[] = [];
  for (const r of data?.rows ?? []) {
    const k = dayKey(r.createdAt);
    if (days[days.length - 1]?.key !== k) days.push({ key: k, at: r.createdAt, rows: [] });
    days[days.length - 1].rows.push(r);
  }

  return (
    <RequireRole role="owner">
      <div className="page page--wide">
        <header className="titlerow">
          <div>
            <h1 className="title">ประวัติการแก้ไข</h1>
            <p className="subline">ทุกการแก้ราคา เปลี่ยนสถานะ รับเงิน และดูรหัสปลดล็อก บันทึกไว้แก้หรือลบไม่ได้</p>
          </div>
        </header>

        <div className="toolbar">
          <Segmented label="ประเภท" value={kind} options={KINDS} onChange={(v) => set({ kind: v })} />
          <div className="toolbar__end">
            <label className="visually-hidden" htmlFor="audit-actor">
              ใครทำ
            </label>
            <select id="audit-actor" className="input input--select toolbar__select" value={actor} onChange={(e) => set({ actor: e.target.value })}>
              <option value="">ทุกคน</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              <option value="customer">ลูกค้าและระบบ</option>
            </select>
          </div>
        </div>

        <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
          {data && !data.total ? (
            <Empty title="ยังไม่มีรายการ">{kind || actor ? 'ลองเลือกประเภทหรือคนอื่น' : 'ทุกการเปลี่ยนแปลงในร้านจะขึ้นที่นี่'}</Empty>
          ) : (
            <section className="panel audit" aria-busy={q.isFetching || undefined} aria-label="รายการ">
              <div className="audit__row audit__row--head" aria-hidden="true">
                <span>เวลา</span>
                <span>ใคร</span>
                <span>ทำอะไร</span>
                <span>เกี่ยวกับ</span>
                <span>รายละเอียด</span>
              </div>
              {days.map((d) => (
                <div key={d.key}>
                  <h2 className="audit__date">
                    {weekday.format(new Date(d.at))} {fmt.date(d.at)}
                  </h2>
                  <ul>
                    {d.rows.map((r) => (
                      <li key={r.id} className="audit__row">
                        <span className="audit__time t-num">{fmt.time(r.createdAt)}</span>
                        <span className="audit__who">
                          <Person id={r.actorUserId} name={r.actorLabel} withName />
                        </span>
                        <span className="audit__what">{ACTION[r.action] ?? r.action}</span>
                        <span className="audit__subject">
                          {r.subject?.type === 'job' && r.subject.id ? (
                            <Link to={`/shop/jobs/${r.subject.id}`} className="t-num">
                              {r.subject.label}
                            </Link>
                          ) : r.subject?.type === 'customer' && r.subject.id ? (
                            <Link to={`/shop/customers/${r.subject.id}`}>{r.subject.label}</Link>
                          ) : (
                            r.subject?.label
                          )}
                        </span>
                        <span className="audit__detail">{describe(r.action, r.diff)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          {data && data.total > 0 && (
            <nav className="pager" aria-label="เลือกหน้า">
              <p className="t-muted t-num">
                {fmt.num(first)} ถึง {fmt.num(last)} จาก {fmt.num(data.total)} รายการ
              </p>
              <div className="pager__pages">
                <button type="button" className="pager__btn" disabled={data.page <= 1} onClick={() => set({ page: data.page - 1 })} aria-label="หน้าก่อน">
                  <ChevronLeft aria-hidden="true" />
                </button>
                {pageList(data.page, pages).map((p, i) =>
                  p === 'gap' ? (
                    <span key={`gap${i}`} className="pager__gap" aria-hidden="true">
                      ...
                    </span>
                  ) : (
                    <button key={p} type="button" className="pager__btn t-num" aria-current={p === data.page ? 'page' : undefined} aria-label={`หน้า ${p}`} onClick={() => set({ page: p })}>
                      {p}
                    </button>
                  ),
                )}
                <button type="button" className="pager__btn" disabled={data.page >= pages} onClick={() => set({ page: data.page + 1 })} aria-label="หน้าถัดไป">
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </nav>
          )}
        </QueryState>
      </div>
    </RequireRole>
  );
}

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Plus } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../api/client';
import type { Category, LaborPreset, Role, Settings as S } from '../../api/types';
import { ShopMark } from '../../components/ShopMark';
import { useToast } from '../../components/Toast';
import { Button, Checkbox, Dialog, Notice, Pill, QueryState, Select, TextArea, TextField } from '../../components/ui';
import { CATEGORY_LABEL, fmt, ROLE_LABEL } from '../../lib/format';
import { atLeast, RequireRole, useUser } from './ShopLayout';

export function Settings() {
  const me = useUser();
  return (
    <RequireRole role="admin">
      <div className="page">
        <header className="titlerow">
          <div>
            <h1 className="title">ตั้งค่าร้าน</h1>
          </div>
        </header>
        <nav className="tabs" aria-label="หมวดการตั้งค่า">
          {me.role === 'owner' && (
            <NavLink to="/shop/settings/shop" className="tab">
              ข้อมูลร้าน
            </NavLink>
          )}
          {me.role === 'owner' && (
            <NavLink to="/shop/settings/terms" className="tab">
              เงื่อนไขและค่าเริ่มต้น
            </NavLink>
          )}
          <NavLink to="/shop/settings/pricing" className="tab">
            ค่าแรงมาตรฐาน
          </NavLink>
          <NavLink to="/shop/settings/users" className="tab">
            พนักงาน
          </NavLink>
          {me.role === 'owner' && (
            <NavLink to="/shop/settings/line" className="tab">
              LINE
            </NavLink>
          )}
        </nav>
        <Routes>
          <Route index element={<Navigate to={me.role === 'owner' ? 'shop' : 'pricing'} replace />} />
          <Route
            path="shop"
            element={
              <OwnerOnly>
                <ShopInfo />
              </OwnerOnly>
            }
          />
          <Route
            path="terms"
            element={
              <OwnerOnly>
                <Terms />
              </OwnerOnly>
            }
          />
          <Route path="pricing" element={<Pricing />} />
          <Route path="users" element={<Users />} />
          <Route
            path="line"
            element={
              <OwnerOnly>
                <Line />
              </OwnerOnly>
            }
          />
        </Routes>
      </div>
    </RequireRole>
  );
}

const OwnerOnly = ({ children }: { children: ReactNode }) => <RequireRole role="owner">{children}</RequireRole>;

function Row({ title, help, children }: { title: string; help: ReactNode; children: ReactNode }) {
  return (
    <section className="srow">
      <div className="srow__label">
        <h2 className="srow__title">{title}</h2>
        <div className="srow__help">{help}</div>
      </div>
      <div className="srow__panel">{children}</div>
    </section>
  );
}

/** Settings read once and saved per panel; the server keeps the cache for every other screen. */
function useSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<S>('/shop/settings') });
  const save = useMutation({
    mutationFn: (patch: Partial<S>) => api.patch<S>('/shop/settings', patch),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      void qc.invalidateQueries({ queryKey: ['config'] });
      void qc.invalidateQueries({ queryKey: ['intake-config'] });
      toast('บันทึกแล้ว');
    },
  });
  return { q, save };
}

function Upload({
  label,
  url,
  onUploaded,
  hint,
  empty = 'ยังไม่มีรูป',
  removeLabel = 'เอารูปออก',
}: {
  label: string;
  url: string | null;
  onUploaded: (url: string | null) => void;
  hint: string;
  empty?: string;
  removeLabel?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const f = new FormData();
      f.append('file', file);
      const r = await api.post<{ url: string }>('/shop/settings/upload', f);
      onUploaded(r.url);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="upload">
        {url ? <img src={url} alt="" className="upload__img" /> : <span className="upload__empty">{empty}</span>}
        <div className="stack" style={{ ['--stack' as string]: '6px' }}>
          <label className="btn btn--sm">
            <ImageUp aria-hidden="true" />
            {busy ? 'กำลังอัปโหลด' : url ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
            <input type="file" accept="image/png,image/jpeg" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {url && (
            <Button size="sm" variant="ghost" onClick={() => onUploaded(null)}>
              {removeLabel}
            </Button>
          )}
        </div>
      </div>
      <p className="field__hint">{hint}</p>
    </div>
  );
}

function ShopInfo() {
  const { q, save } = useSettings();
  const [f, setF] = useState<Partial<S>>({});
  // Fill the form once; after that, saving a picture must not wipe text the owner is still typing.
  useEffect(() => {
    if (q.data) setF((x) => (Object.keys(x).length ? x : q.data!));
  }, [q.data]);
  const errs = fieldErrors(save.error);
  const set = (k: keyof S) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  /** Pictures save as soon as they are uploaded or removed, so there is nothing left to forget. */
  const savePicture = (k: 'logoUrl' | 'promptpayImageUrl') => (url: string | null) => {
    setF((x) => ({ ...x, [k]: url }));
    save.mutate({ [k]: url });
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ shopName: f.shopName, phone: f.phone, address: f.address, lineOaUrl: f.lineOaUrl });
  }
  return (
    <QueryState loading={q.isLoading} error={q.error}>
      <form onSubmit={submit}>
        <Row title="โลโก้ร้าน" help="ไม่ใส่ก็ได้ ร้านที่ไม่มีโลโก้ ระบบแสดงชื่อร้านอย่างเดียว ทั้งบนเมนู หน้าที่ลูกค้าเปิดจาก QR ใบรับเครื่อง และใบเสร็จ">
          <div className="stack">
            <div className="logo-preview">
              <span className="logo-preview__label">ตัวอย่างที่ลูกค้าเห็น</span>
              <ShopMark size="lg" name={f.shopName ?? ''} logoUrl={f.logoUrl ?? null} />
            </div>
            <Upload
              label="ไฟล์โลโก้"
              url={f.logoUrl ?? null}
              onUploaded={savePicture('logoUrl')}
              hint="PNG หรือ JPG ไม่เกิน 3 MB รูปสี่เหลี่ยมจัตุรัสพื้นขาวหรือพื้นใสจะดูดีที่สุด บันทึกทันทีที่อัปโหลด"
              empty="ไม่มีโลโก้"
              removeLabel="ไม่ใช้โลโก้"
            />
          </div>
        </Row>
        <Row title="ข้อมูลร้าน" help="ชื่อ เบอร์โทร และที่อยู่ พิมพ์บนใบรับเครื่อง ใบเสร็จ และแสดงบนหน้าสถานะที่ลูกค้าเปิดจาก QR">
          <div className="stack">
            <TextField label="ชื่อร้าน" value={f.shopName ?? ''} onChange={set('shopName')} error={errs.shopName} required />
            <div className="grid2">
              <TextField label="เบอร์โทรร้าน" inputMode="tel" value={f.phone ?? ''} onChange={set('phone')} />
              <TextField label="ลิงก์ LINE OA ของร้าน" placeholder="https://lin.ee/..." value={f.lineOaUrl ?? ''} onChange={set('lineOaUrl')} />
            </div>
            <TextArea label="ที่อยู่ร้าน" rows={2} value={f.address ?? ''} onChange={set('address')} />
          </div>
        </Row>
        <Row title="รับเงินผ่านพร้อมเพย์" help="รูป QR พร้อมเพย์ของร้าน แสดงให้ลูกค้าสแกนจ่ายในหน้าสถานะเมื่อเครื่องเสร็จ และบนจอหน้าร้านตอนส่งมอบ">
          <Upload
            label="QR พร้อมเพย์"
            url={f.promptpayImageUrl ?? null}
            onUploaded={savePicture('promptpayImageUrl')}
            hint="บันทึกรูป QR จากแอปธนาคารของร้าน แล้วอัปโหลดที่นี่ บันทึกทันทีที่อัปโหลด"
          />
        </Row>
        <div className="sfoot">
          {save.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
          <Button type="submit" variant="primary" loading={save.isPending}>
            บันทึกข้อมูลร้าน
          </Button>
        </div>
      </form>
    </QueryState>
  );
}

function Terms() {
  const { q, save } = useSettings();
  const [f, setF] = useState<Partial<S>>({});
  useEffect(() => {
    if (q.data) setF(q.data);
  }, [q.data]);
  const errs = fieldErrors(save.error);
  const num = (k: keyof S) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value === '' ? '' : Number(e.target.value) }));
  const changed = q.data && f.termsText !== undefined && f.termsText !== q.data.termsText;
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      termsText: f.termsText,
      defaultWarrantyDays: Number(f.defaultWarrantyDays),
      pickupReminderDays: Number(f.pickupReminderDays),
      inspectionFee: Number(f.inspectionFee),
      defaultEtaDays: Number(f.defaultEtaDays),
    });
  }
  return (
    <QueryState loading={q.isLoading} error={q.error}>
      <form onSubmit={submit}>
        <Row
          title="เงื่อนไขในใบรับเครื่อง"
          help={
            <>
              <p>บรรทัดละหนึ่งข้อ ลูกค้าอ่านและเซ็นบนจอตอนรับเครื่อง ระบบเก็บฉบับที่ลูกค้าเซ็นไว้กับงานนั้น</p>
              <p>
                ฉบับปัจจุบัน <Pill tone="neutral">{q.data?.termsVersion}</Pill>
              </p>
            </>
          }
        >
          <div className="stack">
            <TextArea label="เงื่อนไข" rows={8} value={f.termsText ?? ''} onChange={(e) => setF((x) => ({ ...x, termsText: e.target.value }))} error={errs.termsText} />
            {changed && <Notice tone="warning">บันทึกแล้วจะเป็นฉบับใหม่ งานที่รับไปแล้วยังใช้ฉบับเดิมที่ลูกค้าเซ็น</Notice>}
          </div>
        </Row>
        <Row title="ค่าเริ่มต้น" help="ค่าที่ระบบเติมให้ตอนรับเครื่องและส่งมอบ พนักงานแก้เป็นรายงานได้">
          <div className="grid2">
            <TextField label="ค่าตรวจเช็คถ้าลูกค้าไม่ซ่อม" type="number" min={0} suffix="บาท" value={f.inspectionFee ?? ''} onChange={num('inspectionFee')} />
            <TextField label="นัดรับปกติหลังรับเครื่อง" type="number" min={0} suffix="วัน" value={f.defaultEtaDays ?? ''} onChange={num('defaultEtaDays')} />
            <TextField label="รับประกันงานซ่อม" type="number" min={0} suffix="วัน" value={f.defaultWarrantyDays ?? ''} onChange={num('defaultWarrantyDays')} />
            <TextField label="เตือนเครื่องไม่มารับเมื่อเกิน" type="number" min={1} suffix="วัน" value={f.pickupReminderDays ?? ''} onChange={num('pickupReminderDays')} />
          </div>
        </Row>
        <div className="sfoot">
          {save.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
          <Button type="submit" variant="primary" loading={save.isPending}>
            บันทึก
          </Button>
        </div>
      </form>
    </QueryState>
  );
}

function Line() {
  const { q, save } = useSettings();
  const [liff, setLiff] = useState('');
  const [channel, setChannel] = useState('');
  useEffect(() => {
    if (q.data) {
      setLiff(q.data.lineLiffId ?? '');
      setChannel(q.data.lineChannelId ?? '');
    }
  }, [q.data]);
  return (
    <QueryState loading={q.isLoading} error={q.error}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ lineLiffId: liff, lineChannelId: channel });
        }}
      >
        <Row
          title="LINE Login (LIFF)"
          help={
            <ol className="steps-list">
              <li>สร้าง LINE Login channel ใน LINE Developers</li>
              <li>เพิ่ม LIFF app ตั้ง Endpoint URL เป็น {location.origin}/#/me และเปิดสิทธิ์ openid กับ profile</li>
              <li>ใส่ LIFF ID และ Channel ID ที่นี่ แล้วใส่ลิงก์ LIFF ในเมนูของ LINE OA ร้าน</li>
            </ol>
          }
        >
          <div className="stack">
            <TextField label="LIFF ID" placeholder="1650000000-AbCdEfGh" value={liff} onChange={(e) => setLiff(e.target.value)} />
            <TextField label="Channel ID" inputMode="numeric" value={channel} onChange={(e) => setChannel(e.target.value)} hint="ใช้ตรวจ ID token กับ LINE ฝั่งเซิร์ฟเวอร์" />
            <p className="t-small t-muted">
              ลูกค้าที่เข้าผ่าน LINE เห็นเครื่องทุกเครื่องที่เคยส่งซ่อมและประกันที่เหลือ การแจ้งเตือนอัตโนมัติผ่าน LINE OA อยู่ในเฟส 2 ตอนนี้ใช้ปุ่มคัดลอกข้อความอัปเดตในหน้างาน
            </p>
          </div>
        </Row>
        <div className="sfoot">
          <Button type="submit" variant="primary" loading={save.isPending}>
            บันทึก
          </Button>
        </div>
      </form>
    </QueryState>
  );
}

/* ---------------- labour prices ---------------- */

function Pricing() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['presets-all'], queryFn: () => api.get<LaborPreset[]>('/shop/labor-presets?all=1') });
  const [edit, setEdit] = useState<Partial<LaborPreset> | null>(null);
  const save = useMutation({
    mutationFn: (p: Partial<LaborPreset>) =>
      p.id
        ? api.patch(`/shop/labor-presets/${p.id}`, { name: p.name, price: Number(p.price), category: p.category ?? null, active: p.active })
        : api.post('/shop/labor-presets', { name: p.name, price: Number(p.price), category: p.category ?? null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['presets-all'] });
      void qc.invalidateQueries({ queryKey: ['presets'] });
      setEdit(null);
      toast('บันทึกแล้ว');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const groups: (Category | null)[] = ['phone', 'computer', 'appliance', null];
  return (
    <QueryState loading={q.isLoading} error={q.error}>
      <Row title="ค่าแรงมาตรฐาน" help="ค่าแรงเป็นราคาตายตัวต่อรายการ ช่างเลือกจากรายการนี้ตอนเขียนใบเสนอราคา ลูกค้าเห็นราคาเดียวกันทุกครั้ง ไม่มีการคิดตามชั่วโมง">
        <div className="stack">
          {groups.map((g) => {
            const rows = q.data?.filter((p) => p.category === g) ?? [];
            if (!rows.length) return null;
            return (
              <div key={g ?? 'all'}>
                <h3 className="sgroup">{g ? CATEGORY_LABEL[g] : 'ทุกประเภท'}</h3>
                <table className="table table--flush">
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className={p.active ? undefined : 'row--off'}>
                        <td>{p.name}</td>
                        <td className="num">{fmt.baht(p.price)} บาท</td>
                        <td className="t-end">
                          {!p.active && <Pill tone="neutral">ปิดใช้</Pill>}
                          <Button size="sm" variant="ghost" onClick={() => setEdit(p)}>
                            แก้
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          <div>
            <Button onClick={() => setEdit({ category: 'phone', name: '', price: 0, active: true })}>
              <Plus aria-hidden="true" />
              เพิ่มรายการ
            </Button>
          </div>
        </div>
      </Row>
      <Dialog open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? 'แก้ค่าแรง' : 'เพิ่มค่าแรงมาตรฐาน'}>
        {edit && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(edit);
            }}
          >
            <TextField label="ชื่อรายการ" placeholder="เช่น ค่าแรงเปลี่ยนจอ" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus />
            <div className="grid2">
              <TextField label="ราคา" type="number" min={0} suffix="บาท" value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} />
              <Select label="ใช้กับ" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: (e.target.value || null) as Category | null })}>
                <option value="phone">{CATEGORY_LABEL.phone}</option>
                <option value="computer">{CATEGORY_LABEL.computer}</option>
                <option value="appliance">{CATEGORY_LABEL.appliance}</option>
                <option value="">ทุกประเภท</option>
              </Select>
            </div>
            {edit.id && (
              <Checkbox checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} detail="ปิดแล้วจะไม่อยู่ในรายการตอนเขียนใบเสนอราคา ใบที่ส่งไปแล้วไม่เปลี่ยน">
                ใช้งานอยู่
              </Checkbox>
            )}
            <div className="dialog__actions">
              <Button onClick={() => setEdit(null)}>ยกเลิก</Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                บันทึก
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </QueryState>
  );
}

/* ---------------- staff ---------------- */

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
}

function Users() {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/shop/users') });
  const [edit, setEdit] = useState<(Partial<UserRow> & { password?: string }) | null>(null);
  const save = useMutation({
    mutationFn: (u: Partial<UserRow> & { password?: string }) =>
      u.id
        ? api.patch(`/shop/users/${u.id}`, { name: u.name, role: u.role, active: u.active, ...(u.password ? { password: u.password } : {}) })
        : api.post('/shop/users', { name: u.name, email: u.email, role: u.role, password: u.password }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['team'] });
      setEdit(null);
      toast('บันทึกแล้ว');
    },
  });
  const errs = fieldErrors(save.error);
  const roles: Role[] = me.role === 'owner' ? ['technician', 'staff', 'admin', 'owner'] : ['technician', 'staff', 'admin'];
  return (
    <QueryState loading={q.isLoading} error={q.error}>
      <Row
        title="พนักงาน"
        help={
          <ul className="steps-list">
            <li>ช่าง: เห็นงานของตัวเองและคิวที่ยังไม่มีคนรับ ไม่เห็นเงิน</li>
            <li>หน้าร้าน: รับเครื่อง รับเงิน ส่งมอบ ค้นลูกค้า</li>
            <li>ผู้จัดการ: เพิ่มรายงาน ค่าแรงมาตรฐาน และพนักงาน</li>
            <li>เจ้าของร้าน: ทุกอย่าง รวมข้อมูลร้านและประวัติการแก้ไข</li>
          </ul>
        }
      >
        <div className="stack">
          <table className="table table--flush">
            <tbody>
              {q.data?.map((u) => (
                <tr key={u.id} className={u.active ? undefined : 'row--off'}>
                  <td>
                    <strong>{u.name}</strong>
                    <span className="t-small t-muted block">{u.email}</span>
                  </td>
                  <td>
                    {ROLE_LABEL[u.role]}
                    {!u.active && <Pill tone="neutral">ปิดบัญชี</Pill>}
                  </td>
                  <td className="t-small t-muted">{u.lastLoginAt ? `เข้าล่าสุด ${fmt.dateShort(u.lastLoginAt)}` : 'ยังไม่เคยเข้า'}</td>
                  <td className="t-end">
                    {(u.role !== 'owner' || atLeast(me, 'owner')) && (
                      <Button size="sm" variant="ghost" onClick={() => setEdit(u)}>
                        แก้
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <Button onClick={() => setEdit({ role: 'technician', name: '', email: '', active: true })}>
              <Plus aria-hidden="true" />
              เพิ่มพนักงาน
            </Button>
          </div>
        </div>
      </Row>
      <Dialog
        open={edit !== null}
        onClose={() => {
          setEdit(null);
          save.reset();
        }}
        title={edit?.id ? `แก้บัญชี ${edit.name}` : 'เพิ่มพนักงาน'}
      >
        {edit && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(edit);
            }}
          >
            <TextField label="ชื่อที่แสดง" placeholder="เช่น ช่างต้น" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={errs.name} required autoFocus />
            {!edit.id && <TextField label="อีเมลสำหรับเข้าระบบ" type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} error={errs.email} required />}
            <Select label="บทบาท" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })} disabled={edit.id === me.id}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
            <TextField
              label={edit.id ? 'ตั้งรหัสผ่านใหม่' : 'รหัสผ่านเริ่มต้น'}
              type="password"
              autoComplete="new-password"
              optional={Boolean(edit.id)}
              hint="อย่างน้อย 10 ตัวอักษร ให้พนักงานเปลี่ยนเองที่บัญชีของฉัน"
              value={edit.password ?? ''}
              onChange={(e) => setEdit({ ...edit, password: e.target.value })}
              error={errs.password}
            />
            {edit.id && edit.id !== me.id && (
              <Checkbox checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} detail="ปิดแล้วเข้าระบบไม่ได้ งานที่ค้างอยู่กลับไปที่คิวให้ช่างคนอื่นรับ">
                เปิดใช้บัญชี
              </Checkbox>
            )}
            {save.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
            <div className="dialog__actions">
              <Button onClick={() => setEdit(null)}>ยกเลิก</Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                บันทึก
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </QueryState>
  );
}

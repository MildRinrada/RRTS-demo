import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, House, LoaderCircle, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useMe } from '../../api/hooks';
import type { Me } from '../../api/types';
import { Button, Dialog } from '../../components/ui';
import { Person } from '../../components/Person';
import { useToast } from '../../components/Toast';
import { ACCOUNTS, roleCanOpen } from '../../demo/accounts';
import { DEMO_PASSWORD, resetDemo } from '../../demo/server';

/** The strip on every screen that says this is the demo: switch role in one click, or reset. */
export function DemoBar() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function reset() {
    setBusy(true);
    await resetDemo();
    qc.clear();
    setBusy(false);
    setAsking(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="demobar" role="note">
      <p className="demobar__text">
        <strong>เดโม</strong>
        <span className="demobar__more">ข้อมูลตัวอย่าง เก็บไว้ในเบราว์เซอร์นี้เท่านั้น</span>
      </p>
      <div className="demobar__links">
        <RoleSwitch />
        <button type="button" onClick={() => setAsking(true)} aria-label="รีเซ็ตข้อมูล">
          <RotateCcw aria-hidden="true" />
          <span className="demobar__more">รีเซ็ตข้อมูล</span>
        </button>
      </div>
      <Dialog open={asking} onClose={() => setAsking(false)} title="รีเซ็ตข้อมูลเดโม">
        <div className="stack">
          <p>งานที่รับเพิ่ม ราคาที่แจ้ง และการตั้งค่าที่แก้ไว้จะหายทั้งหมด ข้อมูลกลับเป็นร้านตัวอย่างแบบตอนเปิดครั้งแรก และออกจากระบบทุกบัญชี</p>
          <div className="dialog__actions">
            <Button onClick={() => setAsking(false)}>ยกเลิก</Button>
            <Button variant="danger" loading={busy} onClick={reset}>
              รีเซ็ตข้อมูล
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/**
 * Who you are in the shop right now, and the other roles one click away. Switching keeps you on
 * the same screen when the new role may see it, so the difference between roles shows side by side.
 */
function RoleSwitch() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const current = ACCOUNTS.find((a) => a.email === me.data?.email);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  async function become(email: string) {
    if (email === me.data?.email) return setOpen(false);
    setSwitching(email);
    try {
      const user = await api.post<Me>('/auth/login', { email, password: DEMO_PASSWORD });
      let to = roleCanOpen(user.role, pathname) ? pathname + search : '/shop';
      // A technician only sees their own jobs: another technician's job sends them to their board.
      const job = /^\/shop\/jobs\/(\d+)/.exec(to)?.[1];
      if (job && user.role === 'technician') await api.get(`/shop/jobs/${job}`).catch(() => (to = '/shop'));
      qc.clear();
      qc.setQueryData(['auth-me'], user);
      navigate(to, { replace: to === pathname + search });
      setOpen(false);
      toast(`เข้าใช้เป็น${ACCOUNTS.find((a) => a.email === email)?.name ?? user.name}แล้ว`);
    } catch (e) {
      toast(`${errorMessage(e)} ถ้าแก้บัญชีนี้ไว้ ให้กดรีเซ็ตข้อมูล`, 'error');
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="roleswitch" ref={box}>
      <button type="button" className="roleswitch__toggle" aria-expanded={open} aria-controls="roleswitch-menu" onClick={() => setOpen((v) => !v)}>
        {current ? (
          <>
            <span className="demobar__more">ใช้งานเป็น</span>
            <strong>{current.name}</strong>
            <span className="roleswitch__role">{current.roleLabel}</span>
          </>
        ) : (
          <strong>เลือกบทบาท</strong>
        )}
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="roleswitch__menu" id="roleswitch-menu">
          <p className="roleswitch__head">สลับบทบาท อยู่หน้าเดิมถ้าบทบาทใหม่เปิดหน้านี้ได้</p>
          <ul>
            {ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button type="button" className="roleswitch__item" aria-current={a.email === current?.email || undefined} disabled={switching !== null} onClick={() => become(a.email)}>
                  <Person id={a.id} name={a.name} />
                  <span className="roleswitch__who">
                    <span>
                      <strong>{a.name}</strong> <span className="t-muted">{a.roleLabel}</span>
                    </span>
                    <span className="t-small t-muted">{a.can}</span>
                  </span>
                  {switching === a.email ? (
                    <LoaderCircle className="spin roleswitch__mark" aria-hidden="true" />
                  ) : a.email === current?.email ? (
                    <Check className="roleswitch__mark" aria-label="ใช้อยู่" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <Link to="/" className="roleswitch__home">
            <House aria-hidden="true" />
            หน้าเริ่มต้นเดโม และหน้าของลูกค้า
          </Link>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, ClipboardPlus, History, KanbanSquare, LogOut, Menu, ScanLine, Settings2, UserRound, Users, X } from 'lucide-react';
import { api } from '../../api/client';
import { useMe } from '../../api/hooks';
import type { Me, Role } from '../../api/types';
import { ShopMark } from '../../components/ShopMark';
import { QueryState } from '../../components/ui';
import { ROLE_LABEL } from '../../lib/format';

const RANK: Record<Role, number> = { technician: 0, staff: 1, admin: 2, owner: 3 };
export const atLeast = (me: Me | null | undefined, role: Role) => Boolean(me && RANK[me.role] >= RANK[role]);

/** The signed-in shop user. Only rendered inside ShopLayout, which guarantees one. */
export function useUser() {
  return useMe().data as Me;
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const me = useUser();
  if (!atLeast(me, role)) return <p className="t-muted">หน้านี้สำหรับ{ROLE_LABEL[role]}ขึ้นไป</p>;
  return <>{children}</>;
}

const TITLES: [RegExp, string][] = [
  [/^\/shop$/, 'กระดานงาน'],
  [/^\/shop\/intake/, 'รับเครื่องใหม่'],
  [/^\/shop\/scan/, 'สแกนสติกเกอร์'],
  [/^\/shop\/jobs\/\d+\/handover/, 'ส่งมอบเครื่อง'],
  [/^\/shop\/jobs/, 'รายละเอียดงาน'],
  [/^\/shop\/customers/, 'ลูกค้า'],
  [/^\/shop\/reports/, 'รายงาน'],
  [/^\/shop\/settings/, 'ตั้งค่าร้าน'],
  [/^\/shop\/audit/, 'ประวัติการแก้ไข'],
  [/^\/shop\/account/, 'บัญชีของฉัน'],
];

export function ShopLayout() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [navOpen, setNavOpen] = useState(false);

  // The phone's menu sheet closes once a link inside it is followed.
  useEffect(() => setNavOpen(false), [location.pathname]);

  if (me.isLoading)
    return (
      <QueryState loading error={null}>
        {null}
      </QueryState>
    );
  if (me.error)
    return (
      <QueryState loading={false} error={me.error} onRetry={() => me.refetch()}>
        {null}
      </QueryState>
    );
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  const user = me.data;
  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? '';

  async function logout() {
    await api.post('/auth/logout');
    qc.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell" data-nav={navOpen ? 'open' : undefined}>
      <a className="skip-link" href="#main">
        ข้ามไปเนื้อหา
      </a>
      <aside className="side" id="shop-nav" aria-label="เมนูร้าน">
        <div className="side__brand">
          <Link to="/shop" className="side__home">
            <ShopMark />
          </Link>
          <button type="button" className="iconbtn side__close" onClick={() => setNavOpen(false)} aria-label="ปิดเมนู">
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="side__group" aria-label="งานซ่อม">
          <NavLink to="/shop" end className="navlink">
            <KanbanSquare aria-hidden="true" />
            {user.role === 'technician' ? 'งานของฉัน' : 'กระดานงาน'}
          </NavLink>
          {atLeast(user, 'staff') && (
            <NavLink to="/shop/intake" className="navlink">
              <ClipboardPlus aria-hidden="true" />
              รับเครื่องใหม่
            </NavLink>
          )}
          <NavLink to="/shop/scan" className="navlink">
            <ScanLine aria-hidden="true" />
            สแกนสติกเกอร์
          </NavLink>
          {atLeast(user, 'staff') && (
            <NavLink to="/shop/customers" className="navlink">
              <Users aria-hidden="true" />
              ลูกค้า
            </NavLink>
          )}
        </nav>
        {atLeast(user, 'admin') && (
          <nav className="side__group" aria-label="ร้าน">
            <p className="side__label">ร้าน</p>
            <NavLink to="/shop/reports" className="navlink">
              <BarChart3 aria-hidden="true" />
              รายงาน
            </NavLink>
            <NavLink to="/shop/settings" className="navlink">
              <Settings2 aria-hidden="true" />
              ตั้งค่าร้าน
            </NavLink>
            {user.role === 'owner' && (
              <NavLink to="/shop/audit" className="navlink">
                <History aria-hidden="true" />
                ประวัติการแก้ไข
              </NavLink>
            )}
          </nav>
        )}
        <div className="side__foot">
          <NavLink to="/shop/account" className="navlink side__user">
            <UserRound aria-hidden="true" />
            <span>
              {user.name}
              <small>{ROLE_LABEL[user.role]}</small>
            </span>
          </NavLink>
          <button type="button" className="navlink" onClick={logout}>
            <LogOut aria-hidden="true" />
            ออกจากระบบ
          </button>
        </div>
      </aside>
      <header className="topbar">
        <button type="button" className="iconbtn" onClick={() => setNavOpen(true)} aria-expanded={navOpen} aria-controls="shop-nav" aria-label="เปิดเมนู">
          <Menu aria-hidden="true" />
        </button>
        <p className="topbar__title">{title}</p>
        {atLeast(user, 'staff') && !location.pathname.startsWith('/shop/intake') ? (
          <Link to="/shop/intake" className="btn btn--primary btn--sm">
            รับเครื่อง
          </Link>
        ) : (
          <span />
        )}
      </header>
      <main className="canvas" id="main">
        <Outlet />
      </main>
    </div>
  );
}

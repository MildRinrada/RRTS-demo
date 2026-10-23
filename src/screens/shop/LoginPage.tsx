import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, fieldErrors } from '../../api/client';
import { useMe } from '../../api/hooks';
import type { Me } from '../../api/types';
import { ShopMark } from '../../components/ShopMark';
import { Button, Notice, TextField } from '../../components/ui';
import { DEMO_PASSWORD } from '../../demo/server';

const DEMO_ACCOUNTS = [
  { email: 'owner@example.com', label: 'เจ้าของร้าน' },
  { email: 'fon@example.com', label: 'หน้าร้าน' },
  { email: 'ton@example.com', label: 'ช่างต้น' },
  { email: 'bank@example.com', label: 'ช่างแบงก์' },
];

export function LoginPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/shop';
  const login = useMutation({
    mutationFn: (creds: { email: string; password: string }) => api.post<Me>('/auth/login', creds),
    onSuccess: (user) => {
      qc.setQueryData(['auth-me'], user);
      navigate(next, { replace: true });
    },
  });
  if (me.data) return <Navigate to={next} replace />;
  const errs = fieldErrors(login.error);

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
  }

  function demo(account: string) {
    setEmail(account);
    setPassword(DEMO_PASSWORD);
    login.mutate({ email: account, password: DEMO_PASSWORD });
  }

  return (
    <div className="login">
      <main className="login__card" id="main">
        <ShopMark size="lg" />
        <h1 className="login__title">เข้าสู่ระบบร้าน</h1>
        <form className="stack" onSubmit={submit} noValidate>
          <TextField label="อีเมล" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={errs.email} required autoFocus />
          <TextField label="รหัสผ่าน" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errs.password} required />
          {login.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(login.error)}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={login.isPending}>
            เข้าสู่ระบบ
          </Button>
        </form>
        <p className="t-small t-muted">ลืมรหัสผ่าน ให้เจ้าของร้านตั้งรหัสใหม่ให้ที่ ตั้งค่าร้าน &gt; พนักงาน</p>
        <section className="login__demo" aria-labelledby="demo-accounts">
          <h2 className="login__demotitle" id="demo-accounts">
            บัญชีเดโม รหัสผ่าน {DEMO_PASSWORD}
          </h2>
          <div className="login__demolist">
            {DEMO_ACCOUNTS.map((a) => (
              <Button key={a.email} size="sm" disabled={login.isPending} onClick={() => demo(a.email)}>
                {a.label}
              </Button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

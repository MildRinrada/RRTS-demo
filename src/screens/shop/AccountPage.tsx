import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage, fieldErrors } from '../../api/client';
import { useToast } from '../../components/Toast';
import { Button, Notice, TextField } from '../../components/ui';
import { ROLE_LABEL } from '../../lib/format';
import { useUser } from './ShopLayout';

export function AccountPage() {
  const me = useUser();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/auth/password', { current, next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      toast('เปลี่ยนรหัสผ่านแล้ว');
    },
  });
  const errs = fieldErrors(change.error);
  function submit(e: FormEvent) {
    e.preventDefault();
    change.mutate();
  }
  return (
    <div className="page page--narrow">
      <header className="titlerow">
        <div>
          <h1 className="title">บัญชีของฉัน</h1>
          <p className="subline">
            {me.name}, {ROLE_LABEL[me.role]}, {me.email}
          </p>
        </div>
      </header>
      <form className="panel stack" onSubmit={submit} noValidate>
        <h2 className="panel__title">เปลี่ยนรหัสผ่าน</h2>
        <TextField label="รหัสผ่านเดิม" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errs.current} />
        <TextField label="รหัสผ่านใหม่" type="password" autoComplete="new-password" hint="อย่างน้อย 10 ตัวอักษร" value={next} onChange={(e) => setNext(e.target.value)} error={errs.next} />
        {change.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(change.error)}</Notice>}
        <div>
          <Button type="submit" variant="primary" loading={change.isPending}>
            บันทึกรหัสผ่านใหม่
          </Button>
        </div>
      </form>
    </div>
  );
}

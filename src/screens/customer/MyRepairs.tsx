import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { api, ApiError, errorMessage, fieldErrors } from '../../api/client';
import { useConfig } from '../../api/hooks';
import type { JobStatus } from '../../api/types';
import { ShopMark } from '../../components/ShopMark';
import { Button, Notice, QueryState, StatusPill, TextField } from '../../components/ui';
import { fmt } from '../../lib/format';
import { lineSignIn } from '../../lib/liff';

interface MyJob {
  jobNo: string;
  device: string;
  status: JobStatus;
  statusLabel: string;
  receivedAt: string;
  etaDate: string;
  deliveredAt: string | null;
  warrantyUntil: string | null;
  warrantyDaysLeft: number | null;
  publicToken: string;
}

/** "My repairs" inside LINE: every device this customer has sent in, and the warranty left on each. */
export function MyRepairs() {
  const cfg = useConfig();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<{ name: string; linked: boolean; customerName: string | null }>('/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
  const signIn = useMutation({
    mutationFn: () => lineSignIn(cfg.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  return (
    <div className="cust">
      <header className="cust__bar">
        <div className="cust__bar-in">
          <ShopMark />
        </div>
      </header>
      <main className="cust__main" id="main">
        <h1 className="cust__title">งานซ่อมของฉัน</h1>
        <QueryState loading={me.isLoading || cfg.isLoading} error={me.error}>
          {!me.data ? (
            <section className="csec">
              <p>เข้าสู่ระบบด้วย LINE เพื่อดูเครื่องทั้งหมดที่เคยส่งซ่อมกับร้าน สถานะล่าสุด และประกันที่เหลือ</p>
              {!cfg.data?.liffId && !cfg.data?.devLiff ? (
                <Notice tone="info">ร้านยังไม่ได้เปิดใช้ LINE ดูสถานะได้จาก QR บนใบรับเครื่อง</Notice>
              ) : (
                <Button variant="primary" size="lg" onClick={() => signIn.mutate()} loading={signIn.isPending}>
                  เข้าสู่ระบบด้วย LINE
                </Button>
              )}
              {signIn.error && <Notice tone="danger">{errorMessage(signIn.error)}</Notice>}
            </section>
          ) : me.data.linked ? (
            <Jobs name={me.data.customerName ?? me.data.name} />
          ) : (
            <LinkPhone />
          )}
        </QueryState>
      </main>
    </div>
  );
}

function LinkPhone() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [jobNo, setJobNo] = useState('');
  const link = useMutation({
    mutationFn: () => api.post('/me/link-phone', { phone, jobNo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const errs = fieldErrors(link.error);
  function submit(e: FormEvent) {
    e.preventDefault();
    link.mutate();
  }
  return (
    <form className="csec stack" onSubmit={submit} noValidate>
      <h2 className="csec__title">ผูก LINE กับเบอร์โทรของคุณ</h2>
      <p className="t-muted">ใส่เบอร์ที่ให้ร้านไว้ และเลขงานซ่อมจากหัวใบรับเครื่อง ทำครั้งเดียว ครั้งต่อไปจะเห็นทุกเครื่องทันที</p>
      <TextField label="เบอร์โทร" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errs.phone} required />
      <TextField label="เลขงานซ่อม" hint="เช่น R2611-0042" autoCapitalize="characters" value={jobNo} onChange={(e) => setJobNo(e.target.value.toUpperCase())} error={errs.jobNo} required />
      {link.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(link.error)}</Notice>}
      <Button type="submit" variant="primary" size="lg" loading={link.isPending}>
        ผูกบัญชี
      </Button>
    </form>
  );
}

function Jobs({ name }: { name: string }) {
  const jobs = useQuery({ queryKey: ['me-jobs'], queryFn: () => api.get<MyJob[]>('/me/jobs') });
  const open = jobs.data?.filter((j) => !['delivered', 'cancelled'].includes(j.status)) ?? [];
  const done = jobs.data?.filter((j) => ['delivered', 'cancelled'].includes(j.status)) ?? [];
  return (
    <QueryState loading={jobs.isLoading} error={jobs.error} onRetry={() => jobs.refetch()}>
      <p className="t-muted">สวัสดี {name}</p>
      {open.length > 0 && (
        <section className="csec" aria-labelledby="open-h">
          <h2 className="csec__title" id="open-h">
            อยู่ที่ร้านตอนนี้
          </h2>
          <ul className="mylist">
            {open.map((j) => (
              <JobRow key={j.jobNo} j={j} />
            ))}
          </ul>
        </section>
      )}
      <section className="csec" aria-labelledby="done-h">
        <h2 className="csec__title" id="done-h">
          ซ่อมเสร็จแล้ว
        </h2>
        {done.length ? (
          <ul className="mylist">
            {done.map((j) => (
              <JobRow key={j.jobNo} j={j} />
            ))}
          </ul>
        ) : (
          <p className="t-muted">ยังไม่มี</p>
        )}
      </section>
    </QueryState>
  );
}

function JobRow({ j }: { j: MyJob }) {
  return (
    <li>
      <Link to={`/j/${j.publicToken}`} className="mylist__row">
        <span className="mylist__main">
          <strong>{j.device}</strong>
          <span className="t-small t-muted">
            {j.jobNo}, รับเครื่อง {fmt.dateShort(j.receivedAt)}
          </span>
          {j.warrantyDaysLeft !== null && j.warrantyUntil && (
            <span className={`t-small mylist__warranty${j.warrantyDaysLeft > 0 ? '' : ' t-muted'}`}>
              <ShieldCheck aria-hidden="true" />
              {j.warrantyDaysLeft > 0 ? `ประกันเหลือ ${j.warrantyDaysLeft} วัน ถึง ${fmt.calDML(j.warrantyUntil)}` : 'หมดประกันแล้ว'}
            </span>
          )}
        </span>
        <StatusPill status={j.status} label={j.statusLabel} />
        <ChevronRight aria-hidden="true" className="mylist__chev" />
      </Link>
    </li>
  );
}

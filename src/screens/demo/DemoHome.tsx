import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, MessageCircle } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { JobStatus, Me } from '../../api/types';
import { Person } from '../../components/Person';
import { useToast } from '../../components/Toast';
import { Button, QueryState, StatusPill } from '../../components/ui';
import { ACCOUNTS } from '../../demo/accounts';
import { DEMO_PASSWORD, demoJobs } from '../../demo/server';
import { STATUS_LABEL } from '../../lib/format';

type Sample = Awaited<ReturnType<typeof demoJobs>>[number];

/** One sample job for each situation the customer's page handles differently. */
const SITUATIONS: { key: (j: Sample) => boolean; note: string }[] = [
  { key: (j) => j.status === 'received', note: 'เห็นคิวที่เท่าไร และวันคาดว่าเสร็จ' },
  { key: (j) => j.status === 'awaiting_approval' && j.quote === 'sent', note: 'ราคาแยกรายการ กดอนุมัติหรือไม่ซ่อมได้เลย' },
  { key: (j) => j.status === 'awaiting_approval' && j.quote === 'callback', note: 'ลูกค้าขอให้ร้านโทรกลับก่อนตัดสินใจ' },
  { key: (j) => j.status === 'repairing', note: 'ราคาที่อนุมัติแล้วกับวันคาดว่าเสร็จ' },
  { key: (j) => j.status === 'waiting_parts', note: 'รออะไหล่อะไร และคาดว่าจะได้วันไหน' },
  { key: (j) => j.status === 'ready' && j.result === 'repaired', note: 'ยอดที่ต้องจ่าย พร้อม QR พร้อมเพย์ของร้าน' },
  { key: (j) => j.status === 'ready' && j.result === 'not_repaired', note: 'ไม่ซ่อม เหลือแค่ค่าตรวจเช็ค' },
  { key: (j) => j.status === 'delivered', note: 'รับเครื่องแล้ว เปิดใบรับประกันได้' },
];

export function DemoHome() {
  const jobs = useQuery({ queryKey: ['demo-jobs'], queryFn: demoJobs });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const find = (pred: (j: Sample) => boolean) => jobs.data?.find(pred);
  const samples = SITUATIONS.map((s) => ({ ...s, job: jobs.data?.find(s.key) })).filter((s) => s.job);
  const first = find((j) => j.jobNo.endsWith('-0001'));

  /** Signs in as a sample account and opens a screen, the way a staff member would start their shift. */
  async function enter(email: string, to: string) {
    setBusy(`${email}${to}`);
    try {
      const user = await api.post<Me>('/auth/login', { email, password: DEMO_PASSWORD });
      qc.clear();
      qc.setQueryData(['auth-me'], user);
      navigate(to);
    } catch (e) {
      toast(`${errorMessage(e)} ถ้าแก้บัญชีนี้ไว้ ให้กดรีเซ็ตข้อมูลด้านบน`, 'error');
    } finally {
      setBusy(null);
    }
  }

  const ready = find((j) => j.status === 'ready' && j.result === 'repaired' && j.customer === 'คุณจิราพร');
  const awaiting = find((j) => j.status === 'awaiting_approval' && j.quote === 'sent');
  const callback = find((j) => j.status === 'awaiting_approval' && j.quote === 'callback');

  const tries = [
    {
      title: 'รับเครื่องใหม่',
      text: 'กรอกเบอร์ลูกค้า ถ่ายรูปสภาพเครื่อง ให้ลูกค้าเซ็นบนจอ แล้วพิมพ์ใบรับเครื่องที่มี QR กับสติกเกอร์ติดเครื่อง',
      action: 'เข้าเป็นหน้าร้าน',
      run: () => enter('fon@example.com', '/shop/intake'),
      key: 'fon@example.com/shop/intake',
    },
    {
      title: 'ลูกค้าอนุมัติราคาจากลิงก์',
      text: `เปิดหน้าลูกค้าของงาน ${awaiting?.jobNo ?? ''} ในแท็บใหม่ กดอนุมัติ แล้วดูงานบนกระดานย้ายไปกำลังซ่อมเอง`,
      action: 'เปิดหน้าลูกค้า',
      href: awaiting ? `#/j/${awaiting.publicToken}` : undefined,
    },
    {
      title: 'ส่งมอบและออกใบรับประกัน',
      text: `งาน ${ready?.jobNo ?? ''} ซ่อมเสร็จแล้ว ติ๊กของที่คืน รับเงิน ให้ลูกค้าเซ็นรับ แล้วพิมพ์ใบเสร็จพร้อมใบรับประกัน`,
      action: 'เข้าเป็นหน้าร้าน',
      run: () => ready && enter('fon@example.com', `/shop/jobs/${ready.id}/handover`),
      key: `fon@example.com/shop/jobs/${ready?.id}/handover`,
    },
    {
      title: 'ลองเริ่มซ่อมก่อนลูกค้าอนุมัติ',
      text: `งาน ${callback?.jobNo ?? ''} ลูกค้ายังไม่ตอบราคา ลองเปลี่ยนเป็นกำลังซ่อม ระบบจะไม่ยอม เพราะกฎนี้อยู่ถึงระดับฐานข้อมูล`,
      action: 'เข้าเป็นช่างต้น',
      run: () => callback && enter('ton@example.com', `/shop/jobs/${callback.id}`),
      key: `ton@example.com/shop/jobs/${callback?.id}`,
    },
  ];

  return (
    <div className="demo">
      <main className="demo__main" id="main">
        <header className="demo__head">
          <h1 className="demo__title">ระบบรับงานซ่อมและติดตามสถานะ</h1>
          <p className="demo__lead">ร้านตัวอย่างที่มีงานครบทุกสถานะ ลองได้ทุกหน้าจอทั้งฝั่งร้านและฝั่งลูกค้า สิ่งที่แก้จะเก็บไว้ในเบราว์เซอร์นี้เท่านั้น</p>
        </header>

        <div className="demo__grid">
          <div className="demo__col">
            <section className="panel demo__panel" aria-labelledby="demo-shop">
              <h2 className="panel__title" id="demo-shop">
                เข้าใช้ฝั่งร้าน
              </h2>
              <p className="t-muted">แต่ละบทบาทเห็นและทำได้ไม่เท่ากัน เลือกบัญชีแล้วระบบจะเข้าสู่ระบบให้</p>
              <ul className="demo__accounts">
                {ACCOUNTS.map((a) => (
                  <li key={a.email} className="demo__account">
                    <Person id={a.id} name={a.name} />
                    <div className="demo__who">
                      <p>
                        <strong>{a.name}</strong> <span className="t-muted">{a.roleLabel}</span>
                      </p>
                      <p className="t-small t-muted">{a.can}</p>
                    </div>
                    <Button variant={a.role === 'owner' ? 'primary' : 'secondary'} size="sm" loading={busy === `${a.email}/shop`} onClick={() => enter(a.email, '/shop')}>
                      เข้าใช้
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="t-small t-muted">
                หรือเข้าทาง <Link to="/login">หน้าเข้าสู่ระบบ</Link> รหัสผ่านทุกบัญชีคือ {DEMO_PASSWORD}
              </p>
            </section>
            <section className="panel demo__panel" aria-labelledby="demo-try">
              <h2 className="panel__title" id="demo-try">
                ลองทำตามนี้
              </h2>
              <ol className="demo__trylist">
                {tries.map((t, i) => (
                  <li key={t.title} className="demo__try">
                    <span className="demo__n t-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <h3 className="demo__trytitle">{t.title}</h3>
                    <p className="t-muted">{t.text}</p>
                    {t.href ? (
                      <a className="btn btn--sm demo__go" href={t.href} target="_blank" rel="noopener">
                        {t.action}
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                    ) : (
                      <Button size="sm" className="demo__go" loading={busy === t.key} onClick={t.run}>
                        {t.action}
                        <ChevronRight aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section className="panel demo__panel" aria-labelledby="demo-customer">
            <h2 className="panel__title" id="demo-customer">
              เปิดหน้าลูกค้า
            </h2>
            <p className="t-muted">หน้าที่ลูกค้าเห็นเมื่อสแกน QR บนใบรับเครื่อง เปิดในแท็บใหม่ วางคู่กับหน้าร้านแล้วจะเห็นทั้งสองฝั่งอัปเดตพร้อมกัน</p>
            <QueryState loading={jobs.isLoading} error={jobs.error} onRetry={() => jobs.refetch()}>
              <ul className="demo__jobs">
                {samples.map(({ job, note }) => (
                  <li key={job!.id}>
                    <a className="demo__job" href={`#/j/${job!.publicToken}`} target="_blank" rel="noopener">
                      <span className="demo__jobmain">
                        <span className="demo__jobtop">
                          <StatusPill
                            status={job!.status as JobStatus}
                            label={job!.status === 'ready' && job!.result === 'not_repaired' ? 'ไม่ซ่อม รอรับคืน' : STATUS_LABEL[job!.status as JobStatus]}
                          />
                          <span className="t-small t-muted t-num">{job!.jobNo}</span>
                        </span>
                        <span className="demo__jobdevice">
                          {job!.customer} {job!.device}
                        </span>
                        <span className="t-small t-muted">{note}</span>
                      </span>
                      <ArrowUpRight className="demo__chev" aria-hidden="true" />
                    </a>
                  </li>
                ))}
                <li>
                  <a className="demo__job" href="#/me" target="_blank" rel="noopener">
                    <span className="demo__jobmain">
                      <span className="demo__jobtop">
                        <span className="pill pill--accent">
                          <MessageCircle className="inline-icon" aria-hidden="true" />
                          งานซ่อมของฉันใน LINE
                        </span>
                      </span>
                      <span className="t-small t-muted">
                        เข้าด้วยบัญชี LINE ตัวอย่าง แล้วผูกเบอร์ 081-234-5678 กับเลขงาน {first?.jobNo ?? ''} ที่พิมพ์อยู่บนใบรับเครื่อง จะเห็นทุกเครื่องที่เคยส่งซ่อมและประกันที่เหลือ
                      </span>
                    </span>
                    <ArrowUpRight className="demo__chev" aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </QueryState>
          </section>
        </div>

        <footer className="demo__foot">
          <div>
            <h2 className="demo__foottitle">เกี่ยวกับเดโมนี้</h2>
            <ul className="demo__notes">
              <li>ทุกอย่างทำงานในเบราว์เซอร์ ไม่มีเซิร์ฟเวอร์ และไม่ส่งข้อมูลไปที่ไหน กฎ สิทธิ์ และข้อความแจ้งเตือนเป็นชุดเดียวกับระบบจริง</li>
              <li>ระบบจริงใช้ NestJS กับ PostgreSQL ติดตั้งแยกต่อร้านด้วย Docker สำรองข้อมูลทุกวัน</li>
              <li>ใบรับเครื่อง สติกเกอร์ และใบเสร็จ ระบบจริงสร้างเป็น PDF ในเดโมเปิดเป็นหน้าพิมพ์ เลือกบันทึกเป็น PDF ได้จากหน้าต่างพิมพ์</li>
              <li>ไม่ได้เชื่อมกับ LINE จริง ปุ่มเข้าสู่ระบบด้วย LINE ใช้บัญชีตัวอย่าง และไม่มีการส่งข้อความออกไป</li>
            </ul>
          </div>
          <p className="t-small t-faint">
            รูปเครื่องตัวอย่างจาก Wikimedia Commons: Sygmoral (CC BY-SA 4.0), Samsung Galaxy S2 shattered screen (CC BY-SA 2.0), Laptop hardware (CC BY 3.0), Acer SF114-32 keyboard closeup (CC0),
            Xiaomi Mi Note 2 charging (CC BY-SA 4.0), Sima shimony (CC BY-SA 4.0)
          </p>
        </footer>
      </main>
    </div>
  );
}

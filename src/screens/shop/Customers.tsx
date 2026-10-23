import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Category, JobStatus } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Baht, Button, Empty, QueryState, StatusPill, TextArea } from '../../components/ui';
import { daysFromToday, fmt, telHref } from '../../lib/format';
import { CategoryIcon } from './Board';
import { RequireRole } from './ShopLayout';

interface Row {
  id: number;
  fullName: string;
  phone: string;
  jobs: number;
  lastVisit: string | null;
  lineLinked: boolean;
}

interface CustomerDetail {
  id: number;
  fullName: string;
  phone: string;
  note: string | null;
  lineLinked: boolean;
  createdAt: string;
  devices: { id: number; label: string; category: Category; serialOrImei: string | null; jobs: number }[];
  jobs: {
    id: number;
    jobNo: string;
    deviceId: number;
    device: string;
    issue: string;
    status: JobStatus;
    statusLabel: string;
    receivedAt: string;
    deliveredAt: string | null;
    warrantyUntil: string | null;
    charge: number | null;
  }[];
}

export function Customers() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const res = useQuery({ queryKey: ['customers', debounced], queryFn: () => api.get<{ rows: Row[] }>(`/shop/customers?q=${encodeURIComponent(debounced)}`), enabled: debounced.length >= 2 });
  return (
    <RequireRole role="staff">
      <div className="page">
        <header className="titlerow">
          <div>
            <h1 className="title">ลูกค้า</h1>
            <p className="subline">ค้นด้วยเบอร์โทร ชื่อ IMEI หรือเลขงาน เพื่อดูประวัติเครื่องและประกันที่เหลือ</p>
          </div>
        </header>
        <div className="toolbar">
          <label className="search search--wide">
            <Search aria-hidden="true" />
            <span className="visually-hidden">ค้นหาลูกค้า</span>
            <input type="search" autoFocus placeholder="เช่น 0812345678, สมชาย, 3567891044" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {debounced.length < 2 ? (
          <p className="t-muted">พิมพ์อย่างน้อย 2 ตัวอักษร</p>
        ) : (
          <QueryState loading={res.isLoading} error={res.error}>
            {res.data?.rows.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>ลูกค้า</th>
                    <th className="num">งานซ่อม</th>
                    <th className="num">มาล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/shop/customers/${c.id}`} className="rowlink">
                          <span className="rowlink__text">
                            <strong>{c.fullName}</strong>
                            <span className="t-small t-muted num">
                              {c.phone}
                              {c.lineLinked ? ', ผูก LINE แล้ว' : ''}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="num">{c.jobs}</td>
                      <td className="num">{c.lastVisit ? fmt.dateShort(c.lastVisit) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title={`ไม่พบลูกค้าที่ตรงกับ "${debounced}"`}>ลูกค้าใหม่จะถูกบันทึกเองตอนรับเครื่อง</Empty>
            )}
          </QueryState>
        )}
      </div>
    </RequireRole>
  );
}

export function CustomerPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/shop/customers/${id}`) });
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.patch<CustomerDetail>(`/shop/customers/${id}`, { note }),
    onSuccess: (c) => {
      qc.setQueryData(['customer', id], c);
      setNote(null);
      toast('บันทึกแล้ว');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const c = q.data;
  return (
    <RequireRole role="staff">
      <div className="page">
        <Link to="/shop/customers" className="backlink">
          <ArrowLeft aria-hidden="true" />
          ลูกค้า
        </Link>
        <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
          {c && (
            <>
              <header className="titlerow">
                <div>
                  <h1 className="title">{c.fullName}</h1>
                  <p className="subline">
                    <a href={telHref(c.phone)}>{c.phone}</a>, ลูกค้าตั้งแต่ {fmt.date(c.createdAt)}, {c.lineLinked ? 'ผูก LINE แล้ว' : 'ยังไม่ได้ผูก LINE'}
                  </p>
                </div>
              </header>
              <div className="split">
                <section className="panel stack" aria-labelledby="hist-h">
                  <h2 className="panel__title" id="hist-h">
                    ประวัติงานซ่อม {c.jobs.length} งาน
                  </h2>
                  <table className="table table--flush">
                    <thead>
                      <tr>
                        <th>งาน</th>
                        <th>สถานะ</th>
                        <th className="num">ค่าซ่อม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.jobs.map((j) => (
                        <tr key={j.id}>
                          <td>
                            <Link to={`/shop/jobs/${j.id}`} className="rowlink">
                              <span className="rowlink__text">
                                <strong>{j.device}</strong>
                                <span className="t-small t-muted">
                                  <span className="code">{j.jobNo}</span> {fmt.dateShort(j.receivedAt)} {j.issue}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <span className="stack" style={{ ['--stack' as string]: '2px' }}>
                              <StatusPill status={j.status} label={j.statusLabel} />
                              {j.warrantyUntil && daysFromToday(j.warrantyUntil) >= 0 && (
                                <span className="t-small warranty-left">
                                  <ShieldCheck aria-hidden="true" />
                                  ประกันถึง {fmt.calDM(j.warrantyUntil)}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="num">
                            <Baht value={j.charge} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <div className="stack">
                  <section className="panel stack" aria-labelledby="dev-h">
                    <h2 className="panel__title" id="dev-h">
                      เครื่องของลูกค้า
                    </h2>
                    <ul className="devlist">
                      {c.devices.map((d) => (
                        <li key={d.id}>
                          <span className="thumb thumb--sm">
                            <CategoryIcon c={d.category} />
                          </span>
                          <span>
                            <strong>{d.label}</strong>
                            <span className="t-small t-muted">
                              {d.serialOrImei ? `${d.serialOrImei}, ` : ''}ซ่อม {d.jobs} ครั้ง
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="panel stack" aria-labelledby="note-h">
                    <h2 className="panel__title" id="note-h">
                      บันทึกเกี่ยวกับลูกค้า
                    </h2>
                    <TextArea label="บันทึก" rows={3} value={note ?? c.note ?? ''} onChange={(e) => setNote(e.target.value)} hint="เห็นเฉพาะคนในร้าน เช่น สะดวกให้โทรช่วงเย็น" />
                    <div>
                      <Button size="sm" disabled={note === null} loading={save.isPending} onClick={() => save.mutate()}>
                        บันทึก
                      </Button>
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}
        </QueryState>
      </div>
    </RequireRole>
  );
}

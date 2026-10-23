import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Phone } from 'lucide-react';
import { api, download, errorMessage } from '../../api/client';
import type { JobStatus } from '../../api/types';
import { BarChart } from '../../components/BarChart';
import { Person } from '../../components/Person';
import { useToast } from '../../components/Toast';
import { Baht, Button, Empty, QueryState, Segmented, TextField } from '../../components/ui';
import { fmt, STATUS_TONE, telHref, todayYmd } from '../../lib/format';
import { RequireRole } from './ShopLayout';

interface Summary {
  from: string;
  to: string;
  revenue: number;
  days: { date: string; total: number; payments: number }[];
  methods: { method: string; label: string; total: number }[];
  received: number;
  delivered: number;
  completed: number;
  avgTurnaroundDays: number | null;
  openByStatus: { status: JobStatus; label: string; count: number }[];
  openTotal: number;
  overdue: number;
  perTech: { id: number | null; name: string; completed: number; notRepaired: number; open: number }[];
}
interface Unclaimed {
  days: number;
  rows: { id: number; jobNo: string; customerName: string; customerPhone: string; device: string; result: string | null; completedAt: string; daysWaiting: number; due: number | null }[];
}

type Range = '7' | '30' | 'month' | 'custom';

function rangeOf(r: Range, from: string, to: string) {
  if (r === '7') return { from: todayYmd(-6), to: todayYmd() };
  if (r === '30') return { from: todayYmd(-29), to: todayYmd() };
  if (r === 'month') return { from: `${todayYmd().slice(0, 8)}01`, to: todayYmd() };
  return { from, to };
}

/** Reports answer: how much came in, where work is stuck, and which finished devices nobody collected. */
export function Reports() {
  const toast = useToast();
  const [range, setRange] = useState<Range>('30');
  const [from, setFrom] = useState(todayYmd(-29));
  const [to, setTo] = useState(todayYmd());
  const r = rangeOf(range, from, to);
  const sum = useQuery({ queryKey: ['report', r.from, r.to], queryFn: () => api.get<Summary>(`/shop/reports/summary?from=${r.from}&to=${r.to}`) });
  const unclaimed = useQuery({ queryKey: ['unclaimed'], queryFn: () => api.get<Unclaimed>('/shop/reports/unclaimed') });
  const [exporting, setExporting] = useState(false);
  const s = sum.data;
  const maxOpen = Math.max(1, ...(s?.openByStatus.map((o) => o.count) ?? [1]));

  async function exportXlsx() {
    setExporting(true);
    try {
      await download(`/shop/reports/export.xlsx?from=${r.from}&to=${r.to}`, 'งานซ่อม.xlsx');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <RequireRole role="admin">
      <div className="page page--wide">
        <header className="titlerow">
          <div>
            <h1 className="title">รายงาน</h1>
            <p className="subline">
              {s ? `${fmt.cal(s.from)} ถึง ${fmt.cal(s.to)}` : ' '}
              {s && s.overdue > 0 && <span className="t-negative">, เลยวันนัดอยู่ {s.overdue} เครื่อง</span>}
              {unclaimed.data && unclaimed.data.rows.length > 0 && (
                <span>
                  , ไม่มารับเกิน {unclaimed.data.days} วัน {unclaimed.data.rows.length} เครื่อง
                </span>
              )}
            </p>
          </div>
          <Button onClick={exportXlsx} loading={exporting}>
            <Download aria-hidden="true" />
            ส่งออก Excel
          </Button>
        </header>
        <div className="toolbar">
          <Segmented
            label="ช่วงเวลา"
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: '7 วัน' },
              { value: '30', label: '30 วัน' },
              { value: 'month', label: 'เดือนนี้' },
              { value: 'custom', label: 'เลือกเอง' },
            ]}
          />
          {range === 'custom' && (
            <span className="cluster">
              <TextField label="ตั้งแต่" hideLabel type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="t-muted">ถึง</span>
              <TextField label="ถึง" hideLabel type="date" value={to} min={from} max={todayYmd()} onChange={(e) => setTo(e.target.value)} />
            </span>
          )}
        </div>

        <QueryState loading={sum.isLoading} error={sum.error} onRetry={() => sum.refetch()}>
          {s && (
            <>
              <section className="kpis" aria-label="ตัวเลขหลัก">
                <div className="kpi kpi--lead">
                  <p className="kpi__label">รับเงิน</p>
                  <p className="kpi__value num">
                    {fmt.baht(s.revenue)}
                    <span className="unit"> บาท</span>
                  </p>
                  <p className="kpi__note">
                    {s.days.reduce((n, d) => n + d.payments, 0)} รายการ ใน {s.days.length} วัน
                  </p>
                </div>
                <div className="kpi">
                  <p className="kpi__label">รับเครื่องเข้า</p>
                  <p className="kpi__value num">
                    {s.received}
                    <span className="unit"> เครื่อง</span>
                  </p>
                  <p className="kpi__note">ส่งมอบคืน {s.delivered} เครื่อง</p>
                </div>
                <div className="kpi">
                  <p className="kpi__label">เวลาซ่อมเฉลี่ย</p>
                  <p className="kpi__value num">
                    {s.avgTurnaroundDays === null ? '-' : s.avgTurnaroundDays.toLocaleString('th-TH', { minimumFractionDigits: 1 })}
                    <span className="unit"> วัน</span>
                  </p>
                  <p className="kpi__note">จากรับเครื่องถึงเสร็จ {s.completed} งาน</p>
                </div>
                <div className="kpi">
                  <p className="kpi__label">อยู่ในร้านตอนนี้</p>
                  <p className="kpi__value num">
                    {s.openTotal}
                    <span className="unit"> เครื่อง</span>
                  </p>
                  <p className={`kpi__note${s.overdue ? ' t-negative' : ''}`}>{s.overdue ? `เลยวันนัด ${s.overdue} เครื่อง` : 'ไม่มีเครื่องเลยวันนัด'}</p>
                </div>
              </section>

              <div className="split split--report">
                <section className="panel stack" aria-labelledby="rev-h">
                  <div className="panel__head">
                    <h2 className="panel__title" id="rev-h">
                      รับเงินรายวัน
                    </h2>
                    <span className="t-small t-muted">บาท</span>
                  </div>
                  <BarChart label="รับเงินรายวัน (บาท)" data={s.days.map((d) => ({ key: d.date, value: d.total }))} xLabel={(k) => fmt.calDM(k)} />
                  {s.methods.length > 0 && (
                    <p className="t-small t-muted">
                      {s.methods.map((m, i) => (
                        <span key={m.method} className="nowrap">
                          {i > 0 && ', '}
                          {m.label} {fmt.baht(m.total)}
                        </span>
                      ))}
                    </p>
                  )}
                </section>
                <section className="panel stack" aria-labelledby="open-h">
                  <h2 className="panel__title" id="open-h">
                    งานค้างตามสถานะ
                  </h2>
                  <ul className="hbars">
                    {s.openByStatus.map((o) => (
                      <li key={o.status}>
                        <Link to="/shop" className="hbars__label">
                          {o.label}
                        </Link>
                        <span className="hbars__track">{o.count > 0 && <span className={`hbars__bar hbars__bar--${STATUS_TONE[o.status]}`} style={{ width: `${(o.count / maxOpen) * 100}%` }} />}</span>
                        <span className="num hbars__value">{o.count}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <div className="split">
                <section className="panel stack" aria-labelledby="unc-h">
                  <h2 className="panel__title" id="unc-h">
                    เสร็จแล้วแต่ไม่มารับเกิน {unclaimed.data?.days ?? '-'} วัน
                  </h2>
                  <QueryState loading={unclaimed.isLoading} error={unclaimed.error}>
                    {unclaimed.data?.rows.length ? (
                      <table className="table table--flush">
                        <thead>
                          <tr>
                            <th>เครื่อง</th>
                            <th className="num">รอมาแล้ว</th>
                            <th className="num">ค้างชำระ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unclaimed.data.rows.map((u) => (
                            <tr key={u.id}>
                              <td>
                                <Link to={`/shop/jobs/${u.id}`} className="rowlink">
                                  <span className="rowlink__text">
                                    <strong>{u.device}</strong>
                                    <span className="t-small t-muted">
                                      <span className="code">{u.jobNo}</span> {u.customerName}{' '}
                                    </span>
                                  </span>
                                </Link>
                                <div>
                                  <a href={telHref(u.customerPhone)} className="t-small nowrap">
                                    <Phone aria-hidden="true" className="inline-icon" />
                                    {u.customerPhone}
                                  </a>
                                </div>
                              </td>
                              <td className="num">{u.daysWaiting} วัน</td>
                              <td className="num">
                                <Baht value={u.due} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <Empty title="ไม่มีเครื่องค้างรับ">เครื่องที่เสร็จแล้วลูกค้ามารับครบภายในกำหนด</Empty>
                    )}
                  </QueryState>
                  <p className="t-small t-muted">ระบบแค่แจ้งเตือน ไม่จัดการเครื่องให้อัตโนมัติ การจำหน่ายเครื่องที่ลูกค้าทิ้งไว้ ควรปรึกษาผู้รู้กฎหมายก่อน</p>
                </section>
                <section className="panel stack" aria-labelledby="tech-h">
                  <h2 className="panel__title" id="tech-h">
                    งานต่อช่าง
                  </h2>
                  {s.perTech.length ? (
                    <table className="table table--flush">
                      <thead>
                        <tr>
                          <th>ช่าง</th>
                          <th className="num">ซ่อมเสร็จ</th>
                          <th className="num">ไม่ซ่อม</th>
                          <th className="num">ค้างอยู่</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.perTech.map((t) => (
                          <tr key={t.id ?? 'none'}>
                            <td>{t.id ? <Person id={t.id} name={t.name} withName /> : <span className="t-muted">{t.name}</span>}</td>
                            <td className="num">{t.completed}</td>
                            <td className="num">{t.notRepaired}</td>
                            <td className="num">{t.open}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Empty title="ยังไม่มีงานในช่วงนี้" />
                  )}
                </section>
              </div>
            </>
          )}
        </QueryState>
      </div>
    </RequireRole>
  );
}

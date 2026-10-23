import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardPlus, Laptop, LayoutList, KanbanSquare, PhoneCall, Search, Smartphone, Tv } from 'lucide-react';
import { api } from '../../api/client';
import { useTeam } from '../../api/hooks';
import type { BoardJob, Category, JobStatus } from '../../api/types';
import { Person } from '../../components/Person';
import { useToast } from '../../components/Toast';
import { Empty, QueryState, Segmented, StatusPill } from '../../components/ui';
import { daysFromToday, fmt, STATUS_LABEL, STATUS_TONE } from '../../lib/format';
import { MoveDialog, MoveTarget, NEEDS_DETAILS, useMoveJob } from './MoveDialog';
import { atLeast, useUser } from './ShopLayout';

const COLUMNS: JobStatus[] = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'waiting_parts', 'ready'];
const VIEW_KEY = 'board:view';

export const CategoryIcon = ({ c }: { c: Category }) => (c === 'phone' ? <Smartphone aria-hidden="true" /> : c === 'computer' ? <Laptop aria-hidden="true" /> : <Tv aria-hidden="true" />);

/**
 * The board answers: which device needs what next, and which ones are past the date the customer
 * was given. Columns are the fixed statuses; a card moves by dragging or from the job page.
 */
export function Board() {
  const me = useUser();
  const team = useTeam();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [who, setWho] = useState('all');
  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as 'board' | 'list') || (window.innerWidth < 720 ? 'list' : 'board');
    } catch {
      return 'board';
    }
  });
  const [target, setTarget] = useState<MoveTarget | null>(null);
  const [dragOver, setDragOver] = useState<JobStatus | null>(null);
  const move = useMoveJob();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // storage blocked: the view is simply not remembered
    }
  }, [view]);

  const params = new URLSearchParams();
  if (debounced) params.set('q', debounced);
  if (who !== 'all') params.set('assignee', who);
  const jobs = useQuery({ queryKey: ['board', debounced, who], queryFn: () => api.get<BoardJob[]>(`/shop/jobs?${params}`), refetchInterval: 30_000 });
  const rows = jobs.data ?? [];
  const open = rows.filter((j) => COLUMNS.includes(j.status));

  const finding = useMemo(() => {
    const late = open.filter((j) => j.overdue).length;
    const callback = open.filter((j) => j.callback).length;
    const ready = open.filter((j) => j.status === 'ready').length;
    const parts: string[] = [];
    if (late) parts.push(`เลยวันนัด ${late} เครื่อง`);
    if (callback) parts.push(`ลูกค้าขอให้โทรกลับ ${callback} ราย`);
    if (ready) parts.push(`เสร็จรอลูกค้ามารับ ${ready} เครื่อง`);
    return parts.length ? parts.join(', ') : `ในร้าน ${open.length} เครื่อง ไม่มีงานเลยวันนัด`;
  }, [open]);

  function drop(e: DragEvent, to: JobStatus) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/job'));
    const job = rows.find((j) => j.id === id);
    if (!job || job.status === to) return;
    if (to === 'awaiting_approval') {
      toast('ส่งราคาจากหน้างานนั้น ระบบจะย้ายมาที่รอลูกค้าอนุมัติให้เอง', 'error');
      navigate(`/shop/jobs/${job.id}`);
      return;
    }
    if (NEEDS_DETAILS.includes(to)) setTarget({ jobId: job.id, jobNo: job.jobNo, to, etaDate: job.etaDate });
    else move.mutate({ jobId: job.id, to, visibleToCustomer: true });
  }

  const techs = team.data?.filter((u) => u.role === 'technician' || u.role === 'owner' || u.role === 'admin') ?? [];

  return (
    <div className="page page--wide">
      <header className="titlerow">
        <div>
          <h1 className="title">{me.role === 'technician' ? 'งานของฉัน' : 'กระดานงาน'}</h1>
          <p className="subline">{jobs.data ? finding : ' '}</p>
        </div>
        {atLeast(me, 'staff') && (
          <Link to="/shop/intake" className="btn btn--primary">
            <ClipboardPlus aria-hidden="true" />
            รับเครื่องใหม่
          </Link>
        )}
      </header>

      <div className="toolbar">
        <label className="search">
          <Search aria-hidden="true" />
          <span className="visually-hidden">ค้นหางาน</span>
          <input type="search" placeholder="ค้นเลขงาน ชื่อ เบอร์ รุ่น หรือ IMEI" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {me.role !== 'technician' && (
          <select className="input input--select toolbar__select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="ดูงานของช่าง">
            <option value="all">ช่างทุกคน</option>
            <option value="none">ยังไม่มีช่างรับ</option>
            {techs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <span className="toolbar__end">
          <span className="t-small t-muted num">{open.length} เครื่องในร้าน</span>
          <Segmented
            label="มุมมอง"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              {
                value: 'board',
                label: (
                  <>
                    <KanbanSquare aria-hidden="true" />
                    กระดาน
                  </>
                ),
              },
              {
                value: 'list',
                label: (
                  <>
                    <LayoutList aria-hidden="true" />
                    รายการ
                  </>
                ),
              },
            ]}
          />
        </span>
      </div>

      <QueryState loading={jobs.isLoading} error={jobs.error} onRetry={() => jobs.refetch()}>
        {view === 'board' ? (
          <div className="board" role="list" aria-label="งานแยกตามสถานะ">
            {COLUMNS.map((status) => {
              const items = open.filter((j) => j.status === status);
              return (
                <section
                  key={status}
                  className={`col${dragOver === status ? ' col--over' : ''}`}
                  role="listitem"
                  aria-labelledby={`col-${status}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(status);
                  }}
                  onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
                  onDrop={(e) => drop(e, status)}
                >
                  <h2 className="col__head" id={`col-${status}`}>
                    <span className={`col__dot col__dot--${STATUS_TONE[status]}`} aria-hidden="true" />
                    {STATUS_LABEL[status]}
                    <span className="col__count num">{items.length}</span>
                  </h2>
                  <ul className="col__cards">
                    {items.map((j) => (
                      <li key={j.id}>
                        <JobCard j={j} />
                      </li>
                    ))}
                    {items.length === 0 && <li className="col__empty">ไม่มีงาน</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <JobList rows={rows} />
        )}
        {rows.length === 0 && debounced && <Empty title={`ไม่พบงานที่ตรงกับ "${debounced}"`}>ลองค้นด้วยเบอร์โทร 4 ตัวท้าย หรือเลขงานเต็ม เช่น R2611-0042</Empty>}
      </QueryState>
      <MoveDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function Flags({ j }: { j: BoardJob }) {
  if (j.callback)
    return (
      <span className="flag flag--negative">
        <PhoneCall aria-hidden="true" />
        ลูกค้าขอให้โทรกลับ
      </span>
    );
  if (j.status === 'awaiting_approval' && j.quote?.status === 'sent') return <span className="flag">ส่งราคา {fmt.baht(j.quote.total)} บาท รอตอบ</span>;
  if (j.status === 'awaiting_approval' && j.quote?.status === 'rejected') return <span className="flag flag--warning">ลูกค้าไม่ซ่อม รอคืนเครื่อง</span>;
  if (j.status === 'waiting_parts' && j.waitingReason)
    return (
      <span className="flag flag--orange">
        รอ{j.waitingReason.replace(/^รอ/, '')}
        {j.waitingUntil ? ` ถึง ${fmt.calDM(j.waitingUntil)}` : ''}
      </span>
    );
  if (j.status === 'ready' && j.completedAt) {
    const d = Math.floor((Date.now() - new Date(j.completedAt).getTime()) / 86400_000);
    return (
      <span className={`flag${d >= 30 ? ' flag--warning' : ''}`}>
        {j.result === 'not_repaired' ? 'ไม่ซ่อม ' : ''}เสร็จมา {d} วัน
      </span>
    );
  }
  return null;
}

function Eta({ j }: { j: BoardJob }) {
  if (j.status === 'ready') return null;
  const n = daysFromToday(j.etaDate);
  return (
    <span className={`eta${j.overdue ? ' eta--late' : n === 0 ? ' eta--today' : ''}`}>
      นัด {fmt.calWeekdayShort(j.etaDate)} {fmt.calDM(j.etaDate)}
      {j.overdue && <span className="eta__late"> เลย {-n} วัน</span>}
    </span>
  );
}

function JobCard({ j }: { j: BoardJob }) {
  return (
    <Link
      to={`/shop/jobs/${j.id}`}
      className={`card${j.overdue ? ' card--late' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/job', String(j.id));
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      {j.thumbUrl && <img className="card__photo" src={j.thumbUrl} alt="" loading="lazy" />}
      <span className="card__id">
        <span className="code card__no">
          {!j.thumbUrl && <CategoryIcon c={j.category} />}
          {j.jobNo}
        </span>
        <strong className="card__device">{j.device}</strong>
      </span>
      <span className="card__who">
        {j.customerName}
        <span className="t-muted"> {j.reportedIssue}</span>
      </span>
      <Flags j={j} />
      <span className="card__foot">
        <Eta j={j} />
        <Person id={j.assignee?.id ?? null} name={j.assignee?.name ?? 'ยังไม่มีช่างรับ'} />
      </span>
    </Link>
  );
}

function JobList({ rows }: { rows: BoardJob[] }) {
  if (!rows.length) return <Empty title="ยังไม่มีงานในร้าน">กดรับเครื่องใหม่เพื่อเริ่มงานแรก</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>งาน</th>
          <th>สถานะ</th>
          <th>ช่าง</th>
          <th className="num">นัด</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((j) => (
          <tr key={j.id}>
            <td>
              <Link to={`/shop/jobs/${j.id}`} className="rowlink">
                <span className="thumb thumb--sm">{j.thumbUrl ? <img src={j.thumbUrl} alt="" loading="lazy" /> : <CategoryIcon c={j.category} />}</span>
                <span className="rowlink__text">
                  <strong>{j.device}</strong>
                  <span className="t-small t-muted">
                    <span className="code">{j.jobNo}</span> {j.customerName} {j.customerPhone}
                  </span>
                </span>
              </Link>
            </td>
            <td>
              <span className="stack" style={{ ['--stack' as string]: '4px' }}>
                <StatusPill status={j.status} label={j.statusLabel} />
                <Flags j={j} />
              </span>
            </td>
            <td>{j.assignee ? <Person id={j.assignee.id} name={j.assignee.name} withName /> : <span className="t-faint">-</span>}</td>
            <td className="num">{j.status === 'delivered' && j.deliveredAt ? <span className="t-muted">ส่งมอบ {fmt.dayMonth(j.deliveredAt)}</span> : <Eta j={j} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

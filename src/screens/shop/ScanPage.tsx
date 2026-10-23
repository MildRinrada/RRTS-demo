import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '../../api/hooks';
import { api, errorMessage } from '../../api/client';
import type { BoardJob } from '../../api/types';
import { Scanner } from '../../components/Scanner';
import { useToast } from '../../components/Toast';
import { Button, Empty, Notice, QueryState, StatusPill, TextField } from '../../components/ui';
import { fmt } from '../../lib/format';
import { useUser } from './ShopLayout';

/** What a scanned QR holds: our sticker link, a bare sticker token, or something else. */
function parseCode(text: string): { sticker?: string; customer?: boolean; jobNo?: string } {
  const s = /\/s\/([A-Za-z0-9]{22})\b/.exec(text);
  if (s) return { sticker: s[1] };
  if (/^[A-Za-z0-9]{22}$/.test(text)) return { sticker: text };
  if (/\/j\/[A-Za-z0-9]{22}\b/.test(text)) return { customer: true };
  const no = /R\d{4}-\d{4}/i.exec(text);
  if (no) return { jobNo: no[0].toUpperCase() };
  return {};
}

/** The technician's phone: point at the sticker on a device and its job opens. */
export function ScanPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [jobNo, setJobNo] = useState('');
  const [msg, setMsg] = useState('');

  const open = useCallback(
    async (text: string) => {
      const code = parseCode(text);
      setMsg('');
      if (code.customer) return setMsg('นี่คือ QR บนใบรับเครื่องของลูกค้า ให้สแกนสติกเกอร์ที่ติดตัวเครื่องแทน');
      setBusy(true);
      try {
        if (code.sticker) {
          const { id } = await api.get<{ id: number }>(`/shop/jobs/by-sticker/${code.sticker}`);
          navigator.vibrate?.(40);
          navigate(`/shop/jobs/${id}`);
          return;
        }
        if (code.jobNo) {
          const rows = await api.get<BoardJob[]>(`/shop/jobs?q=${encodeURIComponent(code.jobNo)}&status=received,diagnosing,awaiting_approval,repairing,waiting_parts,ready,delivered,cancelled`);
          const hit = rows.find((r) => r.jobNo === code.jobNo);
          if (hit) return navigate(`/shop/jobs/${hit.id}`);
          setMsg(`ไม่พบงาน ${code.jobNo}`);
          return;
        }
        setMsg('QR นี้ไม่ใช่สติกเกอร์ของร้าน');
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        setBusy(false);
      }
    },
    [navigate, toast],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (jobNo.trim()) void open(jobNo.trim());
  }

  return (
    <div className="page">
      <header className="titlerow">
        <div>
          <h1 className="title">สแกนสติกเกอร์</h1>
          <p className="subline">เปิดงานจาก QR ที่ติดตัวเครื่อง ไม่ต้องค้นชื่อ กันเครื่องสลับกัน</p>
        </div>
      </header>
      <div className="split">
        <div className="stack">
          <Scanner paused={busy} onCode={(t) => void open(t)} />
          {msg && <Notice tone="warning">{msg}</Notice>}
          <form className="codeform" onSubmit={submit}>
            <TextField label="หรือพิมพ์เลขงาน" placeholder="R2611-0042" autoCapitalize="characters" value={jobNo} onChange={(e) => setJobNo(e.target.value.toUpperCase())} />
            <Button type="submit" loading={busy}>
              เปิดงาน
            </Button>
          </form>
        </div>
        <Queue />
      </div>
    </div>
  );
}

/** Beside the camera: the work waiting on this person, so the next device is one tap away. */
function Queue() {
  const me = useUser();
  const jobs = useQuery({ queryKey: ['board', '', 'scan'], queryFn: () => api.get<BoardJob[]>('/shop/jobs') });
  const rows = (jobs.data ?? []).filter((j) => j.status !== 'ready' && (me.role !== 'technician' || j.assignee?.id === me.id || !j.assignee)).slice(0, 8);
  return (
    <section className="panel stack" aria-labelledby="queue-h">
      <h2 className="panel__title" id="queue-h">
        {me.role === 'technician' ? 'งานของฉันและคิวที่ยังไม่มีคนรับ' : 'งานที่ยังไม่เสร็จ เรียงตามวันนัด'}
      </h2>
      <QueryState loading={jobs.isLoading} error={jobs.error}>
        {rows.length ? (
          <ul className="queue">
            {rows.map((j) => (
              <li key={j.id}>
                <Link to={`/shop/jobs/${j.id}`} className="queue__row">
                  <span className="rowlink__text">
                    <strong>{j.device}</strong>
                    <span className="t-small t-muted">
                      <span className="code">{j.jobNo}</span> นัด {fmt.calDM(j.etaDate)}
                      {j.overdue && <span className="t-negative"> เลยนัด</span>}
                    </span>
                  </span>
                  <StatusPill status={j.status} label={j.statusLabel} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="ไม่มีงานค้าง" />
        )}
      </QueryState>
    </section>
  );
}

/** A sticker scanned with the phone's own camera app lands here: resolve it and open the job. */
export function StickerOpen() {
  const { token = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!me.data) return;
    api
      .get<{ id: number }>(`/shop/jobs/by-sticker/${token}`)
      .then(({ id }) => navigate(`/shop/jobs/${id}`, { replace: true }))
      .catch(setError);
  }, [me.data, token, navigate]);
  if (!me.isLoading && !me.data) return <Navigate to={`/login?next=${encodeURIComponent(`/s/${token}`)}`} replace />;
  return (
    <div className="page page--narrow">
      <QueryState loading={!error} error={error}>
        {null}
      </QueryState>
    </div>
  );
}

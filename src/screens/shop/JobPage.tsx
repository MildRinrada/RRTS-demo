import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, ChevronDown, Copy, Eye, EyeOff, ExternalLink, Hand, KeyRound, Phone, PhoneCall, Printer, Sticker } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useTeam } from '../../api/hooks';
import type { JobDetail, JobStatus, PayMethod, PhotoKind } from '../../api/types';
import { PhotoPicker, PickedPhoto } from '../../components/PhotoPicker';
import { Person } from '../../components/Person';
import { useToast } from '../../components/Toast';
import { Baht, Button, Checkbox, Dialog, LinkButton, Notice, QueryState, Segmented, StatusPill, TextArea, TextField } from '../../components/ui';
import { daysFromToday, fmt, METHOD_LABEL, MOVE_LABEL, PHOTO_LABEL, relDay, STATUS_TONE, telHref, todayYmd } from '../../lib/format';
import { MoveDialog, MoveTarget, NEEDS_DETAILS, useMoveJob } from './MoveDialog';
import { QuotePanel } from './QuotePanel';
import { atLeast, useUser } from './ShopLayout';

/** The next step a job usually takes from each status; the others sit in the "change status" menu. */
const NEXT: Partial<Record<JobStatus, JobStatus>> = { received: 'diagnosing', repairing: 'ready', waiting_parts: 'repairing' };

export function JobPage() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api.get<JobDetail>(`/shop/jobs/${id}`), refetchInterval: 30_000 });
  return (
    <div className="page page--wide">
      <Link to="/shop" className="backlink">
        <ArrowLeft aria-hidden="true" />
        กระดานงาน
      </Link>
      <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
        {q.data && <Job job={q.data} />}
      </QueryState>
    </div>
  );
}

function useSetJob() {
  const qc = useQueryClient();
  return (j: JobDetail) => {
    qc.setQueryData(['job', j.id], j);
    void qc.invalidateQueries({ queryKey: ['board'] });
  };
}

function Job({ job }: { job: JobDetail }) {
  const me = useUser();
  const toast = useToast();
  const setJob = useSetJob();
  const [target, setTarget] = useState<MoveTarget | null>(null);
  const move = useMoveJob();
  const latest = job.quotes.find((q) => q.status !== 'draft');
  const next = NEXT[job.status];
  const open = !['delivered', 'cancelled'].includes(job.status);

  const claim = useMutation({ mutationFn: () => api.post<JobDetail>(`/shop/jobs/${job.id}/claim`), onSuccess: setJob, onError: (e) => toast(errorMessage(e), 'error') });
  const callbackDone = useMutation({ mutationFn: () => api.patch<JobDetail>(`/shop/jobs/${job.id}`, { callbackDone: true }), onSuccess: setJob, onError: (e) => toast(errorMessage(e), 'error') });
  const copy = useMutation({
    mutationFn: () => api.get<{ text: string }>(`/shop/jobs/${job.id}/update-message`),
    onSuccess: ({ text }) =>
      navigator.clipboard.writeText(text).then(
        () => toast('คัดลอกข้อความแล้ว วางในแชท LINE ของลูกค้าได้เลย'),
        () => toast('คัดลอกไม่ได้ในเบราว์เซอร์นี้', 'error'),
      ),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  function go(to: JobStatus) {
    if (NEEDS_DETAILS.includes(to)) return setTarget({ jobId: job.id, jobNo: job.jobNo, to, etaDate: job.etaDate });
    move.mutate({ jobId: job.id, to, visibleToCustomer: true });
  }

  const others = job.moves.filter((m) => m !== next && m !== 'cancelled');
  return (
    <>
      <header className="titlerow titlerow--job">
        <div className="job__id">
          <div className="cluster">
            <h1 className="title code">{job.jobNo}</h1>
            <StatusPill status={job.status} label={job.statusLabel} />
          </div>
          <p className="subline">
            {job.device.label}, {job.customer.fullName}{' '}
            <a href={telHref(job.customer.phone)} className="nowrap">
              {job.customer.phone}
            </a>
          </p>
        </div>
        <div className="cluster job__actions">
          <Button onClick={() => copy.mutate()} loading={copy.isPending}>
            <Copy aria-hidden="true" />
            คัดลอกข้อความอัปเดต
          </Button>
          <details className="menu">
            <summary className="btn">
              <Printer aria-hidden="true" />
              พิมพ์
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className="menu__list">
              <a href={`#/print/intake/${job.id}`} target="_blank" rel="noopener">
                ใบรับเครื่อง A5
              </a>
              <a href={`#/print/intake/${job.id}?size=80mm`} target="_blank" rel="noopener">
                ใบรับเครื่อง 80 มม.
              </a>
              <a href={`#/print/sticker/${job.id}`} target="_blank" rel="noopener">
                <Sticker aria-hidden="true" />
                สติกเกอร์ QR ติดเครื่อง
              </a>
              {job.status === 'delivered' && atLeast(me, 'staff') && (
                <>
                  <a href={`#/print/receipt/${job.id}`} target="_blank" rel="noopener">
                    ใบเสร็จและใบรับประกัน A5
                  </a>
                  <a href={`#/print/receipt/${job.id}?size=80mm`} target="_blank" rel="noopener">
                    ใบเสร็จ 80 มม.
                  </a>
                </>
              )}
            </div>
          </details>
          <LinkButton href={job.statusUrl} target="_blank" rel="noopener" variant="ghost">
            <ExternalLink aria-hidden="true" />
            หน้าที่ลูกค้าเห็น
          </LinkButton>
        </div>
      </header>

      {job.callbackAt && (
        <Notice
          tone="warning"
          title="ลูกค้าขอให้ร้านโทรกลับก่อนตัดสินใจเรื่องราคา"
          action={
            <span className="cluster">
              <LinkButton href={telHref(job.customer.phone)} size="sm">
                <PhoneCall aria-hidden="true" />
                โทร
              </LinkButton>
              <Button size="sm" onClick={() => callbackDone.mutate()} loading={callbackDone.isPending}>
                โทรแล้ว
              </Button>
            </span>
          }
        >
          ขอเมื่อ {fmt.dateTime(job.callbackAt)}
        </Notice>
      )}
      {job.status === 'awaiting_approval' && latest?.status === 'rejected' && (
        <Notice tone="warning" title="ลูกค้าเลือกไม่ซ่อม">
          ปิดงานเป็น "ไม่ซ่อม คืนสภาพเดิม" เพื่อให้ลูกค้ามารับเครื่องคืน{job.inspectionFee > 0 ? ` ค่าตรวจเช็ค ${fmt.baht(job.inspectionFee)} บาท` : ''} หรือแจ้งราคาใหม่ถ้าตกลงกันได้
        </Notice>
      )}

      <div className="jobgrid">
        <div className="jobgrid__main">
          <PromiseCard job={job} onMove={go} next={next} others={others} moving={move.isPending} />
          <QuotePanel job={job} />
          <Timeline job={job} />
          <Photos job={job} />
        </div>
        <aside className="jobgrid__rail" aria-label="ข้อมูลประกอบ">
          {job.status === 'ready' && atLeast(me, 'staff') && (
            <Link to={`/shop/jobs/${job.id}/handover`} className="btn btn--primary btn--lg btn--block">
              <Hand aria-hidden="true" />
              ส่งมอบเครื่องให้ลูกค้า
            </Link>
          )}
          {atLeast(me, 'staff') && job.money && <MoneyPanel job={job} />}
          <section className="panel stack" aria-labelledby="dev-h">
            <h2 className="panel__title" id="dev-h">
              เครื่องและอาการ
            </h2>
            <dl className="kv">
              <div>
                <dt>เครื่อง</dt>
                <dd>{job.device.label}</dd>
              </div>
              <div>
                <dt>IMEI/S/N</dt>
                <dd className="num">{job.device.serialOrImei ?? '-'}</dd>
              </div>
              <div>
                <dt>อาการที่แจ้ง</dt>
                <dd>{job.reportedIssue}</dd>
              </div>
              <div>
                <dt>ของที่ให้มา</dt>
                <dd>{job.accessories.length ? job.accessories.join(', ') : 'เครื่องเปล่า'}</dd>
              </div>
              <div>
                <dt>สภาพตอนรับ</dt>
                <dd>
                  {job.condition.checks?.length ? job.condition.checks.join(', ') : 'ไม่พบรอยเสียหาย'}
                  {', '}เปิด{job.condition.powersOn === 'yes' ? 'ติด' : job.condition.powersOn === 'no' ? 'ไม่ติด' : ' ไม่ได้ลอง'}
                  {job.condition.note && <span className="t-muted"> {job.condition.note}</span>}
                </dd>
              </div>
              <div>
                <dt>รับเครื่อง</dt>
                <dd>
                  {fmt.dateTime(job.receivedAt)}
                  {job.receivedBy && <span className="t-muted"> โดย {job.receivedBy}</span>}
                </dd>
              </div>
            </dl>
            <Passcode job={job} />
          </section>
          <section className="panel stack" aria-labelledby="who-h">
            <h2 className="panel__title" id="who-h">
              ช่างและลูกค้า
            </h2>
            <Assignee job={job} onClaim={() => claim.mutate()} claiming={claim.isPending} />
            <div className="kv kv--block">
              <p>
                {atLeast(me, 'staff') ? <Link to={`/shop/customers/${job.customer.id}`}>{job.customer.fullName}</Link> : job.customer.fullName}{' '}
                <a href={telHref(job.customer.phone)} className="nowrap">
                  <Phone aria-hidden="true" className="inline-icon" />
                  {job.customer.phone}
                </a>
              </p>
              {job.customer.note && <p className="t-small t-muted">{job.customer.note}</p>}
              <p className="t-small t-muted">{job.customer.lineLinked ? 'ผูก LINE แล้ว ลูกค้าเปิดดูงานใน LINE ได้' : 'ยังไม่ได้ผูก LINE'}</p>
            </div>
            {job.intakeSignatureUrl && (
              <figure className="sigthumb">
                <img src={job.intakeSignatureUrl} alt="ลายเซ็นลูกค้าตอนรับเครื่อง" />
                <figcaption className="t-small t-muted">เซ็นยอมรับเงื่อนไขฉบับ {job.termsVersion}</figcaption>
              </figure>
            )}
          </section>
          {open && atLeast(me, 'staff') && job.moves.includes('cancelled') && (
            <Button variant="danger" onClick={() => setTarget({ jobId: job.id, jobNo: job.jobNo, to: 'cancelled', etaDate: job.etaDate })}>
              ยกเลิกงานนี้
            </Button>
          )}
        </aside>
      </div>
      <MoveDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

/* ---------------- the promise to the customer ---------------- */

function PromiseCard({ job, onMove, next, others, moving }: { job: JobDetail; onMove: (to: JobStatus) => void; next?: JobStatus; others: JobStatus[]; moving: boolean }) {
  const setJob = useSetJob();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [eta, setEta] = useState(job.etaDate);
  const [why, setWhy] = useState('');
  const save = useMutation({
    mutationFn: () => api.patch<JobDetail>(`/shop/jobs/${job.id}`, { etaDate: eta, etaNote: why || null }),
    onSuccess: (j) => {
      setJob(j);
      setEditing(false);
      setWhy('');
      toast('ปรับวันนัดแล้ว ลูกค้าเห็นในหน้าสถานะ');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const open = !['ready', 'delivered', 'cancelled'].includes(job.status);
  const n = daysFromToday(job.etaDate);
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }
  return (
    <section className={`panel promise promise--${STATUS_TONE[job.status]}`} aria-labelledby="promise-h">
      <div className="promise__answer">
        <h2 className="panel__label" id="promise-h">
          {open ? 'บอกลูกค้าว่าได้เครื่องคืน' : job.status === 'ready' ? 'เสร็จเมื่อ' : job.status === 'delivered' ? 'ส่งมอบเมื่อ' : 'ปิดงานเมื่อ'}
        </h2>
        {open ? (
          <p className="promise__date">
            {fmt.calWeekday(job.etaDate)} {fmt.calDML(job.etaDate)}
            <span className={`promise__rel${n < 0 ? ' promise__rel--late' : ''}`}>{relDay(job.etaDate)}</span>
          </p>
        ) : (
          <p className="promise__date">
            {job.status === 'ready' && job.completedAt ? fmt.dateTime(job.completedAt) : job.deliveredAt ? fmt.dateTime(job.deliveredAt) : '-'}
            {job.status === 'ready' && job.completedAt && <span className="promise__rel">รอลูกค้ามา {Math.floor((Date.now() - new Date(job.completedAt).getTime()) / 86400_000)} วัน</span>}
          </p>
        )}
        {job.status === 'waiting_parts' && job.waitingReason && (
          <p className="promise__why">
            รอ{job.waitingReason.replace(/^รอ/, '')}
            {job.waitingUntil && ` คาดว่าได้ ${fmt.calDML(job.waitingUntil)}`}
          </p>
        )}
        {job.queuePosition !== null && <p className="promise__why">คิวตรวจลำดับที่ {job.queuePosition} ลูกค้าเห็นลำดับนี้</p>}
        {job.status === 'delivered' && job.warrantyUntil && (
          <p className="promise__why">
            รับประกัน {job.warrantyDays} วัน ถึง {fmt.cal(job.warrantyUntil)}
          </p>
        )}
        {open && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            เลื่อนวันนัด
          </Button>
        )}
        {editing && (
          <form className="promise__edit" onSubmit={submit}>
            <TextField label="วันนัดใหม่" type="date" min={todayYmd()} value={eta} onChange={(e) => setEta(e.target.value)} />
            <TextField label="เหตุผลที่บอกลูกค้า" optional placeholder="เช่น อะไหล่ส่งช้ากว่าที่ร้านค้าแจ้ง" value={why} onChange={(e) => setWhy(e.target.value)} />
            <div className="cluster">
              <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
                บันทึก
              </Button>
              <Button size="sm" onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
            </div>
          </form>
        )}
      </div>
      {(next || others.length > 0) && (
        <div className="promise__moves">
          {next && (
            <Button variant="primary" onClick={() => onMove(next)} loading={moving}>
              {MOVE_LABEL[next]}
            </Button>
          )}
          {others.map((m) => (
            <Button key={m} onClick={() => onMove(m)} disabled={moving}>
              {m === 'ready' ? 'ปิดงาน (ซ่อมเสร็จหรือไม่ซ่อม)' : MOVE_LABEL[m]}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

function Assignee({ job, onClaim, claiming }: { job: JobDetail; onClaim: () => void; claiming: boolean }) {
  const me = useUser();
  const team = useTeam();
  const setJob = useSetJob();
  const toast = useToast();
  const assign = useMutation({
    mutationFn: (assignedTo: number | null) => api.patch<JobDetail>(`/shop/jobs/${job.id}`, { assignedTo }),
    onSuccess: (j) => {
      setJob(j);
      toast(j.assignee ? `มอบงานให้${j.assignee.name}แล้ว` : 'เอาช่างออกจากงานแล้ว');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (me.role === 'technician') {
    return job.assignee ? (
      <p className="cluster">
        <Person id={job.assignee.id} name={job.assignee.name} withName />
      </p>
    ) : (
      <Button variant="primary" onClick={onClaim} loading={claiming}>
        รับงานนี้
      </Button>
    );
  }
  return (
    <label className="field">
      <span className="field__label">ช่างที่รับผิดชอบ</span>
      <select
        className="input input--select"
        value={job.assignee?.id ?? ''}
        disabled={['delivered', 'cancelled'].includes(job.status) || assign.isPending}
        onChange={(e) => assign.mutate(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">ยังไม่มีช่างรับ</option>
        {team.data?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Passcode({ job }: { job: JobDetail }) {
  const toast = useToast();
  const [shown, setShown] = useState<string | null>(null);
  const reveal = useMutation({
    mutationFn: () => api.post<{ passcode: string }>(`/shop/jobs/${job.id}/passcode`),
    onSuccess: (r) => setShown(r.passcode),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (!job.hasPasscode) return <p className="t-small t-muted">{job.status === 'delivered' ? 'รหัสปลดล็อกถูกลบแล้วตอนส่งมอบ' : 'ไม่มีรหัสปลดล็อก'}</p>;
  if (!job.canSeePasscode)
    return (
      <p className="t-small t-muted">
        <KeyRound aria-hidden="true" className="inline-icon" />
        มีรหัสปลดล็อก เห็นได้เฉพาะช่างที่รับงานนี้
      </p>
    );
  return (
    <div className="passcode">
      <KeyRound aria-hidden="true" />
      {shown ? <span className="code passcode__value">{shown}</span> : <span className="t-muted">รหัสปลดล็อก</span>}
      <Button size="sm" variant="ghost" onClick={() => (shown ? setShown(null) : reveal.mutate())} loading={reveal.isPending}>
        {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {shown ? 'ซ่อน' : 'ดูรหัส'}
      </Button>
    </div>
  );
}

/* ---------------- money ---------------- */

function MoneyPanel({ job }: { job: JobDetail }) {
  const m = job.money!;
  const setJob = useSetJob();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const pay = useMutation({
    mutationFn: () => api.post<JobDetail>(`/shop/jobs/${job.id}/payments`, { amount: Number(amount), method }),
    onSuccess: (j) => {
      setJob(j);
      setOpen(false);
      setAmount('');
      toast('บันทึกรับเงินแล้ว');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const closed = ['delivered', 'cancelled'].includes(job.status);
  return (
    <section className="panel stack" aria-labelledby="money-h">
      <div className="panel__head">
        <h2 className="panel__title" id="money-h">
          ค่าซ่อม
        </h2>
        {!closed && (
          <Button size="sm" onClick={() => setOpen(true)}>
            รับเงิน
          </Button>
        )}
      </div>
      <dl className="kv kv--money">
        <div>
          <dt>{job.result === 'not_repaired' ? 'ค่าตรวจเช็ค' : 'ราคาที่อนุมัติ'}</dt>
          <dd>{m.charge === null ? <span className="t-muted">ยังไม่มีราคาที่อนุมัติ</span> : <Baht value={m.charge} />}</dd>
        </div>
        <div>
          <dt>รับแล้ว</dt>
          <dd>
            <Baht value={m.paid} />
          </dd>
        </div>
        <div>
          <dt>ค้างชำระ</dt>
          <dd>{m.due === null ? <span className="t-faint">-</span> : <Baht value={m.due} strong />}</dd>
        </div>
      </dl>
      {job.payments.length > 0 && (
        <ul className="paylist">
          {job.payments.map((p) => (
            <li key={p.id}>
              <span>
                {METHOD_LABEL[p.method]} <span className="t-small t-muted">{fmt.dateTime(p.paidAt)}</span>
              </span>
              <span className="num">{fmt.baht(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="รับเงิน">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            pay.mutate();
          }}
        >
          <TextField
            label="จำนวนเงิน"
            type="number"
            inputMode="numeric"
            min={1}
            suffix="บาท"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={m.due ? `ค้างชำระ ${fmt.baht(m.due)} บาท รับเป็นมัดจำบางส่วนได้` : 'ยังไม่มีราคาที่อนุมัติ รับเป็นมัดจำได้'}
            autoFocus
          />
          <div className="field">
            <span className="field__label">ช่องทาง</span>
            <Segmented label="ช่องทางชำระ" value={method} onChange={setMethod} options={(Object.keys(METHOD_LABEL) as PayMethod[]).map((k) => ({ value: k, label: METHOD_LABEL[k] }))} />
          </div>
          <div className="dialog__actions">
            <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" variant="primary" disabled={!Number(amount)} loading={pay.isPending}>
              บันทึก
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

/* ---------------- timeline and notes ---------------- */

function Timeline({ job }: { job: JobDetail }) {
  const setJob = useSetJob();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(true);
  const add = useMutation({
    mutationFn: () => api.post<JobDetail>(`/shop/jobs/${job.id}/notes`, { note, visibleToCustomer: visible }),
    onSuccess: (j) => {
      setJob(j);
      setNote('');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const rows = [...job.events].reverse();
  return (
    <section className="panel stack" aria-labelledby="tl-h">
      <h2 className="panel__title" id="tl-h">
        ไทม์ไลน์
      </h2>
      {!['delivered', 'cancelled'].includes(job.status) && (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) add.mutate();
          }}
        >
          <TextArea label="บันทึกงาน" rows={2} placeholder="เช่น เปิดเครื่องแล้ว พบแพรจอขาด ต้องเปลี่ยนจอทั้งชุด" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="composer__foot">
            <Checkbox checked={visible} onChange={setVisible}>
              ให้ลูกค้าเห็น
            </Checkbox>
            <Button type="submit" size="sm" disabled={!note.trim()} loading={add.isPending}>
              เพิ่มบันทึก
            </Button>
          </div>
        </form>
      )}
      <ol className="tl">
        {rows.map((e) => (
          <li key={e.id}>
            <span className={`tl__dot${e.to ? ` tl__dot--${STATUS_TONE[e.to]}` : ''}`} aria-hidden="true" />
            <div className="tl__body">
              <p>{e.note ?? (e.to ? `เปลี่ยนเป็น ${MOVE_LABEL[e.to]}` : '')}</p>
              <p className="t-small t-muted">
                {fmt.dateTime(e.at)} {e.actor}
                {!e.visibleToCustomer && (
                  <span className="tl__private">
                    <EyeOff aria-hidden="true" />
                    ภายในร้าน
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Photos({ job }: { job: JobDetail }) {
  const setJob = useSetJob();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<PhotoKind>('before');
  const [visible, setVisible] = useState(true);
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [view, setView] = useState<number | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const f = new FormData();
      f.append('kind', kind);
      f.append('visibleToCustomer', String(visible));
      picked.forEach((p, i) => f.append('photos', p.blob, `photo-${i + 1}.jpg`));
      return api.post<JobDetail>(`/shop/jobs/${job.id}/photos`, f);
    },
    onSuccess: (j) => {
      setJob(j);
      setPicked([]);
      setAdding(false);
      toast('เพิ่มรูปแล้ว');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const toggle = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) => api.patch<JobDetail>(`/shop/jobs/${job.id}/photos/${id}`, { visibleToCustomer: v }),
    onSuccess: setJob,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const shown = job.photos.find((p) => p.id === view);
  return (
    <section className="panel stack" aria-labelledby="ph-h">
      <div className="panel__head">
        <h2 className="panel__title" id="ph-h">
          รูปหลักฐาน
        </h2>
        {!adding && job.status !== 'cancelled' && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Camera aria-hidden="true" />
            เพิ่มรูป
          </Button>
        )}
      </div>
      {adding && (
        <div className="stack addphotos">
          <Segmented label="รูปนี้คือ" value={kind} onChange={setKind} options={(['before', 'after', 'removed_part', 'other'] as PhotoKind[]).map((k) => ({ value: k, label: PHOTO_LABEL[k] }))} />
          <PhotoPicker photos={picked} onChange={setPicked} hint="อย่าถ่ายให้เห็นข้อความหรือรูปส่วนตัวบนจอ" />
          <Checkbox checked={visible} onChange={setVisible} detail="รูปอะไหล่ที่ถอดออกและรูปหลังซ่อมช่วยให้ลูกค้ามั่นใจว่าซ่อมจริง">
            ให้ลูกค้าเห็นในหน้าสถานะ
          </Checkbox>
          <div className="cluster">
            <Button variant="primary" size="sm" disabled={!picked.length} onClick={() => upload.mutate()} loading={upload.isPending}>
              อัปโหลด {picked.length || ''} รูป
            </Button>
            <Button size="sm" onClick={() => (setAdding(false), setPicked([]))}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
      {job.photos.length ? (
        <ul className="jphotos">
          {job.photos.map((p) => (
            <li key={p.id}>
              <button type="button" className="jphotos__img" onClick={() => setView(p.id)} aria-label={`ดูรูป${PHOTO_LABEL[p.kind]}`}>
                <img src={p.url} alt="" loading="lazy" />
              </button>
              <span className="jphotos__meta">
                <span className="t-small">{PHOTO_LABEL[p.kind]}</span>
                {p.kind === 'intake' ? (
                  <span className="t-small t-muted">ลูกค้าเห็นเสมอ</span>
                ) : (
                  <button type="button" className="linkbtn t-small" onClick={() => toggle.mutate({ id: p.id, v: !p.visibleToCustomer })}>
                    {p.visibleToCustomer ? 'ลูกค้าเห็น' : 'ซ่อนจากลูกค้า'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-muted">ยังไม่มีรูป</p>
      )}
      <Dialog open={Boolean(shown)} onClose={() => setView(null)} title={shown ? `${PHOTO_LABEL[shown.kind]} ${fmt.dateTime(shown.at)}${shown.takenBy ? ` โดย ${shown.takenBy}` : ''}` : ''} wide>
        {shown && <img className="lightbox" src={shown.url} alt={`รูป${PHOTO_LABEL[shown.kind]}`} />}
      </Dialog>
    </section>
  );
}

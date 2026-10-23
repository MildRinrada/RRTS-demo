import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Download, MessageCircle, Phone, PhoneCall, Wrench } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { JobStatus, PublicJob } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button, Dialog, LinkButton, QueryState } from '../../components/ui';
import { daysFromToday, fmt, ITEM_LABEL, PHOTO_LABEL, relDay, STATUS_TONE, telHref } from '../../lib/format';

/**
 * The customer's page, opened from the QR on the intake slip. It answers one question first,
 * "when do I get my device back", in the largest type on the page, and the reason when it waits.
 */
export function StatusPage() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['public-job', token], queryFn: () => api.get<PublicJob>(`/public/jobs/${token}`), refetchInterval: 60_000 });
  const job = q.data;
  return (
    <div className="cust">
      <header className="cust__bar">
        <div className="cust__bar-in">
          <span className="shopmark shopmark--md">
            {job?.shop.logoUrl ? (
              <img className="shopmark__img" src={job.shop.logoUrl} alt="" />
            ) : (
              <span className="shopmark__mono" aria-hidden="true">
                {Array.from((job?.shop.shopName ?? '').replace(/^ร้าน\s*/, ''))[0] ?? ''}
              </span>
            )}
            <span className="shopmark__name">{job?.shop.shopName ?? ''}</span>
          </span>
          <span className="cluster">
            {job?.shop.lineOaUrl && (
              <a className="iconbtn iconbtn--line" href={job.shop.lineOaUrl} target="_blank" rel="noopener" aria-label="แชท LINE ของร้าน">
                <MessageCircle aria-hidden="true" />
              </a>
            )}
            {job?.shop.phone && (
              <a className="iconbtn" href={telHref(job.shop.phone)} aria-label={`โทรหาร้าน ${job.shop.phone}`}>
                <Phone aria-hidden="true" />
              </a>
            )}
          </span>
        </div>
      </header>
      <main className="cust__main" id="main">
        <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
          {job && <Content job={job} token={token} />}
        </QueryState>
      </main>
    </div>
  );
}

function Content({ job, token }: { job: PublicJob; token: string }) {
  return (
    <>
      {job.pendingQuote && <Approval job={job} token={token} />}
      <Answer job={job} token={token} />
      <Tag job={job} />
      <Steps job={job} />
      <Timeline job={job} />
      {job.photos.length > 0 && <Photos job={job} />}
      {job.quotes.some((q) => q.status === 'approved') && <ApprovedPrice job={job} />}
      <ShopFoot job={job} />
    </>
  );
}

/* ---------------- the answer ---------------- */

function Answer({ job, token }: { job: PublicJob; token: string }) {
  if (job.status === 'ready') {
    const due = job.money?.due ?? 0;
    return (
      <section className="answer answer--ready" aria-labelledby="answer-h">
        <p className="answer__q">{job.result === 'not_repaired' ? 'ไม่ได้ซ่อม' : 'ซ่อมเสร็จแล้ว'}</p>
        <h1 className="answer__big" id="answer-h">
          มารับเครื่องได้เลย
        </h1>
        <p className="answer__sub">
          {due > 0 ? (
            <>
              ยอดชำระตอนรับเครื่อง <strong className="num">{fmt.baht(due)} บาท</strong>
            </>
          ) : (
            'ชำระครบแล้ว นำใบรับเครื่องมาด้วย'
          )}
        </p>
        {job.shop.promptpayImageUrl && (
          <figure className="promptpay">
            <img src={job.shop.promptpayImageUrl} alt={`QR พร้อมเพย์ของ${job.shop.shopName}`} />
            <figcaption>สแกนจ่ายผ่านพร้อมเพย์ได้ แล้วแสดงสลิปตอนรับเครื่อง</figcaption>
          </figure>
        )}
        {job.shop.address && <p className="answer__note">{job.shop.address}</p>}
      </section>
    );
  }
  if (job.status === 'delivered') {
    return (
      <section className="answer answer--done" aria-labelledby="answer-h">
        <p className="answer__q">รับเครื่องคืนแล้ว {job.deliveredAt && fmt.date(job.deliveredAt)}</p>
        <h1 className="answer__big" id="answer-h">
          {job.warrantyUntil ? `รับประกันถึง ${fmt.calDML(job.warrantyUntil)}` : 'ขอบคุณที่ใช้บริการ'}
        </h1>
        {job.warrantyUntil && (
          <p className="answer__sub">
            {daysFromToday(job.warrantyUntil) >= 0 ? `เหลืออีก ${daysFromToday(job.warrantyUntil)} วัน ถ้าอาการเดิมกลับมา ติดต่อร้านพร้อมใบรับประกัน` : 'หมดระยะรับประกันแล้ว'}
          </p>
        )}
        {job.hasWarrantyPdf && (
          <LinkButton href={`#/print/warranty/${token}`} target="_blank" rel="noopener">
            <Download aria-hidden="true" />
            ใบเสร็จและใบรับประกัน (PDF)
          </LinkButton>
        )}
      </section>
    );
  }
  if (job.status === 'cancelled') {
    return (
      <section className="answer answer--done" aria-labelledby="answer-h">
        <h1 className="answer__big" id="answer-h">
          ยกเลิกงานซ่อมแล้ว
        </h1>
        <p className="answer__sub">ถ้าสงสัยเรื่องงานนี้ ติดต่อร้านได้ที่ปุ่มโทรด้านบน</p>
      </section>
    );
  }
  const late = daysFromToday(job.etaDate) < 0;
  return (
    <section className="answer" aria-labelledby="answer-h">
      <p className="answer__q">ได้เครื่องคืนประมาณ</p>
      <h1 className="answer__big" id="answer-h">
        {fmt.calWeekday(job.etaDate)} {fmt.calDML(job.etaDate)}
      </h1>
      <p className="answer__sub">{late ? 'เลยวันที่ร้านแจ้งไว้แล้ว ร้านกำลังเร่งให้ ติดต่อร้านได้ทุกเมื่อ' : relDay(job.etaDate)}</p>
      {job.status === 'waiting_parts' && job.waitingReason && (
        <div className="why why--orange">
          <strong>ตอนนี้รอ{job.waitingReason.replace(/^รอ/, '')}</strong>
          {job.waitingUntil && (
            <span>
              คาดว่าของถึง {fmt.calWeekday(job.waitingUntil)} {fmt.calDML(job.waitingUntil)}
            </span>
          )}
        </div>
      )}
      {job.queuePosition !== null && (
        <div className="why">
          <strong>{job.queuePosition === 1 ? 'เครื่องของคุณเป็นคิวถัดไป' : `อยู่ในคิวตรวจลำดับที่ ${job.queuePosition}`}</strong>
          <span>ร้านจะตรวจอาการแล้วแจ้งราคาให้คุณอนุมัติก่อนเริ่มซ่อมทุกครั้ง</span>
        </div>
      )}
      {job.status === 'awaiting_approval' && !job.pendingQuote && (
        <div className="why why--yellow">
          <strong>ร้านรอคำตอบเรื่องราคาจากคุณ</strong>
        </div>
      )}
    </section>
  );
}

/* ---------------- quote to approve ---------------- */

function Approval({ job, token }: { job: PublicJob; token: string }) {
  const quote = job.pendingQuote!;
  const qc = useQueryClient();
  const toast = useToast();
  const [ask, setAsk] = useState<'approve' | 'reject' | null>(null);
  const respond = useMutation({
    mutationFn: (decision: 'approve' | 'reject' | 'callback') => api.post<PublicJob>(`/public/jobs/${token}/quotes/${quote.id}/respond`, { decision }),
    onSuccess: (data, decision) => {
      qc.setQueryData(['public-job', token], data);
      setAsk(null);
      toast(decision === 'approve' ? 'อนุมัติแล้ว ร้านจะเริ่มซ่อมให้' : decision === 'reject' ? 'บันทึกแล้วว่าไม่ซ่อม มารับเครื่องคืนได้' : 'ส่งคำขอให้ร้านโทรกลับแล้ว');
    },
    onError: (e) => {
      setAsk(null);
      toast(errorMessage(e), 'error');
      void qc.invalidateQueries({ queryKey: ['public-job', token] });
    },
  });
  return (
    <section className="approve" aria-labelledby="approve-h">
      <h2 id="approve-h" className="approve__title">
        {quote.version > 1 ? 'ร้านแจ้งราคาใหม่ รอคุณอนุมัติ' : 'ร้านแจ้งราคาซ่อม รอคุณอนุมัติ'}
      </h2>
      <p className="approve__total num">
        {fmt.baht(quote.total)} <span className="unit">บาท</span>
      </p>
      {quote.previousTotal !== null && <p className="t-small">ราคาที่คุณอนุมัติไว้ก่อนหน้า {fmt.baht(quote.previousTotal)} บาท ร้านพบปัญหาเพิ่มระหว่างซ่อม</p>}
      <table className="lines">
        <tbody>
          {quote.items.map((i, n) => (
            <tr key={n}>
              <td>
                {i.description}
                <span className="lines__kind">{ITEM_LABEL[i.kind]}</span>
              </td>
              <td className="num">{i.qty > 1 ? `${i.qty} x ${fmt.baht(i.unitPrice)}` : ''}</td>
              <td className="num">{fmt.baht(i.qty * i.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-small">
        ร้านเริ่มซ่อมหลังคุณกดอนุมัติเท่านั้น ค่าแรงเป็นราคาต่อรายการ ไม่คิดเพิ่มตามเวลา{job.inspectionFee > 0 ? ` ถ้าไม่ซ่อม มีค่าตรวจเช็ค ${fmt.baht(job.inspectionFee)} บาท` : ''}
      </p>
      {quote.status === 'callback' && <p className="approve__flag">คุณขอให้ร้านโทรกลับแล้ว ตัดสินใจได้ที่นี่ทุกเมื่อ</p>}
      <div className="approve__actions">
        <Button size="lg" onClick={() => setAsk('approve')}>
          <CircleCheck aria-hidden="true" />
          อนุมัติ ซ่อมเลย
        </Button>
        <Button size="lg" onClick={() => setAsk('reject')}>
          ไม่ซ่อม
        </Button>
      </div>
      {quote.status !== 'callback' && (
        <Button variant="ghost" onClick={() => respond.mutate('callback')} loading={respond.isPending && respond.variables === 'callback'}>
          <PhoneCall aria-hidden="true" />
          ขอให้ร้านโทรกลับก่อน
        </Button>
      )}
      <Dialog open={ask !== null} onClose={() => setAsk(null)} title={ask === 'approve' ? `อนุมัติราคา ${fmt.baht(quote.total)} บาท` : 'ยืนยันว่าไม่ซ่อม'}>
        <p>
          {ask === 'approve'
            ? 'ร้านจะเริ่มซ่อมตามรายการนี้ ถ้าพบปัญหาเพิ่ม ร้านจะแจ้งราคาใหม่ให้อนุมัติก่อนทุกครั้ง'
            : `ร้านจะคืนเครื่องสภาพเดิม${job.inspectionFee > 0 ? ` มีค่าตรวจเช็ค ${fmt.baht(job.inspectionFee)} บาท` : ''}`}
        </p>
        <div className="dialog__actions">
          <Button onClick={() => setAsk(null)}>กลับไปดูก่อน</Button>
          <Button variant="primary" loading={respond.isPending} onClick={() => ask && respond.mutate(ask)}>
            {ask === 'approve' ? 'อนุมัติ' : 'ยืนยัน ไม่ซ่อม'}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

/* ---------------- the repair tag ---------------- */

function Tag({ job }: { job: PublicJob }) {
  return (
    <section className="tag" aria-label="ข้อมูลงานซ่อม">
      <div className="tag__row">
        <span className="tag__no code">{job.jobNo}</span>
        <span className={`pill pill--${STATUS_TONE[job.status]}`}>
          <span className="pill__dot" aria-hidden="true" />
          {job.statusLabel}
        </span>
      </div>
      <p className="tag__device">{job.device}</p>
      <p className="t-small t-muted">
        {job.customerName} {job.phone}, รับเครื่อง {fmt.date(job.receivedAt)}
      </p>
    </section>
  );
}

const STEPS: { key: string; label: string; at: JobStatus[] }[] = [
  { key: 'in', label: 'รับเครื่อง', at: ['received'] },
  { key: 'check', label: 'ตรวจเช็ค', at: ['diagnosing'] },
  { key: 'price', label: 'อนุมัติราคา', at: ['awaiting_approval'] },
  { key: 'fix', label: 'ซ่อม', at: ['repairing', 'waiting_parts'] },
  { key: 'ready', label: 'รอรับ', at: ['ready'] },
  { key: 'out', label: 'รับคืน', at: ['delivered'] },
];

function Steps({ job }: { job: PublicJob }) {
  if (job.status === 'cancelled') return null;
  const current = STEPS.findIndex((s) => s.at.includes(job.status));
  return (
    <ol className="steps" aria-label="ขั้นตอนงานซ่อม">
      {STEPS.map((s, i) => {
        const label = s.key === 'fix' && job.result === 'not_repaired' ? 'ไม่ซ่อม' : s.key === 'fix' && job.status === 'waiting_parts' ? 'รออะไหล่' : s.label;
        return (
          <li key={s.key} className={i < current ? 'steps__done' : i === current ? 'steps__now' : undefined} aria-current={i === current ? 'step' : undefined}>
            <span className="steps__mark" aria-hidden="true" />
            <span className="steps__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- what happened ---------------- */

function Timeline({ job }: { job: PublicJob }) {
  const rows = [...job.timeline].reverse();
  return (
    <section className="csec" aria-labelledby="tl-h">
      <h2 className="csec__title" id="tl-h">
        ร้านทำอะไรไปแล้วบ้าง
      </h2>
      <ol className="ctl">
        {rows.map((e, i) => (
          <li key={e.id} className={i === 0 ? 'ctl__latest' : undefined}>
            <span className={`ctl__dot ctl__dot--${e.status ? STATUS_TONE[e.status] : 'note'}`} aria-hidden="true" />
            <div>
              <p className="ctl__text">{e.text}</p>
              <p className="ctl__at">{fmt.dateTime(e.at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Photos({ job }: { job: PublicJob }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = open !== null ? job.photos.find((p) => p.id === open) : null;
  return (
    <section className="csec" aria-labelledby="ph-h">
      <h2 className="csec__title" id="ph-h">
        รูปเครื่องของคุณ
      </h2>
      <ul className="cphotos">
        {job.photos.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p.id)} aria-label={`ดูรูป${PHOTO_LABEL[p.kind]} ${fmt.dateTime(p.at)}`}>
              <img src={p.url} alt="" loading="lazy" />
            </button>
            <span className="t-small">{PHOTO_LABEL[p.kind]}</span>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(shown)} onClose={() => setOpen(null)} title={shown ? `${PHOTO_LABEL[shown.kind]} ${fmt.dateTime(shown.at)}` : ''} wide>
        {shown && <img className="lightbox" src={shown.url} alt={`รูป${PHOTO_LABEL[shown.kind]}`} />}
      </Dialog>
    </section>
  );
}

function ApprovedPrice({ job }: { job: PublicJob }) {
  const q = job.quotes.find((x) => x.status === 'approved')!;
  return (
    <section className="csec" aria-labelledby="pr-h">
      <h2 className="csec__title" id="pr-h">
        ราคาที่อนุมัติแล้ว
      </h2>
      <table className="lines">
        <tbody>
          {q.items.map((i, n) => (
            <tr key={n}>
              <td>{i.description}</td>
              <td className="num">{fmt.baht(i.qty * i.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>รวม</td>
            <td className="num">{fmt.baht(q.total)} บาท</td>
          </tr>
        </tfoot>
      </table>
      <p className="t-small t-muted">
        {q.respondedVia === 'preapproved' ? 'อยู่ในวงเงินที่คุณตกลงไว้ตอนส่งซ่อม' : q.respondedVia === 'phone' ? 'อนุมัติทางโทรศัพท์' : 'คุณอนุมัติผ่านลิงก์นี้'}
        {q.respondedAt && ` เมื่อ ${fmt.dateTime(q.respondedAt)}`}
      </p>
    </section>
  );
}

function ShopFoot({ job }: { job: PublicJob }) {
  const s = job.shop;
  return (
    <footer className="cfoot">
      <p className="cfoot__name">
        <Wrench aria-hidden="true" />
        {s.shopName}
      </p>
      {s.address && <p>{s.address}</p>}
      <div className="cluster">
        {s.phone && (
          <LinkButton href={telHref(s.phone)} size="sm">
            <Phone aria-hidden="true" />
            {s.phone}
          </LinkButton>
        )}
        {s.lineOaUrl && (
          <LinkButton href={s.lineOaUrl} size="sm" target="_blank" rel="noopener">
            <MessageCircle aria-hidden="true" />
            แชท LINE
          </LinkButton>
        )}
      </div>
      {s.liffId || s.devLiff ? (
        <p className="t-small">
          <Link to="/me">ดูเครื่องทั้งหมดที่เคยส่งซ่อมและประกันที่เหลือ ใน LINE</Link>
        </p>
      ) : null}
    </footer>
  );
}

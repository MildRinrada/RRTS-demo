import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { ItemKind, JobDetail, LaborPreset, Quote, QuoteItem } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button, Dialog, Notice, Pill } from '../../components/ui';
import { fmt, ITEM_LABEL } from '../../lib/format';
import { atLeast, useUser } from './ShopLayout';

const QUOTE_TONE = { draft: 'neutral', sent: 'warning', approved: 'positive', rejected: 'negative', callback: 'accent' } as const;
const QUOTE_LABEL = { draft: 'ร่าง ยังไม่ส่ง', sent: 'รอลูกค้าตอบ', approved: 'อนุมัติแล้ว', rejected: 'ไม่ซ่อม', callback: 'ขอให้โทรกลับ' } as const;
const VIA = { link: 'กดในลิงก์', liff: 'กดใน LINE', phone: 'แจ้งทางโทรศัพท์', preapproved: 'อยู่ในวงเงินที่ตกลงตอนรับเครื่อง', superseded: 'ถูกแทนด้วยราคาใหม่' } as Record<string, string>;

const QUOTABLE = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'waiting_parts'];

/**
 * Itemised price for the customer to approve. Labour is a fixed price per line from the shop's
 * standard list, never hours. A sent version is frozen; a price change is a new version.
 */
export function QuotePanel({ job }: { job: JobDetail }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const set = (j: JobDetail) => {
    qc.setQueryData(['job', j.id], j);
    void qc.invalidateQueries({ queryKey: ['board'] });
  };
  const draft = job.quotes.find((q) => q.status === 'draft');
  const history = job.quotes.filter((q) => q.status !== 'draft');
  const latest = history[0];
  const create = useMutation({ mutationFn: () => api.post<JobDetail>(`/shop/jobs/${job.id}/quotes`), onSuccess: set, onError: (e) => toast(errorMessage(e), 'error') });
  const answer = useMutation({
    mutationFn: ({ quote, decision }: { quote: Quote; decision: 'approve' | 'reject' }) => api.post<JobDetail>(`/shop/quotes/${quote.id}/respond`, { decision, jobId: job.id }),
    onSuccess: (j) => {
      set(j);
      toast('บันทึกคำตอบของลูกค้าแล้ว');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const canQuote = QUOTABLE.includes(job.status);
  const pending = latest && (latest.status === 'sent' || latest.status === 'callback');

  return (
    <section className="panel stack" aria-labelledby="quote-h">
      <div className="panel__head">
        <h2 className="panel__title" id="quote-h">
          ราคาให้ลูกค้าอนุมัติ
        </h2>
        {canQuote && !draft && (
          <Button size="sm" onClick={() => create.mutate()} loading={create.isPending}>
            <Plus aria-hidden="true" />
            {latest ? 'แจ้งราคาใหม่' : 'เขียนใบเสนอราคา'}
          </Button>
        )}
      </div>
      {job.preApprovedAmount !== null && <p className="t-small t-muted">ลูกค้าให้ซ่อมได้เลยถ้าไม่เกิน {fmt.baht(job.preApprovedAmount)} บาท ราคาในวงเงินนี้ระบบอนุมัติให้ตอนส่ง</p>}
      {draft && <DraftEditor job={job} quote={draft} onSaved={set} />}
      {!draft && !latest && <p className="t-muted">ยังไม่ได้แจ้งราคา ตรวจเช็คแล้วเขียนรายการอะไหล่และค่าแรง ลูกค้าจะกดอนุมัติจากหน้าสถานะ</p>}
      {history.map((q, i) => (
        <article key={q.id} className={`qv${i > 0 ? ' qv--old' : ''}`}>
          <header className="qv__head">
            <span className="t-strong">ฉบับที่ {q.version}</span>
            <Pill tone={QUOTE_TONE[q.status]}>{q.respondedVia === 'superseded' ? 'ถูกแทนด้วยราคาใหม่' : QUOTE_LABEL[q.status]}</Pill>
            <span className="qv__total num">{fmt.baht(q.total)} บาท</span>
          </header>
          {i === 0 && (
            <table className="lines">
              <tbody>
                {q.items.map((it, n) => (
                  <tr key={n}>
                    <td>
                      {it.description}
                      <span className="lines__kind">{ITEM_LABEL[it.kind]}</span>
                    </td>
                    <td className="num">{it.qty > 1 ? `${it.qty} x ${fmt.baht(it.unitPrice)}` : ''}</td>
                    <td className="num">{fmt.baht(it.qty * it.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="t-small t-muted">
            {q.sentAt && `ส่งเมื่อ ${fmt.dateTime(q.sentAt)}`}
            {q.createdBy && ` โดย ${q.createdBy}`}
            {q.respondedAt && q.respondedVia !== 'superseded' && `, ลูกค้าตอบ ${fmt.dateTime(q.respondedAt)} (${VIA[q.respondedVia ?? ''] ?? q.respondedVia})`}
          </p>
        </article>
      ))}
      {pending && atLeast(me, 'staff') && (
        <div className="phoneanswer">
          <span className="t-small t-muted">ลูกค้าตอบทางโทรศัพท์</span>
          <Button size="sm" onClick={() => answer.mutate({ quote: latest!, decision: 'approve' })} loading={answer.isPending && answer.variables?.decision === 'approve'}>
            บันทึกว่าอนุมัติ
          </Button>
          <Button size="sm" onClick={() => answer.mutate({ quote: latest!, decision: 'reject' })} loading={answer.isPending && answer.variables?.decision === 'reject'}>
            บันทึกว่าไม่ซ่อม
          </Button>
        </div>
      )}
    </section>
  );
}

function DraftEditor({ job, quote, onSaved }: { job: JobDetail; quote: Quote; onSaved: (j: JobDetail) => void }) {
  const toast = useToast();
  const presets = useQuery({ queryKey: ['presets'], queryFn: () => api.get<LaborPreset[]>('/shop/labor-presets') });
  const [items, setItems] = useState<QuoteItem[]>(quote.items);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setItems(quote.items), [quote.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0), [items]);
  const dirty = JSON.stringify(items) !== JSON.stringify(quote.items);
  const valid = items.length > 0 && items.every((i) => i.description.trim() && i.qty >= 1 && i.unitPrice >= 0);
  const pre = job.preApprovedAmount !== null && total <= job.preApprovedAmount;

  const save = useMutation({
    mutationFn: () =>
      api.patch<JobDetail>(`/shop/quotes/${quote.id}`, { items: items.map((i) => ({ kind: i.kind, description: i.description.trim(), qty: Number(i.qty), unitPrice: Number(i.unitPrice) })) }),
    onSuccess: (j) => {
      onSaved(j);
      toast('บันทึกร่างแล้ว');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const send = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync();
      return api.post<JobDetail>(`/shop/quotes/${quote.id}/send`);
    },
    onSuccess: (j) => {
      onSaved(j);
      setConfirm(false);
      toast(j.latestQuoteStatus === 'approved' ? 'อยู่ในวงเงินที่ลูกค้าตกลงไว้ อนุมัติแล้ว เริ่มซ่อมได้' : 'ส่งราคาแล้ว ลูกค้ากดอนุมัติได้ในหน้าสถานะ');
    },
    onError: (e) => {
      setConfirm(false);
      toast(errorMessage(e), 'error');
    },
  });
  const remove = useMutation({ mutationFn: () => api.del<JobDetail>(`/shop/quotes/${quote.id}`), onSuccess: onSaved, onError: (e) => toast(errorMessage(e), 'error') });

  const upd = (i: number, patch: Partial<QuoteItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = (kind: ItemKind, description = '', unitPrice = 0) => setItems((xs) => [...xs, { kind, description, qty: 1, unitPrice }]);
  const list = (presets.data ?? []).filter((p) => p.category === null || p.category === job.device.category);

  return (
    <div className="draft">
      <p className="t-small">
        <Pill tone="neutral">ฉบับที่ {quote.version} ร่าง</Pill> ลูกค้ายังไม่เห็นจนกว่าจะกดส่ง
      </p>
      <div className="draft__rows" role="table" aria-label="รายการในใบเสนอราคา">
        <div className="draft__row draft__row--head" role="row">
          <span role="columnheader">ประเภท</span>
          <span role="columnheader">รายการ</span>
          <span role="columnheader" className="num">
            จำนวน
          </span>
          <span role="columnheader" className="num">
            ราคาต่อหน่วย
          </span>
          <span role="columnheader" className="num">
            รวม
          </span>
          <span />
        </div>
        {items.map((it, i) => (
          <div className="draft__row" role="row" key={i}>
            <select className="input input--select" aria-label="ประเภท" value={it.kind} onChange={(e) => upd(i, { kind: e.target.value as ItemKind })}>
              {(Object.keys(ITEM_LABEL) as ItemKind[]).map((k) => (
                <option key={k} value={k}>
                  {ITEM_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              className="input"
              aria-label="รายการ"
              value={it.description}
              placeholder={it.kind === 'part' ? 'เช่น จอ iPhone 13 OLED' : 'ชื่อรายการ'}
              onChange={(e) => upd(i, { description: e.target.value })}
            />
            <input className="input num" aria-label="จำนวน" type="number" min={1} inputMode="numeric" value={it.qty} onChange={(e) => upd(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
            <input
              className="input num"
              aria-label="ราคาต่อหน่วย (บาท)"
              type="number"
              min={0}
              inputMode="numeric"
              value={it.unitPrice}
              onChange={(e) => upd(i, { unitPrice: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
            <span className="num draft__sum">{fmt.baht(it.qty * it.unitPrice)}</span>
            <button type="button" className="iconbtn" aria-label={`ลบ ${it.description || 'รายการนี้'}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div className="cluster">
        <Button size="sm" onClick={() => add('part')}>
          <Plus aria-hidden="true" />
          อะไหล่
        </Button>
        <select
          className="input input--select draft__preset"
          aria-label="เพิ่มค่าแรงมาตรฐาน"
          value=""
          onChange={(e) => {
            const p = list.find((x) => x.id === Number(e.target.value));
            if (p) add('labor', p.name, p.price);
          }}
        >
          <option value="">+ ค่าแรงมาตรฐาน</option>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {fmt.baht(p.price)} บาท
            </option>
          ))}
        </select>
        {job.inspectionFee > 0 && !items.some((i) => i.kind === 'inspection') && (
          <Button size="sm" variant="ghost" onClick={() => add('inspection', 'ค่าตรวจเช็ค', job.inspectionFee)}>
            <Plus aria-hidden="true" />
            ค่าตรวจเช็ค
          </Button>
        )}
      </div>
      <div className="draft__foot">
        <p>
          รวม <strong className="num draft__total">{fmt.baht(total)}</strong> บาท
        </p>
        <div className="cluster">
          <Button variant="ghost" size="sm" onClick={() => remove.mutate()} loading={remove.isPending}>
            ทิ้งร่าง
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || !valid} loading={save.isPending}>
            บันทึกร่าง
          </Button>
          <Button variant="primary" size="sm" disabled={!valid} onClick={() => setConfirm(true)}>
            <Send aria-hidden="true" />
            ส่งให้ลูกค้า
          </Button>
        </div>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`ส่งราคา ${fmt.baht(total)} บาท`}>
        {pre ? (
          <Notice tone="success">ไม่เกินวงเงิน {fmt.baht(job.preApprovedAmount!)} บาทที่ลูกค้าตกลงตอนรับเครื่อง ระบบจะบันทึกว่าอนุมัติ และเปลี่ยนเป็นกำลังซ่อมทันที</Notice>
        ) : (
          <p>ลูกค้าจะเห็นรายการนี้ในหน้าสถานะและกดอนุมัติหรือไม่ซ่อมได้ งานจะอยู่ที่รอลูกค้าอนุมัติจนกว่าจะตอบ ส่งแล้วแก้ไม่ได้ ถ้าราคาเปลี่ยนต้องออกฉบับใหม่</p>
        )}
        <div className="dialog__actions">
          <Button onClick={() => setConfirm(false)}>กลับไปแก้</Button>
          <Button variant="primary" onClick={() => send.mutate()} loading={send.isPending}>
            ส่งราคา
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

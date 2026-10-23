import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, Printer } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../api/client';
import type { JobDetail, PayMethod, Settings } from '../../api/types';
import { SignaturePad } from '../../components/SignaturePad';
import { Baht, Button, Checkbox, LinkButton, Notice, QueryState, Segmented, TextField } from '../../components/ui';
import { fmt, METHOD_LABEL, todayYmd } from '../../lib/format';
import { RequireRole } from './ShopLayout';

/**
 * Handing the device back: every accessory ticked off, the balance paid, the warranty dated, the
 * customer's signature, and the unlock code erased. Then the receipt and warranty print.
 */
export function Handover() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api.get<JobDetail>(`/shop/jobs/${id}`) });
  return (
    <RequireRole role="staff">
      <div className="page page--wide">
        <Link to={`/shop/jobs/${id}`} className="backlink">
          <ArrowLeft aria-hidden="true" />
          กลับไปที่งาน
        </Link>
        <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
          {q.data &&
            (q.data.status === 'delivered' ? (
              <Delivered job={q.data} />
            ) : q.data.status !== 'ready' ? (
              <Notice tone="warning" title="งานนี้ยังไม่พร้อมส่งมอบ">
                เปลี่ยนสถานะเป็นเสร็จ รอรับเครื่อง ก่อน
              </Notice>
            ) : (
              <HandoverForm job={q.data} />
            ))}
        </QueryState>
      </div>
    </RequireRole>
  );
}

function HandoverForm({ job }: { job: JobDetail }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['shop-pay-config'], queryFn: () => api.get<Pick<Settings, 'promptpayImageUrl'>>('/shop/handover-config') });
  const m = job.money!;
  const [returned, setReturned] = useState<string[]>(job.accessories);
  const [missingNote, setMissingNote] = useState('');
  const [amount, setAmount] = useState(String(m.due ?? 0));
  const [method, setMethod] = useState<PayMethod>('cash');
  const [warranty, setWarranty] = useState(String(job.defaultWarrantyDays));
  const [signature, setSignature] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => setAmount(String(m.due ?? 0)), [m.due]);

  const deliver = useMutation({
    mutationFn: () =>
      api.post<JobDetail>(`/shop/jobs/${job.id}/deliver`, {
        returnedItems: returned,
        missingNote: missingNote.trim() || null,
        signature,
        payment: Number(amount) > 0 ? { amount: Number(amount), method } : null,
        warrantyDays: job.result === 'repaired' ? Number(warranty) : null,
      }),
    onSuccess: (j) => {
      qc.setQueryData(['job', j.id], j);
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
  const errs = fieldErrors(deliver.error);
  const missing = job.accessories.filter((a) => !returned.includes(a));
  const due = m.due ?? 0;
  const paying = Number(amount) || 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!signature || (missing.length && !missingNote.trim()) || paying < due) return;
    deliver.mutate();
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <header className="titlerow">
        <div>
          <h1 className="title">
            ส่งมอบ <span className="code">{job.jobNo}</span>
          </h1>
          <p className="subline">
            {job.device.label}, {job.customer.fullName} {job.customer.phone}
          </p>
        </div>
      </header>
      <div className="intake__grid">
        <div className="intake__main">
          {job.result === 'not_repaired' && <Notice tone="info">งานนี้ไม่ได้ซ่อม คืนเครื่องสภาพเดิม{job.inspectionFee ? ` เก็บค่าตรวจเช็ค ${fmt.baht(job.inspectionFee)} บาท` : ''}</Notice>}

          <section className="panel stack" aria-labelledby="ret-h">
            <h2 className="panel__title" id="ret-h">
              คืนของให้ครบ
            </h2>
            <p className="t-small t-muted">ตัวเครื่อง {job.device.label} พร้อมของที่ลูกค้าให้มา</p>
            {job.accessories.map((a) => (
              <Checkbox key={a} checked={returned.includes(a)} onChange={(v) => setReturned((xs) => (v ? [...xs, a] : xs.filter((x) => x !== a)))}>
                {a}
              </Checkbox>
            ))}
            {job.accessories.length === 0 && <p className="t-small t-muted">ตอนรับเครื่องไม่มีของอื่นให้มา</p>}
            {missing.length > 0 && (
              <TextField
                label={`ไม่ได้คืน: ${missing.join(', ')}`}
                placeholder="เช่น ลูกค้าบอกให้ทิ้งเคสเก่า"
                value={missingNote}
                onChange={(e) => setMissingNote(e.target.value)}
                error={errs.missingNote ?? (tried && !missingNote.trim() ? 'บอกเหตุผลที่ไม่ได้คืน' : undefined)}
              />
            )}
          </section>

          <section className="panel stack" aria-labelledby="pay-h">
            <h2 className="panel__title" id="pay-h">
              รับเงิน
            </h2>
            <dl className="kv kv--money">
              <div>
                <dt>{job.result === 'not_repaired' ? 'ค่าตรวจเช็ค' : 'ราคาที่ลูกค้าอนุมัติ'}</dt>
                <dd>
                  <Baht value={m.charge} />
                </dd>
              </div>
              <div>
                <dt>รับไว้แล้ว</dt>
                <dd>
                  <Baht value={m.paid} />
                </dd>
              </div>
              <div>
                <dt>ต้องรับวันนี้</dt>
                <dd className="kv__lead">
                  <Baht value={due} strong />
                </dd>
              </div>
            </dl>
            {due > 0 && (
              <div className="payrow">
                <div className="stack">
                  <TextField
                    label="รับเงิน"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    suffix="บาท"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    error={tried && paying < due ? `ยังขาดอีก ${fmt.baht(due - paying)} บาท ส่งมอบได้เมื่อชำระครบ` : undefined}
                  />
                  <div className="field">
                    <span className="field__label">ช่องทาง</span>
                    <Segmented label="ช่องทางชำระ" value={method} onChange={setMethod} options={(Object.keys(METHOD_LABEL) as PayMethod[]).map((k) => ({ value: k, label: METHOD_LABEL[k] }))} />
                  </div>
                </div>
                {method === 'promptpay' && settings.data?.promptpayImageUrl && (
                  <figure className="promptpay promptpay--shop">
                    <img src={settings.data.promptpayImageUrl} alt="QR พร้อมเพย์ของร้าน" />
                    <figcaption>หันจอให้ลูกค้าสแกน แล้วตรวจสลิปก่อนกดส่งมอบ</figcaption>
                  </figure>
                )}
              </div>
            )}
            {due === 0 && <p className="t-muted">ชำระครบแล้ว</p>}
          </section>

          {job.result === 'repaired' && (
            <section className="panel stack" aria-labelledby="war-h">
              <h2 className="panel__title" id="war-h">
                รับประกัน
              </h2>
              <TextField
                label="จำนวนวัน"
                type="number"
                inputMode="numeric"
                min={0}
                max={730}
                suffix="วัน"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                hint={Number(warranty) > 0 ? `หมดประกัน ${fmt.cal(todayYmd(Number(warranty)))} พิมพ์อยู่บนใบรับประกัน` : 'ไม่มีการรับประกัน'}
              />
            </section>
          )}
        </div>
        <aside className="intake__rail stack" aria-label="ลายเซ็นและยืนยัน">
          <section className="panel stack" aria-labelledby="sig-h">
            <h2 className="panel__title" id="sig-h">
              ลายเซ็นรับเครื่องคืน
            </h2>
            <SignaturePad label="ให้ลูกค้าตรวจเครื่องแล้วเซ็นรับ" onChange={setSignature} error={tried && !signature ? 'ให้ลูกค้าเซ็นก่อนส่งมอบ' : undefined} />
            {job.hasPasscode && <p className="t-small t-muted">กดส่งมอบแล้ว ระบบลบรหัสปลดล็อกของลูกค้าทิ้งทันที</p>}
          </section>

          {deliver.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(deliver.error)}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={deliver.isPending}>
            ส่งมอบและออกใบเสร็จ
          </Button>
        </aside>
      </div>
    </form>
  );
}

function Delivered({ job }: { job: JobDetail }) {
  return (
    <section className="done panel" aria-labelledby="dl-h">
      <CircleCheck aria-hidden="true" className="done__icon" />
      <h1 className="title" id="dl-h">
        ส่งมอบแล้ว <span className="code">{job.jobNo}</span>
      </h1>
      <p className="subline">
        {job.deliveredAt && fmt.dateTime(job.deliveredAt)}
        {job.warrantyUntil ? `, รับประกันถึง ${fmt.cal(job.warrantyUntil)}` : ''}
      </p>
      <div className="done__actions">
        <LinkButton href={`#/print/receipt/${job.id}`} target="_blank" rel="noopener" variant="primary">
          <Printer aria-hidden="true" />
          ใบเสร็จและใบรับประกัน A5
        </LinkButton>
        <LinkButton href={`#/print/receipt/${job.id}?size=80mm`} target="_blank" rel="noopener">
          <Printer aria-hidden="true" />
          ใบเสร็จ 80 มม.
        </LinkButton>
      </div>
      <Link to="/shop" className="btn btn--ghost">
        กลับกระดานงาน
      </Link>
    </section>
  );
}

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, fieldErrors } from '../../api/client';
import type { JobDetail, JobResult, JobStatus } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button, Checkbox, Dialog, Notice, Segmented, TextArea, TextField } from '../../components/ui';
import { MOVE_LABEL, STATUS_LABEL, todayYmd } from '../../lib/format';

export interface MoveTarget {
  jobId: number;
  jobNo: string;
  to: JobStatus;
  etaDate: string;
}

/** Moves that need more than a click: the customer is told why the job waits, how it ended, or why it stopped. */
export const NEEDS_DETAILS: JobStatus[] = ['waiting_parts', 'ready', 'cancelled'];

export function useMoveJob(onDone?: (job: JobDetail) => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      jobId,
      ...body
    }: {
      jobId: number;
      to: JobStatus;
      note?: string | null;
      visibleToCustomer: boolean;
      result?: JobResult | null;
      waitingReason?: string | null;
      waitingUntil?: string | null;
      etaDate?: string | null;
    }) => api.post<JobDetail>(`/shop/jobs/${jobId}/status`, body),
    onSuccess: (job) => {
      qc.setQueryData(['job', job.id], job);
      void qc.invalidateQueries({ queryKey: ['board'] });
      toast(`${job.jobNo} เป็น "${job.statusLabel}" แล้ว`);
      onDone?.(job);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
}

export function MoveDialog({ target, onClose }: { target: MoveTarget | null; onClose: () => void }) {
  const move = useMoveJob(() => onClose());
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(true);
  const [result, setResult] = useState<JobResult>('repaired');
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState(todayYmd(2));
  const [eta, setEta] = useState('');

  useEffect(() => {
    if (!target) return;
    setNote('');
    setVisible(true);
    setResult('repaired');
    setReason('');
    setUntil(todayYmd(2));
    setEta(target.etaDate);
    move.reset();
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target)
    return (
      <Dialog open={false} onClose={onClose} title="">
        {null}
      </Dialog>
    );
  const errs = fieldErrors(move.error);
  const to = target.to;

  function submit(e: FormEvent) {
    e.preventDefault();
    move.mutate({
      jobId: target!.jobId,
      to,
      note: note.trim() || null,
      visibleToCustomer: visible,
      result: to === 'ready' ? result : null,
      waitingReason: to === 'waiting_parts' ? reason : null,
      waitingUntil: to === 'waiting_parts' ? until : null,
      etaDate: eta && eta !== target!.etaDate ? eta : null,
    });
  }

  const title = to === 'ready' ? `${target.jobNo} เสร็จแล้ว` : `${target.jobNo}: ${MOVE_LABEL[to]}`;
  return (
    <Dialog open onClose={onClose} title={title}>
      <form className="stack" onSubmit={submit} noValidate>
        {to === 'waiting_parts' && (
          <>
            <TextField
              label="รออะไร"
              placeholder="เช่น จอจากผู้จำหน่าย"
              hint="ลูกค้าเห็นข้อความนี้บนหน้าสถานะ"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={errs.waitingReason}
              required
              autoFocus
            />
            <div className="grid2">
              <TextField label="คาดว่าของถึง" type="date" min={todayYmd()} value={until} onChange={(e) => setUntil(e.target.value)} error={errs.waitingUntil} required />
              <TextField label="วันคาดว่าเสร็จใหม่" type="date" min={todayYmd()} value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
          </>
        )}
        {to === 'ready' && (
          <div className="field">
            <span className="field__label">ผลงานซ่อม</span>
            <Segmented
              label="ผลงานซ่อม"
              value={result}
              onChange={setResult}
              options={[
                { value: 'repaired', label: 'ซ่อมเสร็จ ใช้งานได้' },
                { value: 'not_repaired', label: 'ไม่ซ่อม คืนสภาพเดิม' },
              ]}
            />
            {result === 'not_repaired' && <p className="field__hint">คิดค่าตรวจเช็คตามที่แจ้งลูกค้าตอนรับเครื่อง</p>}
          </div>
        )}
        {to !== 'waiting_parts' && to !== 'ready' && to !== 'cancelled' && <TextField label="วันคาดว่าเสร็จ" type="date" min={todayYmd()} value={eta} onChange={(e) => setEta(e.target.value)} />}
        <TextArea
          label={to === 'cancelled' ? 'เหตุผลที่ยกเลิก' : 'บันทึก'}
          optional={to !== 'cancelled'}
          required={to === 'cancelled'}
          rows={2}
          placeholder={to === 'ready' ? 'เช่น ทดสอบชาร์จและทัชครบทุกจุดแล้ว' : to === 'cancelled' ? 'เช่น ลูกค้าขอรับเครื่องคืนก่อนตรวจ คืนเครื่องแล้ว' : ''}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errs.note}
        />
        <Checkbox checked={visible} onChange={setVisible} detail="แสดงในไทม์ไลน์ของหน้าสถานะลูกค้า">
          ให้ลูกค้าเห็นบันทึกนี้
        </Checkbox>
        {move.error && !Object.keys(errs).length && <Notice tone="danger">{errorMessage(move.error)}</Notice>}
        <div className="dialog__actions">
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" variant={to === 'cancelled' ? 'danger' : 'primary'} loading={move.isPending}>
            {to === 'ready' ? 'บันทึกว่าเสร็จ' : `เปลี่ยนเป็น ${STATUS_LABEL[to]}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

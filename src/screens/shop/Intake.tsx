import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, Copy, ExternalLink, Lock, Plus, Printer, RotateCcw, Sticker } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../api/client';
import { useTeam } from '../../api/hooks';
import type { Category, CustomerLookup, IntakeConfig } from '../../api/types';
import { PhotoPicker, PickedPhoto } from '../../components/PhotoPicker';
import { QR } from '../../components/QR';
import { SignaturePad } from '../../components/SignaturePad';
import { useToast } from '../../components/Toast';
import { Button, LinkButton, Notice, QueryState, Segmented, Select, TextArea, TextField, ToggleChip } from '../../components/ui';
import { CATEGORY_LABEL, fmt, relDay, todayYmd } from '../../lib/format';
import { CategoryIcon } from './Board';

const BRANDS: Record<Category, string[]> = {
  phone: ['Apple', 'Samsung', 'OPPO', 'vivo', 'Xiaomi', 'realme', 'Huawei', 'Infinix', 'Honor', 'Nokia'],
  computer: ['Acer', 'ASUS', 'Lenovo', 'HP', 'Dell', 'Apple', 'MSI', 'Huawei', 'Microsoft'],
  appliance: ['Sharp', 'Panasonic', 'Samsung', 'LG', 'Hitachi', 'Toshiba', 'Mitsubishi Electric', 'Hatari', 'Philips', 'Electrolux'],
};
const ACCESSORIES: Record<Category, string[]> = {
  phone: ['ซิม', 'เมมโมรี่', 'เคส', 'ที่ชาร์จ', 'สายชาร์จ', 'ปากกา'],
  computer: ['ที่ชาร์จ', 'กระเป๋า', 'เมาส์', 'ฮาร์ดดิสก์ภายนอก'],
  appliance: ['รีโมท', 'สายไฟ', 'ถาดหรืออุปกรณ์เสริม'],
};
const CONDITIONS: Record<Category, string[]> = {
  phone: ['จอแตก', 'จอมีเส้น', 'ฝาหลังแตก', 'ขอบเครื่องบุบ', 'มีรอยขีดข่วน', 'กล้องแตก', 'ปุ่มกดไม่ได้', 'เคยตกน้ำ', 'เคยแกะซ่อม'],
  computer: ['จอแตก', 'จอมีเส้น', 'บานพับหลวม', 'ฝาบุบ', 'คีย์บอร์ดปุ่มหาย', 'มีรอยขีดข่วน', 'เคยตกน้ำ', 'เคยแกะซ่อม'],
  appliance: ['ตัวเครื่องแตก', 'มีรอยบุบ', 'มีสนิม', 'สายไฟชำรุด', 'เคยแกะซ่อม'],
};
const ISSUES: Record<Category, string[]> = {
  phone: ['จอแตก ทัชไม่ติด', 'แบตหมดเร็ว', 'ชาร์จไม่เข้า', 'ตกน้ำ', 'เปิดไม่ติด', 'ลำโพงไม่ดัง'],
  computer: ['เปิดไม่ติด', 'ช้า ค้างบ่อย', 'ลงวินโดวส์ใหม่', 'จอไม่ขึ้นภาพ', 'คีย์บอร์ดเสีย', 'ร้อน ดับเอง'],
  appliance: ['ไม่ทำงาน', 'ไฟไม่เข้า', 'มีเสียงดัง', 'ไม่ร้อน', 'ไม่เย็น'],
};

interface Created {
  id: number;
  jobNo: string;
  publicToken: string;
  statusUrl: string;
}

const digits = (s: string) => s.replace(/\D/g, '');

export function Intake() {
  const cfg = useQuery({ queryKey: ['intake-config'], queryFn: () => api.get<IntakeConfig>('/shop/intake-config') });
  const [created, setCreated] = useState<Created | null>(null);
  const [round, setRound] = useState(0);
  return (
    <QueryState loading={cfg.isLoading} error={cfg.error} onRetry={() => cfg.refetch()}>
      {cfg.data &&
        (created ? (
          <Done
            job={created}
            onNext={() => {
              setCreated(null);
              setRound((r) => r + 1);
            }}
          />
        ) : (
          <IntakeForm key={round} cfg={cfg.data} onCreated={setCreated} />
        ))}
    </QueryState>
  );
}

function IntakeForm({ cfg, onCreated }: { cfg: IntakeConfig; onCreated: (c: Created) => void }) {
  const team = useTeam();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [category, setCategory] = useState<Category>('phone');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [color, setColor] = useState('');
  const [issue, setIssue] = useState('');
  const [accessories, setAccessories] = useState<string[]>([]);
  const [extraAcc, setExtraAcc] = useState('');
  const [checks, setChecks] = useState<string[]>([]);
  const [powersOn, setPowersOn] = useState<'yes' | 'no' | 'unknown'>('yes');
  const [conditionNote, setConditionNote] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [passcode, setPasscode] = useState('');
  const [eta, setEta] = useState(todayYmd(cfg.defaultEtaDays));
  const [assignee, setAssignee] = useState('');
  const [preApproved, setPreApproved] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  // Look the customer up as soon as the number is complete: a returning customer is filled in.
  const phoneDigits = digits(phone);
  const lookup = useQuery({
    queryKey: ['customer-lookup', phoneDigits],
    queryFn: () => api.get<CustomerLookup>(`/shop/customers?phone=${phoneDigits}`),
    enabled: /^0\d{8,9}$/.test(phoneDigits),
  });
  const known = lookup.data?.customer ?? null;
  useEffect(() => {
    if (known) setFullName((n) => n || known.fullName);
    setDeviceId(null);
  }, [known]);
  const device = known?.devices.find((d) => d.id === deviceId) ?? null;
  const cat = device?.category ?? category;

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!/^0\d{8,9}$/.test(phoneDigits)) m.push('เบอร์โทรลูกค้า');
    if (fullName.trim().length < 2) m.push('ชื่อลูกค้า');
    if (!device && (!brand.trim() || !model.trim())) m.push('ยี่ห้อและรุ่น');
    if (issue.trim().length < 3) m.push('อาการที่ลูกค้าแจ้ง');
    if (!photos.length) m.push('รูปสภาพเครื่องอย่างน้อย 1 รูป');
    if (!signature) m.push('ลายเซ็นลูกค้า');
    return m;
  }, [phoneDigits, fullName, device, brand, model, issue, photos, signature]);

  const submit = useMutation({
    mutationFn: async () => {
      const data = {
        customer: { phone: phoneDigits, fullName: fullName.trim() },
        deviceId: device?.id ?? null,
        device: device ? null : { category, brand: brand.trim(), model: model.trim(), serialOrImei: serial.trim() || null, color: color.trim() || null },
        reportedIssue: issue.trim(),
        accessories,
        condition: { checks, powersOn, note: conditionNote.trim() || null },
        passcode: passcode.trim() || null,
        etaDate: eta,
        preApprovedAmount: preApproved ? Number(preApproved) : null,
        assignedTo: assignee ? Number(assignee) : null,
        signature,
        termsVersion: cfg.termsVersion,
      };
      const form = new FormData();
      form.append('data', JSON.stringify(data));
      photos.forEach((p, i) => form.append('photos', p.blob, `photo-${i + 1}.jpg`));
      return api.post<Created>('/shop/jobs', form);
    },
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['board'] });
      onCreated(c);
    },
  });
  const errs = fieldErrors(submit.error);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (missing.length) return;
    submit.mutate();
  }

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const show = (cond: boolean) => (tried && cond ? 'กรอกช่องนี้' : undefined);

  return (
    <form className="page page--wide intake" onSubmit={onSubmit} noValidate>
      <header className="titlerow">
        <div>
          <h1 className="title">รับเครื่องใหม่</h1>
          <p className="subline">พิมพ์เบอร์โทรก่อน ลูกค้าเก่าระบบเติมชื่อและเครื่องที่เคยซ่อมให้</p>
        </div>
      </header>

      <div className="intake__grid">
        <div className="intake__main">
          <section className="panel stack" aria-labelledby="s-customer">
            <h2 className="panel__title" id="s-customer">
              ลูกค้า
            </h2>
            <div className="grid2">
              <TextField
                label="เบอร์โทร"
                inputMode="tel"
                autoComplete="off"
                placeholder="0812345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={errs['customer.phone'] ?? show(!/^0\d{8,9}$/.test(phoneDigits))}
                required
                autoFocus
              />
              <TextField label="ชื่อ-นามสกุล" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errs['customer.fullName'] ?? show(fullName.trim().length < 2)} required />
            </div>
            {known && (
              <div className="known">
                <p className="t-small">
                  <CircleCheck aria-hidden="true" className="known__icon" />
                  ลูกค้าเก่าของร้าน
                  {known.recentJobs[0] && (
                    <span className="t-muted">
                      {' '}
                      งานล่าสุด {known.recentJobs[0].jobNo} {known.recentJobs[0].device} ({known.recentJobs[0].statusLabel})
                    </span>
                  )}
                </p>
                {known.devices.length > 0 && (
                  <div className="cluster">
                    {known.devices.map((d) => (
                      <ToggleChip key={d.id} on={deviceId === d.id} onClick={() => setDeviceId(deviceId === d.id ? null : d.id)}>
                        <CategoryIcon c={d.category} />
                        {d.label}
                      </ToggleChip>
                    ))}
                    <span className="t-small t-muted">เลือกถ้าเป็นเครื่องเดิม</span>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="panel stack" aria-labelledby="s-device">
            <h2 className="panel__title" id="s-device">
              เครื่อง
            </h2>
            {device ? (
              <p className="known">
                <strong>{device.label}</strong>
                {device.serialOrImei && <span className="t-muted"> IMEI/S/N {device.serialOrImei}</span>}
                <Button size="sm" variant="ghost" onClick={() => setDeviceId(null)}>
                  เปลี่ยนเป็นเครื่องอื่น
                </Button>
              </p>
            ) : (
              <>
                <Segmented
                  label="ประเภทเครื่อง"
                  value={category}
                  onChange={(c) => {
                    setCategory(c);
                    setAccessories([]);
                    setChecks([]);
                  }}
                  options={(['phone', 'computer', 'appliance'] as Category[]).map((c) => ({
                    value: c,
                    label: (
                      <>
                        <CategoryIcon c={c} />
                        {CATEGORY_LABEL[c]}
                      </>
                    ),
                  }))}
                />
                <div className="grid2">
                  <TextField label="ยี่ห้อ" list="brands" value={brand} onChange={(e) => setBrand(e.target.value)} error={errs['device.brand'] ?? show(!brand.trim())} required />
                  <TextField
                    label="รุ่น"
                    placeholder={category === 'phone' ? 'เช่น iPhone 13' : category === 'computer' ? 'เช่น Aspire 5 A515' : 'เช่น R-2221G'}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    error={errs['device.model'] ?? show(!model.trim())}
                    required
                  />
                  <TextField
                    label={category === 'phone' ? 'IMEI' : 'Serial number'}
                    optional
                    hint={category === 'phone' ? 'กด *#06# ที่เครื่อง' : 'ดูที่ป้ายใต้เครื่อง'}
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                  />
                  <TextField label="สี" optional value={color} onChange={(e) => setColor(e.target.value)} />
                </div>
                <datalist id="brands">
                  {BRANDS[category].map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </>
            )}
          </section>

          <section className="panel stack" aria-labelledby="s-issue">
            <h2 className="panel__title" id="s-issue">
              อาการที่ลูกค้าแจ้ง
            </h2>
            <div className="cluster">
              {ISSUES[cat].map((t) => (
                <ToggleChip
                  key={t}
                  on={issue.includes(t)}
                  onClick={() =>
                    setIssue((s) =>
                      s.includes(t)
                        ? s
                            .replace(t, '')
                            .replace(/\s{2,}/g, ' ')
                            .trim()
                        : `${s.trim()} ${t}`.trim(),
                    )
                  }
                >
                  {t}
                </ToggleChip>
              ))}
            </div>
            <TextArea
              label="อาการ"
              rows={2}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              error={errs.reportedIssue ?? show(issue.trim().length < 3)}
              required
              placeholder="จดตามคำลูกค้า เช่น ตกเมื่อวาน จอแตกมุมขวา ทัชไม่ติดครึ่งจอ"
            />
          </section>

          <section className="panel stack" aria-labelledby="s-condition">
            <h2 className="panel__title" id="s-condition">
              ของที่ให้มาและสภาพเครื่อง
            </h2>
            <div className="field">
              <span className="field__label">ของที่ลูกค้าให้มากับเครื่อง</span>
              <div className="cluster">
                {[...ACCESSORIES[cat], ...accessories.filter((a) => !ACCESSORIES[cat].includes(a))].map((a) => (
                  <ToggleChip key={a} on={accessories.includes(a)} onClick={() => toggle(accessories, setAccessories, a)}>
                    {accessories.includes(a) && <Check aria-hidden="true" />}
                    {a}
                  </ToggleChip>
                ))}
                <span className="addchip">
                  <input
                    className="input"
                    placeholder="อื่น ๆ"
                    aria-label="เพิ่มของที่ให้มา"
                    value={extraAcc}
                    onChange={(e) => setExtraAcc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (extraAcc.trim() && !accessories.includes(extraAcc.trim())) setAccessories([...accessories, extraAcc.trim()]);
                        setExtraAcc('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="เพิ่ม"
                    onClick={() => {
                      if (extraAcc.trim() && !accessories.includes(extraAcc.trim())) setAccessories([...accessories, extraAcc.trim()]);
                      setExtraAcc('');
                    }}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </span>
              </div>
              <p className="field__hint">{accessories.length ? `คืนลูกค้าครบ ${accessories.length} อย่างตอนส่งมอบ` : 'ไม่ได้ติ๊ก หมายถึงรับมาแต่ตัวเครื่อง'}</p>
            </div>
            <div className="field">
              <span className="field__label">สภาพที่เห็นตอนรับ</span>
              <div className="cluster">
                {CONDITIONS[cat].map((c) => (
                  <ToggleChip key={c} on={checks.includes(c)} onClick={() => toggle(checks, setChecks, c)}>
                    {checks.includes(c) && <Check aria-hidden="true" />}
                    {c}
                  </ToggleChip>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">เปิดเครื่องติดไหม</span>
              <Segmented
                label="เปิดเครื่องติดไหม"
                value={powersOn}
                onChange={setPowersOn}
                options={[
                  { value: 'yes', label: 'ติด' },
                  { value: 'no', label: 'ไม่ติด' },
                  { value: 'unknown', label: 'ไม่ได้ลอง' },
                ]}
              />
            </div>
            <TextField label="หมายเหตุสภาพเครื่อง" optional value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} placeholder="เช่น รอยร้าวยาวจากมุมบนซ้าย" />
          </section>

          <section className="panel stack" aria-labelledby="s-photos">
            <h2 className="panel__title" id="s-photos">
              รูปสภาพเครื่องตอนรับ
            </h2>
            <PhotoPicker
              photos={photos}
              onChange={setPhotos}
              error={tried && !photos.length ? 'ถ่ายอย่างน้อย 1 รูปก่อนบันทึก รูปนี้ยืนยันว่ารอยหรือจอแตกมีมาก่อน' : undefined}
              hint="ถ่ายด้านหน้า ด้านหลัง และจุดที่เสียหาย อย่าถ่ายให้เห็นข้อความบนจอ ลูกค้าจะเห็นรูปเหล่านี้ในหน้าสถานะ"
            />
          </section>

          <section className="panel stack" aria-labelledby="s-pass">
            <h2 className="panel__title" id="s-pass">
              <Lock aria-hidden="true" className="panel__icon" />
              รหัสปลดล็อกเครื่อง
            </h2>
            <TextField
              label="รหัสหรือแพตเทิร์น"
              optional
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              hint="เก็บแบบเข้ารหัส เฉพาะช่างที่รับงานเห็นได้ และลบทิ้งทันทีที่ส่งมอบ ถ้าเป็นแพตเทิร์นให้จดเป็นตัวเลข 1-9 ตามตำแหน่ง"
            />
          </section>

          <section className="panel stack" aria-labelledby="s-plan">
            <h2 className="panel__title" id="s-plan">
              นัดรับและราคา
            </h2>
            <div className="grid2">
              <div className="field">
                <TextField label="วันคาดว่าเสร็จ" type="date" min={todayYmd()} value={eta} onChange={(e) => setEta(e.target.value)} error={errs.etaDate} required />
                <div className="cluster">
                  {[1, 3, 7].map((d) => (
                    <ToggleChip key={d} on={eta === todayYmd(d)} onClick={() => setEta(todayYmd(d))}>
                      {d === 1 ? 'พรุ่งนี้' : `${d} วัน`}
                    </ToggleChip>
                  ))}
                </div>
              </div>
              <Select label="ช่างที่รับงาน" optional value={assignee} onChange={(e) => setAssignee(e.target.value)} hint="เว้นไว้ได้ ช่างกดรับงานจากคิวเอง">
                <option value="">ยังไม่ระบุ</option>
                {team.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <TextField
              label="ซ่อมได้เลยโดยไม่ต้องถาม ถ้าไม่เกิน"
              optional
              type="number"
              inputMode="numeric"
              min={0}
              suffix="บาท"
              value={preApproved}
              onChange={(e) => setPreApproved(e.target.value)}
              hint="เว้นว่างเมื่อลูกค้าอยากอนุมัติราคาก่อนทุกครั้ง ถ้าราคาจริงเกินวงเงินนี้ ระบบส่งให้ลูกค้าอนุมัติเสมอ"
            />
            {cfg.inspectionFee > 0 && <p className="t-small t-muted">ค่าตรวจเช็คถ้าลูกค้าไม่ซ่อม {fmt.baht(cfg.inspectionFee)} บาท พิมพ์อยู่บนใบรับเครื่อง</p>}
          </section>

          <section className="panel stack" aria-labelledby="s-terms">
            <h2 className="panel__title" id="s-terms">
              เงื่อนไขและลายเซ็นลูกค้า
            </h2>
            <ol className="terms">
              {cfg.termsText
                .split('\n')
                .filter((l) => l.trim())
                .map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
            </ol>
            <p className="t-small t-muted">เงื่อนไขฉบับ {cfg.termsVersion} ระบบเก็บฉบับที่ลูกค้าเซ็นไว้กับงานนี้</p>
            <SignaturePad label="ให้ลูกค้าอ่านแล้วเซ็นยอมรับ" onChange={setSignature} error={tried && !signature ? 'ให้ลูกค้าเซ็นก่อนบันทึก' : undefined} />
          </section>
        </div>

        <aside className="intake__rail" aria-label="สรุปใบรับเครื่อง">
          <div className="slip">
            <p className="slip__head">ใบรับเครื่อง</p>
            <p className="slip__no">ได้เลขงานเมื่อบันทึก</p>
            <dl className="slip__list">
              <div>
                <dt>ลูกค้า</dt>
                <dd>
                  {fullName || '-'} {phoneDigits && <span className="t-muted num">{phoneDigits}</span>}
                </dd>
              </div>
              <div>
                <dt>เครื่อง</dt>
                <dd>{device ? device.label : [brand, model, color && `สี${color}`].filter(Boolean).join(' ') || '-'}</dd>
              </div>
              <div>
                <dt>อาการ</dt>
                <dd>{issue || '-'}</dd>
              </div>
              <div>
                <dt>ของที่ให้มา</dt>
                <dd>{accessories.length ? accessories.join(', ') : 'เครื่องเปล่า'}</dd>
              </div>
              <div>
                <dt>นัดรับ</dt>
                <dd>
                  {fmt.calWeekday(eta)} {fmt.calDML(eta)} <span className="t-muted">({relDay(eta)})</span>
                </dd>
              </div>
              <div>
                <dt>รูป</dt>
                <dd className="num">{photos.length} รูป</dd>
              </div>
            </dl>
            {missing.length > 0 ? (
              <div className="slip__missing">
                <p className="t-small">ยังขาด</p>
                <ul>
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="slip__ready">
                <CircleCheck aria-hidden="true" />
                ครบแล้ว บันทึกได้
              </p>
            )}
            {submit.error && <Notice tone="danger">{errorMessage(submit.error)}</Notice>}
            <Button type="submit" variant="primary" size="lg" block loading={submit.isPending}>
              บันทึกและพิมพ์ใบรับ
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

function Done({ job, onNext }: { job: Created; onNext: () => void }) {
  const toast = useToast();
  return (
    <div className="page page--narrow">
      <section className="done panel" aria-labelledby="done-h">
        <CircleCheck aria-hidden="true" className="done__icon" />
        <h1 className="title" id="done-h">
          รับเครื่องแล้ว <span className="code">{job.jobNo}</span>
        </h1>
        <p className="subline">ให้ลูกค้าสแกน QR นี้ด้วยมือถือตอนนี้ได้เลย หรือสแกนจากใบรับเครื่องทีหลัง</p>
        <QR value={job.statusUrl} label={`QR หน้าสถานะงาน ${job.jobNo}`} className="done__qr" />
        <div className="done__actions">
          <LinkButton href={`#/print/intake/${job.id}`} target="_blank" rel="noopener" variant="primary">
            <Printer aria-hidden="true" />
            พิมพ์ใบรับ A5
          </LinkButton>
          <LinkButton href={`#/print/intake/${job.id}?size=80mm`} target="_blank" rel="noopener">
            <Printer aria-hidden="true" />
            ใบรับ 80 มม.
          </LinkButton>
          <LinkButton href={`#/print/sticker/${job.id}`} target="_blank" rel="noopener">
            <Sticker aria-hidden="true" />
            สติกเกอร์ติดเครื่อง
          </LinkButton>
          <Button
            onClick={() =>
              navigator.clipboard.writeText(job.statusUrl).then(
                () => toast('คัดลอกลิงก์หน้าสถานะแล้ว'),
                () => toast('คัดลอกไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอก', 'error'),
              )
            }
          >
            <Copy aria-hidden="true" />
            คัดลอกลิงก์ให้ลูกค้า
          </Button>
        </div>
        <div className="cluster">
          <Link to={`/shop/jobs/${job.id}`} className="btn btn--ghost">
            <ExternalLink aria-hidden="true" />
            เปิดงานนี้
          </Link>
          <Button variant="ghost" onClick={onNext}>
            <RotateCcw aria-hidden="true" />
            รับเครื่องถัดไป
          </Button>
        </div>
      </section>
    </div>
  );
}

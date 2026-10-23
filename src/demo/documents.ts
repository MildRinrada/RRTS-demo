/**
 * The intake slip, receipt with warranty, and device sticker. The real server renders these HTML
 * templates to PDF with Gotenberg; the demo shows the same HTML and the browser prints it or saves a PDF.
 */
import QRCode from 'qrcode';
import thai400 from '@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-thai-400-normal.woff2?url';
import thai600 from '@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-thai-600-normal.woff2?url';
import thai700 from '@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-thai-700-normal.woff2?url';
import latin400 from '@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-latin-400-normal.woff2?url';
import latin600 from '@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-latin-600-normal.woff2?url';
import latin700 from '@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-latin-700-normal.woff2?url';
import type { Db, Job } from './db';
import { deviceLabel, moneyOf, rel } from './jobs';
import { badRequest, esc, formatPhone, statusLink, stickerLink, thai } from './util';

export type Paper = 'a5' | '80mm';
export interface PrintDoc {
  title: string;
  html: string;
  paper: Paper | 'sticker';
}

const CATEGORY: Record<string, string> = { phone: 'มือถือ/แท็บเล็ต', computer: 'คอมพิวเตอร์/โน้ตบุ๊ก', appliance: 'เครื่องใช้ไฟฟ้า' };
const METHOD: Record<string, string> = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', transfer: 'โอนเงิน', card: 'บัตร' };
const POWERS: Record<string, string> = { yes: 'ติด', no: 'ไม่ติด', unknown: 'ไม่ได้ลอง' };

const RANGES = {
  thai: 'U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC',
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
};
const FONTS: [number, keyof typeof RANGES, string][] = [
  [400, 'thai', thai400],
  [600, 'thai', thai600],
  [700, 'thai', thai700],
  [400, 'latin', latin400],
  [600, 'latin', latin600],
  [700, 'latin', latin700],
];

function fontFaces() {
  return FONTS.map(
    ([weight, range, url]) =>
      `@font-face{font-family:"Plex Thai";font-weight:${weight};font-style:normal;font-display:block;src:url("${new URL(url, location.href).href}") format("woff2");unicode-range:${RANGES[range]};}`,
  ).join('\n');
}

const qr = (text: string) => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#111111', light: '#ffffff' } });
const baht = (n: number) => n.toLocaleString('th-TH');
const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

function base(paper: Paper | 'sticker') {
  const page =
    paper === 'a5'
      ? '@page{size:148mm 210mm;margin:0}.sheet{width:148mm;min-height:210mm;padding:9mm 10mm 8mm}'
      : paper === '80mm'
        ? '@page{size:80mm auto;margin:0}.sheet{width:80mm;padding:4mm 4.5mm 8mm;font-size:8.6pt}.sheet h1{font-size:12pt}.jobno{font-size:17pt!important}.grid{grid-template-columns:1fr!important}.head{flex-direction:column;align-items:flex-start!important}.qrbox{width:30mm!important}'
        : '@page{size:50mm 30mm;margin:0}';
  return `${fontFaces()}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:"Plex Thai",sans-serif;color:#111;font-size:8.8pt;line-height:1.45;font-variant-numeric:tabular-nums}
  p,h1,h2,ul{margin:0}
  ${page}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:4mm;padding-bottom:3mm;border-bottom:1.2pt solid #111}
  .shop{display:flex;gap:3mm;align-items:center}
  .shop img{width:13mm;height:13mm;object-fit:contain}
  .shop b{font-size:11pt;display:block}
  .muted{color:#555}
  h1{font-size:13pt;font-weight:700;margin-top:3.5mm}
  .jobno{font-size:20pt;font-weight:700;letter-spacing:.02em}
  .row{display:flex;justify-content:space-between;align-items:flex-end;gap:4mm}
  .qrbox{width:27mm;text-align:center;font-size:7pt;color:#333}
  .qrbox svg{width:100%;height:auto;display:block}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 5mm;margin-top:3mm}
  .k{font-size:7.4pt;color:#555;display:block}
  .v{font-weight:600}
  .block{margin-top:3mm}
  .chips span{display:inline-block;border:.6pt solid #888;border-radius:1mm;padding:0 1.6mm;margin:0 1mm 1mm 0}
  .terms{margin-top:3mm;padding-top:2mm;border-top:.6pt solid #bbb;font-size:7.4pt;color:#333}
  .terms ol{margin:1mm 0 0;padding-left:4mm}
  .sign{margin-top:3mm;display:flex;justify-content:space-between;gap:6mm;align-items:flex-end}
  .sign figure{margin:0;flex:1;text-align:center;font-size:7.4pt;color:#444}
  .sign img{height:15mm;max-width:100%;object-fit:contain;display:block;margin:0 auto}
  .sign .line{border-top:.6pt solid #111;padding-top:1mm}
  table{width:100%;border-collapse:collapse;margin-top:3mm}
  th{font-weight:400;color:#555;font-size:7.6pt;text-align:left;padding:1mm 0;border-bottom:.8pt solid #111}
  td{padding:1.2mm 0;border-bottom:.4pt solid #ddd;vertical-align:top}
  .num{text-align:right;white-space:nowrap}
  tfoot td{border:0;padding-top:1.6mm}
  .total td{font-weight:700;font-size:10.5pt;border-top:.8pt solid #111}
  .stamp{display:inline-block;border:1pt solid #111;padding:.6mm 2mm;font-weight:700;margin-top:2mm}
  .note{margin-top:2mm;font-size:7.6pt;color:#333}`;
}

function shopHead(db: Db, right: string) {
  const s = db.settings;
  return `<header class="head">
    <div class="shop">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="">` : ''}<div><b>${esc(s.shopName)}</b>
      ${s.address ? `<span class="muted">${esc(s.address)}</span><br>` : ''}
      ${s.phone ? `<span class="muted">โทร ${esc(s.phone)}</span>` : ''}${s.lineOaUrl ? `<span class="muted"> LINE ${esc(s.lineOaUrl.replace(/^https?:\/\//, ''))}</span>` : ''}</div></div>
    ${right}
  </header>`;
}

function doc(title: string, css: string, body: string) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body><div class="sheet">${body}</div></body></html>`;
}

export async function intakeDoc(db: Db, job: Job, paper: Paper): Promise<PrintDoc> {
  const customer = rel.customer(db, job);
  const device = rel.device(db, job);
  const c = job.condition;
  const terms = lines(job.termsText);
  const receiver = rel.userName(db, job.receivedBy);
  const body = `${shopHead(db, `<div class="qrbox">${await qr(statusLink(job.publicToken))}สแกนดูสถานะงานซ่อม</div>`)}
    <div class="row"><div><h1>ใบรับเครื่องซ่อม</h1><p class="jobno">${esc(job.jobNo)}</p></div>
      <p class="muted" style="text-align:right">รับเครื่อง ${esc(thai.dateTime(job.receivedAt))}<br>คาดว่าเสร็จ <b style="color:#111">${esc(`${thai.calWeekday(job.etaDate)} ${thai.cal(job.etaDate)}`)}</b></p></div>
    <div class="grid">
      <p><span class="k">ลูกค้า</span><span class="v">${esc(customer.fullName)}</span> ${esc(formatPhone(customer.phone))}</p>
      <p><span class="k">เครื่อง (${esc(CATEGORY[device.category])})</span><span class="v">${esc(deviceLabel(device))}</span>${device.serialOrImei ? `<br>IMEI/S/N ${esc(device.serialOrImei)}` : ''}</p>
    </div>
    <div class="block"><span class="k">อาการที่ลูกค้าแจ้ง</span><p class="v">${esc(job.reportedIssue)}</p></div>
    <div class="grid">
      <div><span class="k">ของที่ให้มากับเครื่อง</span><p class="chips">${job.accessories.length ? job.accessories.map((a) => `<span>${esc(a)}</span>`).join('') : 'เครื่องเปล่า'}</p></div>
      <div><span class="k">สภาพเครื่องตอนรับ (เปิดติด: ${esc(POWERS[c.powersOn ?? 'unknown'])})</span><p class="chips">${c.checks.length ? c.checks.map((a) => `<span>${esc(a)}</span>`).join('') : 'ไม่พบรอยเสียหายภายนอก'}</p>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}</div>
    </div>
    <div class="grid">
      <p><span class="k">ค่าตรวจเช็คถ้าไม่ซ่อม</span><span class="v">${job.inspectionFee ? `${baht(job.inspectionFee)} บาท` : 'ไม่มีค่าตรวจเช็ค'}</span></p>
      <p><span class="k">วงเงินที่ซ่อมได้เลยโดยไม่ต้องถามก่อน</span><span class="v">${job.preApprovedAmount !== null ? `ไม่เกิน ${baht(job.preApprovedAmount)} บาท` : 'แจ้งราคาให้อนุมัติก่อนทุกครั้ง'}</span></p>
    </div>
    ${job.passcode ? '<p class="note">ร้านเก็บรหัสปลดล็อกแบบเข้ารหัส เห็นได้เฉพาะช่างที่รับงาน และลบทิ้งทันทีเมื่อส่งมอบเครื่อง</p>' : ''}
    <section class="terms"><b>เงื่อนไขการรับซ่อม</b> <span class="muted">(ฉบับ ${esc(job.termsVersion)})</span><ol>${terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>
    <div class="sign">
      <figure>${job.intakeSignatureUrl ? `<img src="${esc(job.intakeSignatureUrl)}" alt="">` : '<div style="height:15mm"></div>'}<div class="line">ลูกค้าเซ็นยอมรับเงื่อนไข</div></figure>
      <figure><div style="height:15mm"></div><div class="line">ผู้รับเครื่อง ${esc(receiver ?? '')}</div></figure>
    </div>
    <p class="note">เก็บใบนี้ไว้ใช้รับเครื่องคืน และสแกน QR เพื่อดูสถานะ ราคา และรูปของเครื่องได้ตลอดเวลา</p>`;
  const title = `ใบรับเครื่อง ${job.jobNo}`;
  return { title, html: doc(title, base(paper), body), paper };
}

export async function receiptDoc(db: Db, job: Job, paper: Paper): Promise<PrintDoc> {
  if (job.status !== 'delivered') throw badRequest('not_delivered', 'ออกใบเสร็จและใบรับประกันได้หลังส่งมอบเครื่อง');
  const customer = rel.customer(db, job);
  const device = rel.device(db, job);
  const quotes = rel.quotes(db, job.id);
  const payments = rel.payments(db, job.id);
  const money = moneyOf(job, quotes, payments);
  const approved = quotes.find((q) => q.status === 'approved');
  const repaired = job.result === 'repaired';
  const items = repaired && approved ? rel.items(db, approved.id) : job.inspectionFee ? [{ description: 'ค่าตรวจเช็ค (ไม่ได้ซ่อม)', qty: 1, unitPrice: job.inspectionFee }] : [];
  const due = money.due ?? 0;
  const body = `${shopHead(db, `<div class="qrbox">${await qr(statusLink(job.publicToken))}สแกนดูประวัติงานซ่อม</div>`)}
    <div class="row"><div><h1>ใบเสร็จรับเงิน และใบรับประกัน</h1><p class="jobno">${esc(job.jobNo)}</p></div>
      <p class="muted" style="text-align:right">ออกเมื่อ ${esc(thai.dateTime(job.deliveredAt ?? new Date().toISOString()))}</p></div>
    <div class="grid">
      <p><span class="k">ลูกค้า</span><span class="v">${esc(customer.fullName)}</span> ${esc(formatPhone(customer.phone))}</p>
      <p><span class="k">เครื่อง</span><span class="v">${esc(deviceLabel(device))}</span>${device.serialOrImei ? `<br>IMEI/S/N ${esc(device.serialOrImei)}` : ''}</p>
    </div>
    <table>
      <thead><tr><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคา</th><th class="num">รวม (บาท)</th></tr></thead>
      <tbody>${items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${baht(i.unitPrice)}</td><td class="num">${baht(i.qty * i.unitPrice)}</td></tr>`).join('')}</tbody>
      <tfoot>
        <tr class="total"><td colspan="3">รวมทั้งสิ้น</td><td class="num">${baht(money.charge ?? 0)}</td></tr>
        ${payments.map((p) => `<tr><td colspan="3" class="muted">รับชำระ ${esc(METHOD[p.method])} ${esc(thai.dateShort(p.paidAt))}</td><td class="num">${baht(p.amount)}</td></tr>`).join('')}
        <tr><td colspan="3">ค้างชำระ</td><td class="num">${baht(due)}</td></tr>
      </tfoot>
    </table>
    ${
      repaired && job.warrantyUntil
        ? `<p class="stamp">รับประกัน ${job.warrantyDays} วัน ถึง ${esc(thai.cal(job.warrantyUntil))}</p><p class="note">รับประกันเฉพาะรายการที่ซ่อมในใบนี้ ไม่รวมความเสียหายจากการตก น้ำเข้า หรือการแกะซ่อมจากที่อื่น นำใบนี้หรือสแกน QR มาแสดงเมื่อใช้สิทธิ์</p>`
        : `<p class="stamp">${repaired ? 'ไม่มีการรับประกัน' : 'ไม่ได้ซ่อม คืนเครื่องสภาพเดิม'}</p>`
    }
    <div class="sign">
      <figure>${job.deliverySignatureUrl ? `<img src="${esc(job.deliverySignatureUrl)}" alt="">` : '<div style="height:15mm"></div>'}<div class="line">ลูกค้าเซ็นรับเครื่องคืน</div></figure>
      <figure><div style="height:15mm"></div><div class="line">ผู้รับเงิน</div></figure>
    </div>`;
  const title = `ใบเสร็จ ${job.jobNo}`;
  return { title, html: doc(title, base(paper), body), paper };
}

/** 50 x 30 mm label for the device itself: the QR the technician scans to open the job. */
export async function stickerDoc(db: Db, job: Job): Promise<PrintDoc> {
  const device = rel.device(db, job);
  const customer = rel.customer(db, job);
  const css = `${base('sticker')}
    .lab{width:50mm;height:30mm;padding:1.5mm 2mm;display:flex;gap:1.8mm;align-items:center;overflow:hidden;background:#fff}
    .lab svg{width:26mm;height:26mm;flex:none}
    .lab div{min-width:0}
    .lab b{font-size:8.4pt;display:block;white-space:nowrap}
    .lab p{font-size:6.4pt;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}`;
  const title = `สติกเกอร์ ${job.jobNo}`;
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>
    <div class="lab">${await qr(stickerLink(job.stickerToken))}<div><b>${esc(job.jobNo)}</b><p>${esc(deviceLabel(device))}</p><p>${esc(customer.fullName.split(/\s+/)[0])}</p><p>นัด ${esc(thai.calShort(job.etaDate))}</p></div></div>
  </body></html>`;
  return { title, html, paper: 'sticker' };
}

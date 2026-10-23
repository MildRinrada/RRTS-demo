/**
 * Sample shop for the demo: the same rows the real server's `seed --sample` writes, dated relative
 * to today, so every status, quote state and report has something real to show.
 */
import QRCode from 'qrcode';
import type { Category, ItemKind, JobResult, JobStatus, PayMethod } from '../api/types';
import { type AuditLog, type Db, type Job, type JobEvent, nextId, SCHEMA } from './db';
import { DAY, newToken, sha256, todayCal } from './util';

export const DEMO_PASSWORD = 'demo1234';

export const DEFAULT_TERMS = [
  'ร้านไม่รับผิดชอบข้อมูลในเครื่อง กรุณาสำรองข้อมูลก่อนส่งซ่อม',
  'ร้านจะแจ้งราคาให้ลูกค้าอนุมัติก่อนเริ่มซ่อมทุกครั้ง ถ้าพบปัญหาเพิ่มจะแจ้งราคาใหม่ก่อนซ่อมต่อ',
  'ถ้าลูกค้าไม่ซ่อมหลังตรวจเช็ค มีค่าตรวจเช็คตามที่ระบุในใบรับเครื่อง',
  'ร้านเก็บเครื่องที่ซ่อมเสร็จหรือไม่ซ่อมไว้ให้ 60 วันนับจากวันที่แจ้งให้มารับ',
  'การรับประกันครอบคลุมเฉพาะรายการที่ซ่อม ไม่รวมความเสียหายจากการตก น้ำเข้า หรือการแกะซ่อมจากที่อื่น',
].join('\n');

const PRESETS: { category: Category | null; name: string; price: number }[] = [
  { category: 'phone', name: 'ค่าแรงเปลี่ยนจอ', price: 500 },
  { category: 'phone', name: 'ค่าแรงเปลี่ยนแบตเตอรี่', price: 300 },
  { category: 'phone', name: 'ค่าแรงเปลี่ยนช่องชาร์จ', price: 400 },
  { category: 'phone', name: 'ค่าแรงเปลี่ยนกระจกกล้องหลัง', price: 300 },
  { category: 'phone', name: 'ล้างเครื่องตกน้ำ', price: 500 },
  { category: 'phone', name: 'ลงระบบใหม่ (ข้อมูลหาย)', price: 300 },
  { category: 'computer', name: 'ลงวินโดวส์และไดรเวอร์', price: 500 },
  { category: 'computer', name: 'ล้างเครื่องและเปลี่ยนซิลิโคน', price: 600 },
  { category: 'computer', name: 'ค่าแรงเปลี่ยนจอโน้ตบุ๊ก', price: 800 },
  { category: 'computer', name: 'ค่าแรงเปลี่ยนคีย์บอร์ดโน้ตบุ๊ก', price: 500 },
  { category: 'computer', name: 'ค่าแรงเปลี่ยน SSD และย้ายข้อมูล', price: 500 },
  { category: 'appliance', name: 'ซ่อมบอร์ดควบคุม', price: 800 },
  { category: 'appliance', name: 'ค่าแรงเปลี่ยนมอเตอร์', price: 600 },
  { category: 'appliance', name: 'เปลี่ยนสายไฟและปลั๊ก', price: 200 },
  { category: 'appliance', name: 'ล้างทำความสะอาด', price: 400 },
];

/** An instant `days` ago at a Bangkok shop hour. */
function at(days: number, hour: number, minute = 0) {
  const d = new Date(`${todayCal(-days)}T00:00:00Z`);
  return new Date(d.getTime() + (hour - 7) * 3600_000 + minute * 60_000).toISOString();
}

/** A hand-drawn looking signature, so the sample slips carry one like real ones do. */
function signature(seed: number) {
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  let x = 30;
  let y = 70;
  let d = `M${x} ${y}`;
  for (let i = 0; i < 9; i++) {
    const nx = x + 22 + rnd() * 26;
    const ny = 45 + rnd() * 50;
    d += ` C${(x + 10).toFixed(0)} ${(y - 40 * rnd()).toFixed(0)} ${(nx - 10).toFixed(0)} ${(ny + 40 * rnd()).toFixed(0)} ${nx.toFixed(0)} ${ny.toFixed(0)}`;
    x = nx;
    y = ny;
  }
  d += ` M40 ${(100 + rnd() * 8).toFixed(0)} Q${(x / 2).toFixed(0)} ${(88 + rnd() * 10).toFixed(0)} ${(x - 10).toFixed(0)} 104`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(x + 30)} 130"><path d="${d}" fill="none" stroke="#1d1d24" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type Line = [ItemKind, string, number];
interface Sample {
  name: string;
  phone: string;
  category: Category;
  brand: string;
  model: string;
  color?: string;
  serial?: string;
  issue: string;
  accessories: string[];
  checks: string[];
  status: JobStatus;
  result?: JobResult;
  tech?: 'ton' | 'bank';
  daysAgo: number;
  eta: number;
  quote?: { lines: Line[]; state: 'sent' | 'approved' | 'rejected' | 'callback'; daysAgo: number };
  waiting?: { reason: string; until: number };
  completedDaysAgo?: number;
  paid?: { amount: number; method: PayMethod; daysAgo: number }[];
  passcode?: string;
  photo?: number;
}

const SAMPLES: Sample[] = [
  {
    name: 'ณัฐวุฒิ แสงทอง',
    phone: '0812345678',
    category: 'phone',
    brand: 'Apple',
    model: 'iPhone 13',
    color: 'ดำ',
    serial: '356789104455211',
    issue: 'จอแตกมุมขวาล่าง ทัชไม่ทำงานครึ่งจอ',
    accessories: ['ซิม', 'เคส'],
    checks: ['จอแตก'],
    status: 'received',
    daysAgo: 0,
    eta: 2,
    passcode: '240611',
    photo: 0,
  },
  {
    name: 'พรทิพย์ วงศ์สวัสดิ์',
    phone: '0891112233',
    category: 'phone',
    brand: 'Samsung',
    model: 'Galaxy A54',
    color: 'ม่วง',
    issue: 'แบตหมดเร็ว เครื่องดับเองตอนแบตเหลือ 30%',
    accessories: ['ซิม'],
    checks: [],
    status: 'received',
    daysAgo: 0,
    eta: 1,
    photo: 1,
  },
  {
    name: 'กิตติพัฒน์ ชัยมงคล',
    phone: '0867778899',
    category: 'computer',
    brand: 'Acer',
    model: 'Aspire 5 A515',
    serial: 'NXA1DST00412',
    issue: 'กดปุ่มเปิดแล้วไฟติดแต่จอไม่ขึ้น',
    accessories: ['ที่ชาร์จ'],
    checks: ['ฝาหลังมีรอย'],
    status: 'diagnosing',
    tech: 'ton',
    daysAgo: 1,
    eta: 2,
    photo: 2,
  },
  {
    name: 'ศิริลักษณ์ บุญมา',
    phone: '0823456789',
    category: 'computer',
    brand: 'ASUS',
    model: 'VivoBook 15 X1504',
    color: 'เงิน',
    issue: 'น้ำหกใส่คีย์บอร์ด ปุ่มแถวบนพิมพ์ไม่ติด',
    accessories: ['ที่ชาร์จ', 'กระเป๋า'],
    checks: [],
    status: 'awaiting_approval',
    tech: 'bank',
    daysAgo: 2,
    eta: 3,
    quote: {
      lines: [
        ['part', 'คีย์บอร์ด ASUS X1504 ภาษาไทย', 1450],
        ['labor', 'ค่าแรงเปลี่ยนคีย์บอร์ดโน้ตบุ๊ก', 500],
        ['labor', 'ล้างเครื่องและเปลี่ยนซิลิโคน', 600],
      ],
      state: 'sent',
      daysAgo: 0,
    },
    photo: 3,
  },
  {
    name: 'อนุชา ทองดี',
    phone: '0845556677',
    category: 'phone',
    brand: 'OPPO',
    model: 'Reno8 5G',
    color: 'ทอง',
    issue: 'ชาร์จไม่เข้า ต้องขยับสายถึงจะเข้า',
    accessories: ['เคส'],
    checks: ['ขอบเครื่องบุบ'],
    status: 'awaiting_approval',
    tech: 'ton',
    daysAgo: 2,
    eta: 2,
    quote: {
      lines: [
        ['part', 'แพรช่องชาร์จ Reno8', 650],
        ['labor', 'ค่าแรงเปลี่ยนช่องชาร์จ', 400],
      ],
      state: 'callback',
      daysAgo: 1,
    },
    photo: 4,
  },
  {
    name: 'มณีรัตน์ ศรีสุข',
    phone: '0819998877',
    category: 'phone',
    brand: 'Apple',
    model: 'iPhone 11',
    color: 'ขาว',
    issue: 'แบตเสื่อม สุขภาพแบต 71%',
    accessories: [],
    checks: ['ฝาหลังมีรอย'],
    status: 'repairing',
    tech: 'ton',
    daysAgo: 1,
    eta: 0,
    passcode: '1234',
    quote: {
      lines: [
        ['part', 'แบตเตอรี่ iPhone 11 (เกรดคุณภาพสูง)', 990],
        ['labor', 'ค่าแรงเปลี่ยนแบตเตอรี่', 300],
      ],
      state: 'approved',
      daysAgo: 1,
    },
    photo: 5,
  },
  {
    name: 'ธีรวัฒน์ พรหมวงศ์',
    phone: '0861234567',
    category: 'computer',
    brand: 'Lenovo',
    model: 'IdeaPad 3 15ITL6',
    issue: 'เครื่องช้ามาก ร้อน พัดลมดัง',
    accessories: ['ที่ชาร์จ'],
    checks: [],
    status: 'repairing',
    tech: 'bank',
    daysAgo: 4,
    eta: -1,
    quote: {
      lines: [
        ['part', 'SSD 512GB NVMe', 1290],
        ['labor', 'ค่าแรงเปลี่ยน SSD และย้ายข้อมูล', 500],
        ['labor', 'ล้างเครื่องและเปลี่ยนซิลิโคน', 600],
      ],
      state: 'approved',
      daysAgo: 3,
    },
  },
  {
    name: 'วรรณา แก้วมณี',
    phone: '0834445566',
    category: 'computer',
    brand: 'Apple',
    model: 'MacBook Air M1',
    color: 'เทา',
    serial: 'FVFDX2Q1Q6L4',
    issue: 'จอมีเส้นสีและจุดดำมุมซ้าย',
    accessories: ['ที่ชาร์จ'],
    checks: ['จอมีเส้น'],
    status: 'waiting_parts',
    tech: 'bank',
    daysAgo: 5,
    eta: 5,
    quote: {
      lines: [
        ['part', 'จอ MacBook Air M1 (A2337) ประกอบชุด', 7400],
        ['labor', 'ค่าแรงเปลี่ยนจอโน้ตบุ๊ก', 800],
      ],
      state: 'approved',
      daysAgo: 4,
    },
    waiting: { reason: 'จอจากผู้จำหน่าย สั่งแล้ว', until: 3 },
    paid: [{ amount: 3000, method: 'transfer', daysAgo: 4 }],
  },
  {
    name: 'ประเสริฐ จันทร์หอม',
    phone: '0857654321',
    category: 'appliance',
    brand: 'Sharp',
    model: 'ไมโครเวฟ R-2221G',
    issue: 'กดเริ่มแล้วไฟเข้าแต่ไม่ร้อน',
    accessories: ['จานหมุน'],
    checks: [],
    status: 'waiting_parts',
    tech: 'ton',
    daysAgo: 6,
    eta: 6,
    quote: {
      lines: [
        ['part', 'แมกนีตรอน Sharp', 1150],
        ['labor', 'ซ่อมบอร์ดควบคุม', 800],
      ],
      state: 'approved',
      daysAgo: 5,
    },
    waiting: { reason: 'แมกนีตรอนจากศูนย์ Sharp', until: 4 },
  },
  {
    name: 'จิราพร สุขเจริญ',
    phone: '0842223344',
    category: 'phone',
    brand: 'vivo',
    model: 'Y36',
    color: 'เขียว',
    issue: 'ช่องชาร์จหลวม',
    accessories: ['ซิม', 'เมมโมรี่'],
    checks: [],
    status: 'ready',
    result: 'repaired',
    tech: 'ton',
    daysAgo: 3,
    eta: 0,
    completedDaysAgo: 0,
    quote: {
      lines: [
        ['part', 'แพรช่องชาร์จ vivo Y36', 350],
        ['labor', 'ค่าแรงเปลี่ยนช่องชาร์จ', 400],
      ],
      state: 'approved',
      daysAgo: 2,
    },
  },
  {
    name: 'สมชาย ใจดี',
    phone: '0871112222',
    category: 'computer',
    brand: 'Dell',
    model: 'Inspiron 3511',
    issue: 'จอดับ เปิดติดแต่ไม่มีภาพ',
    accessories: ['ที่ชาร์จ'],
    checks: [],
    status: 'ready',
    result: 'not_repaired',
    tech: 'bank',
    daysAgo: 4,
    eta: 1,
    completedDaysAgo: 1,
    quote: {
      lines: [
        ['part', 'เมนบอร์ด Dell Inspiron 3511 i5', 6900],
        ['labor', 'ค่าแรงเปลี่ยนเมนบอร์ด', 800],
      ],
      state: 'rejected',
      daysAgo: 2,
    },
  },
  {
    name: 'ปวีณา ทองประเสริฐ',
    phone: '0896665544',
    category: 'appliance',
    brand: 'Panasonic',
    model: 'เตารีดไอน้ำ NI-E510',
    issue: 'ไม่ร้อน ไฟไม่เข้า',
    accessories: [],
    checks: [],
    status: 'ready',
    result: 'repaired',
    tech: 'ton',
    daysAgo: 44,
    eta: -40,
    completedDaysAgo: 38,
    quote: {
      lines: [
        ['part', 'เทอร์โมสตัท', 180],
        ['labor', 'เปลี่ยนสายไฟและปลั๊ก', 200],
      ],
      state: 'approved',
      daysAgo: 42,
    },
  },
];

/** Handed-back jobs over the last four weeks, so the reports have real history to add up. */
const HISTORY: [string, string, Category, string, string, string, Line[], PayMethod, number, number][] = [
  [
    'ชนิดา แสงอรุณ',
    '0811230001',
    'phone',
    'Xiaomi',
    'Redmi Note 12',
    'จอแตก',
    [
      ['part', 'จอ Redmi Note 12 AMOLED', 1800],
      ['labor', 'ค่าแรงเปลี่ยนจอ', 500],
    ],
    'promptpay',
    1,
    3,
  ],
  [
    'ภานุพงศ์ อินทร์แก้ว',
    '0811230002',
    'phone',
    'Apple',
    'iPhone XR',
    'แบตเสื่อม',
    [
      ['part', 'แบตเตอรี่ iPhone XR', 890],
      ['labor', 'ค่าแรงเปลี่ยนแบตเตอรี่', 300],
    ],
    'cash',
    2,
    1,
  ],
  ['รัตนา พึ่งบุญ', '0811230003', 'computer', 'HP', 'Pavilion 14', 'ลงวินโดวส์ใหม่', [['labor', 'ลงวินโดวส์และไดรเวอร์', 500]], 'cash', 3, 1],
  [
    'อภิชาติ นาคสวัสดิ์',
    '0811230004',
    'phone',
    'Samsung',
    'Galaxy S21',
    'กระจกกล้องหลังแตก',
    [
      ['part', 'กระจกกล้องหลัง S21', 250],
      ['labor', 'ค่าแรงเปลี่ยนกระจกกล้องหลัง', 300],
    ],
    'promptpay',
    4,
    1,
  ],
  [
    'นงลักษณ์ สายทอง',
    '0811230005',
    'appliance',
    'Hatari',
    'พัดลม HT-S16M7',
    'ไม่หมุน มีเสียงหึ่ง',
    [
      ['part', 'คาปาซิเตอร์พัดลม', 120],
      ['labor', 'ค่าแรงเปลี่ยนมอเตอร์', 600],
    ],
    'cash',
    6,
    2,
  ],
  ['กมลชนก ดีมาก', '0811230006', 'computer', 'ASUS', 'TUF Gaming F15', 'เครื่องร้อน ดับเอง', [['labor', 'ล้างเครื่องและเปลี่ยนซิลิโคน', 600]], 'transfer', 7, 2],
  [
    'ธนพล วิเศษสุข',
    '0811230007',
    'phone',
    'OPPO',
    'A78',
    'ชาร์จไม่เข้า',
    [
      ['part', 'แพรช่องชาร์จ A78', 300],
      ['labor', 'ค่าแรงเปลี่ยนช่องชาร์จ', 400],
    ],
    'promptpay',
    8,
    1,
  ],
  [
    'สุภาวดี ลิ้มเจริญ',
    '0811230008',
    'phone',
    'Apple',
    'iPhone 12',
    'จอเขียวเป็นเส้น',
    [
      ['part', 'จอ iPhone 12 OLED', 3200],
      ['labor', 'ค่าแรงเปลี่ยนจอ', 500],
    ],
    'card',
    10,
    2,
  ],
  [
    'วีระพงษ์ มั่นคง',
    '0811230009',
    'computer',
    'Acer',
    'Nitro 5',
    'คีย์บอร์ดบางปุ่มไม่ติด',
    [
      ['part', 'คีย์บอร์ด Nitro 5 ไฟ RGB', 1600],
      ['labor', 'ค่าแรงเปลี่ยนคีย์บอร์ดโน้ตบุ๊ก', 500],
    ],
    'transfer',
    12,
    3,
  ],
  ['อรอุมา ปัญญาดี', '0811230010', 'phone', 'vivo', 'V27', 'ตกน้ำ เปิดไม่ติด', [['labor', 'ล้างเครื่องตกน้ำ', 500]], 'cash', 13, 1],
  [
    'เอกชัย ศรีวงศ์',
    '0811230011',
    'appliance',
    'Sharp',
    'หม้อหุงข้าว KS-19ET',
    'ไม่ตัดเมื่อข้าวสุก',
    [
      ['part', 'เทอร์โมสตัทหม้อหุงข้าว', 150],
      ['labor', 'ซ่อมบอร์ดควบคุม', 800],
    ],
    'cash',
    15,
    2,
  ],
  [
    'ปิยะนุช บุญยืน',
    '0811230012',
    'phone',
    'Samsung',
    'Galaxy A34',
    'แบตบวม',
    [
      ['part', 'แบตเตอรี่ Galaxy A34', 690],
      ['labor', 'ค่าแรงเปลี่ยนแบตเตอรี่', 300],
    ],
    'promptpay',
    17,
    1,
  ],
  [
    'สุรเชษฐ์ คงเจริญ',
    '0811230013',
    'computer',
    'Lenovo',
    'ThinkPad E14',
    'SSD เสีย บูตไม่ขึ้น',
    [
      ['part', 'SSD 512GB NVMe', 1290],
      ['labor', 'ค่าแรงเปลี่ยน SSD และย้ายข้อมูล', 500],
    ],
    'transfer',
    19,
    2,
  ],
  [
    'มาลัย ทองคำ',
    '0811230014',
    'phone',
    'Apple',
    'iPhone 14 Pro',
    'กระจกหลังแตก',
    [
      ['part', 'ฝาหลัง iPhone 14 Pro', 2400],
      ['labor', 'ค่าแรงเปลี่ยนจอ', 500],
    ],
    'card',
    22,
    3,
  ],
  ['ไพโรจน์ แสนดี', '0811230015', 'appliance', 'Toshiba', 'กาต้มน้ำ', 'ไม่ร้อน', [['labor', 'เปลี่ยนสายไฟและปลั๊ก', 200]], 'cash', 24, 1],
  ['ศศิธร วงศ์ใหญ่', '0811230016', 'phone', 'Xiaomi', 'Redmi 12C', 'ลืมรหัส ลงระบบใหม่', [['labor', 'ลงระบบใหม่ (ข้อมูลหาย)', 300]], 'promptpay', 26, 1],
];

const PHOTOS = ['photos/00.jpg', 'photos/01.jpg', 'photos/02.jpg', 'photos/03.jpg', 'photos/04.jpg', 'photos/05.jpg'];

/** Shown where the shop's PromptPay QR goes. It carries a note, never a payment payload. */
async function samplePromptPay() {
  try {
    return await QRCode.toDataURL('ตัวอย่างตำแหน่ง QR พร้อมเพย์ของร้าน ไม่ใช่ QR รับเงินจริง', { margin: 1, width: 360, color: { dark: '#111111', light: '#ffffff' } });
  } catch {
    return null;
  }
}

export async function buildSeed(): Promise<Db> {
  const created = at(60, 9);
  const db: Db = {
    schema: SCHEMA,
    seededAt: new Date().toISOString(),
    ids: {},
    counters: {},
    settings: {
      shopName: 'ร้านช่างต้น โมบายแอนด์คอม',
      logoUrl: null,
      phone: '02-951-4420',
      address: '88/12 ถนนงามวงศ์วาน แขวงทุ่งสองห้อง หลักสี่ กรุงเทพฯ',
      lineOaUrl: 'https://lin.ee/chang-ton',
      promptpayImageUrl: await samplePromptPay(),
      termsText: DEFAULT_TERMS,
      termsVersion: 'v1',
      defaultWarrantyDays: 30,
      pickupReminderDays: 30,
      inspectionFee: 200,
      defaultEtaDays: 3,
      lineLiffId: null,
      lineChannelId: null,
    },
    users: [],
    customers: [],
    devices: [],
    jobs: [],
    events: [],
    photos: [],
    quotes: [],
    items: [],
    presets: [],
    payments: [],
    audit: [],
  };

  const hash = await sha256(DEMO_PASSWORD);
  const user = (email: string, name: string, role: 'owner' | 'admin' | 'staff' | 'technician') => {
    const u = { id: nextId(db, 'users'), email, name, role, passwordHash: hash, active: true, lastLoginAt: null, createdAt: created };
    db.users.push(u);
    return u;
  };
  user('owner@example.com', 'คุณต้น เจ้าของร้าน', 'owner');
  const tech = { ton: user('ton@example.com', 'ช่างต้น', 'technician'), bank: user('bank@example.com', 'ช่างแบงก์', 'technician') };
  const counter = user('fon@example.com', 'ฝน หน้าร้าน', 'staff');

  PRESETS.forEach((p, sort) => db.presets.push({ id: nextId(db, 'presets'), ...p, active: true, sort }));

  const s = db.settings;
  let seq = 0;
  const yymm = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: '2-digit', month: '2-digit' }).format(new Date()).replace(/\D/g, '');
  const calLong = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

  function create(x: Sample) {
    let customer = db.customers.find((c) => c.phone === x.phone);
    if (!customer) {
      customer = { id: nextId(db, 'customers'), phone: x.phone, fullName: x.name, lineUserId: null, note: null, createdAt: at(x.daysAgo, 9) };
      db.customers.push(customer);
    }
    const device = {
      id: nextId(db, 'devices'),
      customerId: customer.id,
      category: x.category,
      brand: x.brand,
      model: x.model,
      color: x.color ?? null,
      serialOrImei: x.serial ?? null,
      createdAt: at(x.daysAgo, 9),
    };
    db.devices.push(device);
    const received = at(x.daysAgo, 10 + (seq % 6), (seq * 17) % 60);
    const t = x.tech ? tech[x.tech] : null;
    const jobId = nextId(db, 'jobs');
    const events: Omit<JobEvent, 'id' | 'jobId'>[] = [];
    const ev = (by: string, when: string, note: string, to: JobStatus | null = null, from: JobStatus | null = null, visible = true) =>
      events.push({ note, toStatus: to, fromStatus: from, visibleToCustomer: visible, actorLabel: by, actorId: null, createdAt: when });

    ev(counter.name, received, `รับเครื่องแล้ว อาการที่แจ้ง: ${x.issue}`, 'received');
    if (t && x.status !== 'received') ev(t.name, new Date(new Date(received).getTime() + 3 * 3600_000).toISOString(), 'ช่างเริ่มตรวจเช็คอาการ', 'diagnosing', 'received');
    if (x.quote) {
      const total = x.quote.lines.reduce((sum, l) => sum + l[2], 0);
      const sent = at(x.quote.daysAgo, 15, 20);
      const answered = new Date(new Date(sent).getTime() + 95 * 60_000).toISOString();
      const list = x.quote.lines.map((l) => `${l[1]} ${l[2].toLocaleString('th-TH')} บาท`).join(', ');
      ev(t?.name ?? counter.name, sent, `แจ้งราคา ${total.toLocaleString('th-TH')} บาท (${list}) รอลูกค้าอนุมัติก่อนซ่อม`, 'awaiting_approval', 'diagnosing');
      if (x.quote.state === 'approved') ev('ลูกค้า (ลิงก์)', answered, `ลูกค้าอนุมัติราคา ${total.toLocaleString('th-TH')} บาท`, 'repairing', 'awaiting_approval');
      if (x.quote.state === 'rejected') ev('ลูกค้า (ลิงก์)', answered, `ลูกค้าเลือกไม่ซ่อมที่ราคา ${total.toLocaleString('th-TH')} บาท`);
      if (x.quote.state === 'callback') ev('ลูกค้า (ลิงก์)', answered, 'ลูกค้าขอให้ร้านโทรกลับก่อนตัดสินใจ');
      const quoteId = nextId(db, 'quotes');
      db.quotes.push({
        id: quoteId,
        jobId,
        version: 1,
        status: x.quote.state,
        total,
        note: null,
        sentAt: sent,
        respondedAt: x.quote.state === 'sent' ? null : answered,
        respondedVia: x.quote.state === 'sent' ? null : 'link',
        createdBy: t?.id ?? counter.id,
        createdAt: sent,
      });
      x.quote.lines.forEach(([kind, description, unitPrice], sort) => db.items.push({ id: nextId(db, 'items'), quoteId, kind, description, qty: 1, unitPrice, sort }));
    }
    if (x.waiting)
      ev(
        t!.name,
        at(Math.max(0, (x.quote?.daysAgo ?? x.daysAgo) - 1), 11),
        `รอ${x.waiting.reason} คาดว่าจะได้ ${calLong.format(new Date(`${todayCal(x.waiting.until)}T00:00:00Z`))}`,
        'waiting_parts',
        'repairing',
      );
    if (x.completedDaysAgo !== undefined) {
      ev(
        t!.name,
        at(x.completedDaysAgo, 16, 10),
        x.result === 'repaired' ? 'ซ่อมเสร็จ ทดสอบแล้วใช้งานได้ปกติ' : 'คืนเครื่องสภาพเดิม ลูกค้าไม่ซ่อม',
        'ready',
        x.quote?.state === 'rejected' ? 'awaiting_approval' : 'repairing',
      );
    }
    seq += 1;
    const job: Job = {
      id: jobId,
      jobNo: `R${yymm}-${String(seq).padStart(4, '0')}`,
      deviceId: device.id,
      customerId: customer.id,
      reportedIssue: x.issue,
      accessories: x.accessories,
      condition: { checks: x.checks, powersOn: x.category === 'appliance' ? 'unknown' : 'yes', note: null },
      passcode: x.passcode ?? null,
      status: x.status,
      result: x.result ?? null,
      waitingReason: x.waiting?.reason ?? null,
      waitingUntil: x.waiting ? todayCal(x.waiting.until) : null,
      etaDate: todayCal(x.eta),
      assignedTo: t?.id ?? null,
      publicToken: newToken(),
      stickerToken: newToken(),
      intakeSignatureUrl: signature(seq),
      termsVersion: s.termsVersion,
      termsText: s.termsText,
      preApprovedAmount: null,
      inspectionFee: s.inspectionFee,
      callbackAt: x.quote?.state === 'callback' ? at(x.quote.daysAgo, 16, 55) : null,
      receivedAt: received,
      completedAt: x.completedDaysAgo !== undefined ? at(x.completedDaysAgo, 16, 10) : null,
      deliveredAt: null,
      warrantyDays: null,
      warrantyUntil: null,
      deliverySignatureUrl: null,
      returnedItems: null,
      receivedBy: counter.id,
      updatedAt: received,
    };
    db.jobs.push(job);
    for (const e of events) db.events.push({ id: nextId(db, 'events'), jobId, ...e });
    if (x.photo !== undefined) db.photos.push({ id: nextId(db, 'photos'), jobId, kind: 'intake', url: PHOTOS[x.photo], visibleToCustomer: true, takenBy: counter.id, createdAt: received });
    for (const p of x.paid ?? []) db.payments.push({ id: nextId(db, 'payments'), jobId, amount: p.amount, method: p.method, note: null, paidAt: at(p.daysAgo, 14), receivedBy: counter.id });
    return job;
  }

  for (const x of SAMPLES) create(x);
  for (const [name, phone, category, brand, model, issue, lines, method, deliveredDaysAgo, took] of HISTORY) {
    const total = lines.reduce((sum, l) => sum + l[2], 0);
    const job = create({
      name,
      phone,
      category,
      brand,
      model,
      issue,
      accessories: [],
      checks: [],
      status: 'ready',
      result: 'repaired',
      tech: seq % 2 ? 'ton' : 'bank',
      daysAgo: deliveredDaysAgo + took,
      eta: -deliveredDaysAgo,
      completedDaysAgo: deliveredDaysAgo,
      quote: { lines, state: 'approved', daysAgo: deliveredDaysAgo + took - 1 },
      paid: [{ amount: total, method, daysAgo: deliveredDaysAgo }],
    });
    const deliveredAt = at(deliveredDaysAgo, 17, 30);
    Object.assign(job, {
      status: 'delivered',
      deliveredAt,
      warrantyDays: s.defaultWarrantyDays,
      warrantyUntil: new Date(new Date(`${todayCal(-deliveredDaysAgo)}T00:00:00Z`).getTime() + s.defaultWarrantyDays * DAY).toISOString().slice(0, 10),
      returnedItems: { items: [], missingNote: null },
      deliverySignatureUrl: signature(seq + 50),
      updatedAt: deliveredAt,
    });
    db.events.push({
      id: nextId(db, 'events'),
      jobId: job.id,
      fromStatus: 'ready',
      toStatus: 'delivered',
      note: `ส่งมอบเครื่องแล้ว รับประกัน ${s.defaultWarrantyDays} วัน`,
      visibleToCustomer: true,
      actorLabel: counter.name,
      actorId: counter.id,
      createdAt: deliveredAt,
    });
  }
  db.counters[`job:${yymm}`] = seq;

  // The audit log the real server would have written for this history, oldest first.
  const rows: Omit<AuditLog, 'id'>[] = [];
  const userId = (label: string) => db.users.find((u) => u.name === label)?.id ?? null;
  for (const e of db.events) {
    const quote = db.quotes.find((q) => q.jobId === e.jobId);
    const base = { actorUserId: userId(e.actorLabel), actorLabel: e.actorLabel, createdAt: e.createdAt };
    const note = e.note ?? '';
    if (e.toStatus === 'received') {
      const job = db.jobs.find((j) => j.id === e.jobId)!;
      rows.push({ ...base, action: 'job.intake', entity: 'repair_job', entityId: e.jobId, diff: { jobNo: job.jobNo, customerId: job.customerId, deviceId: job.deviceId, photos: db.photos.filter((p) => p.jobId === job.id).length } });
    } else if (note.startsWith('แจ้งราคา') && quote) {
      rows.push({ ...base, action: 'quote.send', entity: 'quote', entityId: quote.id, diff: { jobId: e.jobId, version: 1, total: quote.total, preapproved: false } });
    } else if (/^ลูกค้า(อนุมัติ|เลือกไม่ซ่อม|ขอให้ร้านโทรกลับ)/.test(note) && quote) {
      const action = note.startsWith('ลูกค้าอนุมัติ') ? 'quote.approve' : note.startsWith('ลูกค้าเลือกไม่ซ่อม') ? 'quote.reject' : 'quote.callback';
      rows.push({ ...base, action, entity: 'quote', entityId: quote.id, diff: { jobId: e.jobId, via: 'link', total: quote.total } });
    } else if (e.toStatus === 'delivered') {
      rows.push({ ...base, action: 'job.deliver', entity: 'repair_job', entityId: e.jobId, diff: { warrantyDays: s.defaultWarrantyDays, missing: [] } });
    } else if (e.toStatus) {
      rows.push({ ...base, action: 'job.status', entity: 'repair_job', entityId: e.jobId, diff: { from: e.fromStatus, to: e.toStatus } });
    }
  }
  for (const p of db.payments) {
    rows.push({ actorUserId: counter.id, actorLabel: counter.name, createdAt: p.paidAt, action: 'payment.add', entity: 'repair_job', entityId: p.jobId, diff: { amount: p.amount, method: p.method } });
  }
  rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  for (const r of rows) db.audit.push({ id: nextId(db, 'audit'), ...r });
  return db;
}

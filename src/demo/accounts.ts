import type { Role } from '../api/types';

/** The sample shop's staff, one per role, used by the start page and the role switcher. */
export interface Account {
  id: number;
  email: string;
  name: string;
  role: Role;
  roleLabel: string;
  can: string;
}

export const ACCOUNTS: Account[] = [
  { id: 1, email: 'owner@example.com', name: 'คุณต้น', role: 'owner', roleLabel: 'เจ้าของร้าน', can: 'เห็นทุกงาน รายงานรายได้ ส่งออก Excel ตั้งค่าร้าน พนักงาน และประวัติการแก้ไข' },
  { id: 4, email: 'fon@example.com', name: 'ฝน', role: 'staff', roleLabel: 'หน้าร้าน', can: 'รับเครื่อง ถ่ายรูป ให้ลูกค้าเซ็น รับเงิน ส่งมอบ และค้นหาลูกค้า' },
  { id: 2, email: 'ton@example.com', name: 'ช่างต้น', role: 'technician', roleLabel: 'ช่าง', can: 'เห็นเฉพาะงานของตัวเองกับคิวที่ยังไม่มีคนรับ ดูรหัสปลดล็อกได้เมื่อรับงานแล้ว' },
  { id: 3, email: 'bank@example.com', name: 'ช่างแบงก์', role: 'technician', roleLabel: 'ช่าง', can: 'ช่างอีกคน ใช้ดูว่างานของช่างต้นถูกซ่อนจากคนอื่นอย่างไร' },
];

const RANK: Record<Role, number> = { technician: 0, staff: 1, admin: 2, owner: 3 };

/** Shop pages that need more than a technician's access. Every other /shop page is open to all roles. */
const NEEDS: [RegExp, Role][] = [
  [/^\/shop\/audit/, 'owner'],
  [/^\/shop\/(reports|settings)/, 'admin'],
  [/^\/shop\/(intake|customers)/, 'staff'],
  [/^\/shop\/jobs\/\d+\/handover/, 'staff'],
];

/** Whether a role may stay on this page after switching to it. */
export function roleCanOpen(role: Role, path: string) {
  if (!path.startsWith('/shop')) return false;
  const need = NEEDS.find(([re]) => re.test(path))?.[1];
  return !need || RANK[role] >= RANK[need];
}

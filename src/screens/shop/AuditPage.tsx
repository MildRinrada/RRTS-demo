import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button, QueryState } from '../../components/ui';
import { fmt } from '../../lib/format';
import { RequireRole } from './ShopLayout';

interface Log {
  id: number;
  actorLabel: string;
  action: string;
  entity: string;
  entityId: number | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

/** What each logged action means to an owner reading it later. */
const ACTION: Record<string, string> = {
  'auth.login': 'เข้าสู่ระบบ',
  'job.intake': 'รับเครื่อง',
  'job.status': 'เปลี่ยนสถานะงาน',
  'job.update': 'แก้ข้อมูลงาน',
  'job.claim': 'ช่างรับงาน',
  'job.deliver': 'ส่งมอบเครื่อง',
  'photo.add': 'เพิ่มรูป',
  'photo.visibility': 'เปลี่ยนการแสดงรูป',
  'passcode.view': 'ดูรหัสปลดล็อก',
  'payment.add': 'รับเงิน',
  'quote.draft': 'เริ่มใบเสนอราคา',
  'quote.send': 'ส่งราคาให้ลูกค้า',
  'quote.approve': 'อนุมัติราคา',
  'quote.reject': 'ไม่ซ่อม',
  'quote.callback': 'ขอให้โทรกลับ',
  'customer.update': 'แก้ข้อมูลลูกค้า',
  'customer.link_line': 'ผูก LINE',
  'labor_preset.create': 'เพิ่มค่าแรงมาตรฐาน',
  'labor_preset.update': 'แก้ค่าแรงมาตรฐาน',
  'user.create': 'เพิ่มพนักงาน',
  'user.update': 'แก้บัญชีพนักงาน',
  'user.password': 'เปลี่ยนรหัสผ่าน',
  'settings.update': 'แก้ตั้งค่าร้าน',
};

/** Append-only: nobody can edit or delete these rows, not even from the database console. */
export function AuditPage() {
  const q = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) => api.get<Log[]>(`/shop/audit-logs${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1].id : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];
  return (
    <RequireRole role="owner">
      <div className="page">
        <header className="titlerow">
          <div>
            <h1 className="title">ประวัติการแก้ไข</h1>
            <p className="subline">ทุกการแก้ราคา เปลี่ยนสถานะ รับเงิน และดูรหัสปลดล็อก บันทึกไว้แก้หรือลบไม่ได้</p>
          </div>
        </header>
        <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
          <table className="table">
            <thead>
              <tr>
                <th>เมื่อ</th>
                <th>ใคร</th>
                <th>ทำอะไร</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap t-small">{fmt.dateTime(r.createdAt)}</td>
                  <td>{r.actorLabel}</td>
                  <td>
                    {ACTION[r.action] ?? r.action}
                    {r.entityId !== null && <span className="t-small t-muted"> #{r.entityId}</span>}
                  </td>
                  <td className="t-small t-muted audit__diff">{r.diff ? JSON.stringify(r.diff) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.hasNextPage && (
            <Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
              ดูเพิ่ม
            </Button>
          )}
        </QueryState>
      </div>
    </RequireRole>
  );
}

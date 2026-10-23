import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { resetDemo } from '../../demo/server';
import { Button, Dialog } from '../../components/ui';

/** The thin strip on every screen that says this is the demo, with the way back and a reset. */
export function DemoBar() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function reset() {
    setBusy(true);
    await resetDemo();
    qc.clear();
    setBusy(false);
    setAsking(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="demobar" role="note">
      <p className="demobar__text">
        <strong>เดโม</strong>
        <span className="demobar__more">ข้อมูลตัวอย่าง เก็บไว้ในเบราว์เซอร์นี้เท่านั้น</span>
      </p>
      <nav className="demobar__links" aria-label="เดโม">
        <Link to="/">เปลี่ยนบทบาท</Link>
        <button type="button" onClick={() => setAsking(true)}>
          <RotateCcw aria-hidden="true" />
          รีเซ็ตข้อมูล
        </button>
      </nav>
      <Dialog open={asking} onClose={() => setAsking(false)} title="รีเซ็ตข้อมูลเดโม">
        <div className="stack">
          <p>งานที่รับเพิ่ม ราคาที่แจ้ง และการตั้งค่าที่แก้ไว้จะหายทั้งหมด ข้อมูลกลับเป็นร้านตัวอย่างแบบตอนเปิดครั้งแรก และออกจากระบบทุกบัญชี</p>
          <div className="dialog__actions">
            <Button onClick={() => setAsking(false)}>ยกเลิก</Button>
            <Button variant="danger" loading={busy} onClick={reset}>
              รีเซ็ตข้อมูล
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

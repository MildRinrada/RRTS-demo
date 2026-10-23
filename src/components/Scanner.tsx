import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff } from 'lucide-react';
import { Button } from './ui';

type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported';

/** Continuous camera scanning with jsQR. Calls onCode once per distinct code (3 s debounce). */
export function Scanner({ paused, onCode }: { paused: boolean; onCode: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const last = useRef({ text: '', at: 0 });
  const pausedRef = useRef(paused);
  const cb = useRef(onCode);
  const [cam, setCam] = useState<CamState>('idle');
  pausedRef.current = paused;
  cb.current = onCode;

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam('unsupported');
      return;
    }
    setCam('starting');
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      stream.current = st;
      const v = video.current!;
      v.srcObject = st;
      await v.play();
      setCam('live');
      loop();
    } catch {
      setCam('denied');
    }
  }

  function loop() {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c || !stream.current) return;
    if (!pausedRef.current && v.readyState >= 2) {
      // Decode a 480-pixel-wide frame: fast enough on a mid-range phone.
      const scale = Math.min(1, 480 / v.videoWidth);
      c.width = Math.floor(v.videoWidth * scale);
      c.height = Math.floor(v.videoHeight * scale);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(v, 0, 0, c.width, c.height);
      const img = g.getImageData(0, 0, c.width, c.height);
      const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      const now = Date.now();
      if (hit?.data && !(hit.data === last.current.text && now - last.current.at < 3000)) {
        last.current = { text: hit.data, at: now };
        cb.current(hit.data.trim());
      }
    }
    requestAnimationFrame(loop);
  }

  return (
    <div className={`viewfinder viewfinder--${cam}`}>
      <video ref={video} playsInline muted aria-hidden="true" />
      <canvas ref={canvas} hidden />
      <span className="viewfinder__frame" aria-hidden="true" />
      {cam !== 'live' && (
        <div className="viewfinder__msg">
          {cam === 'denied' || cam === 'unsupported' ? (
            <>
              <CameraOff aria-hidden="true" />
              <p>{cam === 'denied' ? 'เปิดกล้องไม่ได้ อนุญาตการใช้กล้องในการตั้งค่าเบราว์เซอร์ หรือพิมพ์เลขงานด้านล่าง' : 'เบราว์เซอร์นี้ไม่รองรับกล้อง พิมพ์เลขงานด้านล่างแทน'}</p>
              {cam === 'denied' && (
                <Button size="sm" onClick={start}>
                  ลองอีกครั้ง
                </Button>
              )}
            </>
          ) : (
            <>
              <Camera aria-hidden="true" />
              <p>เล็ง QR บนสติกเกอร์ที่ติดตัวเครื่อง ระบบจะเปิดงานนั้นทันที</p>
              <Button variant="primary" size="lg" onClick={start} loading={cam === 'starting'}>
                เปิดกล้อง
              </Button>
            </>
          )}
        </div>
      )}
      {cam === 'live' && <p className="viewfinder__hint">{paused ? 'กำลังเปิดงาน' : 'เล็ง QR ให้อยู่ในกรอบ'}</p>}
    </div>
  );
}

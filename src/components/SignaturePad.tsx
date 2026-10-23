import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/**
 * On-screen signature for the counter tablet. Pointer events cover finger, stylus and mouse.
 * Reports a PNG data URL after each stroke, or null when cleared.
 */
export function SignaturePad({ label, onChange, error }: { label: string; onChange: (dataUrl: string | null) => void; error?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const setup = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const g = c.getContext('2d')!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#111827';
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  function point(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const g = canvas.current!.getContext('2d')!;
    g.beginPath();
    g.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    g.fillStyle = '#111827';
    g.fill();
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const g = canvas.current!.getContext('2d')!;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvas.current!.toDataURL('image/png'));
  }
  function clear() {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className={`sigpad${error ? ' sigpad--error' : ''}`}>
        <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={label} role="img" />
        {empty && (
          <span className="sigpad__hint" aria-hidden="true">
            เซ็นชื่อในกรอบนี้
          </span>
        )}
        <span className="sigpad__line" aria-hidden="true" />
        <button type="button" className="sigpad__clear" onClick={clear} disabled={empty}>
          <Eraser aria-hidden="true" />
          ล้าง
        </button>
      </div>
      {error && <p className="field__error">{error}</p>}
    </div>
  );
}

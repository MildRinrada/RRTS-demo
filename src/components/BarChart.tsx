import { useEffect, useRef, useState } from 'react';

/** Round, even axis steps whose top sits above the largest value. */
function ticks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step + (max % step === 0 ? step : 0);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step));
}

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })}k` : n.toLocaleString('th-TH'));

/**
 * Columns per day in the one data hue, square-cornered, on 4-5 faint gridlines with the y ticks in
 * their own lane. Empty days are drawn as nothing, not as a stub.
 */
export function BarChart({ data, label, height = 200, xLabel }: { data: { key: string; value: number }[]; label: string; height?: number; xLabel: (key: string, i: number) => string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(0, ...data.map((d) => d.value));
  const t = ticks(max);
  const top = t[t.length - 1];
  const padL = 44;
  const padB = 24;
  const padT = 8;
  const plotW = w - padL;
  const plotH = height - padB - padT;
  const slot = plotW / data.length;
  const bw = Math.max(2, Math.min(28, slot * 0.68));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const every = Math.max(1, Math.ceil(data.length / Math.max(3, Math.floor(plotW / 70))));
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="bars" ref={wrap}>
      <svg width={w} height={height} role="img" aria-label={label}>
        {t.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w} y1={y(v)} y2={y(v)} className={v === 0 ? 'bars__base' : 'bars__grid'} />
            <text x={padL - 8} y={y(v)} className="bars__tick" textAnchor="end" dominantBaseline="middle">
              {short(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          return (
            <g key={d.key} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" />
              {d.value > 0 && <rect x={x} y={y(d.value)} width={bw} height={y(0) - y(d.value)} className={`bars__bar${hover === i ? ' bars__bar--on' : ''}`} />}
              {i % every === 0 && (
                <text x={Math.min(Math.max(x + bw / 2, padL + 14), w - 14)} y={height - 6} className="bars__tick" textAnchor="middle">
                  {xLabel(d.key, i)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="bars__tip t-small" aria-live="polite">
        {h ? `${xLabel(h.key, -1)}: ${h.value.toLocaleString('th-TH')} บาท` : ' '}
      </p>
      <table className="visually-hidden">
        <caption>{label}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.key}>
              <th>{xLabel(d.key, i)}</th>
              <td className="num">{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

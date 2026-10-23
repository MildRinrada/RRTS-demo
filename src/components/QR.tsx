import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** An SVG QR. Modules stay near-black on white whatever the theme: scanners need the contrast. */
export function QR({ value, label, className }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#111111', light: '#ffffff' } }).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
  }, [value]);
  return <div className={`qr ${className ?? ''}`} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

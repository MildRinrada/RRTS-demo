import { useEffect, useId, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { shrinkPhoto } from '../lib/image';

export interface PickedPhoto {
  key: string;
  blob: Blob;
  url: string;
}

/**
 * Takes photos with the tablet's camera (or picks from the gallery on a computer), shrinks each
 * before it is kept, and shows them as thumbnails that can be removed.
 */
export function PhotoPicker({ photos, onChange, max = 8, error, hint }: { photos: PickedPhoto[]; onChange: (p: PickedPhoto[]) => void; max?: number; error?: string; hint?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const latest = useRef(photos);
  latest.current = photos;

  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setFailed('');
    const next = [...photos];
    for (const f of Array.from(files).slice(0, max - photos.length)) {
      try {
        const blob = await shrinkPhoto(f);
        next.push({ key: `${Date.now()}-${Math.random()}`, blob, url: URL.createObjectURL(blob) });
      } catch {
        setFailed(`เปิดไฟล์ ${f.name} ไม่ได้ ใช้รูป JPG หรือ PNG`);
      }
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  function remove(key: string) {
    const p = photos.find((x) => x.key === key);
    if (p) URL.revokeObjectURL(p.url);
    onChange(photos.filter((x) => x.key !== key));
  }

  return (
    <div className="field">
      <div className="photos">
        {photos.map((p, i) => (
          <figure className="photos__item" key={p.key}>
            <img src={p.url} alt={`รูปที่ ${i + 1}`} />
            <button type="button" className="photos__remove" onClick={() => remove(p.key)} aria-label={`ลบรูปที่ ${i + 1}`}>
              <X aria-hidden="true" />
            </button>
          </figure>
        ))}
        {photos.length < max && (
          <label className={`photos__add${error ? ' photos__add--error' : ''}`} htmlFor={id}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : photos.length ? <ImagePlus aria-hidden="true" /> : <Camera aria-hidden="true" />}
            <span>{photos.length ? 'เพิ่มรูป' : 'ถ่ายรูป'}</span>
          </label>
        )}
        <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/heic,image/*" capture="environment" multiple className="visually-hidden" onChange={(e) => add(e.target.files)} />
      </div>
      {hint && !error && <p className="field__hint">{hint}</p>}
      {(error || failed) && <p className="field__error">{error || failed}</p>}
    </div>
  );
}

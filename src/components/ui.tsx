import { forwardRef, useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { errorMessage } from '../api/client';
import type { JobStatus } from '../api/types';
import { STATUS_TONE } from '../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
}

const btnClass = (variant: Variant, size: string, block?: boolean, extra = '') =>
  ['btn', variant !== 'secondary' && `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', extra].filter(Boolean).join(' ');

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, loading, className = '', type = 'button', children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={btnClass(variant, size, block, className)} aria-busy={loading || undefined} disabled={disabled || loading} {...rest}>
      {loading && <LoaderCircle className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  block,
  children,
  className,
  ...rest
}: { href: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean; children: ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} className={btnClass(variant, size, block, className)} {...rest}>
      {children}
    </a>
  );
}

function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  required,
  hideLabel,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  required?: boolean;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className={hideLabel ? 'visually-hidden' : 'field__label'} htmlFor={id}>
        {label}
        {required && (
          <span className="field__req" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="field__opt">ไม่บังคับ</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-err`}>
          <CircleAlert aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  hideLabel?: boolean;
  suffix?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, hint, error, optional, required, hideLabel, id, suffix, className = '', ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const input = (
    <input
      ref={ref}
      id={fid}
      className={`input ${className}`}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
      {...rest}
    />
  );
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional} required={required} hideLabel={hideLabel}>
      {suffix ? (
        <div className="input-wrap">
          {input}
          <span className="input-wrap__suffix" aria-hidden="true">
            {suffix}
          </span>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
});

export function TextArea({
  label,
  hint,
  error,
  optional,
  required,
  rows = 3,
  ...rest
}: { label: string; hint?: ReactNode; error?: string; optional?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={required}>
      <textarea
        id={id}
        rows={rows}
        className="input input--area"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  hint,
  error,
  optional,
  required,
  hideLabel,
  children,
  ...rest
}: { label: string; hint?: ReactNode; error?: string; optional?: boolean; hideLabel?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={required} hideLabel={hideLabel}>
      <select id={id} className="input input--select" required={required} aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ checked, onChange, children, detail }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; detail?: ReactNode }) {
  const id = useId();
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__text">
        {children}
        {detail && <small>{detail}</small>}
      </span>
    </label>
  );
}

/** A pressable chip for picking from a known list (accessories, condition). */
export function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="tchip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export function StatusPill({ status, label }: { status: JobStatus; label: string }) {
  return (
    <span className={`pill pill--${STATUS_TONE[status]}`}>
      <span className="pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'warning' | 'negative' | 'positive'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'warning' ? TriangleAlert : tone === 'danger' ? CircleAlert : Info;
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <div className="notice__body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Native <dialog>: focus trapping, Escape and an inert background come with it. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog--wide' : ''}`}
      aria-labelledby={tid}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog__body">
          <div className="dialog__head">
            <h2 className="dialog__title" id={tid}>
              {title}
            </h2>
            <button type="button" className="iconbtn" onClick={onClose} aria-label="ปิด">
              <X aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  function move(delta: number) {
    const j = (idx + delta + options.length) % options.length;
    onChange(options[j].value);
    refs.current[j]?.focus();
  }
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value || (idx < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Loading and failure for a query, the same on every screen. */
export function QueryState({ loading, error, onRetry, children }: { loading: boolean; error: unknown; onRetry?: () => void; children: ReactNode }) {
  if (loading) {
    return (
      <div className="qstate" role="status">
        <LoaderCircle aria-hidden="true" className="spin" />
        กำลังโหลด
      </div>
    );
  }
  if (error) {
    return (
      <div className="qstate qstate--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{errorMessage(error)}</span>
        {onRetry && (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            ลองอีกครั้ง
          </Button>
        )}
      </div>
    );
  }
  return <>{children}</>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Baht({ value, strong }: { value: number | null | undefined; strong?: boolean }) {
  if (value === null || value === undefined) return <span className="t-faint">-</span>;
  return (
    <span className={`num${strong ? ' num--strong' : ''}`}>
      {value.toLocaleString('th-TH')}
      <span className="unit"> บาท</span>
    </span>
  );
}

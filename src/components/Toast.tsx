import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';

interface ToastItem {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

const Ctx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div className={`toast toast--${t.tone}`} key={t.id}>
            {t.tone === 'success' ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

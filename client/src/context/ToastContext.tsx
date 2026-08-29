import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { ToastKind } from '../types';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  duration: number;
  leaving: boolean;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastKind, string> = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
const TITLES: Record<ToastKind, string> = {
  success: 'Berhasil',
  error: 'Gagal',
  warning: 'Perhatian',
  info: 'Info',
};

function durationFor(kind: ToastKind) {
  return kind === 'error' ? 5000 : kind === 'warning' ? 4500 : 3500;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => remove(id), 280);
  }, [remove]);

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++idRef.current;
    const duration = durationFor(kind);
    setToasts((prev) => {
      const next = [...prev, { id, message, kind, duration, leaving: false }];
      // keep at most 4 visible, like the original
      return next.length > 4 ? next.slice(next.length - 4) : next;
    });
    const timer = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.kind}${t.leaving ? ' out' : ''}`} role="alert">
            <span className={`toast-icon ${t.kind}`}>{ICONS[t.kind]}</span>
            <div className="toast-message">
              <p className="toast-title">{TITLES[t.kind]}</p>
              <p className="toast-desc">{t.message}</p>
            </div>
            <button className="toast-close" aria-label="tutup" onClick={() => dismiss(t.id)}>
              ×
            </button>
            <div className="toast-progress" style={{ animationDuration: `${t.duration}ms` }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

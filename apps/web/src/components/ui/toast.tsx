'use client';

import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import s from './ui.module.css';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(opts: ToastOptions) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback(() => setToast(null), []);

  const show = useCallback((opts: ToastOptions) => {
    seq.current += 1;
    setToast({ ...opts, id: seq.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(dismiss, toast.durationMs ?? (toast.actionLabel ? 6000 : 3500));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast, dismiss]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={s.toastRegion} role="status" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div className={s.toast} key={toast.id} data-testid="toast">
            <span className={s.toastMessage}>{toast.message}</span>
            {toast.actionLabel && toast.onAction ? (
              <button
                type="button"
                className={s.toastAction}
                onClick={() => {
                  toast.onAction?.();
                  dismiss();
                }}
              >
                {toast.actionLabel}
              </button>
            ) : null}
            <button type="button" className={s.toastClose} onClick={dismiss} aria-label={t('common.close')}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

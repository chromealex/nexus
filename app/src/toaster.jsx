import React, {useEffect, useRef, useState} from 'react';
import {X, AlertCircle, Info, CheckCircle2} from 'lucide-react';
import {notify, onToast, pushToast} from './toasts.js';
import {loc} from './i18n.js';

function Toast({toast, onClose}) {
  const timer = useRef(null),
    left = useRef(toast.timeout),
    started = useRef(0);
  const start = () => {
    started.current = Date.now();
    timer.current = setTimeout(onClose, left.current);
  };
  const pause = () => {
    clearTimeout(timer.current);
    left.current = Math.max(1500, left.current - (Date.now() - started.current));
  };
  useEffect(() => {
    left.current = toast.timeout;
    start();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);
  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      className={'app-toast is-' + toast.tone}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="app-toast-text">
        {toast.text}
        {toast.count > 1 && <small> ×{toast.count}</small>}
      </span>
      {toast.action && (
        <button
          type="button"
          className="app-toast-action"
          onClick={() => {
            toast.action.run();
            onClose();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="app-toast-close"
        aria-label={loc('Закрыть уведомление')}
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Top of the window, above dialogs. Newest at the bottom of the stack.
export function Toaster() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => onToast(toast => setToasts(list => pushToast(list, toast))), []);
  if (!toasts.length) return null;
  return (
    <div className="app-toasts" aria-live="polite">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onClose={() => setToasts(list => list.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
}

// Shows a component's message as a toast and clears it, so nothing stays pinned inside the layout.
export function useToastOn(value, clear, tone = 'error', action = null) {
  useEffect(() => {
    if (!value) return;
    notify(typeof value === 'string' ? value : String(value), {tone, action});
    clear?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

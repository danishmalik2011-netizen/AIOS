import { useEffect } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { useNotificationStore } from '@/store/useNotificationStore';
import type { Notification } from '@/core/types';
import './Toaster.css';

const iconMap = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

function ToastItem({ toast }: { toast: Notification }) {
  const dismiss = useNotificationStore((s) => s.dismiss);
  const Icon = iconMap[toast.type];

  useEffect(() => {
    if (!toast.duration) return;
    const id = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(id);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div className={`toast glass-heavy toast--${toast.type} animate-slide-left`} role="status">
      <span className="toast__icon">
        <Icon size={18} />
      </span>
      <div className="toast__content">
        <div className="toast__title">{toast.title}</div>
        {toast.message && <div className="toast__message">{toast.message}</div>}
      </div>
      <button className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const notifications = useNotificationStore((s) => s.notifications);

  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {notifications.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

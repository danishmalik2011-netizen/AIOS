import { useState } from 'react';
import { Bell, Info, CheckCircle2, AlertTriangle, XCircle, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { IconButton } from '@/components/shared/IconButton';
import { Badge } from '@/components/shared/Badge';
import { useNotificationStore, toast } from '@/store/useNotificationStore';
import type { Notification } from '@/core/types';
import './NotificationsView.css';

const TYPE_ICON: Record<Notification['type'], typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function NotificationsView() {
  // Only real, runtime-generated notifications are rendered — no mock data.
  const storeNotifications = useNotificationStore((s) => s.notifications);
  const [now, setNow] = useState(() => Date.now());
  useState(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  });
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const notifications = storeNotifications
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    notifications.forEach((n) => {
      if (!n.read) useNotificationStore.getState().dismiss(n.id);
    });
    useNotificationStore.getState().markAllRead();
    toast.success('Success', 'Marked all notifications as read.');
  };

  const handleClearAll = () => {
    useNotificationStore.getState().clearAll();
    toast.warning('Cleared', 'Cleared all notifications.');
  };

  const toggleRead = (id: string) => {
    useNotificationStore.getState().toggleRead(id);
  };

  const deleteNotification = (id: string) => {
    useNotificationStore.getState().dismiss(id);
    toast.info('Deleted', 'Notification removed.');
  };

  const filtered = notifications.filter((n) => filter === 'all' || !n.read);

  return (
    <div className="notifications-view animate-fade-in">
      {/* Header */}
      <header className="notifications-view__header">
        <div className="notifications-view__title-row">
          <Bell className="notifications-view__title-icon" size={20} />
          <h1 className="notifications-view__title">Notifications Hub</h1>
          {unreadCount > 0 && (
            <Badge variant="accent" className="notifications-view__badge">
              {unreadCount} unread
            </Badge>
          )}
        </div>
        <div className="notifications-view__actions">
          <Button variant="ghost" size="sm" icon={<Check size={14} />} onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all read
          </Button>
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={handleClearAll} disabled={notifications.length === 0}>
            Clear all
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="notifications-view__tabs">
        <button
          className={`notifications-view__tab ${filter === 'all' ? 'notifications-view__tab--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All events ({notifications.length})
        </button>
        <button
          className={`notifications-view__tab ${filter === 'unread' ? 'notifications-view__tab--active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* List */}
      <div className="notifications-view__list">
        {filtered.length === 0 ? (
          <div className="notifications-view__empty">
            <Bell size={42} className="notifications-view__empty-icon" />
            <p className="notifications-view__empty-title">All clean here!</p>
            <p className="notifications-view__empty-desc">No new system alerts or notifications.</p>
          </div>
        ) : (
          filtered.map((item) => {
            const Icon =
              item.type === 'success'
                ? CheckCircle2
                : item.type === 'warning'
                ? AlertTriangle
                : item.type === 'error'
                ? XCircle
                : Info;

            return (
              <div
                key={item.id}
                className={`notifications-view__item notifications-view__item--${item.type} ${
                  item.read ? 'notifications-view__item--read' : ''
                } glass-card`}
              >
                <div className="notifications-view__item-indicator">
                  <Icon size={16} className={`notifications-view__item-icon--${item.type}`} />
                </div>
                <div className="notifications-view__item-content">
                  <h3 className="notifications-view__item-title">{item.title}</h3>
                  <p className="notifications-view__item-msg">{item.message}</p>
                  <span className="notifications-view__item-time">{relativeTime(item.timestamp, now)}</span>
                </div>
                <div className="notifications-view__item-actions">
                  <IconButton
                    icon={<Check size={14} />}
                    tooltip={item.read ? 'Mark unread' : 'Mark read'}
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRead(item.id)}
                  />
                  <IconButton
                    icon={<Trash2 size={14} />}
                    tooltip="Delete"
                    variant="ghost"
                    size="sm"
                    className="notifications-view__item-delete"
                    onClick={() => deleteNotification(item.id)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

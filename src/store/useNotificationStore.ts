import { create } from 'zustand';
import type { Notification } from '@/core/types';

interface NotificationStore {
  notifications: Notification[];
  notify: (n: Omit<Notification, 'id' | 'timestamp'>) => string;
  dismiss: (id: string) => void;
  markAllRead: () => void;
  toggleRead: (id: string) => void;
  clearAll: () => void;
}

let counter = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  notify: (n) => {
    counter += 1;
    const id = `toast-${counter}`;
    const notification: Notification = {
      id,
      timestamp: Date.now(),
      duration: 4200,
      read: false,
      ...n,
    };
    set((state) => ({ notifications: [...state.notifications, notification] }));
    return id;
  },

  dismiss: (id) =>
    set((state) => ({ notifications: state.notifications.filter((t) => t.id !== id) })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((t) => (t.read ? t : { ...t, read: true })),
    })),

  toggleRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((t) =>
        t.id === id ? { ...t, read: !t.read } : t,
      ),
    })),

  clearAll: () => set({ notifications: [] }),
}));

/** Convenience helper usable outside React components. */
export const toast = {
  info: (title: string, message = '') =>
    useNotificationStore.getState().notify({ type: 'info', title, message }),
  success: (title: string, message = '') =>
    useNotificationStore.getState().notify({ type: 'success', title, message }),
  warning: (title: string, message = '') =>
    useNotificationStore.getState().notify({ type: 'warning', title, message }),
  error: (title: string, message = '') =>
    useNotificationStore.getState().notify({ type: 'error', title, message }),
};

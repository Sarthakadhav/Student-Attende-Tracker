import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Notification } from "../types";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.notifications();
      setNotifications(d.notifications);
      setUnread(d.unread);
    } catch { /* not critical */ }
  }, []);

  useEffect(() => {
    const run = async () => { await load(); };
    void run();
    const t = setInterval(() => { void run(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((n) => n.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
  };

  return { notifications, unread, open, setOpen, markAllRead, reload: load };
}

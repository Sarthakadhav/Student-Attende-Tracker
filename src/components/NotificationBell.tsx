// eslint-disable-next-line react-refresh/only-export-components
export { useNotifications } from "./useNotifications";

import { useEffect, useRef } from "react";
import { Bell, Check } from "lucide-react";
import { api } from "../api";
import type { Notification } from "../types";
import { timeAgo } from "../utils/format";

type NotificationBellProps = {
  notifications: Notification[];
  unread: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  markAllRead: () => void;
  onNavigate?: (applicationId: string) => void;
};

const KIND_LABEL: Record<string, string> = {
  new_application: "New application",
  reviewed: "Application reviewed",
  reminder: "Reminder",
};

export function NotificationBell({
  notifications, unread, open, setOpen, markAllRead, onNavigate,
}: NotificationBellProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, setOpen]);

  return (
    <div className="notif-wrap" ref={ref}>
      <button className="top-icon" onClick={() => setOpen(!open)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}>
        <Bell size={20} />
        {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-label="Notifications">
          <div className="notif-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="notif-mark-all" onClick={markAllRead}>
                <Check size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0
              ? <p className="notif-empty">No notifications yet.</p>
              : notifications.map((n) => (
                <button key={n.id} className={`notif-item${n.readAt ? "" : " notif-unread"}`}
                  onClick={() => {
                    if (!n.readAt) api.markNotificationRead(n.id).catch(() => {});
                    setOpen(false);
                    if (n.applicationId && onNavigate) onNavigate(n.applicationId);
                  }}>
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-body">{n.body}</div>
                  <div className="notif-item-time">
                    {KIND_LABEL[n.kind] ?? n.kind} · {timeAgo(n.createdAt).toLowerCase()}
                  </div>
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

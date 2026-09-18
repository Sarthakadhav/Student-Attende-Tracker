import type { LucideIcon } from "lucide-react";
import { FileCheck, LogOut, X } from "lucide-react";
import { initials } from "../utils/format";

export type NavItem<K extends string> = {
  key: K;
  label: string;
  icon: LucideIcon;
};

type SidebarProps<K extends string> = {
  portalName: string;
  items: NavItem<K>[];
  active: K;
  onNavigate: (key: K) => void;
  userName: string;
  userDetail: string;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
};

function Sidebar<K extends string>({
  portalName,
  items,
  active,
  onNavigate,
  userName,
  userDetail,
  onLogout,
  open,
  onClose,
}: SidebarProps<K>) {
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-logo">
            <FileCheck size={21} />
          </div>

          <div>
            <h2>Sanjivani University</h2>
            <span>{portalName}</span>
          </div>

          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-link ${active === key ? "active" : ""}`}
              onClick={() => {
                onNavigate(key);
                onClose();
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-profile">
          <div className="profile-avatar">{initials(userName)}</div>

          <div className="sidebar-profile-text">
            <strong>{userName}</strong>
            <span>{userDetail}</span>
          </div>

          <button className="logout-button" onClick={onLogout} aria-label="Log out" title="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;

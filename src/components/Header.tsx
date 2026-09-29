import type { ReactNode } from "react";
import { Menu, User } from "lucide-react";

type HeaderProps = {
  title: string;
  userName: string;
  userDetail: string;
  hasUnread?: boolean;
  onBellClick?: () => void;
  onMenuClick: () => void;
  /** Slot for a custom bell (NotificationBell component). Falls back to a plain bell if omitted. */
  bellSlot?: ReactNode;
};

const Header = ({ title, userName, userDetail, onMenuClick, bellSlot }: HeaderProps) => (
  <header className="topbar">
    <div className="topbar-left">
      <button className="top-icon menu-button" onClick={onMenuClick} aria-label="Open menu">
        <Menu size={19} />
      </button>
      <span className="topbar-title">{title}</span>
    </div>
    <div className="topbar-right">
      {bellSlot}
      <div className="top-profile">
        <div className="top-profile-avatar"><User size={17} /></div>
        <div className="top-profile-info">
          <strong>{userName}</strong>
          <span>{userDetail}</span>
        </div>
      </div>
    </div>
  </header>
);

export default Header;

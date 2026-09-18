import { Bell, Menu, User } from "lucide-react";

type HeaderProps = {
  title: string;
  userName: string;
  userDetail: string;
  hasUnread?: boolean;
  onBellClick?: () => void;
  onMenuClick: () => void;
};

const Header = ({
  title,
  userName,
  userDetail,
  hasUnread = false,
  onBellClick,
  onMenuClick,
}: HeaderProps) => {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="top-icon menu-button" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={19} />
        </button>

        <span className="topbar-title">{title}</span>
      </div>

      <div className="topbar-right">
        <button
          className="top-icon notification-icon"
          onClick={onBellClick}
          aria-label={hasUnread ? "Notifications (new)" : "Notifications"}
        >
          <Bell size={19} />
          {hasUnread && <span className="notification-indicator" />}
        </button>

        <div className="top-profile">
          <div className="top-profile-avatar">
            <User size={17} />
          </div>

          <div className="top-profile-info">
            <strong>{userName}</strong>
            <span>{userDetail}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

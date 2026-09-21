import { useCallback, useEffect, useState } from "react";
import { FilePlus2, FileText, LayoutDashboard, ListChecks } from "lucide-react";
import { api } from "../api";
import Header from "../components/Header";
import LeaveApplication from "../components/LeaveApplication";
import Sidebar from "../components/Sidebar";
import type { NavItem } from "../components/Sidebar";
import StatusBadge from "../components/StatusBadge";
import type { LeaveApplication as Application, User } from "../types";
import { formatRange, timeAgo } from "../utils/format";

type Page = "dashboard" | "apply" | "applications";

const NAV: NavItem<Page>[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "apply", label: "Apply for attendance", icon: FilePlus2 },
  { key: "applications", label: "My applications", icon: ListChecks },
];

type StudentDashboardProps = {
  user: User;
  onLogout: () => void;
};

const StudentDashboard = ({ user, onLogout }: StudentDashboardProps) => {
  const [page, setPage] = useState<Page>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api
        .applications()
        .then((data) => {
          setApplications(data.applications);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  // Names in the class list are in capitals, sometimes surname first, so show the full name.
  const displayName = user.name.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
  const events = applications.filter((a) => a.kind === "event");
  const approvedSessions = events.filter((a) => a.status === "approved").reduce((n, a) => n + a.sessions, 0);
  const waiting = applications.filter((a) => a.status === "pending").length;

  return (
    <div className="app">
      <Sidebar
        portalName="Student portal"
        items={NAV}
        active={page}
        onNavigate={setPage}
        userName={user.name}
        userDetail={user.prn ?? ""}
        onLogout={onLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main className="main">
        <Header
          title="Student portal"
          userName={user.name}
          userDetail={user.classId ?? ""}
          onBellClick={() => setPage("applications")}
          onMenuClick={() => setMenuOpen(true)}
        />

        <div className="content">
          {error && <div className="page-error">{error}</div>}

          {page === "apply" ? (
            <LeaveApplication onBack={() => setPage("dashboard")} onSubmitted={load} />
          ) : loading ? (
            <p className="page-loading">Loading…</p>
          ) : page === "applications" ? (
            <ApplicationList applications={applications} onApply={() => setPage("apply")} />
          ) : (
            <>
              <section className="welcome-section">
                <div>
                  <h1>Welcome, {displayName}</h1>
                  <p className="welcome-text">
                    {user.classLabel}. Missed lectures for an approved event? Apply here with your
                    pre-approval letter and certificate.
                  </p>
                </div>
                <button className="primary-button" onClick={() => setPage("apply")}>
                  <FilePlus2 size={17} />
                  Apply for attendance
                </button>
              </section>

              <section className="stat-row">
                <div className="stat-card">
                  <span>Approved event sessions</span>
                  <strong>{approvedSessions}</strong>
                  <p>Added to your attendance by your class coordinator.</p>
                </div>
                <div className="stat-card">
                  <span>Waiting for review</span>
                  <strong>{waiting}</strong>
                  <p>Application{waiting === 1 ? "" : "s"} your coordinator hasn't checked yet.</p>
                </div>
                <div className="stat-card">
                  <span>Applications</span>
                  <strong>{applications.length}</strong>
                  <p>Submitted this semester.</p>
                </div>
              </section>

              <section className="student-section">
                <div className="section-heading">
                  <h2>Recent applications</h2>
                </div>
                <ApplicationList applications={applications.slice(0, 5)} onApply={() => setPage("apply")} compact />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

type ApplicationListProps = {
  applications: Application[];
  onApply: () => void;
  compact?: boolean;
};

function ApplicationList({ applications, onApply, compact = false }: ApplicationListProps) {
  if (applications.length === 0) {
    return (
      <div className="empty-state">
        <FileText size={24} />
        <p>You haven't applied yet.</p>
        <button className="secondary-button" onClick={onApply}>
          Apply for attendance
        </button>
      </div>
    );
  }

  return (
    <section className={compact ? "" : "student-section"}>
      {!compact && (
        <div className="section-heading">
          <h2>My applications</h2>
          <p>Medical applications are kept on record but not counted, as per the circular.</p>
        </div>
      )}

      <div className="application-list">
        {applications.map((a) => (
          <article className="application-row" key={a.id}>
            <div className="application-row-main">
              <strong>
                {a.eventName}
                {a.kind === "medical" && <span className="kind-tag">Medical, not counted</span>}
              </strong>
              <span>
                {formatRange(a.startDate, a.endDate)}, {a.sessions} session{a.sessions === 1 ? "" : "s"}
              </span>
              {a.remark && <p className={`application-remark remark-${a.status}`}>Coordinator: {a.remark}</p>}
            </div>
            <div className="application-row-side">
              <StatusBadge status={a.status} />
              <span>Submitted {timeAgo(a.submittedAt).toLowerCase()}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default StudentDashboard;

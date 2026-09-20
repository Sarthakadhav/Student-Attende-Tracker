import { useCallback, useEffect, useState } from "react";
import { ClipboardList, FilePlus2, FileText, LayoutDashboard, ListChecks } from "lucide-react";
import { api } from "../api";
import CircularTable from "../components/CircularTable";
import ErpAttendanceForm from "../components/ErpAttendanceForm";
import Header from "../components/Header";
import LeaveApplication from "../components/LeaveApplication";
import Sidebar from "../components/Sidebar";
import type { NavItem } from "../components/Sidebar";
import StatusBadge from "../components/StatusBadge";
import type { CircularRow, LeaveApplication as Application, User } from "../types";
import { formatRange, timeAgo } from "../utils/format";

type Page = "dashboard" | "erp" | "apply" | "applications";

const NAV: NavItem<Page>[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "erp", label: "My ERP attendance", icon: ClipboardList },
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
  const [rows, setRows] = useState<CircularRow[]>([]);
  const [ready, setReady] = useState(true);
  const [threshold, setThreshold] = useState(75);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([api.applications(), api.myAttendance()])
        .then(([apps, att]) => {
          setApplications(apps.applications);
          setRows(att.rows);
          setReady(att.ready);
          setThreshold(att.threshold);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const entered = rows.filter((r) => r.total !== null);
  const below = entered.filter((r) => (r.finalPercent ?? 0) < threshold);
  // Names in the class list are in capitals, sometimes surname first, so show the full name.
  const displayName = user.name
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

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
            <LeaveApplication
              onBack={() => setPage("dashboard")}
              onOpenErp={() => setPage("erp")}
              onSubmitted={load}
            />
          ) : page === "erp" ? (
            <ErpAttendanceForm onSaved={load} />
          ) : loading ? (
            <p className="page-loading">Loading your attendance…</p>
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

              {!ready ? (
                <div className="empty-state">
                  <p>
                    Your class's time table hasn't been added to the system yet, so attendance can't be
                    calculated. Contact your class coordinator.
                  </p>
                </div>
              ) : (
                <section className="student-section">
                  <div className="section-heading section-heading-row">
                    <div>
                      <h2>My attendance</h2>
                      <p>
                        ERP attendance plus approved event lectures, as per the Registrar's circular. You
                        need {threshold}% in every subject.
                      </p>
                    </div>
                    {entered.length > 0 && (
                      <div className={`overall-figure ${below.length ? "text-warning" : "text-good"}`}>
                        <strong>{below.length}</strong>
                        <span>subject{below.length === 1 ? "" : "s"} below {threshold}%</span>
                      </div>
                    )}
                  </div>

                  {entered.length === 0 ? (
                    <div className="empty-state">
                      <p>Enter your ERP attendance first. The table fills in from there.</p>
                      <button className="secondary-button" onClick={() => setPage("erp")}>
                        Enter ERP attendance
                      </button>
                    </div>
                  ) : (
                    <div className="table-card">
                      <CircularTable rows={rows} threshold={threshold} mode="overall" />
                    </div>
                  )}
                </section>
              )}

              <section className="student-section">
                <div className="section-heading">
                  <h2>Recent applications</h2>
                </div>
                <ApplicationList
                  applications={applications.slice(0, 3)}
                  onApply={() => setPage("apply")}
                  compact
                />
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
              {a.remark && (
                <p className={`application-remark remark-${a.status}`}>Coordinator: {a.remark}</p>
              )}
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
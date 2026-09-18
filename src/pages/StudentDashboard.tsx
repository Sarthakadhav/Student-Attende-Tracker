import { useCallback, useEffect, useState } from "react";
import { FilePlus2, FileText, LayoutDashboard, ListChecks } from "lucide-react";
import { api } from "../api";
import AttendanceCard from "../components/AttendanceCard";
import Header from "../components/Header";
import LeaveApplication from "../components/LeaveApplication";
import Sidebar from "../components/Sidebar";
import type { NavItem } from "../components/Sidebar";
import StatusBadge from "../components/StatusBadge";
import type { AttendanceRecord, LeaveApplication as Application, User } from "../types";
import { ATTENDANCE_THRESHOLD, formatRange, timeAgo } from "../utils/format";

type Page = "dashboard" | "apply" | "applications";

const NAV: NavItem<Page>[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "apply", label: "Apply for leave", icon: FilePlus2 },
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
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([api.applications(), api.attendance()])
        .then(([apps, att]) => {
          setApplications(apps.applications);
          setAttendance(att.records[0] ?? null);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const detail = `${user.year} CSE, division ${user.division}`;
  const firstName = user.name.split(" ")[0];

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
          userDetail={detail}
          onBellClick={() => setPage("applications")}
          onMenuClick={() => setMenuOpen(true)}
        />

        <div className="content">
          {error && <div className="page-error">{error}</div>}

          {page === "apply" ? (
            <LeaveApplication onBack={() => setPage("dashboard")} onSubmitted={load} />
          ) : loading ? (
            <p className="page-loading">Loading your attendance…</p>
          ) : page === "applications" ? (
            <ApplicationList applications={applications} onApply={() => setPage("apply")} />
          ) : (
            <>
              <section className="welcome-section">
                <div>
                  <h1>Hi, {firstName}</h1>
                  <p className="welcome-text">
                    Missed lectures for an event? Apply for duty leave and your attendance
                    is updated once it's approved.
                  </p>
                </div>

                <button className="primary-button" onClick={() => setPage("apply")}>
                  <FilePlus2 size={17} />
                  Apply for leave
                </button>
              </section>

              {/* {attendance && (
                <section className="student-section">
                  <div className="section-heading section-heading-row">
                    <div>
                      <h2>My attendance</h2>
                      <p>Including approved duty leave. You need {ATTENDANCE_THRESHOLD}% in every subject.</p>
                    </div>

                    <div
                      className={`overall-figure ${
                        attendance.total.afterPercent >= ATTENDANCE_THRESHOLD ? "text-good" : "text-warning"
                      }`}
                    >
                      <strong>{attendance.total.afterPercent}%</strong>
                      <span>overall</span>
                    </div>
                  </div>

                  <div className="subject-grid">
                    {attendance.subjects.map((s) => (
                      <AttendanceCard
                        key={s.subjectCode}
                        subject={s.subjectName}
                        attended={s.attended}
                        dutyLeave={s.dutyLeave}
                        pendingLeave={s.pendingLeave}
                        total={s.conducted}
                        percentage={s.afterPercent}
                      />
                    ))}
                  </div>
                </section>
              )} */}

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
        <p>You haven't applied for duty leave yet.</p>
        <button className="secondary-button" onClick={onApply}>
          Apply for leave
        </button>
      </div>
    );
  }

  return (
    <section className={compact ? "" : "student-section"}>
      {!compact && (
        <div className="section-heading">
          <h2>My applications</h2>
          <p>Every duty leave you've applied for this semester.</p>
        </div>
      )}

      <div className="application-list">
        {applications.map((a) => (
          <article className="application-row" key={a.id}>
            <div className="application-row-main">
              <strong>{a.eventName}</strong>
              <span>
                {formatRange(a.startDate, a.endDate)}, {a.lectures.length} lecture
                {a.lectures.length === 1 ? "" : "s"}
              </span>
              {a.remark && (
                <p className={`application-remark remark-${a.status}`}>
                  Coordinator: {a.remark}
                </p>
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

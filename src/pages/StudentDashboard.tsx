import { useCallback, useEffect, useState } from "react";
import { Bell, FilePlus2, FileText, LayoutDashboard, ListChecks, Upload } from "lucide-react";
import { api } from "../api";
import Header from "../components/Header";
import LeaveApplication from "../components/LeaveApplication";
import { NotificationBell, useNotifications } from "../components/NotificationBell";
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

type StudentDashboardProps = { user: User; onLogout: () => void };

const StudentDashboard = ({ user, onLogout }: StudentDashboardProps) => {
  const [page, setPage] = useState<Page>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const notif = useNotifications();

  const load = useCallback(
    () =>
      api
        .applications()
        .then((data) => { setApplications(data.applications); setError(""); })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => { load(); }, [load]);

  const displayName = user.name.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
  const events = applications.filter((a) => a.kind === "event");
  const approvedSessions = events.filter((a) => a.status === "approved").reduce((n, a) => n + a.sessions, 0);
  const waiting = applications.filter((a) => a.status === "pending").length;
  const totalUnread = (notif.unread) + applications.filter((a) => a.studentUnread).length;

  const handleNavigateToApp = (appId: string) => {
    setPage("applications");
    const app = applications.find((a) => a.id === appId);
    if (app?.studentUnread) api.studentMarkRead(appId).catch(() => {});
  };

  return (
    <div className="app">
      <Sidebar portalName="Student portal" items={NAV} active={page} onNavigate={setPage}
        userName={user.name} userDetail={user.prn ?? ""} onLogout={onLogout}
        open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="main">
        <Header title="Student portal" userName={user.name} userDetail={user.classId ?? ""}
          hasUnread={totalUnread > 0} onBellClick={() => setPage("applications")}
          onMenuClick={() => setMenuOpen(true)}
          bellSlot={
            <NotificationBell {...notif} onNavigate={handleNavigateToApp} />
          } />
        <div className="content">
          {error && <div className="page-error">{error}</div>}
          {page === "apply" ? (
            <LeaveApplication onBack={() => setPage("dashboard")} onSubmitted={load} />
          ) : loading ? (
            <p className="page-loading">Loading…</p>
          ) : page === "applications" ? (
            <ApplicationList applications={applications} onApply={() => setPage("apply")}
              onUpdated={(a) => setApplications((prev) => prev.map((x) => x.id === a.id ? a : x))}
              uploadTarget={uploadTarget} setUploadTarget={setUploadTarget} />
          ) : (
            <>
              <section className="welcome-section">
                <div>
                  <h1>Welcome, {displayName}</h1>
                  <p className="welcome-text">{user.classLabel}. Missed lectures for an approved event?
                    Apply here with your pre-approval letter and certificate.</p>
                </div>
                <button className="primary-button" onClick={() => setPage("apply")}>
                  <FilePlus2 size={17} /> Apply for attendance
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
                <div className="section-heading"><h2>Recent applications</h2></div>
                <ApplicationList applications={applications.slice(0, 5)} onApply={() => setPage("apply")}
                  onUpdated={(a) => setApplications((prev) => prev.map((x) => x.id === a.id ? a : x))}
                  compact uploadTarget={uploadTarget} setUploadTarget={setUploadTarget} />
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
  onUpdated: (a: Application) => void;
  compact?: boolean;
  uploadTarget: string | null;
  setUploadTarget: (id: string | null) => void;
};

function ApplicationList({ applications, onApply, onUpdated, compact = false, uploadTarget, setUploadTarget }: ApplicationListProps) {
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [error, setError] = useState("");

  const [now] = useState(() => Date.now());

  if (applications.length === 0) {
    return (
      <div className="empty-state">
        <FileText size={24} />
        <p>You haven't applied yet.</p>
        <button className="secondary-button" onClick={onApply}>Apply for attendance</button>
      </div>
    );
  }
  const sendReminder = async (id: string) => {
    try {
      await api.sendReminder(id);
      setReminderSent((p) => ({ ...p, [id]: true }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const uploadCert = async (id: string) => {
    if (!certFile) { setError("Choose the certificate file."); return; }
    setCertLoading(true); setError("");
    try {
      const r = await api.uploadCertificate(id, certFile);
      onUpdated(r.application);
      setUploadTarget(null); setCertFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCertLoading(false);
    }
  };

  return (
    <section className={compact ? "" : "student-section"}>
      {!compact && (
        <div className="section-heading">
          <h2>My applications</h2>
          <p>Medical applications are kept on record but not counted, as per the circular.</p>
        </div>
      )}
      {error && <div className="page-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="application-list">
        {applications.map((a) => {
          const ageH = (now - new Date(a.submittedAt).getTime()) / 3_600_000;
          const canRemind = a.status === "pending" && ageH >= 24 && !reminderSent[a.id];
          const isUploadTarget = uploadTarget === a.id;
          return (
            <article className={`application-row${a.studentUnread ? " row-unread" : ""}`} key={a.id}
              onClick={() => { if (a.studentUnread) api.studentMarkRead(a.id).catch(() => {}); }}>
              <div className="application-row-main">
                <strong>
                  {a.eventName}
                  {a.kind === "medical" && <span className="kind-tag">Medical, not counted</span>}
                  {a.certificatePending && a.status === "pending" && (
                    <span className="kind-tag cert-pending-tag">Certificate pending</span>
                  )}
                </strong>
                <span>{formatRange(a.startDate, a.endDate)}, {a.sessions} session{a.sessions === 1 ? "" : "s"}</span>
                {a.remark && <p className={`application-remark remark-${a.status}`}>Coordinator: {a.remark}</p>}

                {/* Upload certificate after the event */}
                {a.certificatePending && a.status !== "rejected" && (
                  isUploadTarget ? (
                    <div className="cert-upload-inline" onClick={(e) => e.stopPropagation()}>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
                      <div className="cert-upload-actions">
                        <button className="secondary-button small-btn" onClick={() => { setUploadTarget(null); setCertFile(null); }}>Cancel</button>
                        <button className="primary-button small-btn" disabled={!certFile || certLoading} onClick={() => uploadCert(a.id)}>
                          <Upload size={14} /> {certLoading ? "Uploading…" : "Upload certificate"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="secondary-button small-btn cert-upload-btn"
                      onClick={(e) => { e.stopPropagation(); setUploadTarget(a.id); }}>
                      <Upload size={14} /> Upload certificate now
                    </button>
                  )
                )}

                {/* Reminder */}
                {canRemind && (
                  <button className="reminder-btn" onClick={(e) => { e.stopPropagation(); sendReminder(a.id); }}>
                    <Bell size={13} /> Send reminder to coordinator
                  </button>
                )}
                {reminderSent[a.id] && (
                  <span className="reminder-sent">✓ Reminder sent</span>
                )}
                {a.status === "pending" && ageH < 24 && (
                  <span className="reminder-hint">Reminder available after 24 h</span>
                )}
              </div>
              <div className="application-row-side">
                <StatusBadge status={a.status} />
                <span>Submitted {timeAgo(a.submittedAt).toLowerCase()}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default StudentDashboard;

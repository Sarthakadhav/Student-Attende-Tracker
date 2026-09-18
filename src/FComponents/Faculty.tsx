import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  X,
} from "lucide-react";
import { api } from "../api";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import type { NavItem } from "../components/Sidebar";
import StatusBadge from "../components/StatusBadge";
import type {
  ApplicationStatus,
  AttendanceNumbers,
  AttendanceRecord,
  LeaveApplication,
  User,
} from "../types";
import {
  ATTENDANCE_THRESHOLD,
  formatDate,
  formatFileSize,
  formatRange,
  formatTime,
  initials,
  timeAgo,
} from "../utils/format";
import "./Faculty.css";

type Page = "dashboard" | "attendance" | "application";

const NAV: NavItem<Exclude<Page, "application">>[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "attendance", label: "Calculate attendance", icon: ClipboardCheck },
];

type FacultyProps = {
  user: User;
  onLogout: () => void;
};

/* =========================================
   FACULTY PORTAL
========================================= */

function Faculty({ user, onLogout }: FacultyProps) {
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadApplications = useCallback(
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
    loadApplications();
  }, [loadApplications]);

  const replaceApplication = (updated: LeaveApplication) =>
    setApplications((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );

  const openApplication = (application: LeaveApplication) => {
    setSelectedId(application.id);
    setActivePage("application");

    if (application.unread) {
      replaceApplication({ ...application, unread: false });
      api.markRead(application.id).catch(() => {
        /* not critical: it shows as unread again after a refresh */
      });
    }
  };

  const goToDashboard = () => {
    setSelectedId(null);
    setActivePage("dashboard");
  };

  const selectedApplication = applications.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="app">
      <Sidebar
        portalName="Faculty portal"
        items={NAV}
        active={activePage === "attendance" ? "attendance" : "dashboard"}
        onNavigate={(key) => {
          setSelectedId(null);
          setActivePage(key);
        }}
        userName={user.name}
        userDetail={user.designation ?? "Faculty"}
        onLogout={onLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main className="main">
        <Header
          title="Faculty portal"
          userName={user.name}
          userDetail="2026–27"
          hasUnread={applications.some((a) => a.unread)}
          onBellClick={goToDashboard}
          onMenuClick={() => setMenuOpen(true)}
        />

        <div className="content">
          {error && <div className="page-error">{error}</div>}

          {activePage === "attendance" ? (
            <AttendanceCalculation onBack={goToDashboard} />
          ) : activePage === "application" && selectedApplication ? (
            <ApplicationDetails
              key={selectedApplication.id}
              application={selectedApplication}
              onBack={goToDashboard}
              onReviewed={replaceApplication}
            />
          ) : (
            <Dashboard
              name={user.name}
              applications={applications}
              loading={loading}
              onOpen={openApplication}
              onRefresh={loadApplications}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* =========================================
   DASHBOARD
========================================= */

type Filter = ApplicationStatus | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

type DashboardProps = {
  name: string;
  applications: LeaveApplication[];
  loading: boolean;
  onOpen: (application: LeaveApplication) => void;
  onRefresh: () => void;
};

function Dashboard({ name, applications, loading, onOpen, onRefresh }: DashboardProps) {
  const [filter, setFilter] = useState<Filter>("pending");

  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const visible =
    filter === "all" ? applications : applications.filter((a) => a.status === filter);

  return (
    <>
      <section className="welcome-section">
        <div>
          <h1>Welcome back, {name}</h1>
          <p className="welcome-text">
            {pendingCount === 0
              ? "No leave applications are waiting for you."
              : `${pendingCount} leave application${
                  pendingCount === 1 ? " is" : "s are"
                } waiting for your review.`}
          </p>
        </div>

        <button className="secondary-button" onClick={onRefresh}>
          Refresh
        </button>
      </section>

      <section className="notification-section">
        <div className="section-heading section-heading-row">
          <div>
            <h2>Leave applications</h2>
            <p>Submitted by students with the HOD-signed letter.</p>
          </div>

          <div className="filter-tabs" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                className={filter === f.key ? "active" : ""}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="page-loading">Loading applications…</p>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <FileText size={24} />
            <p>No applications here.</p>
          </div>
        ) : (
          <div className="notification-list">
            {visible.map((application) => (
              <button
                key={application.id}
                className={`notification-card ${application.unread ? "unread" : ""}`}
                onClick={() => onOpen(application)}
              >
                <div className="notification-main">
                  <div className="notification-avatar">
                    <FileText size={19} />
                  </div>

                  <div className="notification-text">
                    <p className="notification-message">
                      <strong>{application.student.name}</strong> applied for{" "}
                      {application.lectures.length} lecture
                      {application.lectures.length === 1 ? "" : "s"} for{" "}
                      {application.eventName}
                    </p>
                    <span>
                      {formatRange(application.startDate, application.endDate)}, submitted{" "}
                      {timeAgo(application.submittedAt).toLowerCase()}
                    </span>
                  </div>
                </div>

                <div className="notification-action">
                  <StatusBadge status={application.status} />
                  {application.unread && <span className="unread-dot" />}
                  <ChevronRight size={20} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* =========================================
   ATTENDANCE CALCULATION
========================================= */

type AttendanceCalculationProps = {
  onBack: () => void;
};

function AttendanceCalculation({ onBack }: AttendanceCalculationProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [subject, setSubject] = useState("all");
  const [includePending, setIncludePending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .attendance()
      .then((data) => setRecords(data.records))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const subjects = records[0]?.subjects ?? [];

  const rows = useMemo(
    () =>
      records.map((record) => {
        const numbers: AttendanceNumbers =
          subject === "all"
            ? record.total
            : record.subjects.find((s) => s.subjectCode === subject) ?? record.total;

        const leave = numbers.dutyLeave + (includePending ? numbers.pendingLeave : 0);
        const after =
          Math.round(((numbers.attended + leave) / numbers.conducted) * 1000) / 10;

        return { student: record.student, before: numbers.beforePercent, leave, after };
      }),
    [records, subject, includePending]
  );

  const belowCount = rows.filter((r) => r.after < ATTENDANCE_THRESHOLD).length;

  return (
    <section className="attendance-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={17} />
        Back to dashboard
      </button>

      <div className="application-heading">
        <div>
          <h1>Calculate attendance</h1>
          <p>Attendance before and after approved duty leave is added back.</p>
        </div>
      </div>

      <div className="attendance-card">
        <div className="attendance-card-header attendance-controls">
          <div>
            <h2>
              {rows.length === 0
                ? "No students yet"
                : belowCount === 0
                  ? "Every student is at 75% or above"
                  : `${belowCount} student${belowCount === 1 ? " is" : "s are"} below 75%`}
            </h2>
            <p>Duty leave only gives back lectures the student actually missed.</p>
          </div>

          <div className="attendance-filters">
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Subject"
            >
              <option value="all">All subjects</option>
              {subjects.map((s) => (
                <option key={s.subjectCode} value={s.subjectCode}>
                  {s.subjectName}
                </option>
              ))}
            </select>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includePending}
                onChange={(e) => setIncludePending(e.target.checked)}
              />
              Also count applications waiting for review
            </label>
          </div>
        </div>

        {error ? (
          <p className="page-error table-message">{error}</p>
        ) : loading ? (
          <p className="page-loading table-message">Calculating…</p>
        ) : rows.length === 0 ? (
          <p className="page-loading table-message">No students have signed up yet.</p>
        ) : (
          <div className="attendance-table">
            <div className="attendance-table-header attendance-grid-5">
              <span>Student</span>
              <span>Before</span>
              <span>Duty leave</span>
              <span>After</span>
              <span>Status</span>
            </div>

            {rows.map((row) => (
              <div className="attendance-table-row attendance-grid-5" key={row.student.id}>
                <div className="attendance-student">
                  <div className="attendance-avatar">{initials(row.student.name)}</div>
                  <div>
                    <strong>{row.student.name}</strong>
                    <span className="student-meta">
                      {row.student.prn}, {row.student.year} {row.student.division}
                    </span>
                  </div>
                </div>

                <span className="missed-lectures">{row.before}%</span>
                <span className="missed-lectures">+{row.leave}</span>

                <div className="attendance-percentage">
                  <strong>{row.after}%</strong>
                </div>

                <span
                  className={
                    row.after >= ATTENDANCE_THRESHOLD ? "status-good" : "status-warning"
                  }
                >
                  {row.after >= ATTENDANCE_THRESHOLD ? "Safe" : "Detention risk"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="attendance-footer">
          <span>
            The attendance register is demo data until the department's records are
            connected.
          </span>
          <strong>Threshold: {ATTENDANCE_THRESHOLD}%</strong>
        </div>
      </div>
    </section>
  );
}

/* =========================================
   APPLICATION DETAILS
========================================= */

type ApplicationDetailsProps = {
  application: LeaveApplication;
  onBack: () => void;
  onReviewed: (application: LeaveApplication) => void;
};

function ApplicationDetails({ application, onBack, onReviewed }: ApplicationDetailsProps) {
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState("");

  const review = async (status: "approved" | "rejected") => {
    setError("");
    if (status === "rejected" && remark.trim().length < 3) {
      setError("Add a remark so the student knows why it was rejected.");
      return;
    }

    setSaving(status);
    try {
      const { application: updated } = await api.review(
        application.id,
        status,
        remark.trim()
      );
      onReviewed(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const openDocument = () => {
    setError("");
    api.openDocument(application.id).catch((err: Error) => setError(err.message));
  };

  const { student } = application;

  return (
    <section className="application-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={17} />
        Back to applications
      </button>

      <div className="application-heading application-heading-row">
        <div>
          <h1>{student.name}</h1>
          <p>
            {student.prn}, {student.year} CSE division {student.division}. Submitted{" "}
            {timeAgo(application.submittedAt).toLowerCase()}.
          </p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <div className="details-layout">
        {/* LEFT */}
        <div className="details-left">
          <div className="info-card">
            <div className="card-title">
              <div className="card-icon">
                <CalendarDays size={18} />
              </div>
              <div>
                <h2>Leave details</h2>
                <p>Information provided with the application.</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-label">
                <CalendarDays size={16} />
                Leave period
              </div>
              <strong>{formatRange(application.startDate, application.endDate)}</strong>
            </div>

            <div className="info-item">
              <div className="info-label">
                <FileText size={16} />
                Event
              </div>
              <strong>
                {application.eventName} ({application.category})
              </strong>
            </div>

            {application.description && (
              <div className="info-item">
                <div className="info-label">
                  <FileText size={16} />
                  Details
                </div>
                <strong>{application.description}</strong>
              </div>
            )}
          </div>

          <div className="info-card">
            <div className="card-title">
              <div className="card-icon">
                <BookOpen size={18} />
              </div>
              <div>
                <h2>Affected lectures</h2>
                <p>Taken from the time table, with holidays and weekends skipped.</p>
              </div>
            </div>

            <div className="lecture-table">
              <div className="lecture-header">
                <span>Date</span>
                <span>Subject</span>
                <span>Time</span>
              </div>

              {application.lectures.map((lecture) => (
                <div className="lecture-item" key={`${lecture.date}-${lecture.start}`}>
                  <div className="lecture-date">
                    <CalendarDays size={15} />
                    {formatDate(lecture.date)}
                  </div>
                  <div className="lecture-subject">{lecture.subjectName}</div>
                  <div className="lecture-time">
                    <Clock3 size={15} />
                    {formatTime(lecture.start)} – {formatTime(lecture.end)}
                  </div>
                </div>
              ))}
            </div>

            <div className="lecture-footer">
              <span>Total affected lectures</span>
              <strong>{application.lectures.length}</strong>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <aside className="details-right">
          <div className="document-card">
            <div className="document-top">
              <div className="document-icon">
                <FileText size={23} />
              </div>
              <span className="document-type">
                {application.document.mimeType === "application/pdf" ? "PDF" : "Image"}
              </span>
            </div>

            <h2>HOD-signed letter</h2>
            <p>
              {application.document.originalName} (
              {formatFileSize(application.document.size)}). Check the HOD's signature
              before approving.
            </p>

            <button className="view-document" onClick={openDocument}>
              <FileText size={16} />
              View document
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="document-card decision-card">
            <h2>Decision</h2>

            {application.status === "pending" ? (
              <>
                <label htmlFor="remark" className="form-label">
                  Remark <span className="optional">(needed to reject)</span>
                </label>
                <textarea
                  id="remark"
                  rows={3}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="e.g. HOD signature missing"
                  maxLength={300}
                />

                {error && <p className="decision-error">{error}</p>}

                <div className="decision-actions">
                  <button
                    className="danger-button"
                    onClick={() => review("rejected")}
                    disabled={saving !== null}
                  >
                    <X size={16} />
                    {saving === "rejected" ? "Rejecting…" : "Reject"}
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => review("approved")}
                    disabled={saving !== null}
                  >
                    <Check size={16} />
                    {saving === "approved" ? "Approving…" : "Approve"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  {application.status === "approved" ? "Approved" : "Rejected"}
                  {application.reviewedBy ? ` by ${application.reviewedBy}` : ""}
                  {application.reviewedAt
                    ? ` on ${formatDate(application.reviewedAt.slice(0, 10), false)}`
                    : ""}
                  .
                </p>
                {application.remark && (
                  <p className="decision-remark">{application.remark}</p>
                )}
                {error && <p className="decision-error">{error}</p>}
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default Faculty;

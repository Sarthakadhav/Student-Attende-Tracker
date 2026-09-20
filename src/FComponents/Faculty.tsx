import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  KeyRound,
  LayoutDashboard,
  X,
} from "lucide-react";
import { api } from "../api";
import CircularTable from "../components/CircularTable";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import type { NavItem } from "../components/Sidebar";
import StatusBadge from "../components/StatusBadge";
import type {
  ApplicationStatus,
  CircularRow,
  ClassAttendance,
  ClassInfo,
  LeaveApplication,
  User,
} from "../types";
import { formatDate, formatFileSize, formatRange, formatTime, initials, timeAgo } from "../utils/format";
import "./Faculty.css";

type Page = "dashboard" | "attendance" | "application";

const NAV: NavItem<Exclude<Page, "application">>[] = [
  { key: "dashboard", label: "Applications", icon: LayoutDashboard },
  { key: "attendance", label: "Class attendance", icon: ClipboardCheck },
];

const EVIDENCE_LABEL: Record<string, string> = {
  certificate: "Participation certificate",
  authority_permission: "HoD / Dean permission (no certificate)",
  medical_certificate: "Medical certificate",
};

type FacultyProps = {
  user: User;
  onLogout: () => void;
};

/* =========================================
   FACULTY PORTAL
========================================= */

function Faculty({ user, onLogout }: FacultyProps) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState("");
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Classes this faculty member can see (none assigned = HoD, sees all).
  useEffect(() => {
    api
      .classes()
      .then(({ classes: all }) => {
        const mine = user.classes?.length ? all.filter((c) => user.classes!.includes(c.id)) : all;
        setClasses(mine);
      })
      .catch((err: Error) => setError(err.message));
  }, [user.classes]);

  const loadApplications = useCallback(
    () =>
      api
        .applications(classId || undefined)
        .then((data) => {
          setApplications(data.applications);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    [classId]
  );

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const replaceApplication = (updated: LeaveApplication) =>
    setApplications((list) => list.map((a) => (a.id === updated.id ? updated : a)));

  const openApplication = (application: LeaveApplication) => {
    setSelectedId(application.id);
    setActivePage("application");
    if (application.unread) {
      replaceApplication({ ...application, unread: false });
      api.markRead(application.id).catch(() => {
        /* not critical */
      });
    }
  };

  const goToDashboard = () => {
    setSelectedId(null);
    setActivePage("dashboard");
  };

  const selected = applications.find((a) => a.id === selectedId) ?? null;
  const scope = user.classes?.length ? user.classes.join(", ") : "All classes";

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
          userDetail={scope}
          hasUnread={applications.some((a) => a.unread)}
          onBellClick={goToDashboard}
          onMenuClick={() => setMenuOpen(true)}
        />

        <div className="content">
          {error && <div className="page-error">{error}</div>}

          {activePage === "attendance" ? (
            <ClassAttendancePage classes={classes} onBack={goToDashboard} />
          ) : activePage === "application" && selected ? (
            <ApplicationDetails key={selected.id} application={selected} onBack={goToDashboard} onReviewed={replaceApplication} />
          ) : (
            <Dashboard
              name={user.name}
              classes={classes}
              classId={classId}
              onClassChange={setClassId}
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
  classes: ClassInfo[];
  classId: string;
  onClassChange: (id: string) => void;
  applications: LeaveApplication[];
  loading: boolean;
  onOpen: (application: LeaveApplication) => void;
  onRefresh: () => void;
};

function Dashboard({ name, classes, classId, onClassChange, applications, loading, onOpen, onRefresh }: DashboardProps) {
  const [filter, setFilter] = useState<Filter>("pending");
  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const visible = filter === "all" ? applications : applications.filter((a) => a.status === filter);

  return (
    <>
      <section className="welcome-section">
        <div>
          <h1>Welcome back, {name}</h1>
          <p className="welcome-text">
            {pendingCount === 0
              ? "No applications are waiting for you."
              : `${pendingCount} application${pendingCount === 1 ? " is" : "s are"} waiting for verification.`}
          </p>
        </div>
        <button className="secondary-button" onClick={onRefresh}>
          Refresh
        </button>
      </section>

      <section className="notification-section">
        <div className="section-heading section-heading-row">
          <div>
            <h2>Applications</h2>
            <p>Check the documents and ERP numbers before approving.</p>
          </div>

          <div className="toolbar">
            {classes.length > 1 && (
              <select value={classId} onChange={(e) => onClassChange(e.target.value)} aria-label="Class" className="toolbar-select">
                <option value="">All my classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
              </select>
            )}
            <div className="filter-tabs" role="tablist">
              {FILTERS.map((f) => (
                <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
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
            {visible.map((a) => (
              <button key={a.id} className={`notification-card ${a.unread ? "unread" : ""}`} onClick={() => onOpen(a)}>
                <div className="notification-main">
                  <div className="notification-avatar">
                    <FileText size={19} />
                  </div>
                  <div className="notification-text">
                    <p className="notification-message">
                      <strong>{a.student.name}</strong> ({a.classId}):{" "}
                      {a.kind === "medical" ? "medical leave, " : `${a.eventName}, `}
                      {a.sessions} session{a.sessions === 1 ? "" : "s"}
                    </p>
                    <span>
                      {formatRange(a.startDate, a.endDate)}, submitted {timeAgo(a.submittedAt).toLowerCase()}
                    </span>
                  </div>
                </div>
                <div className="notification-action">
                  {a.kind === "medical" && <span className="kind-tag">Medical</span>}
                  <StatusBadge status={a.status} />
                  {a.unread && <span className="unread-dot" />}
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
   CLASS ATTENDANCE
========================================= */

type ClassAttendancePageProps = {
  classes: ClassInfo[];
  onBack: () => void;
};

function ClassAttendancePage({ classes, onBack }: ClassAttendancePageProps) {
  const [classId, setClassId] = useState("");
  const [data, setData] = useState<ClassAttendance | null>(null);
  const [courseId, setCourseId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);

  const activeClass = classId || classes[0]?.id || "";

  useEffect(() => {
    if (!activeClass) return;
    let cancelled = false;
    api
      .classAttendance(activeClass)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [activeClass]);

  const threshold = data?.threshold ?? 75;
  const activeCourse = courseId && data?.courses.some((c) => c.id === courseId) ? courseId : data?.courses[0]?.id ?? "";

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.students
      .map(({ student, rows }) => ({ student, row: rows.find((r) => r.courseId === activeCourse) as CircularRow | undefined }))
      .filter(({ student }) => !q || student.name.toLowerCase().includes(q) || student.prn.toLowerCase().includes(q))
      .filter(({ row }) => !onlyRisk || (row?.finalPercent != null && row.finalPercent < threshold));
  }, [data, activeCourse, search, onlyRisk, threshold]);

  const entered = data ? data.students.filter((s) => s.rows.some((r) => r.total !== null)).length : 0;

  const resetPassword = async (prn: string) => {
    if (!window.confirm(`Reset the password for ${prn}? They'll have to set a new one when they log in.`)) return;
    try {
      const r = await api.resetPassword(prn);
      setNotice(`New starting password for ${r.name} (${r.prn}): ${r.password}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const downloadPasswords = async () => {
    const ok = window.confirm(
      `Create starting passwords for ${activeClass}?\n\n` +
        "Every student who hasn't set their own password yet gets a NEW password, " +
        "and any earlier password file for them stops working. " +
        "Students who already logged in are not affected."
    );
    if (!ok) return;
    setDownloading(true);
    try {
      await api.downloadPasswords(activeClass);
      setNotice(`Starting passwords for ${activeClass} downloaded. Only this file is valid. Give each student only their own row.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      await api.downloadSummary(activeClass);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="attendance-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={17} />
        Back to applications
      </button>

      <div className="application-heading application-heading-row">
        <div>
          <h1>Class attendance</h1>
          <p>ERP attendance entered by students, plus approved event lectures (circular step 6.a).</p>
        </div>
        <div className="toolbar">
          <button className="secondary-button" onClick={downloadPasswords} disabled={downloading || !activeClass}>
            <KeyRound size={16} />
            Download starting passwords
          </button>
          <button className="primary-button" onClick={download} disabled={downloading || !data?.ready}>
            <Download size={16} />
            {downloading ? "Preparing…" : "Export summary (Excel)"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="form-success notice-banner" role="status">
          <KeyRound size={17} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}
      {error && <div className="page-error">{error}</div>}

      <div className="attendance-card">
        <div className="attendance-card-header attendance-controls">
          <div className="attendance-filters attendance-filters-row">
            <select value={activeClass} onChange={(e) => { setClassId(e.target.value); setCourseId(""); }} aria-label="Class">
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}: {c.label}
                </option>
              ))}
            </select>
            <select value={activeCourse} onChange={(e) => setCourseId(e.target.value)} aria-label="Subject" disabled={!data?.ready}>
              {data?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input className="search-input" placeholder="Search name or PRN" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />
            Only below {threshold}%
          </label>
        </div>

        {!data ? (
          <p className="page-loading table-message">Loading…</p>
        ) : !data.ready ? (
          <p className="page-loading table-message">
            The time table or academic calendar for {activeClass} hasn't been added yet, so attendance can't be calculated.
          </p>
        ) : (
          <>
            <p className="table-caption">
              {data.students.length} students, {entered} have entered their ERP attendance.
            </p>
            <div className="circular-table-wrap">
              <table className="circular-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>ERP attendance</th>
                    <th>ERP %</th>
                    <th>Lectures missed</th>
                    <th>Total</th>
                    <th>Final</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ student, row }) => {
                    const has = row && row.total !== null;
                    const below = has && (row!.finalPercent ?? 0) < threshold;
                    return (
                      <tr key={student.id}>
                        <td>
                          <div className="attendance-student">
                            <div className="attendance-avatar">{initials(student.name)}</div>
                            <div>
                              <strong>{student.name}</strong>
                              <span className="student-meta">
                                {student.rollNo ? `Roll ${student.rollNo}, ` : ""}
                                {student.prn}
                              </span>
                            </div>
                          </div>
                        </td>
                        {has ? (
                          <>
                            <td>{row!.attended}/{row!.total}</td>
                            <td>{row!.erpPercent}%</td>
                            <td>
                              {row!.approvedMissed}
                              {row!.pendingMissed > 0 && <span className="cell-sub text-pending">+{row!.pendingMissed} waiting</span>}
                            </td>
                            <td>{row!.credit ? `${row!.attended}+${row!.credit}` : row!.attended}</td>
                            <td>
                              <strong className={below ? "text-warning" : "text-good"}>{row!.finalPercent}%</strong>
                            </td>
                          </>
                        ) : (
                          <td colSpan={5} className="cell-missing">
                            ERP attendance not entered
                          </td>
                        )}
                        <td>
                          <button className="icon-text-button" onClick={() => resetPassword(student.prn)} title="Reset password">
                            <KeyRound size={14} />
                            Reset
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="page-loading table-message">No students match.</p>}
          </>
        )}

        <div className="attendance-footer">
          <span>Lectures missed only counts approved event applications, capped at the sessions actually missed.</span>
          <strong>Threshold: {threshold}%</strong>
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
  const [calc, setCalc] = useState<{ counted: boolean; rows: CircularRow[] } | null>(null);
  const [remark, setRemark] = useState("");
  const [checks, setChecks] = useState({ letter: false, evidence: false, erp: false });
  const [saving, setSaving] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState("");

  const isEvent = application.kind === "event";
  const allChecked = !isEvent || (checks.letter && checks.evidence && checks.erp);

  useEffect(() => {
    api
      .calculation(application.id)
      .then(setCalc)
      .catch((err: Error) => setError(err.message));
  }, [application.id, application.status]);

  const review = async (status: "approved" | "rejected") => {
    setError("");
    if (status === "rejected" && remark.trim().length < 3) {
      setError("Add a remark so the student knows why it was rejected.");
      return;
    }
    if (status === "approved" && !allChecked) {
      setError("Tick all three checks before approving.");
      return;
    }
    setSaving(status);
    try {
      const { application: updated } = await api.review(application.id, status, remark.trim());
      onReviewed(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const openDoc = (docId: string) => {
    setError("");
    api.openDocument(application.id, docId).catch((err: Error) => setError(err.message));
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
            {student.prn}, {application.classId}
            {student.rollNo ? `, roll no. ${student.rollNo}` : ""}. Submitted {timeAgo(application.submittedAt).toLowerCase()}.
          </p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <div className="info-card calc-card">
        <div className="card-title">
          <div className="card-icon">
            <ClipboardCheck size={18} />
          </div>
          <div>
            <h2>{isEvent ? "Attendance calculation" : "Affected subjects"}</h2>
            <p>
              {isEvent
                ? application.status === "pending"
                  ? "Final attendance if this application is approved, including earlier approved ones. Verify the ERP numbers."
                  : "Final attendance with this application included."
                : "Shown for the record. Nothing is added for medical leave."}
            </p>
          </div>
        </div>
        {calc ? (
          <CircularTable rows={calc.rows} threshold={75} mode="application" counted={calc.counted} />
        ) : (
          <p className="page-loading">Calculating…</p>
        )}
      </div>

      <div className="details-layout">
        <div className="details-left">
          <div className="info-card">
            <div className="card-title">
              <div className="card-icon">
                <CalendarDays size={18} />
              </div>
              <div>
                <h2>{isEvent ? "Event details" : "Medical leave"}</h2>
                <p>{isEvent ? "As entered by the student." : "Recorded only. Not counted, as per the circular."}</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-label">
                <CalendarDays size={16} />
                Period
              </div>
              <strong>{formatRange(application.startDate, application.endDate)}</strong>
            </div>
            {isEvent && (
              <div className="info-item">
                <div className="info-label">
                  <FileText size={16} />
                  Event
                </div>
                <strong>
                  {application.eventName} ({application.category})
                </strong>
              </div>
            )}
            <div className="info-item">
              <div className="info-label">
                <FileText size={16} />
                Proof
              </div>
              <strong>{EVIDENCE_LABEL[application.evidenceType]}</strong>
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
                <h2>Lectures in this period</h2>
                <p>From the time table, with holidays, CIA days and off Saturdays skipped.</p>
              </div>
            </div>

            <div className="lecture-table">
              <div className="lecture-header">
                <span>Date</span>
                <span>Subject</span>
                <span>Time</span>
              </div>
              {application.lectures.map((l) => (
                <div className="lecture-item" key={`${l.date}-${l.start}`}>
                  <div className="lecture-date">
                    <CalendarDays size={15} />
                    {formatDate(l.date)}
                  </div>
                  <div className="lecture-subject">
                    {l.subjectName}
                    {l.type === "LAB" && <span className="cell-sub">Lab, 1 session</span>}
                  </div>
                  <div className="lecture-time">
                    <Clock3 size={15} />
                    {formatTime(l.start)} – {formatTime(l.end)}
                  </div>
                </div>
              ))}
            </div>
            <div className="lecture-footer">
              <span>Total sessions</span>
              <strong>{application.sessions}</strong>
            </div>
          </div>
        </div>

        <aside className="details-right">
          <div className="document-card">
            <h2>Documents</h2>
            <div className="doc-list">
              {application.documents.map((d) => (
                <button key={d.id} className="view-document" onClick={() => openDoc(d.id)}>
                  <FileText size={16} />
                  <span className="doc-label">
                    <strong>{d.kind === "approval_letter" ? "Pre-approval letter" : EVIDENCE_LABEL[application.evidenceType]}</strong>
                    <span>
                      {d.originalName} ({formatFileSize(d.size)})
                    </span>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>

          <div className="document-card decision-card">
            <h2>Decision</h2>

            {application.status === "pending" ? (
              <>
                {isEvent && (
                  <div className="check-list">
                    <label>
                      <input type="checkbox" checked={checks.letter} onChange={(e) => setChecks({ ...checks, letter: e.target.checked })} />
                      Pre-approval letter is valid
                    </label>
                    <label>
                      <input type="checkbox" checked={checks.evidence} onChange={(e) => setChecks({ ...checks, evidence: e.target.checked })} />
                      {application.evidenceType === "certificate" ? "Certificate shows these exact dates" : "HoD / Dean signature is present"}
                    </label>
                    <label>
                      <input type="checkbox" checked={checks.erp} onChange={(e) => setChecks({ ...checks, erp: e.target.checked })} />
                      ERP numbers match ERP
                    </label>
                  </div>
                )}

                <label htmlFor="remark" className="form-label">
                  Remark <span className="optional">(needed to reject)</span>
                </label>
                <textarea id="remark" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Certificate dates don't match" maxLength={300} />

                {error && <p className="decision-error">{error}</p>}

                <div className="decision-actions">
                  <button className="danger-button" onClick={() => review("rejected")} disabled={saving !== null}>
                    <X size={16} />
                    {saving === "rejected" ? "Rejecting…" : "Reject"}
                  </button>
                  <button className="primary-button" onClick={() => review("approved")} disabled={saving !== null || !allChecked}>
                    <Check size={16} />
                    {saving === "approved" ? "Saving…" : isEvent ? "Approve" : "Record"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  {application.status === "approved" ? (isEvent ? "Approved" : "Recorded") : "Rejected"}
                  {application.reviewedBy ? ` by ${application.reviewedBy}` : ""}
                  {application.reviewedAt ? ` on ${formatDate(application.reviewedAt.slice(0, 10), false)}` : ""}.
                </p>
                {application.remark && <p className="decision-remark">{application.remark}</p>}
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
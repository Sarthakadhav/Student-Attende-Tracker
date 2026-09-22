import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  LayoutDashboard,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { api } from "../api";
import type { Calculation, ErpImportResult } from "../api";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import type { NavItem } from "../components/Sidebar";
import StatusBadge from "../components/StatusBadge";
import SubjectTable from "../components/SubjectTable";
import type {
  ApplicationStatus,
  ClassInfo,
  ErpImport,
  EventReport,
  FinalReport,
  FinalStatus,
  LeaveApplication,
  StudentListItem,
  User,
} from "../types";
import { formatDate, formatFileSize, formatRange, formatTime, initials, timeAgo } from "../utils/format";
import "./Faculty.css";

type Page = "dashboard" | "erp" | "event" | "final" | "students" | "application";

const NAV: NavItem<Exclude<Page, "application">>[] = [
  { key: "dashboard", label: "Applications", icon: LayoutDashboard },
  { key: "erp", label: "ERP attendance", icon: Upload },
  { key: "event", label: "Event attendance report", icon: BarChart3 },
  { key: "final", label: "Final attendance report", icon: ClipboardCheck },
  { key: "students", label: "Students", icon: Users },
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
  const [filterClass, setFilterClass] = useState("");
  const [reportClass, setReportClass] = useState("");
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
        .applications(filterClass || undefined)
        .then((data) => {
          setApplications(data.applications);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    [filterClass]
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
  const classId = reportClass || classes[0]?.id || "";
  const classPicker = <ClassSelect classes={classes} value={classId} onChange={setReportClass} />;

  return (
    <div className="app">
      <Sidebar
        portalName="Faculty portal"
        items={NAV}
        active={activePage === "application" ? "dashboard" : activePage}
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

          {activePage === "erp" ? (
            <ErpPage key={classId} classId={classId} classPicker={classPicker} />
          ) : activePage === "event" ? (
            <EventReportPage key={classId} classId={classId} classPicker={classPicker} />
          ) : activePage === "final" ? (
            <FinalReportPage key={classId} classId={classId} classPicker={classPicker} allClasses={classes.length > 1} onGoToErp={() => setActivePage("erp")} />
          ) : activePage === "students" ? (
            <StudentsPage key={classId} classId={classId} classPicker={classPicker} />
          ) : activePage === "application" && selected ? (
            <ApplicationDetails key={selected.id} application={selected} onBack={goToDashboard} onReviewed={replaceApplication} />
          ) : (
            <Dashboard
              name={user.name}
              classes={classes}
              classId={filterClass}
              onClassChange={setFilterClass}
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
   SHARED PIECES
========================================= */

function ClassSelect({ classes, value, onChange }: { classes: ClassInfo[]; value: string; onChange: (id: string) => void }) {
  if (classes.length <= 1) {
    return <span className="class-pill">{classes[0]?.id ?? "No class"}: {classes[0]?.label}</span>;
  }
  return (
    <select className="toolbar-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Class">
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.id}: {c.label}
        </option>
      ))}
    </select>
  );
}

function PageHeading({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="application-heading application-heading-row">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children && <div className="toolbar">{children}</div>}
    </div>
  );
}

function useDownload(setError: (message: string) => void) {
  const [busy, setBusy] = useState("");
  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };
  return { busy, run };
}

const pctText = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `${n}%`);

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
   ERP ATTENDANCE IMPORT
========================================= */

const LABEL_SUGGESTIONS = ["Till CIA-1", "Till CIA-2", "Detention list"];

function ErpPage({ classId, classPicker }: { classId: string; classPicker: ReactNode }) {
  const [imports, setImports] = useState<ErpImport[]>([]);
  const [label, setLabel] = useState("Till CIA-1");
  const [asOf, setAsOf] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ErpImportResult | null>(null);
  const [error, setError] = useState("");
  const { busy, run } = useDownload(setError);

  const load = useCallback(
    () =>
      classId
        ? api
            .erpImports(classId)
            .then((d) => setImports(d.imports))
            .catch((err: Error) => setError(err.message))
        : Promise.resolve(),
    [classId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (label.trim().length < 2) return setError("Give this upload a name, e.g. Till CIA-1.");
    if (!asOf) return setError("Enter the date the ERP figures were taken on.");
    if (!file) return setError("Choose the filled ERP attendance file.");
    const form = new FormData();
    form.append("label", label.trim());
    form.append("asOf", asOf);
    form.append("file", file);
    setSaving(true);
    try {
      setResult(await api.importErp(classId, form));
      setFile(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: ErpImport) => {
    if (!window.confirm(`Delete the ERP upload "${item.label}"? Reports based on it will change.`)) return;
    try {
      await api.deleteErpImport(item.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="attendance-page">
      <PageHeading
        title="ERP attendance"
        text="Import the attended and total sessions of every student from ERP. The final attendance report merges these with approved event sessions."
      >
        {classPicker}
      </PageHeading>

      {error && <div className="page-error">{error}</div>}
      {result && (
        <div className="form-success" role="status">
          <Check size={17} />
          <span>
            Imported {result.students} students across {result.subjects} subjects
            {result.replaced ? ", replacing the earlier upload with this name" : ""}.
            {result.missingStudents > 0 && ` ${result.missingStudents} student(s) of the class weren't in the file.`}
            {result.unknownPrns.length > 0 && ` Ignored PRNs not in ${classId}: ${result.unknownPrns.join(", ")}.`}
          </span>
        </div>
      )}

      <div className="erp-steps">
        <div className="info-card">
          <div className="card-title">
            <div className="card-icon">1</div>
            <div>
              <h2>Download the template</h2>
              <p>An Excel sheet with every student and subject of {classId}. Fill it from ERP.</p>
            </div>
          </div>
          <button
            className="secondary-button"
            onClick={() => run("template", () => api.downloadErpTemplate(classId))}
            disabled={!classId || busy === "template"}
          >
            <FileSpreadsheet size={16} />
            {busy === "template" ? "Preparing…" : "Download template"}
          </button>
          <p className="field-hint">
            For each subject, fill <strong>Attended</strong> and <strong>Total</strong> sessions. Leave both empty if a subject
            doesn't apply to a student.
          </p>
        </div>

        <form className="info-card" onSubmit={upload} noValidate>
          <div className="card-title">
            <div className="card-icon">2</div>
            <div>
              <h2>Upload the filled file</h2>
              <p>Uploading again with the same name replaces the earlier one.</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="erpLabel">Name</label>
              <input id="erpLabel" list="erp-labels" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
              <datalist id="erp-labels">
                {LABEL_SUGGESTIONS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="erpAsOf">ERP figures as on</label>
              <input id="erpAsOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <span className="form-label">File (.xlsx or .csv)</span>
            {file ? (
              <div className="selected-file">
                <FileSpreadsheet size={18} />
                <div>
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)}</span>
                </div>
                <button type="button" onClick={() => setFile(null)} aria-label="Remove file">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="upload-box">
                <Upload size={20} />
                <div className="upload-content">
                  <strong>Choose the filled template</strong>
                  <span>Excel (.xlsx) or CSV</span>
                </div>
                <span className="upload-button">Choose file</span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={saving || !classId}>
              <Upload size={16} />
              {saving ? "Importing…" : "Import ERP attendance"}
            </button>
          </div>
        </form>
      </div>

      <div className="attendance-card">
        <div className="attendance-card-header">
          <div>
            <h2>Uploads for {classId}</h2>
            <p>The final report uses the newest one by default. Event sessions after its date aren't counted, since ERP hasn't recorded those lectures yet.</p>
          </div>
        </div>
        {imports.length === 0 ? (
          <p className="page-loading table-message">Nothing imported yet.</p>
        ) : (
          <div className="circular-table-wrap">
            <table className="circular-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>As on</th>
                  <th>Students</th>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.label}</strong>
                    </td>
                    <td>{formatDate(i.asOf, false)}</td>
                    <td>{i.students}</td>
                    <td className="cell-sub-text">{i.fileName}</td>
                    <td className="cell-sub-text">
                      {i.uploadedBy}, {timeAgo(i.uploadedAt).toLowerCase()}
                    </td>
                    <td>
                      <button className="icon-text-button" onClick={() => remove(i)}>
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================
   REPORT 1: EVENT ATTENDANCE
========================================= */

function EventReportPage({ classId, classPicker }: { classId: string; classPicker: ReactNode }) {
  const [report, setReport] = useState<EventReport | null>(null);
  const [courseId, setCourseId] = useState("all");
  const [search, setSearch] = useState("");
  const [onlyWith, setOnlyWith] = useState(true);
  const [error, setError] = useState("");
  const { busy, run } = useDownload(setError);

  useEffect(() => {
    if (!classId) return;
    api
      .eventReport(classId)
      .then(setReport)
      .catch((err: Error) => setError(err.message));
  }, [classId]);

  const rows = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return report.students
      .map((s) => {
        const byPhase = courseId === "all" ? s.byPhase : s.perCourse[courseId] ?? {};
        const total = Object.values(byPhase).reduce((a, b) => a + b, 0);
        return { ...s, shown: byPhase, shownTotal: total };
      })
      .filter((s) => !onlyWith || s.shownTotal > 0 || s.pendingApplications > 0)
      .filter((s) => !q || s.student.name.toLowerCase().includes(q) || s.student.prn.toLowerCase().includes(q));
  }, [report, courseId, search, onlyWith]);

  const withEvents = report?.students.filter((s) => s.total > 0).length ?? 0;

  return (
    <section className="attendance-page">
      <PageHeading
        title="Event attendance report"
        text="Sessions missed for approved events, from the time table, split by CIA. Updates as soon as you approve an application."
      >
        {classPicker}
        <button className="primary-button" onClick={() => run("xlsx", () => api.downloadEventReport(classId))} disabled={!report || busy === "xlsx"}>
          <Download size={16} />
          {busy === "xlsx" ? "Preparing…" : "Download Excel"}
        </button>
      </PageHeading>

      {error && <div className="page-error">{error}</div>}

      <div className="attendance-card">
        <div className="attendance-card-header attendance-controls">
          <div className="attendance-filters attendance-filters-row">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Subject">
              <option value="all">All subjects</option>
              {report?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input className="search-input" placeholder="Search name or PRN" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={onlyWith} onChange={(e) => setOnlyWith(e.target.checked)} />
            Only students with event applications
          </label>
        </div>

        {!report ? (
          <p className="page-loading table-message">Loading…</p>
        ) : (
          <>
            <p className="table-caption">
              {withEvents} of {report.students.length} students have approved event sessions.
            </p>
            <div className="circular-table-wrap">
              <table className="circular-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    {report.phases.map((p) => (
                      <th key={p.key}>
                        {p.label}
                        <span className="cell-sub th-sub">
                          {formatDate(p.start, false)} to {formatDate(p.end, false)}
                        </span>
                      </th>
                    ))}
                    <th>Total sessions</th>
                    <th>Approved</th>
                    <th>Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.student.id}>
                      <td>
                        <StudentCell student={r.student} />
                      </td>
                      {report.phases.map((p) => (
                        <td key={p.key}>{r.shown[p.key] || "-"}</td>
                      ))}
                      <td>
                        <strong>{r.shownTotal}</strong>
                      </td>
                      <td>{r.approvedApplications}</td>
                      <td>{r.pendingApplications ? <span className="text-pending">{r.pendingApplications}</span> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="page-loading table-message">No students match.</p>}
          </>
        )}
      </div>
    </section>
  );
}

function StudentCell({ student }: { student: { name: string; prn: string; rollNo?: number } }) {
  return (
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
  );
}

/* =========================================
   REPORT 2: FINAL ATTENDANCE
========================================= */

const STATUS_FILTERS: { key: FinalStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "detained", label: "Detained" },
  { key: "subject", label: "Subject detained" },
  { key: "clear", label: "Not detained" },
  { key: "missing", label: "No ERP data" },
];

type FinalReportPageProps = {
  classId: string;
  classPicker: ReactNode;
  allClasses: boolean;
  onGoToErp: () => void;
};

function FinalReportPage({ classId, classPicker, allClasses, onGoToErp }: FinalReportPageProps) {
  const [report, setReport] = useState<FinalReport | null>(null);
  const [importId, setImportId] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<FinalStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { busy, run } = useDownload(setError);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    api
      .finalReport(classId, importId)
      .then((r) => !cancelled && (setReport(r), setError("")))
      .catch((err: Error) => !cancelled && (setReport(null), setError(err.message)))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [classId, importId]);

  const rows = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return report.students
      .filter((s) => filter === "all" || s.statusKey === filter)
      .filter((s) => !q || s.student.name.toLowerCase().includes(q) || s.student.prn.toLowerCase().includes(q));
  }, [report, filter, search]);

  const chosen = report?.import.id;

  return (
    <section className="attendance-page">
      <PageHeading
        title="Final attendance report"
        text="ERP attendance merged with approved event sessions: (ERP attended + event sessions) / ERP total, per subject and overall."
      >
        {classPicker}
      </PageHeading>

      {!loaded ? (
        <p className="page-loading">Loading…</p>
      ) : !report ? (
        <div className="empty-state">
          <p>{error || "No report yet."}</p>
          <button className="secondary-button" onClick={onGoToErp}>
            Go to ERP attendance
          </button>
        </div>
      ) : (
        <>
          {error && <div className="page-error">{error}</div>}

          <div className="report-bar">
            <div className="form-group">
              <label htmlFor="snapshot">ERP upload</label>
              <select id="snapshot" className="toolbar-select" value={chosen} onChange={(e) => setImportId(e.target.value)}>
                {report.imports.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label} (as on {formatDate(i.asOf, false)})
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar">
              <button className="secondary-button" onClick={() => run("xlsx", () => api.downloadFinalReport(classId, chosen))} disabled={busy !== ""}>
                <FileSpreadsheet size={16} />
                {busy === "xlsx" ? "Preparing…" : "Download Excel"}
              </button>
              <button className="primary-button" onClick={() => run("docx", () => api.downloadDetentionList(classId, chosen))} disabled={busy !== ""}>
                <FileText size={16} />
                {busy === "docx" ? "Preparing…" : `Detention list: ${classId}`}
              </button>
              {allClasses && (
                <button className="primary-button" onClick={() => run("dept", () => api.downloadDepartmentDetentionList())} disabled={busy !== ""}>
                  <FileText size={16} />
                  {busy === "dept" ? "Preparing…" : "Detention list: all classes"}
                </button>
              )}
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-card stat-bad">
              <span>Detained</span>
              <strong>{report.counts.detained}</strong>
              <p>Overall final attendance below {report.threshold}%.</p>
            </div>
            <div className="stat-card stat-warn">
              <span>Subject detained</span>
              <strong>{report.counts.subject}</strong>
              <p>Overall fine, but below {report.threshold}% in some subjects.</p>
            </div>
            <div className="stat-card stat-good">
              <span>Not detained</span>
              <strong>{report.counts.clear}</strong>
              <p>{report.threshold}% or more overall and in every subject.</p>
            </div>
            <div className="stat-card">
              <span>No ERP data</span>
              <strong>{report.counts.missing}</strong>
              <p>Not in the uploaded ERP file.</p>
            </div>
          </div>

          <div className="attendance-card">
            <div className="attendance-card-header attendance-controls">
              <div className="filter-tabs" role="tablist">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <input className="search-input" placeholder="Search name or PRN" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="circular-table-wrap">
              <table className="circular-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>ERP %</th>
                    <th>Event sessions</th>
                    <th>Final %</th>
                    <th>Subjects below {report.threshold}%</th>
                    <th>Status</th>
                    <th aria-label="Details" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <FinalRow key={r.student.id} row={r} threshold={report.threshold} open={open === r.student.id} onToggle={() => setOpen(open === r.student.id ? null : r.student.id)} />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="page-loading table-message">No students match.</p>}

            <div className="attendance-footer">
              <span>
                Using ERP upload "{report.import.label}" as on {formatDate(report.import.asOf, false)}. Event sessions after this date aren't added.
              </span>
              <strong>Minimum: {report.threshold}%</strong>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function FinalRow({ row, threshold, open, onToggle }: { row: FinalReport["students"][number]; threshold: number; open: boolean; onToggle: () => void }) {
  const statusClass = { detained: "status-rejected", subject: "status-pending", clear: "status-approved", missing: "status-neutral" }[row.statusKey];
  return (
    <>
      <tr className={open ? "row-open" : ""}>
        <td>
          <StudentCell student={row.student} />
        </td>
        <td className={row.erpPercent !== null && row.erpPercent < threshold ? "text-warning" : ""}>{pctText(row.erpPercent)}</td>
        <td>{row.credit ? `+${row.credit}` : "-"}</td>
        <td>
          <strong className={row.finalPercent === null ? "" : row.finalPercent < threshold ? "text-warning" : "text-good"}>{pctText(row.finalPercent)}</strong>
        </td>
        <td className="cell-sub-text">{row.below.length ? row.below.join(", ") : "-"}</td>
        <td>
          <span className={`status-badge ${statusClass}`}>{row.status}</span>
          {row.savedByEvents && <span className="cell-sub text-good">Cleared by event attendance</span>}
        </td>
        <td>
          {row.subjects.length > 0 && (
            <button className="icon-text-button" onClick={onToggle} aria-expanded={open}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Subjects
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={7}>
            <table className="circular-table compact-table nested-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>ERP attendance</th>
                  <th>ERP %</th>
                  <th>Event sessions</th>
                  <th>Total attendance</th>
                  <th>Final %</th>
                </tr>
              </thead>
              <tbody>
                {row.subjects.map((s) => (
                  <tr key={s.courseId}>
                    <td>
                      <strong>{s.subjectName}</strong>
                      <span className="cell-sub">{s.subjectCode}</span>
                    </td>
                    <td>
                      {s.attended}/{s.total}
                    </td>
                    <td className={s.erpPercent < threshold ? "text-warning" : ""}>{s.erpPercent}%</td>
                    <td>
                      {s.eventSessions}
                      {s.credit < s.eventSessions && <span className="cell-sub">capped at {s.credit}</span>}
                    </td>
                    <td>{s.credit ? `${s.attended}+${s.credit}` : s.attended}</td>
                    <td>
                      <strong className={s.finalPercent < threshold ? "text-warning" : "text-good"}>{s.finalPercent}%</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/* =========================================
   STUDENTS (passwords)
========================================= */

function StudentsPage({ classId, classPicker }: { classId: string; classPicker: ReactNode }) {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { busy, run } = useDownload(setError);

  const load = useCallback(
    () =>
      classId
        ? api
            .students(classId)
            .then((d) => setStudents(d.students))
            .catch((err: Error) => setError(err.message))
        : Promise.resolve(),
    [classId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => !q || s.name.toLowerCase().includes(q) || s.prn.toLowerCase().includes(q));
  }, [students, search]);

  const activated = students.filter((s) => s.activated).length;

  const downloadPasswords = () => {
    const ok = window.confirm(
      `Create starting passwords for ${classId}?\n\nEvery student who hasn't set their own password yet gets a NEW password, ` +
        "and any earlier password file for them stops working. Students who already logged in are not affected."
    );
    if (!ok) return;
    run("passwords", async () => {
      await api.downloadPasswords(classId);
      setNotice(`Starting passwords for ${classId} downloaded. Only this file is valid. Give each student only their own row.`);
    });
  };

  const resetPassword = async (prn: string) => {
    if (!window.confirm(`Reset the password for ${prn}? They'll have to set a new one when they log in.`)) return;
    try {
      const r = await api.resetPassword(prn);
      setNotice(`New starting password for ${r.name} (${r.prn}): ${r.password}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="attendance-page">
      <PageHeading title="Students" text={`${students.length} students, ${activated} have logged in and set their own password.`}>
        {classPicker}
        <button className="primary-button" onClick={downloadPasswords} disabled={!classId || busy === "passwords"}>
          <KeyRound size={16} />
          {busy === "passwords" ? "Preparing…" : "Download starting passwords"}
        </button>
      </PageHeading>

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
          <input className="search-input" placeholder="Search name or PRN" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="circular-table-wrap">
          <table className="circular-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Login</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <StudentCell student={s} />
                  </td>
                  <td>
                    {s.activated ? (
                      <span className="status-badge status-approved">Active</span>
                    ) : (
                      <span className="status-badge status-neutral">Not logged in yet</span>
                    )}
                  </td>
                  <td>
                    <button className="icon-text-button" onClick={() => resetPassword(s.prn)}>
                      <KeyRound size={14} />
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [calc, setCalc] = useState<Calculation | null>(null);
  const [remark, setRemark] = useState("");
  const [checks, setChecks] = useState({ letter: false, evidence: false, erp: false }); // erp = lectures check
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
            <h2>{isEvent ? "Sessions missed for this event" : "Affected subjects"}</h2>
            <p>
              {isEvent
                ? "Once approved, these are added to the event attendance report and to the final attendance."
                : "Shown for the record. Medical leave is never added, as per the circular."}
            </p>
          </div>
        </div>
        {calc ? (
          <SubjectTable subjects={calc.subjects} phases={calc.phases} />
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
                      Student has actually missed these lectures
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

import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "../api";
import type { ErpCourse } from "../types";

type Draft = Record<string, { attended: string; total: string }>;

type ErpAttendanceFormProps = {
  onSaved: () => void;
};

/** Circular step 7: the student enters their ERP attendance; the coordinator verifies it. */
const ErpAttendanceForm = ({ onSaved }: ErpAttendanceFormProps) => {
  const [courses, setCourses] = useState<ErpCourse[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    api
      .erp()
      .then((data) => {
        setReady(data.ready);
        setCourses(data.courses);
        setDraft(
          Object.fromEntries(
            data.courses.map((c) => [
              c.courseId,
              { attended: c.attended?.toString() ?? "", total: c.total?.toString() ?? "" },
            ])
          )
        );
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (courseId: string, field: "attended" | "total", value: string) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [courseId]: { ...d[courseId], [field]: value.replace(/\D/g, "") } }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    const entries = [];
    for (const c of courses) {
      const { attended, total } = draft[c.courseId];
      if (attended === "" && total === "") continue;
      if (attended === "" || total === "") {
        setError(`${c.name}: fill in both numbers, or leave both empty.`);
        return;
      }
      const a = Number(attended);
      const t = Number(total);
      if (t < 1) {
        setError(`${c.name}: total sessions must be at least 1.`);
        return;
      }
      if (a > t) {
        setError(`${c.name}: attended can't be more than the total.`);
        return;
      }
      entries.push({ courseId: c.courseId, attended: a, total: t });
    }
    if (entries.length === 0) {
      setError("Enter the numbers for at least one subject.");
      return;
    }

    setSaving(true);
    try {
      const data = await api.saveErp(entries);
      setCourses(data.courses);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="page-loading">Loading your subjects…</p>;
  if (!ready) {
    return (
      <div className="empty-state">
        <p>Your class's time table hasn't been added yet. Contact your class coordinator.</p>
      </div>
    );
  }

  return (
    <section className="student-section">
      <div className="section-heading">
        <h2>My ERP attendance</h2>
        <p>
          Copy the attended and total sessions for each subject from ERP, as shown on the
          detention list. Your class coordinator checks these against ERP.
        </p>
      </div>

      <form className="leave-form-card" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}
        {saved && (
          <div className="form-success" role="status">
            <CheckCircle2 size={17} />
            Saved. Your attendance table is updated.
          </div>
        )}

        <div className="erp-table">
          <div className="erp-row erp-head">
            <span>Subject</span>
            <span>Attended</span>
            <span>Total</span>
            <span>ERP %</span>
          </div>

          {courses.map((c) => {
            const { attended, total } = draft[c.courseId];
            const pct =
              attended !== "" && total !== "" && Number(total) > 0
                ? Math.round((Number(attended) / Number(total)) * 10000) / 100
                : null;

            return (
              <div className="erp-row" key={c.courseId}>
                <div>
                  <strong>{c.name}</strong>
                  <span className="cell-sub">{c.code}</span>
                </div>
                <input
                  inputMode="numeric"
                  aria-label={`${c.name} attended`}
                  value={attended}
                  onChange={(e) => update(c.courseId, "attended", e.target.value)}
                  maxLength={3}
                />
                <input
                  inputMode="numeric"
                  aria-label={`${c.name} total`}
                  value={total}
                  onChange={(e) => update(c.courseId, "total", e.target.value)}
                  maxLength={3}
                />
                <span className={pct !== null && pct < 75 ? "text-warning" : ""}>
                  {pct === null ? "-" : `${pct}%`}
                </span>
              </div>
            );
          })}
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save ERP attendance"}
          </button>
        </div>
      </form>
    </section>
  );
};

export default ErpAttendanceForm;

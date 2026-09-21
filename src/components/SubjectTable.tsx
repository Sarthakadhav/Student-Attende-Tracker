import type { Phase, SubjectSummary } from "../types";

type SubjectTableProps = {
  subjects: SubjectSummary[];
  phases: Phase[];
};

/** Sessions missed per subject, split into the CIA phases of the semester. */
const SubjectTable = ({ subjects, phases }: SubjectTableProps) => {
  if (subjects.length === 0) {
    return <p className="table-empty">No lectures in this period.</p>;
  }

  const total = subjects.reduce((sum, s) => sum + s.sessions, 0);

  return (
    <div className="circular-table-wrap">
      <table className="circular-table compact-table">
        <thead>
          <tr>
            <th>Subject</th>
            {phases.map((p) => (
              <th key={p.key}>{p.label}</th>
            ))}
            <th>Sessions</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.courseId}>
              <td>
                <strong>{s.subjectName}</strong>
                <span className="cell-sub">{s.subjectCode}</span>
              </td>
              {phases.map((p) => (
                <td key={p.key}>{s.byPhase[p.key] || "-"}</td>
              ))}
              <td>
                <strong>{s.sessions}</strong>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            {phases.map((p) => (
              <td key={p.key}>{subjects.reduce((sum, s) => sum + (s.byPhase[p.key] ?? 0), 0) || "-"}</td>
            ))}
            <td>
              <strong>{total}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default SubjectTable;

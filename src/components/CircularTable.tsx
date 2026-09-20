import type { CircularRow } from "../types";
import { formatDate } from "../utils/format";

type CircularTableProps = {
  rows: CircularRow[];
  threshold: number;
  /** "overall": all approved leave. "application": one application (preview or review). */
  mode: "overall" | "application";
  /** false for medical or rejected applications: lectures are shown but nothing is added. */
  counted?: boolean;
};

const short = (iso: string) => formatDate(iso, false).replace(/ \d{4}$/, "");

/**
 * The circular's table (step 6.a):
 * Subject | ERP attendance | ERP % | Duration of absence | Lectures missed | Total | Final %
 */
const CircularTable = ({ rows, threshold, mode, counted = true }: CircularTableProps) => {
  if (rows.length === 0) {
    return <p className="table-empty">No subjects to show.</p>;
  }

  return (
    <div className="circular-table-wrap">
      <table className="circular-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>ERP attendance</th>
            <th>ERP %</th>
            <th>Duration of absence</th>
            <th>Lectures missed</th>
            <th>Total attendance</th>
            <th>Final attendance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const missed =
              mode === "application" ? row.applicationSessions ?? row.thisMissed : row.approvedMissed;
            const hasErp = row.attended !== null && row.total !== null;
            const credit = counted ? row.credit ?? 0 : 0;
            const final = counted ? row.finalPercent : row.erpPercent;
            const below = final !== null && final < threshold;

            return (
              <tr key={row.courseId}>
                <td>
                  <strong>{row.subjectName}</strong>
                  <span className="cell-sub">{row.subjectCode}</span>
                </td>

                {hasErp ? (
                  <>
                    <td>
                      {row.attended}/{row.total}
                    </td>
                    <td className={row.erpPercent! < threshold ? "text-warning" : ""}>
                      {row.erpPercent}%
                    </td>
                  </>
                ) : (
                  <td colSpan={2} className="cell-missing">
                    ERP attendance not entered
                  </td>
                )}

                <td className="cell-sub-text">
                  {row.durations.length === 0
                    ? "-"
                    : row.durations.map(([a, b]) => (a === b ? short(a) : `${short(a)} to ${short(b)}`)).join(", ")}
                </td>

                <td>
                  {missed}
                  {mode === "overall" && row.pendingMissed > 0 && (
                    <span className="cell-sub text-pending">+{row.pendingMissed} waiting</span>
                  )}
                  {credit < missed && hasErp && counted && (
                    <span className="cell-sub">capped at {credit}</span>
                  )}
                </td>

                <td>{hasErp ? (credit > 0 ? `${row.attended}+${credit}` : row.attended) : "-"}</td>

                <td>
                  {final === null ? (
                    "-"
                  ) : (
                    <strong className={below ? "text-warning" : "text-good"}>{final}%</strong>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CircularTable;

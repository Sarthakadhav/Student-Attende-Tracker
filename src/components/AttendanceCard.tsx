import { ATTENDANCE_THRESHOLD } from "../utils/format";

interface AttendanceCardProps {
  subject: string;
  attended: number;
  dutyLeave: number;
  pendingLeave: number;
  total: number;
  percentage: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

const AttendanceCard = ({
  subject,
  attended,
  dutyLeave,
  pendingLeave,
  total,
  percentage,
}: AttendanceCardProps) => {
  const attendedWidth = clamp((attended / total) * 100);
  const leaveWidth = clamp((dutyLeave / total) * 100);
  const safe = percentage >= ATTENDANCE_THRESHOLD;

  return (
    <div className="subject-card">
      <div className="subject-card-top">
        <div>
          <h3>{subject}</h3>
          <p>
            {attended} of {total} lectures attended
            {dutyLeave > 0 && ` + ${dutyLeave} duty leave`}
          </p>
        </div>

        <strong className={safe ? "text-good" : "text-warning"}>{percentage}%</strong>
      </div>

      <div
        className="progress-background"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${subject} attendance`}
      >
        <div className="progress-fill" style={{ width: `${attendedWidth}%` }} />
        <div className="progress-leave" style={{ width: `${leaveWidth}%` }} />
        <div className="progress-threshold" style={{ left: `${ATTENDANCE_THRESHOLD}%` }} />
      </div>

      <div className="subject-card-status">
        <span className={safe ? "status-good" : "status-warning"}>
          {safe ? "Above 75%" : "Below 75%"}
        </span>
        {pendingLeave > 0 && (
          <span className="subject-card-pending">{pendingLeave} waiting for approval</span>
        )}
      </div>
    </div>
  );
};

export default AttendanceCard;

import type { ApplicationStatus } from "../types";

const LABELS: Record<ApplicationStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
};

const StatusBadge = ({ status }: { status: ApplicationStatus }) => (
  <span className={`status-badge status-${status}`}>{LABELS[status]}</span>
);

export default StatusBadge;

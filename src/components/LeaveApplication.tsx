import { useEffect, useState } from "react";
import type { ChangeEvent, SubmitEvent } from "react";
import { AlertCircle, CheckCircle2, FileText, Info, Upload, X } from "lucide-react";
import { api } from "../api";
import type { PreviewResult } from "../api";
import type { Academic, ApplicationKind, LeaveApplication as Application } from "../types";
import { formatDate, formatFileSize, formatRange } from "../utils/format";
import CircularTable from "./CircularTable";

interface LeaveApplicationProps {
  onBack: () => void;
  onOpenErp: () => void;
  onSubmitted: () => void;
}

type Preview = PreviewResult & { key: string; error: string };

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 5 * 1024 * 1024;

const LeaveApplication = ({ onBack, onOpenErp, onSubmitted }: LeaveApplicationProps) => {
  const [academic, setAcademic] = useState<Academic | null>(null);
  const [kind, setKind] = useState<ApplicationKind>("event");
  const [category, setCategory] = useState("");
  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceType, setEvidenceType] = useState<"certificate" | "authority_permission">("certificate");
  const [approvalLetter, setApprovalLetter] = useState<File | null>(null);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Application | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const datesReady = Boolean(startDate && endDate && endDate >= startDate);
  const previewKey = `${startDate}|${endDate}|${kind}`;
  const current = datesReady && preview?.key === previewKey ? preview : null;
  const missingErp = current?.rows.filter((r) => r.attended === null) ?? [];

  useEffect(() => {
    api
      .academic()
      .then(setAcademic)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!datesReady) return;
    let cancelled = false;
    const key = `${startDate}|${endDate}|${kind}`;

    api
      .preview(startDate, endDate, kind)
      .then((data) => !cancelled && setPreview({ ...data, key, error: "" }))
      .catch(
        (err: Error) =>
          !cancelled &&
          setPreview({ key, lectures: [], skipped: [], rows: [], counted: false, error: err.message })
      );

    return () => {
      cancelled = true;
    };
  }, [datesReady, startDate, endDate, kind]);

  const pickFile = (setter: (f: File | null) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen) return;
    if (!ALLOWED_TYPES.includes(chosen.type)) {
      setError("Upload a PDF, JPG or PNG file.");
      return;
    }
    if (chosen.size > MAX_SIZE) {
      setError("Each file must be smaller than 5 MB.");
      return;
    }
    setError("");
    setter(chosen);
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!startDate || !endDate || endDate < startDate) {
      setError("Choose valid dates.");
      return;
    }
    if (kind === "event") {
      if (!category || eventName.trim().length < 3) {
        setError("Choose the category and enter the event name.");
        return;
      }
      if (!approvalLetter) {
        setError("Upload the pre-approval letter for the event.");
        return;
      }
      if (missingErp.length > 0) {
        setError("Enter your ERP attendance for the subjects marked below first.");
        return;
      }
    }
    if (!evidence) {
      setError(
        kind === "medical"
          ? "Upload the medical certificate."
          : evidenceType === "certificate"
            ? "Upload the participation certificate."
            : "Upload the permission letter signed by the HoD or Dean."
      );
      return;
    }
    if (current && !current.error && current.lectures.length === 0) {
      setError("No lectures fall on these dates, so there's nothing to add.");
      return;
    }

    const form = new FormData();
    form.append("kind", kind);
    form.append("startDate", startDate);
    form.append("endDate", endDate);
    form.append("description", description.trim());
    if (kind === "event") {
      form.append("category", category);
      form.append("eventName", eventName.trim());
      form.append("evidenceType", evidenceType);
      form.append("approvalLetter", approvalLetter!);
    }
    form.append("evidence", evidence);

    setSubmitting(true);
    try {
      const { application } = await api.submitApplication(form);
      setSubmitted(application);
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className="leave-page">
        <div className="leave-success-card">
          <div className="success-icon">
            <CheckCircle2 size={30} />
          </div>
          <h1>Application submitted</h1>
          <p>
            {submitted.kind === "medical"
              ? "Your medical leave is recorded. As per the Registrar's circular, medical cases aren't counted for now."
              : "Your class coordinator will verify it against ERP and your documents."}
          </p>

          <div className="success-details">
            <div>
              <span>{submitted.kind === "medical" ? "Type" : "Event"}</span>
              <strong>{submitted.eventName}</strong>
            </div>
            <div>
              <span>Period</span>
              <strong>{formatRange(submitted.startDate, submitted.endDate)}</strong>
            </div>
            <div>
              <span>Sessions covered</span>
              <strong>{submitted.sessions}</strong>
            </div>
            <div>
              <span>Documents</span>
              <strong>{submitted.documents.length}</strong>
            </div>
          </div>

          <div className="success-status">Waiting for review</div>
          <button className="primary-button" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="leave-page">
      <div className="leave-page-heading">
        <div>
          <h1>Apply for attendance</h1>
          <p>For lectures missed because of an approved event. You'll see your final attendance before you submit.</p>
        </div>
        <button className="secondary-button" onClick={onBack}>
          <X size={16} />
          Close
        </button>
      </div>

      <form className="leave-form-card" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        <div className="segmented" role="radiogroup" aria-label="Type of leave">
          <button
            type="button"
            role="radio"
            aria-checked={kind === "event"}
            className={kind === "event" ? "active" : ""}
            onClick={() => setKind("event")}
          >
            Event participation
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === "medical"}
            className={kind === "medical" ? "active" : ""}
            onClick={() => setKind("medical")}
          >
            Medical
          </button>
        </div>

        {kind === "medical" && (
          <div className="info-note">
            <Info size={17} />
            As per the Registrar's circular, medical cases aren't counted until further instructions.
            Your application is recorded and kept on file.
          </div>
        )}

        {kind === "event" && (
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="category">Category</label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select category</option>
                {academic?.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="eventName">Event name</label>
              <input
                id="eventName"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Smart India Hackathon 2026"
                maxLength={120}
              />
            </div>
          </div>
        )}

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="startDate">From</label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              min={academic?.semester?.start}
              max={academic?.semester?.end}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="endDate">To</label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              min={startDate || academic?.semester?.start}
              max={academic?.semester?.end}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description">
            Details <span className="optional">(optional)</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === "event" ? "Venue, organiser, your role" : "Anything the coordinator should know"}
            rows={2}
            maxLength={500}
          />
        </div>

        {kind === "event" && (
          <>
            <FileField
              label="Pre-approval letter"
              hint="Permission for the event, taken before you went."
              file={approvalLetter}
              onPick={pickFile(setApprovalLetter)}
              onRemove={() => setApprovalLetter(null)}
            />

            <div className="form-group">
              <span className="form-label">Proof of participation</span>
              <div className="radio-cards">
                {(["certificate", "authority_permission"] as const).map((type) => (
                  <label key={type} className={evidenceType === type ? "active" : ""}>
                    <input
                      type="radio"
                      name="evidenceType"
                      checked={evidenceType === type}
                      onChange={() => setEvidenceType(type)}
                    />
                    <span>
                      <strong>{type === "certificate" ? "Certificate" : "No certificate"}</strong>
                      {academic?.evidenceTypes[type]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <FileField
          label={
            kind === "medical"
              ? "Medical certificate"
              : evidenceType === "certificate"
                ? "Certificate (must show the exact dates)"
                : "Permission letter signed by HoD / Dean"
          }
          file={evidence}
          onPick={pickFile(setEvidence)}
          onRemove={() => setEvidence(null)}
        />

        <div className="preview-card">
          <div className="section-heading">
            <h2>{kind === "event" ? "Your attendance if approved" : "Lectures during this period"}</h2>
            <p>Worked out from your time table and the academic calendar. Labs count as 1 session.</p>
          </div>

          {!datesReady ? (
            <p className="preview-empty">Choose the dates to see the calculation.</p>
          ) : !current ? (
            <p className="preview-empty">Calculating…</p>
          ) : current.error ? (
            <p className="preview-empty preview-error">{current.error}</p>
          ) : current.lectures.length === 0 ? (
            <p className="preview-empty">No lectures fall on these dates.</p>
          ) : (
            <>
              <CircularTable
                rows={current.rows}
                threshold={academic?.threshold ?? 75}
                mode="application"
                counted={current.counted}
              />

              {kind === "event" && missingErp.length > 0 && (
                <div className="info-note warning-note">
                  <AlertCircle size={17} />
                  <span>
                    Enter your ERP attendance for {missingErp.map((r) => r.subjectName).join(", ")} before
                    submitting.{" "}
                    <button type="button" className="link-button" onClick={onOpenErp}>
                      Enter ERP attendance
                    </button>
                  </span>
                </div>
              )}

              {current.skipped.length > 0 && (
                <p className="preview-skipped">
                  No lectures on:{" "}
                  {current.skipped.map((s) => `${formatDate(s.date, false)} (${s.reason})`).join(", ")}
                </p>
              )}
            </>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onBack}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </div>
      </form>
    </section>
  );
};

type FileFieldProps = {
  label: string;
  hint?: string;
  file: File | null;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
};

function FileField({ label, hint, file, onPick, onRemove }: FileFieldProps) {
  return (
    <div className="form-group">
      <span className="form-label">{label}</span>
      {file ? (
        <div className="selected-file">
          <FileText size={18} />
          <div>
            <strong>{file.name}</strong>
            <span>{formatFileSize(file.size)}</span>
          </div>
          <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <label className="upload-box">
          <Upload size={20} />
          <div className="upload-content">
            <strong>Upload file</strong>
            <span>PDF, JPG or PNG, up to 5 MB</span>
          </div>
          <span className="upload-button">Choose file</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onPick} />
        </label>
      )}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export default LeaveApplication;
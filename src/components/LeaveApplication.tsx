import { useEffect, useState } from "react";
import type { ChangeEvent, SubmitEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { api } from "../api";
import type { LeaveApplication as Application, Lecture, SkippedDay } from "../types";
import { formatDate, formatFileSize, formatRange, formatTime } from "../utils/format";

interface LeaveApplicationProps {
  onBack: () => void;
  onSubmitted: (application: Application) => void;
}

type Preview = {
  key: string;
  lectures: Lecture[];
  skipped: SkippedDay[];
  error: string;
};

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 5 * 1024 * 1024;

const LeaveApplication = ({ onBack, onSubmitted }: LeaveApplicationProps) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  // Named "file", not "document", so it doesn't hide the browser's global `document`.
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Application | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const datesReady = Boolean(startDate && endDate && endDate >= startDate);
  const previewKey = `${startDate}|${endDate}`;
  const currentPreview = datesReady && preview?.key === previewKey ? preview : null;

  useEffect(() => {
    api
      .academic()
      .then((data) => setCategories(data.categories))
      .catch((err: Error) => setError(err.message));
  }, []);

  // Ask the server which timetable lectures fall in the chosen dates.
  useEffect(() => {
    if (!datesReady) return;

    let cancelled = false;
    const key = `${startDate}|${endDate}`;

    api
      .previewLectures(startDate, endDate)
      .then((data) => {
        if (!cancelled) setPreview({ key, ...data, error: "" });
      })
      .catch((err: Error) => {
        if (!cancelled) setPreview({ key, lectures: [], skipped: [], error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [datesReady, startDate, endDate]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again after removing it
    if (!chosen) return;

    if (!ALLOWED_TYPES.includes(chosen.type)) {
      setError("Upload a PDF, JPG or PNG file.");
      return;
    }
    if (chosen.size > MAX_SIZE) {
      setError("File must be smaller than 5 MB.");
      return;
    }

    setError("");
    setFile(chosen);
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!category || eventName.trim().length < 3 || !startDate || !endDate) {
      setError("Fill in the category, event name and both dates.");
      return;
    }
    if (endDate < startDate) {
      setError("End date can't be before the start date.");
      return;
    }
    if (!file) {
      setError("Upload the HOD-signed letter.");
      return;
    }
    if (currentPreview && currentPreview.lectures.length === 0 && !currentPreview.error) {
      setError("No lectures fall on these dates, so there's no attendance to add.");
      return;
    }

    const form = new FormData();
    form.append("category", category);
    form.append("eventName", eventName.trim());
    form.append("startDate", startDate);
    form.append("endDate", endDate);
    form.append("description", description.trim());
    form.append("document", file);

    setSubmitting(true);
    try {
      const { application } = await api.submitApplication(form);
      setSubmitted(application);
      onSubmitted(application);
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
          <p>Your class coordinator will review it and approve the duty leave.</p>

          <div className="success-details">
            <div>
              <span>Event</span>
              <strong>{submitted.eventName}</strong>
            </div>
            <div>
              <span>Leave period</span>
              <strong>{formatRange(submitted.startDate, submitted.endDate)}</strong>
            </div>
            <div>
              <span>Lectures covered</span>
              <strong>{submitted.lectures.length}</strong>
            </div>
            <div>
              <span>Letter</span>
              <strong>{submitted.document.originalName}</strong>
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
          <h1>Apply for duty leave</h1>
          <p>
            For lectures you missed because of an event. Your attendance is updated once
            it's approved.
          </p>
        </div>

        <button className="secondary-button" onClick={onBack}>
          <X size={16} />
          Close
        </button>
      </div>

      <div className="leave-layout">
        <div className="leave-form-card">
          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={17} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="category">Category</label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
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

              <div className="form-group">
                <label htmlFor="startDate">From</label>
                <input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="endDate">To</label>
                <input
                  id="endDate"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
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
                placeholder="Venue, organiser, or anything the coordinator should know"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="form-group">
              <span className="form-label">HOD-signed letter</span>

              {file ? (
                <div className="selected-file">
                  <FileText size={18} />
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
                    <strong>Upload the signed letter</strong>
                    <span>PDF, JPG or PNG, up to 5 MB</span>
                  </div>
                  <span className="upload-button">Choose file</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                  />
                </label>
              )}

              <p className="field-hint">
                The letter must carry the HOD's signature, or the coordinator can't
                approve it.
              </p>
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
        </div>

        <aside className="lecture-preview">
          <div className="card-title">
            <div className="card-icon">
              <ClipboardList size={18} />
            </div>
            <div>
              <h2>Lectures covered</h2>
              <p>Worked out from your time table.</p>
            </div>
          </div>

          {!datesReady ? (
            <p className="preview-empty">
              Choose the dates to see which lectures this leave covers.
            </p>
          ) : !currentPreview ? (
            <p className="preview-empty">Checking your time table…</p>
          ) : currentPreview.error ? (
            <p className="preview-empty preview-error">{currentPreview.error}</p>
          ) : (
            <>
              {currentPreview.lectures.length === 0 ? (
                <p className="preview-empty">No lectures on these dates.</p>
              ) : (
                <ul className="preview-list">
                  {currentPreview.lectures.map((lecture) => (
                    <li key={`${lecture.date}-${lecture.start}`}>
                      <strong>{lecture.subjectName}</strong>
                      <span>
                        <CalendarDays size={13} />
                        {formatDate(lecture.date)}
                        <Clock3 size={13} />
                        {formatTime(lecture.start)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {currentPreview.skipped.length > 0 && (
                <p className="preview-skipped">
                  Skipped:{" "}
                  {currentPreview.skipped
                    .map((s) => `${formatDate(s.date, false)} (${s.reason})`)
                    .join(", ")}
                </p>
              )}

              <div className="preview-total">
                <span>Total lectures</span>
                <strong>{currentPreview.lectures.length}</strong>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
};

export default LeaveApplication;

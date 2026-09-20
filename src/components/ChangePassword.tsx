import { useState } from "react";
import type { SubmitEvent } from "react";
import { AlertCircle, FileCheck, LogOut } from "lucide-react";
import { api } from "../api";
import type { User } from "../types";
import "../styles/Auth.css";

type ChangePasswordProps = {
  user: User;
  onChanged: (user: User) => void;
  onLogout: () => void;
};

/** Shown on first login, when the account still has the starting password from the coordinator. */
const ChangePassword = ({ user, onChanged, onLogout }: ChangePasswordProps) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!current) return setError("Enter the starting password you were given.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords don't match.");
    if (next === current) return setError("Choose a password different from the starting one.");

    setSaving(true);
    try {
      const { user: updated } = await api.changePassword(current, next);
      onChanged(updated);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="auth-main auth-single">
      <div className="auth-card">
        <div className="auth-brand auth-brand-dark">
          <div className="brand-logo">
            <FileCheck size={21} />
          </div>
          <div>
            <strong>Welcome, {user.name}</strong>
            <span>{user.prn ?? user.email}</span>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-heading">
            <h2>Set your own password</h2>
            <p>You're using the starting password from your coordinator. Choose a new one to continue.</p>
          </div>

          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={17} />
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="current">Starting password</label>
            <input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label htmlFor="next">New password</label>
            <input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <p className="field-hint">At least 8 characters</p>
          </div>
          <div className="form-group">
            <label htmlFor="confirm">Confirm new password</label>
            <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>

          <button type="submit" className="primary-button auth-submit" disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </button>

          <p className="auth-switch">
            <button type="button" onClick={onLogout}>
              <LogOut size={13} /> Log out
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
import { useState } from "react";
import type { SubmitEvent } from "react";
import { AlertCircle, Eye, EyeOff, FileCheck } from "lucide-react";
import { api } from "../api";
import type { SignupPayload } from "../api";
import type { AuthResponse, Role } from "../types";
import "../styles/Auth.css";

type Mode = "login" | "signup";

type AuthPageProps = {
  onAuthenticated: (result: AuthResponse) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRN_RE = /^[A-Za-z0-9]{6,20}$/;

const AuthPage = ({ onAuthenticated }: AuthPageProps) => {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="auth-page">
      <aside className="auth-panel">
        <div className="auth-brand">
          <div className="brand-logo">
            <FileCheck size={21} />
          </div>
          <div>
            <strong>Sanjivani University</strong>
            <span>Department of Computer Science & Engineering</span>
          </div>
        </div>

        <div className="auth-panel-body">
          <h1>Duty leave, without the paperwork.</h1>
          <p>
            Missed lectures for a competition or college event? Submit the HOD-signed
            letter here instead of on paper, and your attendance is corrected as soon as
            it's approved.
          </p>

          <ol className="auth-steps">
            <li>
              <strong>Student applies</strong>
              <span>Event dates and the signed letter</span>
            </li>
            <li>
              <strong>Coordinator reviews</strong>
              <span>Sees exactly which lectures were missed</span>
            </li>
            <li>
              <strong>Attendance updates</strong>
              <span>Approved lectures count towards 75%</span>
            </li>
          </ol>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "active" : ""}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          {mode === "login" ? (
            <LoginForm onAuthenticated={onAuthenticated} onSwitch={() => setMode("signup")} />
          ) : (
            <SignupForm onAuthenticated={onAuthenticated} onSwitch={() => setMode("login")} />
          )}
        </div>
      </main>
    </div>
  );
};

/* =========================================
   LOGIN
========================================= */

type FormProps = {
  onAuthenticated: (result: AuthResponse) => void;
  onSwitch: () => void;
};

function LoginForm({ onAuthenticated, onSwitch }: FormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!identifier.trim() || !password) {
      setError("Enter your email or PRN and your password.");
      return;
    }

    setLoading(true);
    try {
      onAuthenticated(await api.login(identifier.trim(), password));
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-heading">
        <h2>Welcome back</h2>
        <p>Log in with your college email or PRN.</p>
      </div>

      {error && <FormError message={error} />}

      <div className="form-group">
        <label htmlFor="identifier">Email or PRN</label>
        <input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoFocus
        />
      </div>

      <PasswordField
        id="password"
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      <button type="submit" className="primary-button auth-submit" disabled={loading}>
        {loading ? "Logging in…" : "Log in"}
      </button>

      <p className="auth-switch">
        New here?{" "}
        <button type="button" onClick={onSwitch}>
          Create an account
        </button>
      </p>
    </form>
  );
}

/* =========================================
   SIGN UP
========================================= */

function SignupForm({ onAuthenticated, onSwitch }: FormProps) {
  const [role, setRole] = useState<Role>("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [prn, setPrn] = useState("");
  const [year, setYear] = useState("");
  const [division, setDivision] = useState("");
  const [designation, setDesignation] = useState("Class Coordinator");
  const [facultyCode, setFacultyCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = (): string => {
    if (name.trim().length < 2) return "Enter your full name.";
    if (!EMAIL_RE.test(email.trim())) return "Enter a valid email address.";
    if (role === "student") {
      if (!PRN_RE.test(prn.trim())) return "PRN must be 6–20 letters or numbers.";
      if (!year) return "Choose your year.";
      if (!division) return "Choose your division.";
    } else if (!facultyCode.trim()) {
      return "Enter the faculty access code from the department admin.";
    }
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords don't match.";
    return "";
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;

    const payload: SignupPayload =
      role === "student"
        ? { role, name: name.trim(), email: email.trim(), password, prn: prn.trim(), year, division }
        : { role, name: name.trim(), email: email.trim(), password, designation, facultyCode: facultyCode.trim() };

    setLoading(true);
    try {
      onAuthenticated(await api.signup(payload));
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-heading">
        <h2>Create your account</h2>
        <p>Use your college email so the department can verify you.</p>
      </div>

      <div className="role-switch" role="radiogroup" aria-label="I am a">
        {(["student", "faculty"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            className={role === r ? "active" : ""}
            onClick={() => {
              setRole(r);
              setError("");
            }}
          >
            {r === "student" ? "Student" : "Faculty"}
          </button>
        ))}
      </div>

      {error && <FormError message={error} />}

      <div className="form-group">
        <label htmlFor="name">Full name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>

      <div className="form-group">
        <label htmlFor="email">College email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      {role === "student" ? (
        <div className="form-grid form-grid-3">
          <div className="form-group">
            <label htmlFor="prn">PRN</label>
            <input
              id="prn"
              value={prn}
              onChange={(e) => setPrn(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
          <div className="form-group">
            <label htmlFor="year">Year</label>
            <select id="year" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Select</option>
              <option value="FY">FY</option>
              <option value="SY">SY</option>
              <option value="TY">TY</option>
              <option value="BTech">Final year</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="division">Division</label>
            <select id="division" value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">Select</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="designation">Role</label>
            <select
              id="designation"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
            >
              <option>Class Coordinator</option>
              <option>Assistant Professor</option>
              <option>Associate Professor</option>
              <option>Head of Department</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="facultyCode">Faculty access code</label>
            <input
              id="facultyCode"
              value={facultyCode}
              onChange={(e) => setFacultyCode(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      )}

      <PasswordField
        id="new-password"
        label="Password"
        hint="At least 8 characters"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
      />

      <PasswordField
        id="confirm-password"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />

      <button type="submit" className="primary-button auth-submit" disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </button>

      <p className="auth-switch">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch}>
          Log in
        </button>
      </p>
    </form>
  );
}

/* =========================================
   SMALL PIECES
========================================= */

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
};

function PasswordField({ id, label, value, onChange, autoComplete, hint }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="form-error" role="alert">
      <AlertCircle size={17} />
      {message}
    </div>
  );
}

export default AuthPage;

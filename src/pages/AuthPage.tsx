import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { AlertCircle, Eye, EyeOff, FileCheck } from "lucide-react";
import { api } from "../api";
import type { AuthResponse, ClassInfo } from "../types";
// Place Su-college-logo.webp inside src/assets/
import suLogo from "../assets/Su-college-logo.webp";
import "../styles/Auth.css";

type Mode = "login" | "signup";

type AuthPageProps = {
  onAuthenticated: (result: AuthResponse) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AuthPage = ({ onAuthenticated }: AuthPageProps) => {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="auth-page">

      {/* ── LEFT PANEL: original dark navy bg, original brand row, logo + name centred ── */}
      <aside className="auth-panel" style={{ display: "flex", flexDirection: "column" }}>

        {/* Top-left brand row — exactly as in the original UI */}
        <div className="auth-brand">
          <div className="brand-logo">
            <FileCheck size={21} />
          </div>
          <div>
            <strong>Sanjivani University</strong>
            <span>Department of Computer Science &amp; Engineering</span>
          </div>
        </div>

        {/* Centre area: university logo + app name */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2.25rem",
            padding: "2rem",
          }}
        >
          <img
            src={suLogo}
            alt="Sanjivani University"
            style={{ width: "360px", maxWidth: "88%" }}
          />
          <h1
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: "2.1rem",
              fontWeight: 700,
              textAlign: "center",
              lineHeight: 1.3,
              letterSpacing: "-0.3px",
            }}
          >
            Sanjivani-Attende-Tacker
          </h1>
        </div>

      </aside>

      {/* ── RIGHT PANEL: completely unchanged ── */}
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
              Faculty sign up
            </button>
          </div>

          {mode === "login" ? (
            <LoginForm onAuthenticated={onAuthenticated} />
          ) : (
            <FacultySignupForm onAuthenticated={onAuthenticated} onSwitch={() => setMode("login")} />
          )}
        </div>
      </main>

    </div>
  );
};

/* =========================================
   LOGIN
========================================= */

function LoginForm({ onAuthenticated }: { onAuthenticated: (r: AuthResponse) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) {
      setError("Enter your PRN or email and your password.");
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
        <h2>Log in</h2>
        <p>Students: use your PRN. Faculty: use your email.</p>
      </div>

      {error && <FormError message={error} />}

      <div className="form-group">
        <label htmlFor="identifier">PRN or email</label>
        <input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          placeholder="e.g. 2125UCEF1001"
          autoFocus
        />
      </div>

      <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />

      <button type="submit" className="primary-button auth-submit" disabled={loading}>
        {loading ? "Logging in..." : "Log in"}
      </button>

      <p className="auth-note">
        First time? Your starting password is with your class coordinator. Forgot it? Ask them to
        reset it.
      </p>
    </form>
  );
}

/* =========================================
   FACULTY SIGN UP
========================================= */

function FacultySignupForm({ onAuthenticated, onSwitch }: { onAuthenticated: (r: AuthResponse) => void; onSwitch: () => void }) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("Class Coordinator");
  const [selected, setSelected] = useState<string[]>([]);
  const [facultyCode, setFacultyCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isHod = designation === "Head of Department";

  useEffect(() => {
    api
      .classes()
      .then((d) => setClasses(d.classes))
      .catch((err: Error) => setError(err.message));
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    let problem = "";
    if (name.trim().length < 2) problem = "Enter your full name.";
    else if (!EMAIL_RE.test(email.trim())) problem = "Enter a valid email address.";
    else if (!isHod && selected.length === 0) problem = "Choose the class or classes you coordinate.";
    else if (!facultyCode.trim()) problem = "Enter the faculty access code from the department admin.";
    else if (password.length < 8) problem = "Password must be at least 8 characters.";
    else if (password !== confirm) problem = "Passwords don't match.";
    setError(problem);
    if (problem) return;

    setLoading(true);
    try {
      onAuthenticated(
        await api.signup({
          name: name.trim(),
          email: email.trim(),
          password,
          designation,
          facultyCode: facultyCode.trim(),
          classes: isHod ? [] : selected,
        })
      );
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-heading">
        <h2>Faculty account</h2>
        <p>Student accounts are created by the department from the class lists.</p>
      </div>

      {error && <FormError message={error} />}

      <div className="form-group">
        <label htmlFor="name">Full name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="email">College email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="form-group">
          <label htmlFor="designation">Role</label>
          <select id="designation" value={designation} onChange={(e) => setDesignation(e.target.value)}>
            <option>Class Coordinator</option>
            <option>Assistant Professor</option>
            <option>Associate Professor</option>
            <option>Head of Department</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <span className="form-label">{isHod ? "Classes" : "Classes you coordinate"}</span>
        {isHod ? (
          <p className="field-hint">The Head of Department can see every class.</p>
        ) : (
          <div className="class-picker">
            {classes.map((c) => (
              <label key={c.id} className={selected.includes(c.id) ? "active" : ""}>
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.id}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="facultyCode">Faculty access code</label>
        <input id="facultyCode" value={facultyCode} onChange={(e) => setFacultyCode(e.target.value)} autoComplete="off" />
      </div>

      <PasswordField id="new-password" label="Password" hint="At least 8 characters" value={password} onChange={setPassword} autoComplete="new-password" />
      <PasswordField id="confirm-password" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

      <button type="submit" className="primary-button auth-submit" disabled={loading}>
        {loading ? "Creating account..." : "Create faculty account"}
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

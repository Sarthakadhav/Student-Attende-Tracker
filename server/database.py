"""
SQLite database (built into Python, nothing to install).

The file is created automatically at server/data/attendance.db.
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "attendance.db"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS classes (
    id          TEXT PRIMARY KEY,           -- FY, SY-A, SY-B, TY-A, TY-B, BTECH
    label       TEXT NOT NULL,
    year        TEXT NOT NULL,
    division    TEXT NOT NULL,
    coordinator TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id                   TEXT PRIMARY KEY,
    role                 TEXT NOT NULL CHECK (role IN ('student', 'faculty')),
    name                 TEXT NOT NULL,
    email                TEXT UNIQUE,       -- optional for students (the list has no emails)
    password_hash        TEXT NOT NULL,
    prn                  TEXT UNIQUE,
    roll_no              INTEGER,
    class_id             TEXT REFERENCES classes(id),
    designation          TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL
);

-- Which classes a faculty member coordinates. No rows = sees every class (HoD).
CREATE TABLE IF NOT EXISTS faculty_classes (
    faculty_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id   TEXT NOT NULL REFERENCES classes(id),
    PRIMARY KEY (faculty_id, class_id)
);

-- ERP attendance entered by the student (circular step 7), per course.
CREATE TABLE IF NOT EXISTS erp_attendance (
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id  TEXT NOT NULL,
    attended   INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS applications (
    id            TEXT PRIMARY KEY,
    student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id      TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('event', 'medical')),
    category      TEXT NOT NULL,
    event_name    TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    start_date    TEXT NOT NULL,
    end_date      TEXT NOT NULL,
    lectures      TEXT NOT NULL,            -- JSON list of affected lectures
    evidence_type TEXT NOT NULL,            -- certificate / authority_permission / medical_certificate
    status        TEXT NOT NULL DEFAULT 'pending',
    unread        INTEGER NOT NULL DEFAULT 1,
    remark        TEXT NOT NULL DEFAULT '',
    submitted_at  TEXT NOT NULL,
    reviewed_at   TEXT,
    reviewed_by   TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id             TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL,           -- approval_letter / evidence
    stored_name    TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    mime_type      TEXT NOT NULL,
    size           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_class ON users(class_id);
CREATE INDEX IF NOT EXISTS idx_apps_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_apps_class ON applications(class_id);
"""


@contextmanager
def get_db():
    """Opens a connection, commits if everything worked, rolls back on error."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)
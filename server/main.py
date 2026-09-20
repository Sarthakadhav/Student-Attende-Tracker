"""
CSE Duty Leave & Attendance Portal - Python backend (FastAPI).

Implements the Registrar's circular:
  * students need a pre-approval letter and a certificate (or HoD/Dean permission)
  * medical cases are recorded but not counted
  * Final % = (ERP attended + lectures missed during the event) / ERP total

Run:  python main.py      (http://localhost:5000, docs at http://localhost:5000/docs)
"""

import io
import json
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
import uvicorn
from fastapi import Body, Depends, FastAPI, File, Form, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.exceptions import HTTPException

import lecture_engine as engine
from database import UPLOAD_DIR, get_db, init_db

# =========================================
# CONFIG
# =========================================

PORT = int(os.getenv("PORT", "5000"))
CLIENT_URL = os.getenv("CLIENT_URL", "http://localhost:5173")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
FACULTY_SIGNUP_CODE = os.getenv("FACULTY_SIGNUP_CODE", "CSE-FACULTY-2026")
TOKEN_DAYS = 7
THRESHOLD = 75.0

EVENT_CATEGORIES = [
    "Hackathon / Competition",
    "Technical event / Workshop",
    "Sports",
    "Cultural",
    "Internship",
    "NSS / NCC",
    "Other college duty",
]
EVIDENCE_TYPES = {
    "certificate": "Participation certificate with the exact dates",
    "authority_permission": "Permission signed by HoD / Dean (no certificate)",
}
ALLOWED_FILE_TYPES = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}
MAX_FILE_SIZE = 5 * 1024 * 1024
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

log = logging.getLogger("attendance")
logging.basicConfig(level=logging.INFO)

if "JWT_SECRET" not in os.environ:
    log.warning("JWT_SECRET is not set. Using a development secret. Set it before deploying.")

# =========================================
# APP
# =========================================

app = FastAPI(title="CSE Duty Leave & Attendance API")
app.add_middleware(
    CORSMiddleware, allow_origins=[CLIENT_URL], allow_methods=["*"], allow_headers=["*"]
)
init_db()


class ApiError(HTTPException):
    """An error whose message is safe to show to the user."""


@app.exception_handler(HTTPException)
async def http_error(_request: Request, exc: HTTPException):
    message = exc.detail
    if exc.status_code == 404 and message == "Not Found":
        message = "API route not found."
    elif exc.status_code == 405:
        message = "This method isn't allowed on this route."
    return JSONResponse({"error": message}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    json_problem = any(e.get("type") == "json_invalid" for e in exc.errors())
    message = "Request body is not valid JSON." if json_problem else "Some of the data sent is invalid."
    return JSONResponse({"error": message}, status_code=400)


@app.exception_handler(engine.EngineError)
async def engine_error(_request: Request, exc: engine.EngineError):
    return JSONResponse({"error": str(exc)}, status_code=400)


@app.exception_handler(Exception)
async def server_error(_request: Request, exc: Exception):
    log.exception("Unhandled error", exc_info=exc)
    return JSONResponse({"error": "Something went wrong on the server."}, status_code=500)


# =========================================
# HELPERS
# =========================================


def clean(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode()


def check_password(password: str, password_hash: str) -> bool:
    if len(password.encode("utf-8")) > 72:
        return False
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def generate_password() -> str:
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(10))


def validate_new_password(password: str):
    if len(password) < 8:
        raise ApiError(400, "Password must be at least 8 characters.")
    if len(password.encode("utf-8")) > 72:
        raise ApiError(400, "Password is too long (maximum 72 characters).")


def faculty_class_ids(conn, faculty_id: str) -> list[str]:
    rows = conn.execute("SELECT class_id FROM faculty_classes WHERE faculty_id = ?", (faculty_id,))
    return [r["class_id"] for r in rows]


def class_label(conn, class_id: str | None) -> str | None:
    if not class_id:
        return None
    row = conn.execute("SELECT label FROM classes WHERE id = ?", (class_id,)).fetchone()
    return row["label"] if row else class_id


def public_user(row, conn) -> dict:
    user = {
        "id": row["id"],
        "role": row["role"],
        "name": row["name"],
        "email": row["email"],
        "createdAt": row["created_at"],
        "prn": row["prn"],
        "rollNo": row["roll_no"],
        "classId": row["class_id"],
        "classLabel": class_label(conn, row["class_id"]),
        "designation": row["designation"],
        "mustChangePassword": bool(row["must_change_password"]),
    }
    if row["role"] == "faculty":
        user["classes"] = faculty_class_ids(conn, row["id"])
    return {k: v for k, v in user.items() if v is not None}


def sign_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def logged_in_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "Please log in to continue.")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(401, "Your session has expired. Please log in again.")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (payload.get("sub"),)).fetchone()
    if row is None:
        raise ApiError(401, "This account no longer exists.")
    return row


def current_user(user=Depends(logged_in_user)):
    """Like logged_in_user, but blocks everything until a starting password is changed."""
    if user["must_change_password"]:
        raise ApiError(403, "Change your starting password first.")
    return user


def require_role(role: str):
    def check(user=Depends(current_user)):
        if user["role"] != role:
            raise ApiError(403, "You don't have access to this.")
        return user

    return check


def faculty_can_see(conn, faculty, class_id: str) -> bool:
    allowed = faculty_class_ids(conn, faculty["id"])
    return not allowed or class_id in allowed  # no assigned classes = HoD, sees every class


def visible_classes(conn, faculty) -> list[str]:
    allowed = faculty_class_ids(conn, faculty["id"])
    if allowed:
        return allowed
    return [r["id"] for r in conn.execute("SELECT id FROM classes ORDER BY rowid")]


def student_info(row) -> dict:
    if row is None:
        return {"name": "Deleted student", "prn": "-", "classId": "-"}
    return {"name": row["name"], "prn": row["prn"], "rollNo": row["roll_no"], "classId": row["class_id"]}


def documents_for(conn, application_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM documents WHERE application_id = ? ORDER BY kind", (application_id,)
    ).fetchall()
    return [
        {"id": r["id"], "kind": r["kind"], "originalName": r["original_name"],
         "mimeType": r["mime_type"], "size": r["size"]}
        for r in rows
    ]


def application_json(row, conn) -> dict:
    student = conn.execute("SELECT * FROM users WHERE id = ?", (row["student_id"],)).fetchone()
    lectures = json.loads(row["lectures"])
    data = {
        "id": row["id"],
        "studentId": row["student_id"],
        "student": student_info(student),
        "classId": row["class_id"],
        "kind": row["kind"],
        "category": row["category"],
        "eventName": row["event_name"],
        "description": row["description"],
        "startDate": row["start_date"],
        "endDate": row["end_date"],
        "lectures": lectures,
        "sessions": sum(l["sessions"] for l in lectures),
        "evidenceType": row["evidence_type"],
        "status": row["status"],
        "unread": bool(row["unread"]),
        "remark": row["remark"],
        "submittedAt": row["submitted_at"],
        "reviewedAt": row["reviewed_at"],
        "documents": documents_for(conn, row["id"]),
    }
    if row["reviewed_by"]:
        data["reviewedBy"] = row["reviewed_by"]
    return data


def get_application(conn, application_id: str):
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (application_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Application not found.")
    return row


def check_application_access(conn, user, row):
    if user["role"] == "student":
        if row["student_id"] != user["id"]:
            raise ApiError(403, "You don't have access to this application.")
    elif not faculty_can_see(conn, user, row["class_id"]):
        raise ApiError(403, "This application belongs to a class you don't coordinate.")


def erp_map(conn, student_id: str) -> dict:
    rows = conn.execute("SELECT * FROM erp_attendance WHERE student_id = ?", (student_id,))
    return {r["course_id"]: dict(r) for r in rows}


def event_applications(conn, student_id: str, status: str, exclude: str | None = None):
    rows = conn.execute(
        """SELECT * FROM applications
           WHERE student_id = ? AND kind = 'event' AND status = ? ORDER BY start_date""",
        (student_id, status),
    ).fetchall()
    return [r for r in rows if r["id"] != exclude]


def circular_rows(conn, student, extra_sessions: dict | None = None,
                  extra_range: tuple[str, str] | None = None,
                  exclude_application: str | None = None) -> list[dict]:
    """
    One row per ERP course, in the circular's table format.
    extra_sessions: lectures of an application being previewed or reviewed ("if approved").
    """
    courses = engine.courses_for(student["class_id"])
    erp = erp_map(conn, student["id"])

    def per_course(apps):
        totals, ranges = {}, {}
        for a in apps:
            for course_id, n in engine.sessions_by_course(json.loads(a["lectures"])).items():
                totals[course_id] = totals.get(course_id, 0) + n
                ranges.setdefault(course_id, []).append([a["start_date"], a["end_date"]])
        return totals, ranges

    approved, approved_ranges = per_course(
        event_applications(conn, student["id"], "approved", exclude_application))
    pending, _ = per_course(event_applications(conn, student["id"], "pending", exclude_application))
    extra_sessions = extra_sessions or {}

    rows = []
    for course in courses:
        cid = course["id"]
        entry = erp.get(cid)
        missed = approved.get(cid, 0)
        this = extra_sessions.get(cid, 0)
        durations = list(approved_ranges.get(cid, []))
        if this and extra_range:
            durations.append(list(extra_range))

        row = {
            "courseId": cid,
            "subjectCode": course["code"],
            "subjectName": course["name"],
            "attended": entry["attended"] if entry else None,
            "total": entry["total"] if entry else None,
            "durations": durations,
            "approvedMissed": missed,
            "pendingMissed": pending.get(cid, 0),
            "thisMissed": this,
            "credit": None,
            "erpPercent": None,
            "finalPercent": None,
        }
        if entry and entry["total"] > 0:
            result = engine.final_attendance(entry["attended"], entry["total"], missed + this)
            row.update(credit=result["credit"], erpPercent=result["erpPercent"],
                       finalPercent=result["finalPercent"])
        rows.append(row)
    return rows


async def read_upload(upload: UploadFile | None, label: str):
    if upload is None or not upload.filename:
        raise ApiError(400, f"Upload the {label}.")
    if upload.content_type not in ALLOWED_FILE_TYPES:
        raise ApiError(400, f"The {label} must be a PDF, JPG or PNG file.")
    content = await upload.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise ApiError(400, f"The {label} must be smaller than 5 MB.")
    if not content:
        raise ApiError(400, f"The {label} file is empty.")
    return content, upload


def validate_dates(class_id: str, start_date, end_date) -> dict:
    for value in (start_date, end_date):
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ApiError(400, "Choose a valid start and end date.")
    try:
        return engine.missed_lectures(class_id, start_date, end_date)
    except ValueError:
        raise ApiError(400, "Choose a valid start and end date.")


# =========================================
# AUTH
# =========================================


@app.get("/api/classes")
def list_classes():
    """Public: used by the faculty sign-up form."""
    with get_db() as conn:
        rows = conn.execute("SELECT id, label FROM classes ORDER BY rowid").fetchall()
    return {"classes": [{"id": r["id"], "label": r["label"], "ready": engine.is_ready(r["id"])}
                        for r in rows]}


@app.post("/api/auth/login")
def login(body: dict = Body(default_factory=dict)):
    identifier = clean(body.get("identifier")).lower()
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    if not identifier or not password:
        raise ApiError(400, "Enter your PRN or email and your password.")

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(prn) = ?", (identifier, identifier)
        ).fetchone()
        # Same message either way, so nobody can find out which accounts exist.
        if row is None or not check_password(password, row["password_hash"]):
            raise ApiError(401, "Incorrect PRN/email or password.")
        return {"token": sign_token(row["id"]), "user": public_user(row, conn)}


@app.post("/api/auth/signup", status_code=201)
def faculty_signup(body: dict = Body(default_factory=dict)):
    """Only faculty sign up. Students are loaded from the department list (import_data.py)."""
    name = clean(body.get("name"))
    email = clean(body.get("email")).lower()
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    designation = clean(body.get("designation")) or "Faculty"
    class_ids = body.get("classes") if isinstance(body.get("classes"), list) else []

    if clean(body.get("facultyCode")) != FACULTY_SIGNUP_CODE:
        raise ApiError(403, "The faculty access code is incorrect. Ask the department admin for it.")
    if len(name) < 2:
        raise ApiError(400, "Enter your full name.")
    if not EMAIL_RE.match(email):
        raise ApiError(400, "Enter a valid email address.")
    validate_new_password(password)

    with get_db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE LOWER(email) = ?", (email,)).fetchone():
            raise ApiError(409, "An account with this email already exists.")
        known = {r["id"] for r in conn.execute("SELECT id FROM classes")}
        if any(c not in known for c in class_ids):
            raise ApiError(400, "One of the selected classes doesn't exist.")

        user_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO users (id, role, name, email, password_hash, designation, created_at)
               VALUES (?, 'faculty', ?, ?, ?, ?, ?)""",
            (user_id, name, email, hash_password(password), designation, now_iso()),
        )
        conn.executemany(
            "INSERT INTO faculty_classes (faculty_id, class_id) VALUES (?, ?)",
            [(user_id, c) for c in dict.fromkeys(class_ids)],
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return {"token": sign_token(user_id), "user": public_user(row, conn)}


@app.get("/api/auth/me")
def me(user=Depends(logged_in_user)):
    with get_db() as conn:
        return {"user": public_user(user, conn)}


@app.post("/api/auth/change-password")
def change_password(body: dict = Body(default_factory=dict), user=Depends(logged_in_user)):
    current = body.get("currentPassword") if isinstance(body.get("currentPassword"), str) else ""
    new = body.get("newPassword") if isinstance(body.get("newPassword"), str) else ""

    if not check_password(current, user["password_hash"]):
        raise ApiError(400, "Your current password is incorrect.")
    validate_new_password(new)
    if new == current:
        raise ApiError(400, "Choose a password different from the current one.")

    with get_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
            (hash_password(new), user["id"]),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        return {"user": public_user(row, conn)}


@app.post("/api/students/{prn}/reset-password")
def reset_student_password(prn: str, faculty=Depends(require_role("faculty"))):
    """Coordinator resets a forgotten password. The student must change it on next login."""
    with get_db() as conn:
        student = conn.execute(
            "SELECT * FROM users WHERE role = 'student' AND prn = ?", (prn.upper(),)
        ).fetchone()
        if student is None:
            raise ApiError(404, "No student with this PRN.")
        if not faculty_can_see(conn, faculty, student["class_id"]):
            raise ApiError(403, "This student is in a class you don't coordinate.")

        password = generate_password()
        conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
            (hash_password(password), student["id"]),
        )
    return {"prn": student["prn"], "name": student["name"], "password": password}


# =========================================
# ACADEMIC DATA + ERP ATTENDANCE
# =========================================


@app.get("/api/academic")
def academic(user=Depends(current_user)):
    data = {"categories": EVENT_CATEGORIES, "evidenceTypes": EVIDENCE_TYPES, "threshold": THRESHOLD}
    if user["role"] == "student":
        ready = engine.is_ready(user["class_id"])
        data.update(classId=user["class_id"], ready=ready,
                    courses=engine.courses_for(user["class_id"]) if ready else [])
        if ready:
            cal = engine.calendar_for(user["class_id"])
            data["semester"] = {"start": cal["semesterStart"], "end": cal["semesterEnd"]}
    return data


@app.get("/api/erp-attendance")
def get_erp(user=Depends(require_role("student"))):
    if not engine.is_ready(user["class_id"]):
        return {"ready": False, "courses": []}
    with get_db() as conn:
        erp = erp_map(conn, user["id"])
    courses = []
    for c in engine.courses_for(user["class_id"]):
        entry = erp.get(c["id"])
        courses.append({
            "courseId": c["id"], "code": c["code"], "name": c["name"], "faculty": c["faculty"],
            "attended": entry["attended"] if entry else None,
            "total": entry["total"] if entry else None,
            "updatedAt": entry["updated_at"] if entry else None,
        })
    return {"ready": True, "courses": courses}


@app.put("/api/erp-attendance")
def save_erp(body: dict = Body(default_factory=dict), user=Depends(require_role("student"))):
    entries = body.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ApiError(400, "Enter your ERP attendance for at least one subject.")

    valid = {c["id"]: c["name"] for c in engine.courses_for(user["class_id"])}
    cleaned = []
    for e in entries:
        if not isinstance(e, dict) or e.get("courseId") not in valid:
            raise ApiError(400, "One of the subjects isn't part of your class.")
        name, attended, total = valid[e["courseId"]], e.get("attended"), e.get("total")
        if type(attended) is not int or type(total) is not int:
            raise ApiError(400, f"{name}: enter whole numbers.")
        if not 1 <= total <= 300:
            raise ApiError(400, f"{name}: total sessions must be between 1 and 300.")
        if not 0 <= attended <= total:
            raise ApiError(400, f"{name}: attended can't be more than the total.")
        cleaned.append((user["id"], e["courseId"], attended, total, now_iso()))

    with get_db() as conn:
        conn.executemany(
            """INSERT INTO erp_attendance (student_id, course_id, attended, total, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (student_id, course_id)
               DO UPDATE SET attended = excluded.attended, total = excluded.total,
                             updated_at = excluded.updated_at""",
            cleaned,
        )
    return get_erp(user)


# =========================================
# LEAVE APPLICATIONS
# =========================================


@app.post("/api/applications/preview")
def preview(body: dict = Body(default_factory=dict), user=Depends(require_role("student"))):
    start_date, end_date = body.get("startDate"), body.get("endDate")
    result = validate_dates(user["class_id"], start_date, end_date)
    counted = body.get("kind") != "medical"
    this = engine.sessions_by_course(result["lectures"])

    with get_db() as conn:
        rows = circular_rows(conn, user, extra_sessions=this if counted else None,
                             extra_range=(start_date, end_date))
    for r in rows:
        r["applicationSessions"] = this.get(r["courseId"], 0)
    return {**result, "rows": [r for r in rows if r["applicationSessions"]], "counted": counted}


@app.post("/api/applications", status_code=201)
async def submit_application(
    kind: str = Form("event"),
    category: str = Form(""),
    eventName: str = Form(""),
    startDate: str = Form(""),
    endDate: str = Form(""),
    description: str = Form(""),
    evidenceType: str = Form(""),
    approvalLetter: UploadFile | None = File(None),
    evidence: UploadFile | None = File(None),
    user=Depends(require_role("student")),
):
    kind, category = clean(kind), clean(category)
    event_name, description, evidence_type = clean(eventName), clean(description), clean(evidenceType)

    if kind not in ("event", "medical"):
        raise ApiError(400, "Choose event or medical.")
    if kind == "event":
        if category not in EVENT_CATEGORIES:
            raise ApiError(400, "Choose an event category.")
        if len(event_name) < 3:
            raise ApiError(400, "Enter the name of the event.")
        if evidence_type not in EVIDENCE_TYPES:
            raise ApiError(400, "Choose whether you have a certificate or HoD/Dean permission.")
    else:
        category, evidence_type = "Medical", "medical_certificate"
        event_name = event_name or "Medical leave"
    if len(description) > 500:
        raise ApiError(400, "Keep the description under 500 characters.")

    lectures = validate_dates(user["class_id"], startDate, endDate)["lectures"]
    if not lectures:
        raise ApiError(400, "No lectures fall on these dates, so there's nothing to add.")

    files = []
    if kind == "event":
        files.append(("approval_letter", *await read_upload(approvalLetter, "pre-approval letter")))
        label = "certificate" if evidence_type == "certificate" else "HoD/Dean permission letter"
        files.append(("evidence", *await read_upload(evidence, label)))
    else:
        files.append(("evidence", *await read_upload(evidence, "medical certificate")))

    with get_db() as conn:
        if kind == "event":
            erp = erp_map(conn, user["id"])
            missing = sorted({l["subjectName"] for l in lectures if l["courseId"] not in erp})
            if missing:
                raise ApiError(400, "Enter your ERP attendance first for: " + ", ".join(missing) + ".")

        overlapping = conn.execute(
            """SELECT start_date, end_date FROM applications
               WHERE student_id = ? AND status != 'rejected' AND start_date <= ? AND end_date >= ?""",
            (user["id"], endDate, startDate),
        ).fetchone()
        if overlapping:
            raise ApiError(
                409,
                f"You already applied for {overlapping['start_date']} to {overlapping['end_date']}. "
                "Dates can't overlap.",
            )

        application_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO applications (id, student_id, class_id, kind, category, event_name,
                   description, start_date, end_date, lectures, evidence_type, submitted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (application_id, user["id"], user["class_id"], kind, category, event_name, description,
             startDate, endDate, json.dumps(lectures), evidence_type, now_iso()),
        )

        written = []
        try:
            for doc_kind, content, upload in files:
                stored = f"{uuid.uuid4()}{ALLOWED_FILE_TYPES[upload.content_type]}"
                path = UPLOAD_DIR / stored
                path.write_bytes(content)
                written.append(path)
                conn.execute(
                    """INSERT INTO documents (id, application_id, kind, stored_name, original_name,
                           mime_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (str(uuid.uuid4()), application_id, doc_kind, stored,
                     Path(upload.filename).name, upload.content_type, len(content)),
                )
        except Exception:
            for path in written:
                path.unlink(missing_ok=True)
            raise

        return {"application": application_json(get_application(conn, application_id), conn)}


@app.get("/api/applications")
def list_applications(classId: str | None = None, user=Depends(current_user)):
    with get_db() as conn:
        if user["role"] == "student":
            rows = conn.execute(
                "SELECT * FROM applications WHERE student_id = ? ORDER BY submitted_at DESC",
                (user["id"],),
            ).fetchall()
        else:
            allowed = visible_classes(conn, user)
            if classId and classId not in allowed:
                raise ApiError(403, "You don't coordinate this class.")
            wanted = [classId] if classId else allowed
            if not wanted:
                return {"applications": []}
            marks = ",".join("?" * len(wanted))
            rows = conn.execute(
                f"SELECT * FROM applications WHERE class_id IN ({marks}) ORDER BY submitted_at DESC",
                wanted,
            ).fetchall()
        return {"applications": [application_json(r, conn) for r in rows]}


@app.get("/api/applications/{application_id}/calculation")
def application_calculation(application_id: str, user=Depends(current_user)):
    """The circular's table for one application: the student's attendance if it is approved."""
    with get_db() as conn:
        row = get_application(conn, application_id)
        check_application_access(conn, user, row)
        student = conn.execute("SELECT * FROM users WHERE id = ?", (row["student_id"],)).fetchone()
        this = engine.sessions_by_course(json.loads(row["lectures"]))
        counted = row["kind"] == "event" and row["status"] != "rejected"
        rows = circular_rows(conn, student, extra_sessions=this if counted else None,
                             extra_range=(row["start_date"], row["end_date"]),
                             exclude_application=row["id"])
    for r in rows:
        r["applicationSessions"] = this.get(r["courseId"], 0)
    return {"counted": counted, "rows": [r for r in rows if r["applicationSessions"]]}


@app.patch("/api/applications/{application_id}/read")
def mark_read(application_id: str, user=Depends(require_role("faculty"))):
    with get_db() as conn:
        row = get_application(conn, application_id)
        check_application_access(conn, user, row)
        conn.execute("UPDATE applications SET unread = 0 WHERE id = ?", (application_id,))
        return {"application": application_json(get_application(conn, application_id), conn)}


@app.patch("/api/applications/{application_id}/review")
def review(application_id: str, body: dict = Body(default_factory=dict),
           user=Depends(require_role("faculty"))):
    status, remark = clean(body.get("status")), clean(body.get("remark"))
    if status not in ("approved", "rejected"):
        raise ApiError(400, "Status must be approved or rejected.")
    if status == "rejected" and len(remark) < 3:
        raise ApiError(400, "Add a remark so the student knows why it was rejected.")

    with get_db() as conn:
        row = get_application(conn, application_id)
        check_application_access(conn, user, row)
        if row["status"] != "pending":
            raise ApiError(409, f"This application was already {row['status']}.")
        conn.execute(
            """UPDATE applications SET status = ?, remark = ?, unread = 0, reviewed_at = ?,
                   reviewed_by = ? WHERE id = ?""",
            (status, remark, now_iso(), user["name"], application_id),
        )
        return {"application": application_json(get_application(conn, application_id), conn)}


@app.get("/api/applications/{application_id}/documents/{document_id}")
def get_document(application_id: str, document_id: str, user=Depends(current_user)):
    with get_db() as conn:
        row = get_application(conn, application_id)
        check_application_access(conn, user, row)
        doc = conn.execute(
            "SELECT * FROM documents WHERE id = ? AND application_id = ?", (document_id, application_id)
        ).fetchone()
    if doc is None:
        raise ApiError(404, "Document not found.")
    path = UPLOAD_DIR / doc["stored_name"]
    if not path.exists():
        raise ApiError(404, "The document file is missing.")
    return FileResponse(path, media_type=doc["mime_type"])


# =========================================
# ATTENDANCE
# =========================================


@app.get("/api/attendance")
def my_attendance(user=Depends(require_role("student"))):
    if not engine.is_ready(user["class_id"]):
        return {"ready": False, "rows": [], "threshold": THRESHOLD}
    with get_db() as conn:
        rows = circular_rows(conn, user)
    return {"ready": True, "rows": rows, "threshold": THRESHOLD}


@app.get("/api/attendance/class/{class_id}")
def class_attendance(class_id: str, user=Depends(require_role("faculty"))):
    with get_db() as conn:
        if not faculty_can_see(conn, user, class_id):
            raise ApiError(403, "You don't coordinate this class.")
        if not engine.is_ready(class_id):
            return {"ready": False, "courses": [], "students": [], "threshold": THRESHOLD}

        students = conn.execute(
            "SELECT * FROM users WHERE role = 'student' AND class_id = ? ORDER BY roll_no, name",
            (class_id,),
        ).fetchall()
        result = [{"student": {"id": s["id"], **student_info(s)}, "rows": circular_rows(conn, s)}
                  for s in students]
    return {"ready": True, "courses": engine.courses_for(class_id), "students": result,
            "threshold": THRESHOLD}


@app.post("/api/reports/passwords/{class_id}")
def issue_passwords(class_id: str, user=Depends(require_role("faculty"))):
    """
    Creates new starting passwords for every student in the class who hasn't set their own
    password yet, and returns them as an Excel file. The passwords are saved and the file is
    built in the same request, so the file always matches the database.
    Students who already logged in and changed their password are not touched.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font

    with get_db() as conn:
        if not faculty_can_see(conn, user, class_id):
            raise ApiError(403, "You don't coordinate this class.")
        students = conn.execute(
            """SELECT * FROM users WHERE role = 'student' AND class_id = ?
               ORDER BY roll_no, name""",
            (class_id,),
        ).fetchall()
        if not students:
            raise ApiError(404, "No students in this class. Run import_data.py first.")

        issued, active = [], 0
        for s in students:
            if not s["must_change_password"]:
                active += 1  # already has their own password
                continue
            password = generate_password()
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                         (hash_password(password), s["id"]))
            issued.append((s["roll_no"], s["prn"], s["name"], password))

    stamp = datetime.now()
    wb = Workbook()
    ws = wb.active
    ws.title = class_id
    ws.append([f"Starting passwords: {class_id}, created {stamp.strftime('%d-%m-%Y %H:%M')} by {user['name']}."])
    ws.append(["Only this file is valid. Any earlier file for these students no longer works. "
               "Give each student only their own row. Keep private."])
    ws.append(["Roll No.", "PRN (login ID)", "Name", "Starting password"])
    for row in issued:
        ws.append(list(row))
    if active:
        ws.append([])
        ws.append([f"{active} student(s) already set their own password and are not listed. "
                   "Use Reset in Class attendance if one of them forgets it."])
    for row in ws.iter_rows():
        for cell in row:
            cell.font = Font(name="Arial", bold=cell.row <= 3)
    for col, width in zip("ABCD", (9, 18, 36, 18)):
        ws.column_dimensions[col].width = width

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    filename = f"starting_passwords_{class_id}_{stamp.strftime('%Y%m%d-%H%M%S')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"',
                 "X-Issued-Count": str(len(issued))},
    )


@app.get("/api/reports/summary/{class_id}")
def summary_report(class_id: str, user=Depends(require_role("faculty"))):
    """Circular point 8: the coordinator's summary with all evidence, as an Excel file."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    with get_db() as conn:
        if not faculty_can_see(conn, user, class_id):
            raise ApiError(403, "You don't coordinate this class.")
        engine.courses_for(class_id)  # clear error if the class has no time table yet
        label = class_label(conn, class_id)
        students = conn.execute(
            "SELECT * FROM users WHERE role = 'student' AND class_id = ? ORDER BY roll_no, name",
            (class_id,),
        ).fetchall()
        summary = [(s, r) for s in students for r in circular_rows(conn, s)
                   if r["approvedMissed"] and r["total"]]
        apps = conn.execute(
            "SELECT * FROM applications WHERE class_id = ? ORDER BY submitted_at", (class_id,)
        ).fetchall()
        app_rows = [
            (a, conn.execute("SELECT * FROM users WHERE id = ?", (a["student_id"],)).fetchone(),
             documents_for(conn, a["id"]))
            for a in apps
        ]

    bold, normal = Font(name="Arial", bold=True), Font(name="Arial")
    header_fill = PatternFill("solid", start_color="DCE6F1")

    def style_sheet(ws, widths):
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
        for row in ws.iter_rows():
            for cell in row:
                cell.font = bold if cell.row <= 3 else normal
                cell.alignment = Alignment(vertical="top", wrap_text=cell.row > 2)
        for cell in ws[3]:
            cell.fill = header_fill
        ws.freeze_panes = "A4"

    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = f"Attendance summary for event participation: {label} ({class_id})"
    ws["A2"] = (f"Final attendance = (ERP attended + lectures missed during the event) / ERP total. "
                f"Approved event applications only. Generated "
                f"{datetime.now().strftime('%d-%m-%Y %H:%M')} by {user['name']}.")
    ws.append(["Sr. No.", "Roll No.", "PRN", "Student name", "Subject code", "Subject name",
               "ERP attended", "ERP total", "ERP attendance %", "Duration of absence",
               "Lectures missed", "Total attendance", "Final attendance %", "Status"])
    for i, (s, r) in enumerate(summary, start=1):
        n = ws.max_row + 1
        ws.append([
            i, s["roll_no"], s["prn"], s["name"], r["subjectCode"], r["subjectName"],
            r["attended"], r["total"], f"=G{n}/H{n}",
            "; ".join(f"{a} to {b}" for a, b in r["durations"]), r["credit"],
            f"=G{n}+K{n}", f"=L{n}/H{n}",
            f'=IF(M{n}>={THRESHOLD / 100},"75% or above","Below 75%")',
        ])
        ws[f"I{n}"].number_format = "0.00%"
        ws[f"M{n}"].number_format = "0.00%"
    if not summary:
        ws.append(["No approved event applications for this class yet."])
    ws.append([])
    ws.append(["Note: lectures missed is capped at the sessions the student was actually absent for "
               "(ERP total minus ERP attended). Evidence for each row is on the next sheet."])
    style_sheet(ws, [7, 8, 16, 30, 16, 32, 11, 10, 12, 26, 11, 12, 13, 14])

    ws2 = wb.create_sheet("Applications and evidence")
    ws2["A1"] = f"All leave applications: {label} ({class_id})"
    ws2["A2"] = "Includes rejected and medical applications, kept on record as per the circular."
    ws2.append(["Submitted", "Roll No.", "PRN", "Student name", "Type", "Category", "Event",
                "From", "To", "Sessions", "Evidence type", "Documents", "Status",
                "Reviewed by", "Reviewed on", "Remark"])
    for a, s, docs in app_rows:
        lectures = json.loads(a["lectures"])
        ws2.append([
            a["submitted_at"][:10], s["roll_no"] if s else "", s["prn"] if s else "",
            s["name"] if s else "", "Medical (not counted)" if a["kind"] == "medical" else "Event",
            a["category"], a["event_name"], a["start_date"], a["end_date"],
            sum(l["sessions"] for l in lectures),
            EVIDENCE_TYPES.get(a["evidence_type"], "Medical certificate"),
            "\n".join(
                f"{'Pre-approval letter' if d['kind'] == 'approval_letter' else 'Evidence'}: {d['originalName']}"
                for d in docs),
            a["status"].capitalize(), a["reviewed_by"] or "", (a["reviewed_at"] or "")[:10], a["remark"],
        ])
    style_sheet(ws2, [12, 8, 16, 30, 18, 22, 28, 12, 12, 9, 30, 40, 11, 20, 12, 30])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    filename = f"attendance_summary_{class_id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


if __name__ == "__main__":
    print(f"API running on http://localhost:{PORT}  (docs: http://localhost:{PORT}/docs)")
    uvicorn.run("main:app", host="127.0.0.1", port=PORT, reload=False)
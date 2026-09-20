# Backend (Python + FastAPI)

## Setup (first time only)

```powershell
cd D:\Student-Attendance\server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```powershell
cd D:\Student-Attendance\server
venv\Scripts\activate
python main.py
```

The API runs on http://localhost:5000.
Interactive API docs (test every route in the browser): http://localhost:5000/docs

## Files

| File          | What it does                                                    |
| ------------- | --------------------------------------------------------------- |
| `main.py`     | All API routes: signup, login, leave applications, attendance   |
| `academic.py` | Subjects, time table, holidays. Edit these for real data         |
| `database.py` | SQLite database, created automatically at `data/attendance.db`  |

## Technology

- FastAPI + Uvicorn: web framework and server
- SQLite: database (built into Python, nothing to install)
- bcrypt: password hashing
- PyJWT: login tokens
- python-multipart: HOD letter uploads (saved in `data/uploads/`)

## Settings (environment variables)

| Variable              | Default                 | Purpose                             |
| --------------------- | ----------------------- | ----------------------------------- |
| `PORT`                | `5000`                  | API port                            |
| `JWT_SECRET`          | dev-only value          | Signs login tokens. **Set this.**   |
| `FACULTY_SIGNUP_CODE` | `CSE-FACULTY-2026`      | Code needed to register as faculty  |
| `CLIENT_URL`          | `http://localhost:5173` | Allowed frontend origin (CORS)      |

PowerShell example: `$env:JWT_SECRET="some-long-random-text"; python main.py`

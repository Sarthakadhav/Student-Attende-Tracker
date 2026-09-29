"""
Admin tools for student passwords. Run from the server folder with the venv active.

  python admin.py check <PRN> <password>   Tells you if the PRN exists and the password is right
  python admin.py reset <PRN>              Gives one student a new starting password
  python admin.py reset-class <CLASS>      New starting passwords for a whole class (e.g. SY-A),
                                           saved to data/credentials/ as a fresh Excel file

A reset student must change the password again at their next login.
The backend can keep running while you use these.
"""

import secrets
import sys
from datetime import datetime

import bcrypt
from openpyxl import Workbook
from openpyxl.styles import Font

from database import DATA_DIR, get_db, init_db

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"


def new_password() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(10))


def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def check(prn: str, password: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE UPPER(prn) = ?", (prn.strip().upper(),)).fetchone()
    if row is None:
        print(f"PRN {prn} is NOT in the database. Did import_data.py finish?")
        return
    print(f"Found: {row['name']} ({row['class_id']})")
    if bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
        print("Password is CORRECT.", "Student must change it at login." if row["must_change_password"] else "")
    else:
        print("Password is WRONG for the current database.")
        print("You're probably using an old credentials file. Use the newest file, or run:")
        print(f"  python admin.py reset {row['prn']}")


def reset(prn: str):
    password = new_password()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE UPPER(prn) = ?", (prn.strip().upper(),)).fetchone()
        if row is None:
            print(f"PRN {prn} is NOT in the database.")
            return
        conn.execute("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
                     (hash_pw(password), row["id"]))
    print(f"{row['name']} ({row['prn']}, {row['class_id']})")
    print(f"New starting password: {password}")


def reset_class(class_id: str):
    class_id = class_id.strip().upper()
    with get_db() as conn:
        students = conn.execute(
            "SELECT * FROM users WHERE role = 'student' AND UPPER(class_id) = ? ORDER BY roll_no, name",
            (class_id,),
        ).fetchall()
        if not students:
            print(f"No students found in class {class_id}. Classes are: FY, SY-A, SY-B, TY-A, TY-B, BTECH")
            return
        rows = []
        for i, s in enumerate(students, start=1):
            password = new_password()
            conn.execute("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
                         (hash_pw(password), s["id"]))
            rows.append((s["roll_no"], s["prn"], s["name"], password))
            if i % 25 == 0:
                print(f"  ...{i} of {len(students)}")

    out = DATA_DIR / "credentials"
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"credentials_{class_id}_{datetime.now().strftime('%Y%m%d-%H%M%S')}_RESET.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = class_id
    ws.append([f"Starting passwords: {class_id} (reset {datetime.now().strftime('%d-%m-%Y %H:%M')}). "
               "Older files for this class no longer work. Keep private."])
    ws.append(["Roll No.", "PRN (login ID)", "Name", "Starting password"])
    for r in rows:
        ws.append(list(r))
    for row in ws.iter_rows():
        for cell in row:
            cell.font = Font(name="Arial", bold=cell.row <= 2)
    for col, width in zip("ABCD", (9, 18, 36, 18)):
        ws.column_dimensions[col].width = width
    wb.save(path)
    print(f"\nDone. {len(rows)} students in {class_id} have new passwords.")
    print(f"Use ONLY this file now: {path}")


if __name__ == "__main__":
    init_db()
    args = sys.argv[1:]
    if len(args) == 3 and args[0] == "check":
        check(args[1], args[2])
    elif len(args) == 2 and args[0] == "reset":
        reset(args[1])
    elif len(args) == 2 and args[0] == "reset-class":
        reset_class(args[1])
    else:
        print(__doc__)

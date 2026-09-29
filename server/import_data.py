"""
Loads the department's classes and students into the database.

Usage (from the server folder, venv active):
    python import_data.py

  * Classes come from seed/classes.json.
  * Students come from seed/students.csv (made from the Excel list by seed/build_students.py).
  * Starting passwords are NOT created here. The class coordinator creates and downloads
    them in the app (Class attendance > Download starting passwords), so the file always
    matches the database.
  * Safe to run again: existing students are kept (name/class/roll no. are updated).
"""

import csv
import json
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from database import get_db, init_db

SEED = Path(__file__).parent / "seed"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"


def main():
    init_db()
    classes = json.loads((SEED / "classes.json").read_text(encoding="utf-8"))
    with (SEED / "students.csv").open(newline="", encoding="utf-8-sig") as f:
        students = list(csv.DictReader(f))

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    added = updated = 0

    with get_db() as conn:
        for c in classes:
            conn.execute(
                """INSERT INTO classes (id, label, year, division, coordinator) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (id) DO UPDATE SET label = excluded.label, year = excluded.year,
                       division = excluded.division, coordinator = excluded.coordinator""",
                (c["id"], c["label"], c["year"], c["division"], c.get("coordinator")),
            )
        class_ids = {c["id"] for c in classes}

        for i, s in enumerate(students, start=1):
            prn, name, class_id = s["prn"].strip().upper(), s["name"].strip(), s["class_id"].strip()
            roll = int(s["roll_no"]) if s["roll_no"].strip().isdigit() else None
            if class_id not in class_ids:
                print(f"  SKIPPED {prn}: unknown class {class_id}")
                continue

            existing = conn.execute("SELECT id FROM users WHERE prn = ?", (prn,)).fetchone()
            if existing:
                conn.execute("UPDATE users SET name = ?, class_id = ?, roll_no = ? WHERE id = ?",
                             (name, class_id, roll, existing["id"]))
                updated += 1
                continue

            # Placeholder nobody knows. The coordinator issues the real starting password in the app.
            password = "".join(secrets.choice(ALPHABET) for _ in range(16))
            conn.execute(
                """INSERT INTO users (id, role, name, password_hash, prn, roll_no, class_id,
                                      must_change_password, created_at)
                   VALUES (?, 'student', ?, ?, ?, ?, ?, 1, ?)""",
                (str(uuid.uuid4()), name,
                 bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode(),
                 prn, roll, class_id, now),
            )
            added += 1
            if i % 100 == 0:
                print(f"  ...{i} of {len(students)}")

    print(f"\nDone. {added} students added, {updated} already existed (updated).")
    print(f"{len(classes)} classes loaded.")
    print("\nStarting passwords are NOT created here. A coordinator creates them in the app:")
    print("  Faculty portal > Class attendance > Download starting passwords")


if __name__ == "__main__":
    main()
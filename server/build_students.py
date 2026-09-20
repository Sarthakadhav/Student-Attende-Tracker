"""
Rebuilds seed/students.csv from the department's Excel list.

Usage: put the Excel file in the seed folder as Student_List.xlsx, then from the server folder:
    python seed\\build_students.py
"""

import csv
import re
from collections import Counter
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
SRC = HERE / "Student_List.xlsx"
OUT = HERE / "students.csv"

# Excel sheet name -> class id in classes.json
SHEET_TO_CLASS = {"FY": "FY", "SY": "SY-A", "DSY": "SY-B", "TY-A": "TY-A", "TY-B": "TY-B", "FINAL YEAR": "BTECH"}

rows = []
for ws in openpyxl.load_workbook(SRC, read_only=True):
    cls = SHEET_TO_CLASS.get(ws.title.strip())
    if cls is None:
        print(f"Skipping sheet '{ws.title}': add it to SHEET_TO_CLASS")
        continue
    for r in ws.iter_rows(values_only=True):
        prn = str(r[1]).strip() if len(r) > 1 and r[1] else ""
        if not re.fullmatch(r"\d{4}UCE[FM]\d{4}", prn):
            continue  # skips titles and the header rows repeated on every printed page
        name = re.sub(r"\s+", " ", str(r[2] or "")).strip()
        roll = r[0] if isinstance(r[0], int) else ""
        rows.append({"class_id": cls, "roll_no": roll, "prn": prn, "name": name})

dupes = [p for p, n in Counter(r["prn"] for r in rows).items() if n > 1]
if dupes:
    print("WARNING: duplicate PRNs:", ", ".join(dupes))

with OUT.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["class_id", "roll_no", "prn", "name"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} students to {OUT}")
print(dict(Counter(r["class_id"] for r in rows)))

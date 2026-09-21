"""
Works out which lectures a student missed between two dates, and applies the
attendance formula from the Registrar's circular:

    Final attendance % = (ERP attended + lectures missed during the event) / ERP total x 100

Reads seed/classes.json, seed/calendars.json and seed/timetables/<class>.json.
"""

import json
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "seed"
DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

# ERP counting rule (confirmed by the department):
THEORY_SESSIONS_PER_SLOT = 1   # every theory period is 1 session (a 2-period theory block = 2)
LAB_SESSIONS_PER_BLOCK = 1     # a lab block is 1 session, however many periods it spans

MAX_LEAVE_DAYS = 31


class EngineError(Exception):
    """A problem the user can understand, e.g. a class without a time table."""


def _load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


@lru_cache
def classes() -> dict:
    return {c["id"]: c for c in _load("classes.json")}


@lru_cache
def calendars() -> dict:
    return _load("calendars.json")


@lru_cache
def timetable(class_id: str) -> dict:
    cls = classes().get(class_id)
    if cls is None:
        raise EngineError(f"Unknown class {class_id}.")
    if not cls.get("timetable"):
        raise EngineError(f"The time table for {class_id} hasn't been added yet. Contact your class coordinator.")
    return _load(f"timetables/{cls['timetable']}.json")


def calendar_for(class_id: str) -> dict:
    cls = classes().get(class_id)
    if cls is None or cls["calendar"] not in calendars():
        raise EngineError(f"The academic calendar for {class_id} hasn't been added yet. Contact your class coordinator.")
    return calendars()[cls["calendar"]]


def is_ready(class_id: str) -> bool:
    try:
        timetable(class_id)
        calendar_for(class_id)
        return True
    except EngineError:
        return False


def courses_for(class_id: str) -> list[dict]:
    """The courses ERP tracks attendance for (non-ERP slots like Library are left out)."""
    return [
        {"id": c["id"], "code": c["code"], "name": c["name"], "faculty": c.get("faculty", "")}
        for c in timetable(class_id)["courses"]
        if c["counted"]
    ]


def _dates(entry):
    if "date" in entry:
        return {entry["date"]}
    start, end = date.fromisoformat(entry["from"]), date.fromisoformat(entry["to"])
    return {(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)}


def day_status(day: date, calendar: dict):
    """Returns None if lectures run on this day, otherwise the reason they don't."""
    iso = day.isoformat()
    if iso < calendar["semesterStart"] or iso > calendar["semesterEnd"]:
        return "Outside the semester"
    for h in calendar["holidays"]:
        if iso in _dates(h):
            return h["name"]
    for n in calendar["noLectures"]:
        if iso in _dates(n):
            return n["name"]
    if day.weekday() == 6:
        return "Sunday"
    if day.weekday() == 5:
        nth = (day.day - 1) // 7 + 1
        sat = calendar["saturdays"]
        if nth in sat["offSaturdays"] and iso not in sat["workingSaturdays"]:
            return f"{'1st' if nth == 1 else '3rd'} Saturday holiday"
    return None


def missed_lectures(class_id: str, start: str, end: str) -> dict:
    tt = timetable(class_id)
    calendar = calendar_for(class_id)
    courses = {c["id"]: c for c in tt["courses"]}

    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if last < first:
        raise EngineError("End date can't be before the start date.")
    if (last - first).days + 1 > MAX_LEAVE_DAYS:
        raise EngineError(f"A single application can cover at most {MAX_LEAVE_DAYS} days.")
    if end < calendar["semesterStart"] or start > calendar["semesterEnd"]:
        raise EngineError(
            f"Dates must be within the semester ({calendar['semesterStart']} to {calendar['semesterEnd']})."
        )

    lectures, skipped = [], []
    day = first
    while day <= last:
        reason = day_status(day, calendar)
        if reason:
            skipped.append({"date": day.isoformat(), "reason": reason})
        else:
            for block in tt["blocks"]:
                if block["day"] != DAYS[day.weekday()]:
                    continue
                course = courses[block["course"]]
                if not course["counted"]:
                    continue
                sessions = (LAB_SESSIONS_PER_BLOCK if block["type"] == "LAB"
                            else THEORY_SESSIONS_PER_SLOT * len(block["slots"]))
                lectures.append({
                    "date": day.isoformat(),
                    "courseId": course["id"],
                    "subjectCode": course["code"],
                    "subjectName": course["name"],
                    "type": block["type"],
                    "sessions": sessions,
                    "start": tt["slotTimes"][str(block["slots"][0])][0],
                    "end": tt["slotTimes"][str(block["slots"][-1])][1],
                })
        day += timedelta(days=1)

    return {"lectures": lectures, "skipped": skipped}


def sessions_by_course(lectures: list[dict]) -> dict:
    totals: dict[str, int] = {}
    for lecture in lectures:
        totals[lecture["courseId"]] = totals.get(lecture["courseId"], 0) + lecture["sessions"]
    return totals


def final_attendance(erp_attended: int, erp_total: int, missed: int) -> dict:
    """The circular's step 6.a. Credit can't exceed the lectures the student actually missed."""
    credit = max(0, min(missed, erp_total - erp_attended))
    return {
        "credit": credit,
        "erpPercent": round(erp_attended / erp_total * 100, 2),
        "finalPercent": round((erp_attended + credit) / erp_total * 100, 2),
    }


def _range_end(entry) -> str:
    return entry.get("to") or entry["date"]


def phases_for(class_id: str) -> list[dict]:
    """
    Splits the semester at the CIA exams, so event attendance can be reported
    "till CIA-1", "CIA-1 to CIA-2" and (if lectures continue) "after CIA-2".
    """
    cal = calendar_for(class_id)
    cia = {n["name"]: _range_end(n) for n in cal["noLectures"] if n["name"] in ("CIA-1", "CIA-2")}
    start, end = cal["semesterStart"], cal["semesterEnd"]
    phases = []
    cursor = start
    if "CIA-1" in cia:
        phases.append({"key": "P1", "label": "Till CIA-1", "start": cursor, "end": cia["CIA-1"]})
        cursor = (date.fromisoformat(cia["CIA-1"]) + timedelta(days=1)).isoformat()
    if "CIA-2" in cia and cia["CIA-2"] <= end:
        phases.append({"key": "P2", "label": "CIA-1 to CIA-2", "start": cursor, "end": cia["CIA-2"]})
        cursor = (date.fromisoformat(cia["CIA-2"]) + timedelta(days=1)).isoformat()
        if cursor <= end:
            phases.append({"key": "P3", "label": "After CIA-2", "start": cursor, "end": end})
    else:
        # CIA-2 after the last teaching day (e.g. DSY) still reads as "CIA-1 to CIA-2"
        label = ("CIA-1 to CIA-2" if "CIA-2" in cia else "After CIA-1") if "CIA-1" in cia else "Whole semester"
        phases.append({"key": f"P{len(phases) + 1}", "label": label, "start": cursor, "end": end})
    return phases


def phase_key(phases: list[dict], iso_date: str) -> str | None:
    for p in phases:
        if p["start"] <= iso_date <= p["end"]:
            return p["key"]
    return None

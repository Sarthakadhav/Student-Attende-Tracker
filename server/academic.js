// Academic data for the CSE department.
// These are the "Requirements" from the workflow: subjects, time table and academic calendar.
// Replace the demo values below with the department's real time table and calendar.

export const SEMESTER = {
  name: "2026–27 Odd Semester",
  start: "2026-07-01",
  end: "2026-11-30",
};

export const SUBJECTS = [
  { code: "DS", name: "Data Structures" },
  { code: "DBMS", name: "Database Management Systems" },
  { code: "OS", name: "Operating Systems" },
  { code: "CN", name: "Computer Networks" },
  { code: "DM", name: "Discrete Mathematics" },
];

const SLOTS = [
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "12:45", end: "13:45" },
  { start: "13:45", end: "14:45" },
];

// day: 1 = Monday ... 5 = Friday. Same time table used for every division in this demo.
const WEEK = {
  1: ["DS", "DBMS", "OS", "DM"],
  2: ["CN", "DS", "DBMS", "OS"],
  3: ["DM", "CN", "DS", "DBMS"],
  4: ["OS", "DM", "CN", "DS"],
  5: ["DBMS", "OS", "DM", "CN"],
};

export const HOLIDAYS = [
  { date: "2026-08-15", name: "Independence Day" },
  { date: "2026-09-14", name: "Ganesh Chaturthi" },
  { date: "2026-10-02", name: "Gandhi Jayanti" },
  { date: "2026-10-20", name: "Dussehra" },
];

// Lectures conducted so far in the semester (demo numbers).
export const CONDUCTED = { DS: 42, DBMS: 40, OS: 41, CN: 38, DM: 39 };

export const MAX_LEAVE_DAYS = 15;

const subjectName = (code) =>
  SUBJECTS.find((s) => s.code === code)?.name ?? code;

export function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function toUtc(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function daySpan(startIso, endIso) {
  return Math.round((toUtc(endIso) - toUtc(startIso)) / 86_400_000) + 1;
}

/**
 * Every lecture from the time table that falls between two dates (inclusive),
 * skipping weekends and holidays from the academic calendar.
 */
export function lecturesBetween(startIso, endIso) {
  const lectures = [];
  const skipped = [];

  const cursor = toUtc(startIso);
  const last = toUtc(endIso);

  while (cursor <= last) {
    const iso = toIso(cursor);
    const weekday = cursor.getUTCDay(); // 0 = Sunday
    const holiday = HOLIDAYS.find((h) => h.date === iso);

    if (holiday) {
      skipped.push({ date: iso, reason: holiday.name });
    } else if (weekday === 0 || weekday === 6) {
      skipped.push({ date: iso, reason: weekday === 0 ? "Sunday" : "Saturday" });
    } else {
      WEEK[weekday].forEach((code, i) => {
        lectures.push({
          date: iso,
          subjectCode: code,
          subjectName: subjectName(code),
          start: SLOTS[i].start,
          end: SLOTS[i].end,
        });
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { lectures, skipped };
}

/**
 * Demo attendance register for a newly registered student.
 * Replace with real attendance data once the department's records are connected.
 */
export function seedRegister(prn) {
  let seed = [...prn].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const register = {};

  for (const { code } of SUBJECTS) {
    seed = (seed * 31 + 7) % 997;
    const absent = 6 + (seed % 9); // 6–14 lectures missed
    register[code] = {
      conducted: CONDUCTED[code],
      attended: CONDUCTED[code] - absent,
    };
  }

  return register;
}

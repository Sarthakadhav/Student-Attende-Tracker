import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";

import {
  MAX_LEAVE_DAYS,
  SEMESTER,
  SUBJECTS,
  daySpan,
  isValidIsoDate,
  lecturesBetween,
  seedRegister,
} from "./academic.js";
import { UPLOAD_DIR, readDb, writeDb } from "./db.js";

/* =========================================
   CONFIG
========================================= */

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";
const FACULTY_SIGNUP_CODE =
  process.env.FACULTY_SIGNUP_CODE || "CSE-FACULTY-2026";

if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠  JWT_SECRET is not set. Using a development secret. Set it before deploying."
  );
}

const YEARS = ["FY", "SY", "TY", "BTech"];
const DIVISIONS = ["A", "B", "C"];
const CATEGORIES = [
  "Competition / Hackathon",
  "Sports",
  "Technical or academic event",
  "Cultural event",
  "NSS / NCC",
  "Other college duty",
];
const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRN_RE = /^[A-Za-z0-9]{6,20}$/;

/* =========================================
   APP
========================================= */

const app = express();

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: "100kb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, "Upload a PDF, JPG or PNG file."));
    }
  },
});

/* =========================================
   HELPERS
========================================= */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const clean = (value) => (typeof value === "string" ? value.trim() : "");

function publicUser(user) {
  const { passwordHash: _hidden, ...rest } = user;
  return rest;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new HttpError(401, "Please log in to continue."));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = readDb().users.find((u) => u.id === payload.sub);

    if (!user) {
      return next(new HttpError(401, "This account no longer exists."));
    }

    req.user = user;
    next();
  } catch {
    next(new HttpError(401, "Your session has expired. Please log in again."));
  }
}

const requireRole = (role) => (req, _res, next) => {
  if (req.user.role !== role) {
    return next(new HttpError(403, "You don't have access to this."));
  }
  next();
};

function studentInfo(user) {
  return user
    ? {
        name: user.name,
        prn: user.prn,
        year: user.year,
        division: user.division,
      }
    : { name: "Deleted student", prn: "-", year: "-", division: "-" };
}

function withStudent(application, users) {
  return {
    ...application,
    document: {
      originalName: application.document.originalName,
      mimeType: application.document.mimeType,
      size: application.document.size,
    },
    student: studentInfo(users.find((u) => u.id === application.studentId)),
  };
}

function validateDates(startDate, endDate) {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    throw new HttpError(400, "Choose a valid start and end date.");
  }
  if (endDate < startDate) {
    throw new HttpError(400, "End date can't be before the start date.");
  }
  if (startDate < SEMESTER.start || endDate > SEMESTER.end) {
    throw new HttpError(
      400,
      `Dates must be within the semester (${SEMESTER.start} to ${SEMESTER.end}).`
    );
  }
  if (daySpan(startDate, endDate) > MAX_LEAVE_DAYS) {
    throw new HttpError(
      400,
      `A single application can cover at most ${MAX_LEAVE_DAYS} days.`
    );
  }
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function attendanceFor(user, db) {
  const register = db.attendance[user.id] || seedRegister(user.prn || user.id);
  const mine = db.applications.filter((a) => a.studentId === user.id);

  const leaveCount = (status, code) =>
    mine
      .filter((a) => a.status === status)
      .flatMap((a) => a.lectures)
      .filter((l) => l.subjectCode === code).length;

  const subjects = SUBJECTS.map(({ code, name }) => {
    const { conducted, attended } = register[code];
    const absent = conducted - attended;
    // Duty leave can never give back more lectures than the student actually missed.
    const dutyLeave = Math.min(leaveCount("approved", code), absent);
    const pendingLeave = Math.min(
      leaveCount("pending", code),
      absent - dutyLeave
    );

    return {
      subjectCode: code,
      subjectName: name,
      conducted,
      attended,
      dutyLeave,
      pendingLeave,
      beforePercent: round1((attended / conducted) * 100),
      afterPercent: round1(((attended + dutyLeave) / conducted) * 100),
    };
  });

  const sum = (key) => subjects.reduce((total, s) => total + s[key], 0);
  const conducted = sum("conducted");
  const attended = sum("attended");
  const dutyLeave = sum("dutyLeave");

  return {
    student: { id: user.id, ...studentInfo(user) },
    subjects,
    total: {
      conducted,
      attended,
      dutyLeave,
      pendingLeave: sum("pendingLeave"),
      beforePercent: round1((attended / conducted) * 100),
      afterPercent: round1(((attended + dutyLeave) / conducted) * 100),
    },
  };
}

// Wrap async/sync route handlers so thrown errors reach the error handler.
const route = (fn) => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    if (result instanceof Promise) result.catch(next);
  } catch (err) {
    next(err);
  }
};

/* =========================================
   AUTH ROUTES
========================================= */

app.post(
  "/api/auth/signup",
  route(async (req, res) => {
    const role = clean(req.body.role);
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (role !== "student" && role !== "faculty") {
      throw new HttpError(400, "Choose whether you are a student or faculty.");
    }
    if (name.length < 2) {
      throw new HttpError(400, "Enter your full name.");
    }
    if (!EMAIL_RE.test(email)) {
      throw new HttpError(400, "Enter a valid email address.");
    }
    if (password.length < 8) {
      throw new HttpError(400, "Password must be at least 8 characters.");
    }

    const db = readDb();

    if (db.users.some((u) => u.email === email)) {
      throw new HttpError(409, "An account with this email already exists.");
    }

    const user = {
      id: crypto.randomUUID(),
      role,
      name,
      email,
      createdAt: new Date().toISOString(),
    };

    if (role === "student") {
      const prn = clean(req.body.prn).toUpperCase();
      const year = clean(req.body.year);
      const division = clean(req.body.division);

      if (!PRN_RE.test(prn)) {
        throw new HttpError(400, "PRN must be 6–20 letters or numbers.");
      }
      if (db.users.some((u) => u.prn === prn)) {
        throw new HttpError(409, "An account with this PRN already exists.");
      }
      if (!YEARS.includes(year)) {
        throw new HttpError(400, "Choose your year.");
      }
      if (!DIVISIONS.includes(division)) {
        throw new HttpError(400, "Choose your division.");
      }

      Object.assign(user, { prn, year, division });
    } else {
      // Stops students from creating faculty accounts and approving their own leave.
      if (clean(req.body.facultyCode) !== FACULTY_SIGNUP_CODE) {
        throw new HttpError(
          403,
          "The faculty access code is incorrect. Ask the department admin for it."
        );
      }
      user.designation = clean(req.body.designation) || "Faculty";
    }

    user.passwordHash = await bcrypt.hash(password, 10);

    db.users.push(user);
    if (role === "student") {
      db.attendance[user.id] = seedRegister(user.prn);
    }
    writeDb(db);

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

app.post(
  "/api/auth/login",
  route(async (req, res) => {
    const identifier = clean(req.body.identifier).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!identifier || !password) {
      throw new HttpError(400, "Enter your email or PRN and your password.");
    }

    const user = readDb().users.find(
      (u) =>
        u.email === identifier ||
        (u.prn && u.prn.toLowerCase() === identifier)
    );

    // Same message either way, so nobody can find out which accounts exist.
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      throw new HttpError(401, "Incorrect email/PRN or password.");
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* =========================================
   LEAVE APPLICATION ROUTES
========================================= */

app.post(
  "/api/applications/preview",
  requireAuth,
  requireRole("student"),
  route((req, res) => {
    const { startDate, endDate } = req.body;
    validateDates(startDate, endDate);
    res.json(lecturesBetween(startDate, endDate));
  })
);

app.post(
  "/api/applications",
  requireAuth,
  requireRole("student"),
  upload.single("document"),
  route((req, res) => {
    const removeUpload = () => {
      if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    };

    try {
      const category = clean(req.body.category);
      const eventName = clean(req.body.eventName);
      const description = clean(req.body.description);
      const { startDate, endDate } = req.body;

      if (!CATEGORIES.includes(category)) {
        throw new HttpError(400, "Choose a leave category.");
      }
      if (eventName.length < 3) {
        throw new HttpError(400, "Enter the name of the event.");
      }
      if (description.length > 500) {
        throw new HttpError(400, "Keep the description under 500 characters.");
      }
      validateDates(startDate, endDate);
      if (!req.file) {
        throw new HttpError(400, "Upload the HOD-signed letter.");
      }

      const db = readDb();

      const overlapping = db.applications.find(
        (a) =>
          a.studentId === req.user.id &&
          a.status !== "rejected" &&
          a.startDate <= endDate &&
          a.endDate >= startDate
      );
      if (overlapping) {
        throw new HttpError(
          409,
          `You already applied for ${overlapping.startDate} to ${overlapping.endDate}. Dates can't overlap.`
        );
      }

      const { lectures } = lecturesBetween(startDate, endDate);
      if (lectures.length === 0) {
        throw new HttpError(
          400,
          "No lectures fall on these dates, so there's no attendance to add."
        );
      }

      const application = {
        id: crypto.randomUUID(),
        studentId: req.user.id,
        category,
        eventName,
        description,
        startDate,
        endDate,
        lectures,
        status: "pending",
        unread: true,
        remark: "",
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
        document: {
          storedName: req.file.filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        },
      };

      db.applications.push(application);
      writeDb(db);

      res.status(201).json({ application: withStudent(application, db.users) });
    } catch (err) {
      removeUpload();
      throw err;
    }
  })
);

app.get("/api/applications", requireAuth, (req, res) => {
  const db = readDb();

  const list = db.applications
    .filter((a) => req.user.role === "faculty" || a.studentId === req.user.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((a) => withStudent(a, db.users));

  res.json({ applications: list });
});

app.patch(
  "/api/applications/:id/read",
  requireAuth,
  requireRole("faculty"),
  route((req, res) => {
    const db = readDb();
    const application = db.applications.find((a) => a.id === req.params.id);
    if (!application) throw new HttpError(404, "Application not found.");

    application.unread = false;
    writeDb(db);
    res.json({ application: withStudent(application, db.users) });
  })
);

app.patch(
  "/api/applications/:id/review",
  requireAuth,
  requireRole("faculty"),
  route((req, res) => {
    const status = clean(req.body.status);
    const remark = clean(req.body.remark);

    if (status !== "approved" && status !== "rejected") {
      throw new HttpError(400, "Status must be approved or rejected.");
    }
    if (status === "rejected" && remark.length < 3) {
      throw new HttpError(400, "Add a remark so the student knows why it was rejected.");
    }

    const db = readDb();
    const application = db.applications.find((a) => a.id === req.params.id);
    if (!application) throw new HttpError(404, "Application not found.");
    if (application.status !== "pending") {
      throw new HttpError(409, `This application was already ${application.status}.`);
    }

    Object.assign(application, {
      status,
      remark,
      unread: false,
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.user.name,
    });
    writeDb(db);

    res.json({ application: withStudent(application, db.users) });
  })
);

app.get(
  "/api/applications/:id/document",
  requireAuth,
  route((req, res) => {
    const application = readDb().applications.find((a) => a.id === req.params.id);
    if (!application) throw new HttpError(404, "Application not found.");

    const allowed =
      req.user.role === "faculty" || application.studentId === req.user.id;
    if (!allowed) throw new HttpError(403, "You don't have access to this document.");

    const filePath = path.join(UPLOAD_DIR, application.document.storedName);
    if (!fs.existsSync(filePath)) throw new HttpError(404, "The document file is missing.");

    res.type(application.document.mimeType);
    res.sendFile(filePath);
  })
);

/* =========================================
   ATTENDANCE ROUTES
========================================= */

app.get("/api/attendance", requireAuth, (req, res) => {
  const db = readDb();

  if (req.user.role === "student") {
    return res.json({ records: [attendanceFor(req.user, db)] });
  }

  const records = db.users
    .filter((u) => u.role === "student")
    .map((u) => attendanceFor(u, db))
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

  res.json({ records });
});

app.get("/api/academic", requireAuth, (_req, res) => {
  res.json({ semester: SEMESTER, subjects: SUBJECTS, categories: CATEGORIES });
});

/* =========================================
   ERRORS
========================================= */

app.use("/api", (_req, _res, next) => next(new HttpError(404, "API route not found.")));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File must be smaller than 5 MB."
        : "The file couldn't be uploaded.";
    return res.status(400).json({ error: message });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON." });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err);

  res.status(status).json({
    error: status === 500 ? "Something went wrong on the server." : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`✓ API running on http://localhost:${PORT}`);
});

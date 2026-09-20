export type Role = "student" | "faculty";

export type User = {
  id: string;
  role: Role;
  name: string;
  email?: string;
  createdAt: string;
  mustChangePassword: boolean;
  // Students
  prn?: string;
  rollNo?: number;
  classId?: string;
  classLabel?: string;
  // Faculty
  designation?: string;
  classes?: string[]; // empty = all classes (HoD)
};

export type ClassInfo = {
  id: string;
  label: string;
  ready: boolean;
};

export type Course = {
  id: string;
  code: string;
  name: string;
  faculty: string;
};

export type ErpCourse = {
  courseId: string;
  code: string;
  name: string;
  faculty: string;
  attended: number | null;
  total: number | null;
  updatedAt: string | null;
};

export type Lecture = {
  date: string;
  courseId: string;
  subjectCode: string;
  subjectName: string;
  type: "TH" | "LAB";
  sessions: number;
  start: string;
  end: string;
};

export type SkippedDay = {
  date: string;
  reason: string;
};

/** One row of the circular's table (step 6.a). */
export type CircularRow = {
  courseId: string;
  subjectCode: string;
  subjectName: string;
  attended: number | null;
  total: number | null;
  durations: [string, string][];
  approvedMissed: number;
  pendingMissed: number;
  thisMissed: number;
  credit: number | null;
  erpPercent: number | null;
  finalPercent: number | null;
  applicationSessions?: number;
};

export type ApplicationStatus = "pending" | "approved" | "rejected";
export type ApplicationKind = "event" | "medical";
export type EvidenceType = "certificate" | "authority_permission" | "medical_certificate";

export type AppDocument = {
  id: string;
  kind: "approval_letter" | "evidence";
  originalName: string;
  mimeType: string;
  size: number;
};

export type StudentInfo = {
  name: string;
  prn: string;
  rollNo?: number;
  classId: string;
};

export type LeaveApplication = {
  id: string;
  studentId: string;
  student: StudentInfo;
  classId: string;
  kind: ApplicationKind;
  category: string;
  eventName: string;
  description: string;
  startDate: string;
  endDate: string;
  lectures: Lecture[];
  sessions: number;
  evidenceType: EvidenceType;
  status: ApplicationStatus;
  unread: boolean;
  remark: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy?: string;
  documents: AppDocument[];
};

export type Academic = {
  categories: string[];
  evidenceTypes: Record<"certificate" | "authority_permission", string>;
  threshold: number;
  classId?: string;
  ready?: boolean;
  courses?: Course[];
  semester?: { start: string; end: string };
};

export type ClassAttendance = {
  ready: boolean;
  courses: Course[];
  students: { student: StudentInfo & { id: string }; rows: CircularRow[] }[];
  threshold: number;
};

export type AuthResponse = {
  token: string;
  user: User;
};
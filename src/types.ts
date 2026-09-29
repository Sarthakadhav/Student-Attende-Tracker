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

export type Notification = {
  id: string;
  title: string;
  body: string;
  kind: "new_application" | "reviewed" | "reminder";
  applicationId: string | null;
  createdAt: string;
  readAt: string | null;
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
  studentUnread: boolean;
  certificatePending: boolean;
  reminderSentAt: string | null;
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

export type Phase = {
  key: string;
  label: string;
  start: string;
  end: string;
};

/** Sessions per subject for one application, split by CIA phase. */
export type SubjectSummary = {
  courseId: string;
  subjectCode: string;
  subjectName: string;
  sessions: number;
  byPhase: Record<string, number>;
};

export type StudentListItem = StudentInfo & { id: string; activated: boolean };

export type ErpImport = {
  id: string;
  label: string;
  asOf: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  students: number;
  division?: string;
  periodFrom?: string | null;
  periodTo?: string | null;
};

export type EventReport = {
  courses: Course[];
  phases: Phase[];
  students: {
    student: StudentInfo & { id: string };
    perCourse: Record<string, Record<string, number>>;
    byPhase: Record<string, number>;
    total: number;
    approvedApplications: number;
    pendingApplications: number;
    /** ERP attended/total per subject from the newest ERP upload (empty if none). */
    erp: Record<string, { attended: number; total: number }>;
  }[];
  erpImport: ErpImport | null;
};

export type FinalSubject = {
  courseId: string;
  subjectCode: string;
  subjectName: string;
  attended: number;
  total: number;
  erpPercent: number;
  eventSessions: number;
  credit: number;
  finalPercent: number;
  /** Per ERP slot (Lab / Lecture): conducted, present, event lectures and granted. */
  slots?: Record<string, { conducted: number; present: number; eventSessions: number; granted: number }>;
};

export type FinalStatus = "detained" | "subject" | "clear" | "missing";

export type FinalReport = {
  import: ErpImport;
  imports: ErpImport[];
  courses: Course[];
  threshold: number;
  counts: Record<"detained" | "subject" | "clear" | "missing", number>;
  students: {
    student: StudentInfo & { id: string };
    subjects: FinalSubject[];
    erpPercent: number | null;
    finalPercent: number | null;
    credit: number;
    below: string[];
    erpBelow: string[];
    status: string;
    statusKey: FinalStatus;
    savedByEvents?: boolean;
  }[];
};

export type AuthResponse = {
  token: string;
  user: User;
};

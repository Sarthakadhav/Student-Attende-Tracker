export type Role = "student" | "faculty";

export type User = {
  id: string;
  role: Role;
  name: string;
  email: string;
  createdAt: string;
  // Students only
  prn?: string;
  year?: string;
  division?: string;
  // Faculty only
  designation?: string;
};

export type Lecture = {
  date: string; // YYYY-MM-DD
  subjectCode: string;
  subjectName: string;
  start: string; // HH:mm
  end: string;
};

export type SkippedDay = {
  date: string;
  reason: string;
};

export type ApplicationStatus = "pending" | "approved" | "rejected";

export type StudentInfo = {
  name: string;
  prn?: string;
  year?: string;
  division?: string;
};

export type LeaveApplication = {
  id: string;
  studentId: string;
  student: StudentInfo;
  category: string;
  eventName: string;
  description: string;
  startDate: string;
  endDate: string;
  lectures: Lecture[];
  status: ApplicationStatus;
  unread: boolean;
  remark: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy?: string;
  document: {
    originalName: string;
    mimeType: string;
    size: number;
  };
};

export type AttendanceNumbers = {
  conducted: number;
  attended: number;
  dutyLeave: number;
  pendingLeave: number;
  beforePercent: number;
  afterPercent: number;
};

export type SubjectAttendance = AttendanceNumbers & {
  subjectCode: string;
  subjectName: string;
};

export type AttendanceRecord = {
  student: StudentInfo & { id: string };
  subjects: SubjectAttendance[];
  total: AttendanceNumbers;
};

export type AuthResponse = {
  token: string;
  user: User;
};

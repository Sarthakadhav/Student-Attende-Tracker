import type {
  AttendanceRecord,
  AuthResponse,
  LeaveApplication,
  Lecture,
  SkippedDay,
  User,
} from "./types";

const TOKEN_KEY = "attendance_portal_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body; // browser sets the multipart boundary itself
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, { method: options.method ?? "GET", headers, body });
  } catch {
    throw new ApiError(0, "Can't reach the server. Make sure the backend is running.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (data as { error?: string }).error;
    throw new ApiError(
      response.status,
      message ??
        (response.status >= 500
          ? "The server isn't responding. Make sure the backend is running."
          : "Something went wrong.")
    );
  }

  return data as T;
}

export type SignupPayload = {
  role: "student" | "faculty";
  name: string;
  email: string;
  password: string;
  prn?: string;
  year?: string;
  division?: string;
  designation?: string;
  facultyCode?: string;
};

export const api = {
  signup: (payload: SignupPayload) =>
    request<AuthResponse>("/api/auth/signup", { method: "POST", body: payload }),

  login: (identifier: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { identifier, password },
    }),

  me: () => request<{ user: User }>("/api/auth/me"),

  previewLectures: (startDate: string, endDate: string) =>
    request<{ lectures: Lecture[]; skipped: SkippedDay[] }>(
      "/api/applications/preview",
      { method: "POST", body: { startDate, endDate } }
    ),

  submitApplication: (form: FormData) =>
    request<{ application: LeaveApplication }>("/api/applications", {
      method: "POST",
      body: form,
    }),

  applications: () =>
    request<{ applications: LeaveApplication[] }>("/api/applications"),

  markRead: (id: string) =>
    request<{ application: LeaveApplication }>(`/api/applications/${id}/read`, {
      method: "PATCH",
    }),

  review: (id: string, status: "approved" | "rejected", remark: string) =>
    request<{ application: LeaveApplication }>(`/api/applications/${id}/review`, {
      method: "PATCH",
      body: { status, remark },
    }),

  attendance: () => request<{ records: AttendanceRecord[] }>("/api/attendance"),

  academic: () =>
    request<{ categories: string[] }>("/api/academic"),

  /** Opens the uploaded letter in a new tab (the request needs the login token). */
  openDocument: async (id: string) => {
    const tab = window.open("", "_blank");
    const token = tokenStore.get();
    const response = await fetch(`/api/applications/${id}/document`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      tab?.close();
      const data = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        (data as { error?: string }).error ?? "Couldn't open the document."
      );
    }

    const url = URL.createObjectURL(await response.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

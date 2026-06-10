export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: string[];
  customRoleName?: string | null;
  customRoleColor?: string | null;
  photo?: string | null;
  employee?: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    designation: string | null;
  } | null;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  workingHrs: number;
}

export interface AttendanceToday {
  employee: { id: string } | null;
  today: AttendanceRecord | null;
  recent: AttendanceRecord[];
}

export interface Leave {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  createdAt: string;
}

export interface Payslip {
  id: string;
  month: number;
  year: number;
  status: string;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  basicSalary: number;
  hra: number;
  da: number;
  workingDays: number;
  presentDays: number;
  paidAt: string | null;
}

export interface Expense {
  id: string;
  expenseNo?: string | null;
  title: string;
  category: string;
  amount: number;
  date: string;
  status: string;
  description?: string | null;
}

export interface EmployeeDoc {
  id: string;
  type: string;
  fileName: string;
  fileUrl: string;
  status: string;
  uploadedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  description: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  publishedAt: string;
}

export interface EmployeeProfile {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  designation: string | null;
  photo: string | null;
  dateOfJoining: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIFSC: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  [key: string]: unknown;
}

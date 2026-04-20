import type { UserRole } from "@/types/api";

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface CreateUserPayload {
  email: string;
  full_name: string;
  role: UserRole;
  password: string;
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  role?: UserRole;
}

export interface AuditLogEntry {
  log_id: string;
  timestamp: string;
  user_id: string;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string | null;
  status: "success" | "failure";
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditLogParams {
  page?: number;
  limit?: number;
  user_id?: string;
  action?: string;
  from?: string;
  to?: string;
}

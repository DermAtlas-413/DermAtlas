import type { AuditLogPage, AuditLogParams } from "@/types/admin";
import { apiFetch, USE_MOCK, delay } from "./http";

const MOCK_ENTRIES = [
  {
    log_id: "log-001",
    timestamp: "2026-03-31T09:22:10Z",
    user_id: "1",
    user_name: "Dr. Quach",
    action: "Login",
    resource_type: "Session",
    resource_id: "sess-8821",
    ip_address: "192.168.1.10",
    status: "success" as const,
  },
  {
    log_id: "log-002",
    timestamp: "2026-03-31T09:23:45Z",
    user_id: "1",
    user_name: "Dr. Quach",
    action: "Viewed Patient Record",
    resource_type: "Patient",
    resource_id: "P-00042",
    ip_address: "192.168.1.10",
    status: "success" as const,
  },
  {
    log_id: "log-003",
    timestamp: "2026-03-31T09:25:30Z",
    user_id: "1",
    user_name: "Dr. Quach",
    action: "Uploaded Clinical Image",
    resource_type: "Image",
    resource_id: "img-3301",
    ip_address: "192.168.1.10",
    status: "success" as const,
  },
  {
    log_id: "log-004",
    timestamp: "2026-03-31T09:26:15Z",
    user_id: "1",
    user_name: "Dr. Quach",
    action: "Ran Lesion Analysis",
    resource_type: "Image",
    resource_id: "img-3301",
    ip_address: "192.168.1.10",
    status: "success" as const,
  },
  {
    log_id: "log-005",
    timestamp: "2026-03-30T14:05:22Z",
    user_id: "2",
    user_name: "Dr. Patel",
    action: "Login",
    resource_type: "Session",
    resource_id: "sess-7743",
    ip_address: "10.0.0.44",
    status: "success" as const,
  },
  {
    log_id: "log-006",
    timestamp: "2026-03-30T14:07:11Z",
    user_id: "2",
    user_name: "Dr. Patel",
    action: "Viewed Patient Record",
    resource_type: "Patient",
    resource_id: "P-00018",
    ip_address: "10.0.0.44",
    status: "success" as const,
  },
  {
    log_id: "log-007",
    timestamp: "2026-03-30T14:09:55Z",
    user_id: "2",
    user_name: "Dr. Patel",
    action: "Submitted Feedback",
    resource_type: "Analysis",
    resource_id: "qry-5590",
    ip_address: "10.0.0.44",
    status: "success" as const,
  },
  {
    log_id: "log-008",
    timestamp: "2026-03-29T11:47:03Z",
    user_id: "3",
    user_name: "Dr. Chen",
    action: "Login",
    resource_type: "Session",
    resource_id: "sess-6612",
    ip_address: "172.16.5.22",
    status: "success" as const,
  },
  {
    log_id: "log-009",
    timestamp: "2026-03-29T11:50:40Z",
    user_id: "3",
    user_name: "Dr. Chen",
    action: "Uploaded Clinical Image",
    resource_type: "Image",
    resource_id: "img-3295",
    ip_address: "172.16.5.22",
    status: "failure" as const,
  },
  {
    log_id: "log-010",
    timestamp: "2026-03-29T11:51:30Z",
    user_id: "3",
    user_name: "Dr. Chen",
    action: "Uploaded Clinical Image",
    resource_type: "Image",
    resource_id: "img-3296",
    ip_address: "172.16.5.22",
    status: "success" as const,
  },
  {
    log_id: "log-011",
    timestamp: "2026-03-28T16:30:00Z",
    user_id: "4",
    user_name: "Alice Johnson",
    action: "Login",
    resource_type: "Session",
    resource_id: "sess-5500",
    ip_address: "203.0.113.5",
    status: "success" as const,
  },
  {
    log_id: "log-012",
    timestamp: "2026-03-26T08:14:00Z",
    user_id: "1",
    user_name: "Dr. Quach",
    action: "Created User Account",
    resource_type: "User",
    resource_id: "usr-0005",
    ip_address: "192.168.1.10",
    status: "success" as const,
  },
  {
    log_id: "log-013",
    timestamp: "2026-03-25T13:00:00Z",
    user_id: "1",
    user_name: "Dr. Quach",
    action: "Deactivated User Account",
    resource_type: "User",
    resource_id: "usr-0005",
    ip_address: "192.168.1.10",
    status: "success" as const,
  },
  {
    log_id: "log-014",
    timestamp: "2026-03-24T09:30:00Z",
    user_id: "2",
    user_name: "Dr. Patel",
    action: "Login",
    resource_type: "Session",
    resource_id: "sess-4499",
    ip_address: "10.0.0.44",
    status: "failure" as const,
  },
  {
    log_id: "log-015",
    timestamp: "2026-03-24T09:31:00Z",
    user_id: "2",
    user_name: "Dr. Patel",
    action: "Login",
    resource_type: "Session",
    resource_id: "sess-4500",
    ip_address: "10.0.0.44",
    status: "success" as const,
  },
];

function withinDateRange(timestamp: string, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const t = new Date(timestamp).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
}

export async function getAuditLogs(params: AuditLogParams = {}): Promise<AuditLogPage> {
  const { page = 1, limit = 20, user_id, action, from, to } = params;

  if (USE_MOCK) {
    await delay(500);
    let filtered = MOCK_ENTRIES.filter((e) => {
      if (user_id && e.user_id !== user_id) return false;
      if (action && !e.action.toLowerCase().includes(action.toLowerCase())) return false;
      if (!withinDateRange(e.timestamp, from, to)) return false;
      return true;
    });
    const total = filtered.length;
    const start = (page - 1) * limit;
    const entries = filtered.slice(start, start + limit);
    return { entries, total, page, page_size: limit };
  }

  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("limit", String(limit));
  if (user_id) qs.set("user_id", user_id);
  if (action) qs.set("action", action);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return apiFetch<AuditLogPage>(`/audit-logs?${qs.toString()}`);
}

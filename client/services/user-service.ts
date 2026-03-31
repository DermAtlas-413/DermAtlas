import type { AdminUser, CreateUserPayload, UpdateUserPayload } from "@/types/admin";
import { apiFetch, USE_MOCK, delay } from "./http";

const MOCK_USERS: AdminUser[] = [
  {
    user_id: "1",
    email: "dr.quach@hospital.com",
    full_name: "Dr. Quach",
    role: "PCP",
    is_active: true,
    created_at: "2025-01-15T08:00:00Z",
    last_login: "2026-03-31T09:22:00Z",
  },
  {
    user_id: "2",
    email: "dr.patel@hospital.com",
    full_name: "Dr. Patel",
    role: "PCP",
    is_active: true,
    created_at: "2025-02-03T10:30:00Z",
    last_login: "2026-03-30T14:05:00Z",
  },
  {
    user_id: "3",
    email: "dr.chen@hospital.com",
    full_name: "Dr. Chen",
    role: "PCP",
    is_active: true,
    created_at: "2025-03-20T09:15:00Z",
    last_login: "2026-03-29T11:47:00Z",
  },
  {
    user_id: "4",
    email: "patient.johnson@example.com",
    full_name: "Alice Johnson",
    role: "PATIENT",
    is_active: true,
    created_at: "2025-06-10T13:00:00Z",
    last_login: "2026-03-28T16:30:00Z",
  },
  {
    user_id: "5",
    email: "dr.kim@hospital.com",
    full_name: "Dr. Kim",
    role: "PCP",
    is_active: false,
    created_at: "2024-11-01T08:00:00Z",
    last_login: "2026-01-15T10:00:00Z",
  },
];

let mockUsersStore: AdminUser[] = [...MOCK_USERS];

export async function getUsers(): Promise<AdminUser[]> {
  if (USE_MOCK) {
    await delay(400);
    return [...mockUsersStore];
  }
  return apiFetch<AdminUser[]>("/users");
}

export async function createUser(data: CreateUserPayload): Promise<AdminUser> {
  if (USE_MOCK) {
    await delay(400);
    const newUser: AdminUser = {
      user_id: String(Date.now()),
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      is_active: true,
      created_at: new Date().toISOString(),
      last_login: null,
    };
    mockUsersStore = [...mockUsersStore, newUser];
    return newUser;
  }
  return apiFetch<AdminUser>("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  userId: string,
  data: UpdateUserPayload
): Promise<AdminUser> {
  if (USE_MOCK) {
    await delay(400);
    mockUsersStore = mockUsersStore.map((u) =>
      u.user_id === userId ? { ...u, ...data } : u
    );
    const updated = mockUsersStore.find((u) => u.user_id === userId);
    if (!updated) throw new Error("User not found");
    return updated;
  }
  return apiFetch<AdminUser>(`/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deactivateUser(userId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(400);
    mockUsersStore = mockUsersStore.map((u) =>
      u.user_id === userId ? { ...u, is_active: false } : u
    );
    return;
  }
  await apiFetch<void>(`/users/${userId}`, { method: "DELETE" });
}

import type { TokenResponse, UserInfo, UserRole } from "@/types/api";
import { useAuthStore } from "@/state/auth-store";
import { apiFetch, USE_MOCK, delay } from "./http";

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: UserInfo }> {
  if (USE_MOCK) {
    await delay(500);
    const mockRole: UserRole = email.toLowerCase().includes("patient")
      ? "PATIENT"
      : "PCP";
    const mockUser: UserInfo = {
      userId: "1",
      email: email || "clinician@hospital.com",
      fullName: email ? `Dr. ${email.split("@")[0]}` : "Dr. Quach",
      role: mockRole,
    };
    const mockToken = "mock-token";
    useAuthStore.getState().setAuth(mockToken, mockUser);
    return { token: mockToken, user: mockUser };
  }

  const body = new URLSearchParams({ username: email, password });
  const tokenRes = await apiFetch<TokenResponse>("/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const payload = decodeJwtPayload(tokenRes.access_token);
  const user: UserInfo = {
    userId: String(payload.sub ?? email),
    email: String(payload.email ?? email),
    fullName: String(payload.full_name ?? email.split("@")[0]),
    role: ((payload.role as UserRole) ?? "PATIENT"),
  };

  useAuthStore.getState().setAuth(tokenRes.access_token, user);
  return { token: tokenRes.access_token, user };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (USE_MOCK) {
    await delay(600);
    if (currentPassword === "wrong") {
      throw new Error("Current password is incorrect.");
    }
    return;
  }
  await apiFetch<void>("/auth/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

import type {
  RegisterNetworkPayload,
  TokenResponse,
  UserInfo,
  UserRole,
} from "@/types/api";
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

function userFromToken(token: string, fallbackEmail: string): UserInfo {
  const payload = decodeJwtPayload(token);
  return {
    userId: String(payload.sub ?? fallbackEmail),
    email: String(payload.email ?? fallbackEmail),
    fullName: String(payload.full_name ?? fallbackEmail.split("@")[0]),
    role: ((payload.role as UserRole) ?? "PATIENT"),
    networkId:
      typeof payload.network_id === "number" ? payload.network_id : null,
    isAdmin: Boolean(payload.is_admin),
  };
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
      networkId: 1,
      isAdmin: mockRole === "PCP",
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

  const user = userFromToken(tokenRes.access_token, email);
  useAuthStore.getState().setAuth(tokenRes.access_token, user);
  return { token: tokenRes.access_token, user };
}

export async function registerNetwork(
  payload: RegisterNetworkPayload,
): Promise<{ token: string; user: UserInfo }> {
  if (USE_MOCK) {
    await delay(500);
    const mockUser: UserInfo = {
      userId: "1",
      email: payload.admin_email,
      fullName: payload.admin_full_name,
      role: "PCP",
      networkId: 999,
      isAdmin: true,
    };
    const mockToken = "mock-token";
    useAuthStore.getState().setAuth(mockToken, mockUser);
    return { token: mockToken, user: mockUser };
  }

  const tokenRes = await apiFetch<TokenResponse>("/auth/register-network", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const user = userFromToken(tokenRes.access_token, payload.admin_email);
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

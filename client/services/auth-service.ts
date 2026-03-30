import type { TokenResponse, UserInfo } from "@/types/api";
import { useAuthStore } from "@/state/auth-store";
import { apiFetch, USE_MOCK, delay } from "./http";

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: UserInfo }> {
  if (USE_MOCK) {
    await delay(500);
    const mockUser: UserInfo = {
      userId: "1",
      email: email || "clinician@hospital.com",
      fullName: email ? `Dr. ${email.split("@")[0]}` : "Dr. Quach",
      role: "PCP",
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

  // Derive user info from the email since the token endpoint doesn't return it
  const user: UserInfo = {
    userId: email,
    email,
    fullName: email.split("@")[0],
    role: "PCP",
  };

  useAuthStore.getState().setAuth(tokenRes.access_token, user);
  return { token: tokenRes.access_token, user };
}

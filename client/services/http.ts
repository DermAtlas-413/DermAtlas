import { API_BASE, USE_MOCK } from "./config";
import { useAuthStore } from "@/state/auth-store";

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      useAuthStore.getState().clearAuth();
    }
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export { USE_MOCK };

/**
 * DermAtlas API client
 *
 * Toggle USE_MOCK to switch between mock data and the real backend.
 *   true  → works offline, no backend needed
 *   false → calls http://localhost:8000/api/v1 
 */

export const USE_MOCK = true;

const API_BASE = "http://localhost:8000/api/v1";

// Types

export interface UserInfo {
  userId: string;
  email: string;
  fullName: string;
  role: "PCP" | "PATIENT";
}


// In-memory auth store (feel free to change Charlie)

let _token: string | null = null;
let _user: UserInfo | null = null;

export function getToken(): string | null {
  return _token;
}

export function getUser(): UserInfo | null {
  return _user;
}

export function clearAuth(): void {
  _token = null;
  _user = null;
}

/** Called by the login page after a successful auth response. (feel free to change Charlie)*/
export function setToken(token: string): void {
  _token = token;
}

/** Called by the login page to store decoded user info. (feel free to change Charlie)*/
export function setUser(user: UserInfo): void {
  _user = user;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// submitFeedback

/**
 * Submit or update helpfulness feedback for a match.
 * Real: POST /feedback  { query_id, reference_id, is_helpful }
 */
export async function submitFeedback(
  queryId: string,
  referenceId: string,
  isHelpful: boolean
): Promise<void> {
  if (USE_MOCK) {
    await delay(400);
    return;
  }

  const res = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${_token}`,
    },
    body: JSON.stringify({
      query_id: queryId,
      reference_id: referenceId,
      is_helpful: isHelpful,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Failed to submit feedback");
  }
}

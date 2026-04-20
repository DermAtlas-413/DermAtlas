import type { UploadResponse } from "@/types/api";
import { apiFetch, USE_MOCK, delay } from "./http";
import { API_BASE } from "./config";
import { useAuthStore } from "@/state/auth-store";

export async function uploadImage(
  file: Blob,
  patientId: number,
  lesionLocation: string,
  clinicianNotes?: string,
): Promise<UploadResponse> {
  if (USE_MOCK) {
    await delay(800);
    return { query_id: "mock-query-id" };
  }

  const form = new FormData();
  form.append("file", file);
  form.append("patient_id", String(patientId));
  form.append("lesion_location", lesionLocation);
  if (clinicianNotes) {
    form.append("clinician_notes", clinicianNotes);
  }

  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE}/upload/image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Upload failed (${res.status})`);
  }

  return res.json();
}

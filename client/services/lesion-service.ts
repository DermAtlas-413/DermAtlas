import type { AnalyzeResponse } from "@/types/api";
import { USE_MOCK, delay } from "./http";
import { API_BASE } from "./config";
import { useAuthStore } from "@/state/auth-store";

const MOCK_RESULTS: AnalyzeResponse = {
  benign_results: [
    { reference_id: "1", diagnosis_label: "Seborrheic keratosis", diagnosis_type: "Benign", score: 0.87, gcs_uri: null },
    { reference_id: "2", diagnosis_label: "Benign nevus", diagnosis_type: "Benign", score: 0.82, gcs_uri: null },
    { reference_id: "3", diagnosis_label: "Actinic keratosis", diagnosis_type: "Benign", score: 0.78, gcs_uri: null },
  ],
  malignant_results: [
    { reference_id: "4", diagnosis_label: "Basal cell carcinoma", diagnosis_type: "Malignant", score: 0.74, gcs_uri: null },
    { reference_id: "5", diagnosis_label: "Melanoma", diagnosis_type: "Malignant", score: 0.69, gcs_uri: null },
  ],
};

const STATUS_MESSAGES: Record<number, string> = {
  400: "Invalid request. Please check the image and try again.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to analyze this image.",
  404: "The server could not be reached. Please try again later.",
  503: "The analysis service is temporarily unavailable. Please try again in a few minutes.",
};

export async function analyzeLesion(queryId: string): Promise<AnalyzeResponse> {
  if (USE_MOCK) {
    await delay(600);
    return MOCK_RESULTS;
  }

  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE}/lesion/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query_id: queryId }),
  });

  if (!res.ok) {
    const message =
      STATUS_MESSAGES[res.status] ??
      `Analysis failed (error ${res.status}). Please try again.`;
    throw new Error(message);
  }

  return res.json();
}

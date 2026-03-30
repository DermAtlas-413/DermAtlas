import type { AnalyzeResponse } from "@/types/api";
import { apiFetch, USE_MOCK, delay } from "./http";

const MOCK_RESULTS: AnalyzeResponse = {
  results: [
    { reference_id: "1", diagnosis_label: "Seborrheic keratosis", score: 0.87, gcs_uri: null },
    { reference_id: "2", diagnosis_label: "Benign nevus", score: 0.82, gcs_uri: null },
    { reference_id: "3", diagnosis_label: "Actinic keratosis", score: 0.78, gcs_uri: null },
    { reference_id: "4", diagnosis_label: "Basal cell carcinoma", score: 0.74, gcs_uri: null },
  ],
};

export async function analyzeLesion(queryId: string): Promise<AnalyzeResponse> {
  if (USE_MOCK) {
    await delay(600);
    return MOCK_RESULTS;
  }

  return apiFetch<AnalyzeResponse>("/lesion/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query_id: queryId }),
  });
}

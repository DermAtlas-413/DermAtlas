import { apiFetch, USE_MOCK, delay } from "./http";

export async function submitFeedback(
  queryId: string,
  referenceId: string,
  isHelpful: boolean,
): Promise<void> {
  if (USE_MOCK) {
    await delay(400);
    return;
  }

  await apiFetch("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query_id: queryId,
      reference_id: referenceId,
      is_helpful: isHelpful,
    }),
  });
}

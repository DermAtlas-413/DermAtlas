// Local demo images used when the backend is in mock mode.
// reference_id from the mock AnalyzeResponse maps to a bundled WebP asset.

export const DEMO_IMAGES: Record<string, number> = {
  "1": require("../assets/images/melanocytic-naevus.webp"),
  "2": require("../assets/images/melanocytic-naevus-closeup.webp"),
  "3": require("../assets/images/actinic-keratosis-head-neck.webp"),
  "4": require("../assets/images/basal-cell-carcinoma.webp"),
};

// Fallback "uploaded" image shown on the compare/feedback pages when no image
// was selected in the upload flow (e.g. navigating directly from a stub).
export const DEMO_UPLOAD_IMAGE: number = require("../assets/images/actinic-keratosis.webp");

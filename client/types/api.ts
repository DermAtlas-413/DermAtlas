export type UserRole = "PCP" | "PATIENT";

/** Human-friendly role label for display in headers and badges. */
export function displayRole(role: UserRole | string | undefined): string {
  if (role === "PCP") return "Physician";
  if (role === "PATIENT") return "Patient";
  return role ?? "—";
}

export interface UserInfo {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
}

// POST /auth/token
export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
}

// POST /upload/image
export interface UploadResponse {
  query_id: string;
}

// POST /lesion/analyze
export interface AnalyzeMatch {
  reference_id: string;
  diagnosis_label: string | null;
  score: number;
  gcs_uri: string | null;
}

export type DiagnosisClass = "mel" | "nv" | "bcc" | "akiec" | "bkl" | "df";

export const DIAGNOSIS_LABELS: Record<DiagnosisClass, string> = {
  mel: "Melanoma",
  nv: "Nevus",
  bcc: "Basal Cell Carcinoma",
  akiec: "Actinic Keratosis",
  bkl: "Benign Keratosis",
  df: "Dermatofibroma",
};

export const MALIGNANT_CLASSES: DiagnosisClass[] = ["mel", "bcc", "akiec"];

export interface AnalyzeResponse {
  results: AnalyzeMatch[];
  predicted_probs: Record<DiagnosisClass, number>;
  malignancy_probability: number;
  risk_flag: boolean;
  primary_diagnosis: DiagnosisClass;
}

// POST /feedback
export interface FeedbackResponse {
  status: string;
}

// GET /patients/{id}
export interface ClinicalImageSummary {
  query_id: string;
  gcs_uri: string;
  captured_at: string | null;
  lesion_location: string;
  visible_to_patient: boolean;
}

// GET /patients/me/cases/{query_id}
export interface ClinicalImageDetail {
  query_id: string;
  gcs_uri: string;
  captured_at: string | null;
  lesion_location: string;
  clinician_notes: string | null;
  visible_to_patient: boolean;
  physician_name: string | null;
}

export interface PatientResponse {
  patient_id: number;
  mrn_internal: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  clinical_images: ClinicalImageSummary[];
}

// GET /patients/me
export interface PatientMeResponse {
  user_id: number;
  full_name: string;
  email: string;
  physician_name: string | null;
  clinical_images: ClinicalImageSummary[];
}

// PATCH /clinical-images/{query_id}/visibility
export interface VisibilityToggleResponse {
  query_id: string;
  visible_to_patient: boolean;
}

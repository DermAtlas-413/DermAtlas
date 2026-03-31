export type UserRole = "PCP" | "PATIENT";

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

export interface AnalyzeResponse {
  results: AnalyzeMatch[];
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
}

export interface PatientResponse {
  patient_id: number;
  mrn_internal: string;
  date_of_birth: string;
  gender: string;
  clinical_images: ClinicalImageSummary[];
}

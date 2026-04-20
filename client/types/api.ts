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
  networkId: number | null;
  isAdmin: boolean;
}

export interface Network {
  network_id: number;
  name: string;
  slug: string;
  created_at: string;
}

// POST /auth/register-network
export interface RegisterNetworkPayload {
  network_name: string;
  admin_email: string;
  admin_password: string;
  admin_full_name: string;
  admin_npi: string;
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
  clinical_images: ClinicalImageSummary[];
}

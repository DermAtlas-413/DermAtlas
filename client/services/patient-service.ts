import type {
  ClinicalImageDetail,
  PatientMeResponse,
  PatientResponse,
  VisibilityToggleResponse,
} from "@/types/api";
import { apiFetch, USE_MOCK, delay } from "./http";

const MOCK_PATIENTS: PatientResponse[] = [
  { patient_id: 1, mrn_internal: "MRN-001", full_name: "Alice Johnson", date_of_birth: "1985-06-15", gender: "Female", clinical_images: [] },
  { patient_id: 2, mrn_internal: "MRN-002", full_name: "Robert Chen", date_of_birth: "1972-11-03", gender: "Male", clinical_images: [] },
  { patient_id: 3, mrn_internal: "MRN-003", full_name: "Maria Garcia", date_of_birth: "1990-04-22", gender: "Female", clinical_images: [] },
  { patient_id: 4, mrn_internal: "MRN-004", full_name: "James Williams", date_of_birth: "1965-09-08", gender: "Male", clinical_images: [] },
  { patient_id: 5, mrn_internal: "MRN-005", full_name: "Taylor Kim", date_of_birth: "2001-01-30", gender: "Non-binary", clinical_images: [] },
];

const MOCK_PATIENT_CASES: PatientMeResponse = {
  user_id: 99,
  full_name: "Demo Patient",
  email: "patient@demo.com",
  physician_name: "Dr. Sarah Chen",
  clinical_images: [
    {
      query_id: "mock-q-1-abcd1234",
      gcs_uri: "",
      captured_at: "2026-03-15T10:30:00Z",
      lesion_location: "Left forearm",
      visible_to_patient: true,
    },
    {
      query_id: "mock-q-2-efgh5678",
      gcs_uri: "",
      captured_at: "2026-02-01T14:00:00Z",
      lesion_location: "Upper back",
      visible_to_patient: true,
    },
    {
      query_id: "mock-q-3-ijkl9012",
      gcs_uri: "",
      captured_at: "2026-01-10T09:15:00Z",
      lesion_location: "Right shoulder",
      visible_to_patient: true,
    },
  ],
};

const MOCK_CASE_DETAILS: Record<string, ClinicalImageDetail> = {
  "mock-q-1-abcd1234": {
    query_id: "mock-q-1-abcd1234",
    gcs_uri: "",
    captured_at: "2026-03-15T10:30:00Z",
    lesion_location: "Left forearm",
    clinician_notes: "Irregular borders observed. Recommend follow-up in 3 months. No immediate concern but monitoring advised.",
    visible_to_patient: true,
    physician_name: "Dr. Sarah Chen",
  },
  "mock-q-2-efgh5678": {
    query_id: "mock-q-2-efgh5678",
    gcs_uri: "",
    captured_at: "2026-02-01T14:00:00Z",
    lesion_location: "Upper back",
    clinician_notes: "Symmetric, uniform color. Consistent with benign nevus. No action required at this time.",
    visible_to_patient: true,
    physician_name: "Dr. Sarah Chen",
  },
  "mock-q-3-ijkl9012": {
    query_id: "mock-q-3-ijkl9012",
    gcs_uri: "",
    captured_at: "2026-01-10T09:15:00Z",
    lesion_location: "Right shoulder",
    clinician_notes: null,
    visible_to_patient: true,
    physician_name: "Dr. Sarah Chen",
  },
};

export async function getPatient(patientId: number): Promise<PatientResponse> {
  if (USE_MOCK) {
    await delay(300);
    const found = MOCK_PATIENTS.find((p) => p.patient_id === patientId);
    return (
      found ?? {
        patient_id: patientId,
        mrn_internal: `MRN-${String(patientId).padStart(3, "0")}`,
        full_name: "Unknown Patient",
        date_of_birth: "1990-01-01",
        gender: "Unknown",
        clinical_images: [],
      }
    );
  }

  return apiFetch<PatientResponse>(`/patients/${patientId}`);
}

export async function getPatients(): Promise<PatientResponse[]> {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_PATIENTS;
  }

  return apiFetch<PatientResponse[]>("/patients");
}

export async function getMyPatientCases(): Promise<PatientMeResponse> {
  if (USE_MOCK) {
    await delay(400);
    return MOCK_PATIENT_CASES;
  }

  return apiFetch<PatientMeResponse>("/patients/me");
}

export async function getMyCaseDetail(queryId: string): Promise<ClinicalImageDetail> {
  if (USE_MOCK) {
    await delay(300);
    const detail = MOCK_CASE_DETAILS[queryId];
    if (!detail) throw new Error("Case not found");
    return detail;
  }

  return apiFetch<ClinicalImageDetail>(`/patients/me/cases/${queryId}`);
}

export async function toggleCaseVisibility(
  queryId: string,
  visible: boolean,
): Promise<VisibilityToggleResponse> {
  if (USE_MOCK) {
    await delay(300);
    return { query_id: queryId, visible_to_patient: visible };
  }

  return apiFetch<VisibilityToggleResponse>(
    `/clinical-images/${queryId}/visibility`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible_to_patient: visible }),
    },
  );
}

import type { PatientMeResponse, PatientResponse } from "@/types/api";
import { apiFetch, USE_MOCK, delay } from "./http";

// Demo patients — mirrors the mockPatients array in app.json extra config.
// Defined here as a direct import to avoid Expo's Constants.expoConfig.extra
// dropping complex types (arrays) at runtime in certain web build modes.
const MOCK_PATIENTS: PatientResponse[] = [
  { patient_id: 1, mrn_internal: "MRN-001", full_name: "Alice Johnson", date_of_birth: "1985-06-15", gender: "Female", clinical_images: [] },
  { patient_id: 2, mrn_internal: "MRN-002", full_name: "Robert Chen", date_of_birth: "1972-11-03", gender: "Male", clinical_images: [] },
  { patient_id: 3, mrn_internal: "MRN-003", full_name: "Maria Garcia", date_of_birth: "1990-04-22", gender: "Female", clinical_images: [] },
  { patient_id: 4, mrn_internal: "MRN-004", full_name: "James Williams", date_of_birth: "1965-09-08", gender: "Male", clinical_images: [] },
  { patient_id: 5, mrn_internal: "MRN-005", full_name: "Taylor Kim", date_of_birth: "2001-01-30", gender: "Non-binary", clinical_images: [] },
];

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
    return {
      user_id: 99,
      full_name: "Demo Patient",
      email: "patient@demo.com",
      clinical_images: [
        {
          query_id: "mock-q-1-abcd1234",
          gcs_uri: "",
          captured_at: "2026-03-15T10:30:00Z",
          lesion_location: "Left forearm",
        },
        {
          query_id: "mock-q-2-efgh5678",
          gcs_uri: "",
          captured_at: "2026-02-01T14:00:00Z",
          lesion_location: "Upper back",
        },
        {
          query_id: "mock-q-3-ijkl9012",
          gcs_uri: "",
          captured_at: "2026-01-10T09:15:00Z",
          lesion_location: "Right shoulder",
        },
      ],
    };
  }

  return apiFetch<PatientMeResponse>("/patients/me");
}

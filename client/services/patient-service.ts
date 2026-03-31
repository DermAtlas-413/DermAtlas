import type { PatientResponse } from "@/types/api";
import { apiFetch, USE_MOCK, delay } from "./http";

// Demo patients — mirrors the mockPatients array in app.json extra config.
// Defined here as a direct import to avoid Expo's Constants.expoConfig.extra
// dropping complex types (arrays) at runtime in certain web build modes.
const MOCK_PATIENTS: PatientResponse[] = [
  { patient_id: 1, mrn_internal: "MRN-001", date_of_birth: "1985-06-15", gender: "Female", clinical_images: [] },
  { patient_id: 2, mrn_internal: "MRN-002", date_of_birth: "1972-11-03", gender: "Male", clinical_images: [] },
  { patient_id: 3, mrn_internal: "MRN-003", date_of_birth: "1990-04-22", gender: "Female", clinical_images: [] },
  { patient_id: 4, mrn_internal: "MRN-004", date_of_birth: "1965-09-08", gender: "Male", clinical_images: [] },
  { patient_id: 5, mrn_internal: "MRN-005", date_of_birth: "2001-01-30", gender: "Non-binary", clinical_images: [] },
];

export async function getPatient(patientId: number): Promise<PatientResponse> {
  if (USE_MOCK) {
    await delay(300);
    const found = MOCK_PATIENTS.find((p) => p.patient_id === patientId);
    return (
      found ?? {
        patient_id: patientId,
        mrn_internal: `MRN-${String(patientId).padStart(3, "0")}`,
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

import type { PatientResponse } from "@/types/api";
import { apiFetch, USE_MOCK, delay } from "./http";
import { MOCK_PATIENTS } from "./config";

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

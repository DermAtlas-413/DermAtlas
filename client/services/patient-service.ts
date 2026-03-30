import type { PatientResponse } from "@/types/api";
import { apiFetch, USE_MOCK, delay } from "./http";

const MOCK_PATIENT: PatientResponse = {
  patient_id: 1,
  mrn_internal: "MRN-001",
  date_of_birth: "1985-06-15",
  gender: "Female",
  clinical_images: [],
};

export async function getPatient(patientId: number): Promise<PatientResponse> {
  if (USE_MOCK) {
    await delay(300);
    return { ...MOCK_PATIENT, patient_id: patientId };
  }

  return apiFetch<PatientResponse>(`/patients/${patientId}`);
}

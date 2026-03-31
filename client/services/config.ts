import Constants from "expo-constants";
import type { PatientResponse } from "@/types/api";

const extra = Constants.expoConfig?.extra ?? {};

export const USE_MOCK: boolean = extra.useMock ?? true;
export const API_BASE: string = extra.apiBase ?? "http://localhost:8000/api/v1";
export const MOCK_PATIENTS: PatientResponse[] = extra.mockPatients ?? [];

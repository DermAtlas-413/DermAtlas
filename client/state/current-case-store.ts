import { create } from "zustand";

interface CurrentCaseState {
  // Written by upload.tsx before navigating to /compare
  patientId: number | null;
  patientMrn: string;
  patientName: string;
  queryId: string;
  imageUri: string | null;
  // Written by compare.tsx before navigating to /feedback
  matchId: string;
  referenceId: string;
  diagnosis: string;
  similarity: number | null;
  referenceImageUri: string;

  setCase: (p: {
    patientId: number;
    patientMrn: string;
    patientName: string;
    queryId: string;
    imageUri: string | null;
  }) => void;
  setFeedbackTarget: (p: {
    matchId: string;
    referenceId: string;
    diagnosis: string;
    similarity: number | null;
    referenceImageUri: string;
  }) => void;
  clear: () => void;
}

const EMPTY = {
  patientId: null,
  patientMrn: "",
  patientName: "",
  queryId: "",
  imageUri: null,
  matchId: "",
  referenceId: "",
  diagnosis: "",
  similarity: null,
  referenceImageUri: "",
};

// Intentionally NOT persisted — case context is transient and should die on refresh.
export const useCurrentCaseStore = create<CurrentCaseState>((set) => ({
  ...EMPTY,
  setCase: (p) => set(p),
  setFeedbackTarget: (p) => set(p),
  clear: () => set(EMPTY),
}));

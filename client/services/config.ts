import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

// Metro inlines process.env.* at build time, so these work as fallbacks
// when Constants.expoConfig isn't populated (common on web dev).
export const USE_MOCK: boolean = extra.useMock ?? process.env.USE_MOCK === "true";
export const API_BASE: string = extra.apiBase ?? process.env.API_BASE ?? "http://localhost:8000/api/v1";

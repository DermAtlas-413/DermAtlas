import { useEffect } from "react";
import { useSegments, useRootNavigationState, useRouter } from "expo-router";
import { useAuthStore } from "@/state/auth-store";

const PCP_ONLY: string[] = ["upload", "compare", "feedback", "admin"];
const PATIENT_ONLY: string[] = ["my-cases"];

/**
 * Global auth + role guard. Call once from the root layout.
 * - Unauthenticated users are redirected to "/" for any protected route.
 * - Authenticated users on the login screen are redirected to their home.
 * - PATIENT users are bounced away from PCP-only routes (and vice-versa).
 *
 * Individual screens also call useRequireRole for defense-in-depth, but this
 * hook fires before any screen renders, providing a consistent first-layer guard.
 */
export function useProtectedRoute() {
  const segments = useSegments();
  const navState = useRootNavigationState();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Wait until both the navigation container and zustand persist are hydrated.
    if (!navState?.key || !hydrated) return;

    const onLoginScreen = !segments[0];

    if (!token) {
      if (!onLoginScreen) router.replace("/");
      return;
    }

    // Authenticated user on the login screen → send to their home route.
    if (onLoginScreen) {
      router.replace(user?.role === "PATIENT" ? "/my-cases" : "/upload");
      return;
    }

    const prefix = segments[0] as string | undefined;
    if (!prefix) return;

    if (user?.role === "PATIENT" && PCP_ONLY.includes(prefix)) {
      router.replace("/my-cases");
      return;
    }
    if (user?.role === "PCP" && PATIENT_ONLY.includes(prefix)) {
      router.replace("/upload");
      return;
    }
  }, [token, segments, navState?.key, user?.role, hydrated]);
}

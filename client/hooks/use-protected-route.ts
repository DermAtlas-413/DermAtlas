import { useEffect, useState } from "react";
import { useSegments, useRouter, useNavigationContainerRef } from "expo-router";
import { useAuthStore } from "@/state/auth-store";

const PCP_ONLY: string[] = ["upload", "compare", "feedback", "admin"];
const PATIENT_ONLY: string[] = ["my-cases"];

/**
 * Global auth + role guard. Call once from the root layout.
 * Waits for both navigation mount and zustand rehydration before redirecting.
 */
export function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const navRef = useNavigationContainerRef();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    if (navRef?.isReady) {
      setNavReady(true);
      return;
    }
    // Listen for when navigation becomes ready
    const unsubscribe = navRef?.addListener?.("state", () => {
      if (navRef.isReady) setNavReady(true);
    });
    return () => { unsubscribe?.(); };
  }, [navRef, navRef?.isReady]);

  useEffect(() => {
    if (!hydrated || !navReady) return;

    const onLoginScreen = !segments[0];

    if (!token) {
      if (!onLoginScreen) router.replace("/");
      return;
    }

    if (onLoginScreen) {
      router.replace(user?.role === "PATIENT" ? "/my-cases" : "/upload");
      return;
    }

    const prefix = segments[0] as string | undefined;
    if (!prefix) return;

    if (user?.role === "PATIENT" && PCP_ONLY.includes(prefix)) {
      router.replace("/my-cases");
    }
    if (user?.role === "PCP" && PATIENT_ONLY.includes(prefix)) {
      router.replace("/upload");
    }
  }, [token, segments, user?.role, hydrated, navReady]);
}

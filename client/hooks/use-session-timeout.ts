import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/state/auth-store";

/** Idle timeout before automatic logout. 30 minutes matches common clinical guidelines. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const WEB_EVENTS = ["mousemove", "click", "keydown", "scroll"] as const;

/**
 * Automatic session timeout hook. Call once from the root layout.
 *
 * Web: tracks mouse/keyboard/scroll events to update lastActivity.
 * Native: treats each foreground transition as an activity signal and
 *         checks the timeout whenever the app comes back to the foreground.
 * Both: a 60-second interval checks whether the idle window has been exceeded.
 */
export function useSessionTimeout() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const updateActivity = useAuthStore((s) => s.updateActivity);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    // No-op when not authenticated.
    if (!token) return;

    function checkTimeout() {
      const { lastActivity } = useAuthStore.getState();
      if (lastActivity !== null && Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
        clearAuth();
        router.replace("/");
      }
    }

    // Check once per minute — low overhead, worst-case 60s overshoot.
    const interval = setInterval(checkTimeout, 60_000);

    if (Platform.OS === "web") {
      function onActivity() {
        updateActivity();
      }
      for (const e of WEB_EVENTS) {
        document.addEventListener(e, onActivity, { passive: true });
      }
      return () => {
        clearInterval(interval);
        for (const e of WEB_EVENTS) {
          document.removeEventListener(e, onActivity);
        }
      };
    } else {
      // On native: coming to foreground either triggers a timeout check or
      // resets the activity clock if within the allowed window.
      const sub = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active") {
          checkTimeout();
        } else {
          updateActivity();
        }
      });
      return () => {
        clearInterval(interval);
        sub.remove();
      };
    }
  }, [token]);
}

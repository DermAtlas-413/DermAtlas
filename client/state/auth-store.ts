import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UserInfo } from "@/types/api";

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  lastActivity: number | null;
  setAuth: (token: string, user: UserInfo) => void;
  clearAuth: () => void;
  updateActivity: () => void;
}

const safeSessionStorage = {
  getItem: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} },
  removeItem: (k: string) => { try { sessionStorage.removeItem(k); } catch {} },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      lastActivity: null,
      setAuth: (token, user) => set({ token, user, lastActivity: Date.now() }),
      clearAuth: () => set({ token: null, user: null, lastActivity: null }),
      updateActivity: () => set({ lastActivity: Date.now() }),
    }),
    {
      name: "dermatlas-auth",
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        lastActivity: state.lastActivity,
      }),
    }
  )
);

// Use zustand v5's official persist API to track hydration reliably.
// onRehydrateStorage can be flaky, but onFinishHydration always fires.
useAuthStore.persist.onFinishHydration(() => {
  useAuthStore.setState({ _hasHydrated: true });
});
// If hydration already completed synchronously before the listener registered:
if (useAuthStore.persist.hasHydrated()) {
  useAuthStore.setState({ _hasHydrated: true });
}

import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/state/auth-store";
import type { UserRole } from "@/types/api";

/**
 * Redirects the user if they don't have the required role.
 * - Unauthenticated users → login page
 * - Wrong role → their home page (PCP → /upload, PATIENT → /my-cases)
 *
 * Returns `true` when the user is authorized and the page should render.
 */
export function useRequireRole(requiredRole: UserRole): boolean {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      router.replace("/");
    } else if (user.role !== requiredRole) {
      router.replace(user.role === "PATIENT" ? "/my-cases" : "/upload");
    }
  }, [user, requiredRole, router]);

  return !!user && user.role === requiredRole;
}

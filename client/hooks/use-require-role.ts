import { useAuthStore } from "@/state/auth-store";
import type { UserRole } from "@/types/api";

/**
 * Returns `true` when the user is authenticated with the required role.
 * Returns `false` (render nothing) while hydrating or if unauthorized.
 *
 * Redirects are handled globally by useProtectedRoute in _layout.tsx,
 * so this hook only gates rendering — it never calls router.replace.
 */
export function useRequireRole(requiredRole: UserRole): boolean {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  return hydrated && !!user && user.role === requiredRole;
}

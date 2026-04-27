import { useAuthStore } from "@/state/auth-store";
import type { UserRole } from "@/types/api";

type RequireOptions = { role: UserRole; adminOnly?: boolean };

/**
 * Returns `true` when the user is authenticated with the required role
 * (and, when `adminOnly` is set, with `isAdmin === true`).
 *
 * Returns `false` (render nothing) while hydrating or if unauthorized.
 *
 * Redirects are handled globally by useProtectedRoute in _layout.tsx,
 * so this hook only gates rendering — it never calls router.replace.
 */
export function useRequireRole(required: UserRole | RequireOptions): boolean {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  if (!hydrated || !user) return false;

  const { role, adminOnly } =
    typeof required === "string" ? { role: required, adminOnly: false } : required;

  if (user.role !== role) return false;
  if (adminOnly && !user.isAdmin) return false;
  return true;
}

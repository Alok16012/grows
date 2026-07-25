import type { AuthUser } from "./types";

// Who gets the web Admin panel entry point.
//
// Mirrors the backend's RBAC exactly (lib/permissions.ts): ADMIN is the ONLY
// role with implicit access — MANAGER / HR_MANAGER / INSPECTION_BOY carry no
// hardcoded privilege. Everyone else needs a real permission from their custom
// role. `self.view` is the universal employee-self-service baseline, so it
// never counts, and merely *having* a custom role name doesn't either (the
// role may grant nothing beyond self-service).
export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return (user.permissions ?? []).some((p) => p && p !== "self.view");
}

import type { AuthUser } from "./types";

// Roles that always get the web Admin panel entry point.
const PRIVILEGED_ROLES = new Set(["ADMIN", "MANAGER", "HR_MANAGER"]);

// A user can reach the full web workspace if they hold a privileged role, an
// active custom role, or any permission beyond the baseline `self.view`.
export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (PRIVILEGED_ROLES.has(user.role)) return true;
  if (user.customRoleName) return true;
  return (user.permissions ?? []).some((p) => p && p !== "self.view");
}

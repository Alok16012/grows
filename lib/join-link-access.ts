import type { Access } from "@/lib/access"

/** Who may make and see their own join links. */
export const LINK_USERS = ["onboarding.view", "recruitment.view"]
/** Onboarding managers see and change everyone's links. */
export const canManageAll = (a: Access) => a.isAdmin || a.permissions.includes("onboarding.manage")

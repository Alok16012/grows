// Client-side permission check.
// ADMIN always has full access. Everyone else is checked by permissions array only.
// A list means "any of these" (e.g. ["jobs.publish", "jobs.edit"]).
export function can(session: any, permission: string | string[]): boolean {
    if (!session?.user) return false
    if (session.user.role === "ADMIN") return true
    const held = (session.user.permissions as string[]) || []
    return Array.isArray(permission) ? permission.some(p => held.includes(p)) : held.includes(permission)
}

// True if the user holds ANY of the given permissions (ADMIN always passes).
export function canAny(session: any, permissions: string[]): boolean {
    if (!session?.user) return false
    if (session.user.role === "ADMIN") return true
    const held = (session.user.permissions as string[]) || []
    return permissions.some(p => held.includes(p))
}

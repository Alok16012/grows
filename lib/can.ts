// Client-side permission check.
// ADMIN always has full access. Everyone else is checked by permissions array only.
export function can(session: any, permission: string): boolean {
    if (!session?.user) return false
    if (session.user.role === "ADMIN") return true
    return ((session.user.permissions as string[]) || []).includes(permission)
}

// True if the user holds ANY of the given permissions (ADMIN always passes).
export function canAny(session: any, permissions: string[]): boolean {
    if (!session?.user) return false
    if (session.user.role === "ADMIN") return true
    const held = (session.user.permissions as string[]) || []
    return permissions.some(p => held.includes(p))
}

import { getServerSession } from "next-auth"
import type { Session } from "next-auth"
import { decode } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { resolveAccess, accessVersion } from "@/lib/access-session"

const secret = process.env.NEXTAUTH_SECRET

// Resolve the current request's session from EITHER:
//   1. An `Authorization: Bearer <token>` header (native mobile app), or
//   2. The NextAuth session cookie (web app — unchanged behavior).
// Mobile tokens are minted by /api/mobile/login using next-auth/jwt `encode`
// with the same NEXTAUTH_SECRET, so `decode` here verifies them natively
// without adding any new crypto dependency.
export async function getApiSession(req?: Request): Promise<Session | null> {
    const authHeader = req?.headers.get("authorization") || req?.headers.get("Authorization")
    if (authHeader?.startsWith("Bearer ") && secret) {
        const token = authHeader.slice(7).trim()
        if (token) {
            try {
                const decoded = await decode({ token, secret })
                if (decoded?.id) {
                    // Mobile tokens live 30 days — make sure the user still
                    // exists and is active on every request, so deleting or
                    // terminating an employee kills their app access at once.
                    // (Demo users have no DB row — skip them in dev.)
                    const uid = decoded.id as string
                    let live: { role: string; permissions: string[]; scope: string | null; siteIds: string[] } | null = null
                    if (!uid.startsWith("demo-")) {
                        const u = await prisma.user
                            .findUnique({
                                where: { id: uid },
                                select: { id: true, role: true, isActive: true, customRoleId: true, customRole: { select: { isActive: true, permissions: true } } },
                            })
                            .catch(() => undefined)
                        // undefined = DB hiccup (fail open); null = user deleted
                        if (u === null || u?.isActive === false) return null
                        // Role, status or sites changed since the token was minted:
                        // answer with what the user may do now, not 30 days ago.
                        if (u && (await accessVersion(uid)) !== ((decoded.accessVersion as number) ?? 0)) {
                            const a = await resolveAccess(u)
                            live = { role: u.role, permissions: a.permissions, scope: a.scope, siteIds: a.siteIds }
                        }
                    }
                    // Shaped to match the NextAuth session.user so existing helpers
                    // (checkAccess, audienceWhere, prisma lookups by session.user.id)
                    // work unchanged whether auth came from a cookie or a bearer token.
                    return {
                        user: {
                            id: decoded.id as string,
                            email: (decoded.email as string) ?? null,
                            name: (decoded.name as string) ?? null,
                            role: live?.role ?? (decoded.role as string) ?? "INSPECTION_BOY",
                            permissions: live?.permissions ?? ((decoded.permissions as string[]) ?? []),
                            scope: live ? live.scope : ((decoded.scope as string) ?? null),
                            siteIds: live?.siteIds ?? ((decoded.siteIds as string[]) ?? []),
                            customRoleName: (decoded.customRoleName as string) ?? null,
                            customRoleColor: (decoded.customRoleColor as string) ?? null,
                            photo: (decoded.photo as string) ?? null,
                        },
                        expires: new Date(((decoded.exp as number) ?? 0) * 1000).toISOString(),
                    } as unknown as Session
                }
            } catch {
                // Invalid/expired token — fall through to cookie session below.
            }
        }
    }

    return getServerSession(authOptions)
}

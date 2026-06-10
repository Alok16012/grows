import { getServerSession } from "next-auth"
import type { Session } from "next-auth"
import { decode } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"

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
                    // Shaped to match the NextAuth session.user so existing helpers
                    // (checkAccess, audienceWhere, prisma lookups by session.user.id)
                    // work unchanged whether auth came from a cookie or a bearer token.
                    return {
                        user: {
                            id: decoded.id as string,
                            email: (decoded.email as string) ?? null,
                            name: (decoded.name as string) ?? null,
                            role: (decoded.role as string) ?? "INSPECTION_BOY",
                            permissions: ((decoded.permissions as string[]) ?? []),
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

// Shared pieces of the Users API (app/api/admin/users…).
//
// The login identifier still lives in User.email: for most employees it is
// their mobile number (lib/credentials buildLoginEmail), which is how OTP and
// MPIN sign-in find them. The Users screen therefore shows "Email" only when
// the stored value really is an email address, and "Mobile" from User.phone,
// the login id, or the linked employee's phone — in that order.

import prisma from "@/lib/prisma"
import { phoneDigits } from "@/lib/login-security"
import { RuleError } from "@/lib/role-rules"

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export function isRealEmail(v: string | null | undefined): boolean {
    if (!v) return false
    const s = v.trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !s.endsWith("@cims.local")
}

export function mobileOf(u: { phone?: string | null; email?: string | null }, employeePhone?: string | null): string | null {
    const own = phoneDigits(u.phone)
    if (own.length === 10) return own
    const loginId = phoneDigits(u.email)
    if (loginId.length === 10 && !(u.email ?? "").includes("@")) return loginId
    const emp = phoneDigits(employeePhone)
    return emp.length === 10 ? emp : null
}

/** 10-digit Indian mobile, or a RuleError for the form. */
export function parseMobile(v: unknown): string {
    const digits = phoneDigits(typeof v === "string" ? v : "")
    if (!/^[6-9]\d{9}$/.test(digits)) throw new RuleError(400, "Mobile must be a 10-digit number starting with 6, 7, 8 or 9.")
    return digits
}

export function parseEmail(v: unknown): string | null {
    const s = typeof v === "string" ? v.trim().toLowerCase() : ""
    if (!s) return null
    if (!isRealEmail(s)) throw new RuleError(400, "Enter a real email address, or leave it empty. Never a phone number.")
    return s
}

/** No other login may use this mobile — it is how OTP sign-in finds the account. */
export async function assertMobileFree(mobile: string, exceptUserId?: string) {
    const clash = await prisma.user.findFirst({
        where: {
            OR: [{ phone: { endsWith: mobile } }, { email: mobile }],
            ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}),
        },
        select: { name: true },
    })
    if (clash) throw new RuleError(409, `This mobile is already used by ${clash.name}.`)
}

export async function assertEmailFree(email: string, exceptUserId?: string) {
    const clash = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}) },
        select: { name: true },
    })
    if (clash) throw new RuleError(409, `This email is already used by ${clash.name}.`)
}

export function parseSiteIds(v: unknown): string[] | undefined {
    if (v === undefined) return undefined
    if (!Array.isArray(v)) throw new RuleError(400, "Sites must be a list.")
    return Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0)))
}

export async function assertSitesExist(siteIds: string[]) {
    if (!siteIds.length) return
    const n = await prisma.site.count({ where: { id: { in: siteIds } } })
    if (n !== siteIds.length) throw new RuleError(400, "One of the chosen sites no longer exists.")
}

/** Make the user's site team membership exactly `siteIds`. Returns before/after. */
export async function setUserSites(tx: Tx, userId: string, siteIds: string[], actorId: string) {
    const current = await tx.siteAssignment.findMany({ where: { userId }, select: { id: true, siteId: true, status: true } })
    const want = new Set(siteIds)
    const drop = current.filter(c => !want.has(c.siteId)).map(c => c.id)
    if (drop.length) await tx.siteAssignment.deleteMany({ where: { id: { in: drop } } })
    for (const c of current) {
        if (want.has(c.siteId) && c.status !== "active") {
            await tx.siteAssignment.update({ where: { id: c.id }, data: { status: "active" } })
        }
    }
    const have = new Set(current.map(c => c.siteId))
    const add = siteIds.filter(s => !have.has(s))
    if (add.length) {
        await tx.siteAssignment.createMany({
            data: add.map(siteId => ({ siteId, userId, assignedBy: actorId, status: "active" })),
            skipDuplicates: true,
        })
    }
    return { before: current.filter(c => c.status === "active").map(c => c.siteId).sort(), after: [...siteIds].sort() }
}

export function parseLoginMethod(v: unknown): "OTP" | "PASSWORD" {
    return v === "PASSWORD" ? "PASSWORD" : "OTP"
}

/** Initial password rule for Password sign-in accounts. */
export function parseInitialPassword(v: unknown): string {
    const s = typeof v === "string" ? v : ""
    if (s.length < 10) throw new RuleError(400, "The initial password must be at least 10 characters.")
    if (/^\d+$/.test(s)) throw new RuleError(400, "The initial password cannot be only digits.")
    return s
}

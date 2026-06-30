import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"
import { buildLoginEmail, defaultPassword } from "@/lib/credentials"
import { checkAccess } from "@/lib/permissions"
import bcrypt from "bcryptjs"

// Bulk login generation hashes many passwords + writes to Supabase in a loop;
// give it the max serverless budget so big employee lists don't time out.
export const maxDuration = 60
export const dynamic = "force-dynamic"

// List every employee alongside their login credentials (id + password + role).
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, [], "users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const employees = await prisma.employee.findMany({
            // Pending-onboarding candidates aren't real employees yet — no login
            // and no real EMP code until approved, so keep them off this screen.
            where: { status: { not: "ONBOARDING" } },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                designation: true,
                department: { select: { name: true } },
                deployments: {
                    select: { site: { select: { name: true } } },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
                user: {
                    select: {
                        id: true,
                        email: true,
                        plainPassword: true,
                        role: true,
                        isActive: true,
                        customRole: { select: { id: true, name: true, color: true } },
                    },
                },
            },
        })

        const rows = employees.map(e => ({
            employeeId: e.id,
            empCode: e.employeeId,
            name: `${e.firstName} ${e.lastName || ""}`.trim(),
            designation: e.designation,
            phone: e.phone,
            department: e.department?.name || null,
            site: e.deployments?.[0]?.site?.name || null,
            hasLogin: !!e.user,
            userId: e.user?.id || null,
            loginEmail: e.user?.email || null,
            password: e.user?.plainPassword || null,
            isActive: e.user?.isActive ?? null,
            systemRole: e.user?.role || null,
            customRole: e.user?.customRole || null,
        }))

        return NextResponse.json(rows)
    } catch (error) {
        console.error("GET_EMPLOYEE_LOGINS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

// Employees that still need work: no login yet, or a login without a visible
// (plaintext) password. Used both to fetch a batch and to count what's left.
const NEEDS_WORK = {
    // Never auto-provision logins for pending-onboarding candidates — they only
    // get a login once their onboarding is approved.
    status: { not: "ONBOARDING" },
    OR: [
        { userId: null },
        { user: { is: { plainPassword: null } } },
    ],
} as const

// Process at most BATCH employees per request so a big list never blows the
// serverless time budget; the client calls repeatedly until `remaining` is 0.
const BATCH = 75
// Overlap the DB round-trips (find/create/update) so each batch finishes fast.
const CONCURRENCY = 12

// Run async work over a list with a bounded number of concurrent workers.
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
    let cursor = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const item = items[cursor++]
            await worker(item)
        }
    })
    await Promise.all(workers)
}

// Ensure every employee has a login with a *visible* password.
//  - No user account      → create one (default Grow@<last4> password).
//  - User but no visible   → reset password to a fresh default so admin can see it.
//    plainPassword
//  - Already has visible   → leave untouched.
//    password
//
// Processes one BATCH per call and reports `remaining`; the client loops until
// everything is done, so the operation can't time out regardless of headcount.
export async function POST() {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, [], "users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const employees = await prisma.employee.findMany({
            where: NEEDS_WORK as any,
            select: {
                id: true, employeeId: true, firstName: true, lastName: true, email: true, phone: true,
                userId: true,
                user: { select: { id: true, plainPassword: true } },
            },
            take: BATCH,
        })

        let created = 0
        let linked = 0
        let reset = 0
        let failed = 0

        await runPool(employees, CONCURRENCY, async (e) => {
            try {
                // Already has a login.
                if (e.user) {
                    // Password already visible → nothing to do.
                    if (e.user.plainPassword) return
                    // Visible password missing → reset to a fresh default so it shows.
                    const plain = defaultPassword({ phone: e.phone })
                    await prisma.user.update({
                        where: { id: e.user.id },
                        data: { password: await bcrypt.hash(plain, 8), plainPassword: plain },
                    })
                    reset++
                    return
                }

                const loginEmail = buildLoginEmail({ email: e.email, phone: e.phone, employeeId: e.employeeId })
                const existing = await prisma.user.findUnique({
                    where: { email: loginEmail },
                    include: { employeeProfile: { select: { id: true } } },
                })
                if (existing) {
                    if (!existing.employeeProfile) {
                        await prisma.employee.update({ where: { id: e.id }, data: { userId: existing.id } })
                        linked++
                    }
                    // Backfill a visible password if it doesn't have one.
                    if (!existing.plainPassword) {
                        const plain = defaultPassword({ phone: e.phone })
                        await prisma.user.update({
                            where: { id: existing.id },
                            data: { password: await bcrypt.hash(plain, 8), plainPassword: plain },
                        })
                        reset++
                    }
                    return
                }

                const plain = defaultPassword({ phone: e.phone })
                const hashed = await bcrypt.hash(plain, 8)
                const user = await prisma.user.create({
                    data: {
                        name: `${e.firstName} ${e.lastName || ""}`.trim(),
                        email: loginEmail,
                        password: hashed,
                        plainPassword: plain,
                        phone: e.phone || null,
                        role: "INSPECTION_BOY",
                    },
                })
                await prisma.employee.update({ where: { id: e.id }, data: { userId: user.id } })
                created++
            } catch (err) {
                console.error("BULK_LOGIN_FAIL", e.id, err)
                failed++
            }
        })

        // How many employees still need a login/visible password after this batch.
        const remaining = await prisma.employee.count({ where: NEEDS_WORK as any })

        return NextResponse.json({ created, linked, reset, failed, processed: employees.length, remaining })
    } catch (error) {
        console.error("POST_EMPLOYEE_LOGINS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

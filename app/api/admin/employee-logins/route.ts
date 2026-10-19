import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { buildLoginEmail, hasOwnPassword, NO_PASSWORD } from "@/lib/credentials"
import { checkAccess } from "@/lib/permissions"

// Bulk login generation writes to Supabase in a loop; give it the max
// serverless budget so big employee lists don't time out.
export const maxDuration = 60
export const dynamic = "force-dynamic"

// List every employee alongside their login (id, role, status). Admins never
// see a password: only whether the employee has set one, and whether they
// have an MPIN.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, [], "users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const employees = await prisma.employee.findMany({
            // Pending-onboarding candidates aren't real employees yet — no login
            // and no real EMP code until approved, so keep them off this screen.
            // Filter by the onboarding record (not just employee.status) so legacy
            // records with an incomplete onboarding are hidden too.
            where: {
                status: { not: "ONBOARDING" },
                NOT: { onboardingRecord: { is: { status: { not: "COMPLETED" } } } },
            },
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
                        password: true,
                        role: true,
                        isActive: true,
                        customRole: { select: { id: true, name: true, color: true } },
                        credential: { select: { mpinHash: true, lockedUntil: true } },
                    },
                },
            },
        })

        const now = Date.now()
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
            // Derived flags only — the hash itself never leaves the server.
            hasPassword: e.user ? hasOwnPassword(e.user.password) : false,
            hasMpin: !!e.user?.credential?.mpinHash,
            isLocked: !!e.user?.credential?.lockedUntil && e.user.credential.lockedUntil.getTime() > now,
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

// Employees that still need a login.
const NEEDS_LOGIN = {
    // Never auto-provision logins for pending-onboarding candidates — they only
    // get a login once their onboarding is approved. Filter on the onboarding
    // record so legacy incomplete records are skipped too.
    status: { not: "ONBOARDING" },
    NOT: { onboardingRecord: { is: { status: { not: "COMPLETED" } } } },
    userId: null,
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

// Ensure every employee has a login.
//  - No user account, no account on that login id → create one, with no
//    password: the employee signs in with an OTP and sets an MPIN.
//  - No user account, but an unclaimed account exists on that id → link it.
//  - Already has a login → left completely untouched (nothing is ever reset).
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
            where: NEEDS_LOGIN as any,
            select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, phone: true },
            take: BATCH,
        })

        let created = 0
        let linked = 0
        let failed = 0

        await runPool(employees, CONCURRENCY, async (e) => {
            try {
                const loginEmail = buildLoginEmail({ email: e.email, phone: e.phone, employeeId: e.employeeId })
                const existing = await prisma.user.findUnique({
                    where: { email: loginEmail },
                    select: { id: true, employeeProfile: { select: { id: true } } },
                })
                if (existing) {
                    // Only adopt an account that isn't already someone else's.
                    if (!existing.employeeProfile) {
                        await prisma.employee.update({ where: { id: e.id }, data: { userId: existing.id } })
                        linked++
                    } else {
                        failed++
                    }
                    return
                }

                const user = await prisma.user.create({
                    data: {
                        name: `${e.firstName} ${e.lastName || ""}`.trim(),
                        email: loginEmail,
                        password: NO_PASSWORD,
                        plainPassword: null,
                        phone: e.phone || null,
                        // Base role is vestigial; access comes from the custom role.
                        role: "MANAGER",
                    },
                })
                await prisma.employee.update({ where: { id: e.id }, data: { userId: user.id } })
                created++
            } catch (err) {
                console.error("BULK_LOGIN_FAIL", e.id, err)
                failed++
            }
        })

        // How many employees still have no login after this batch.
        const remaining = await prisma.employee.count({ where: NEEDS_LOGIN as any })

        return NextResponse.json({ created, linked, failed, processed: employees.length, remaining })
    } catch (error) {
        console.error("POST_EMPLOYEE_LOGINS_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

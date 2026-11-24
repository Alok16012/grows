import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { UNFINISHED_JOIN_WHERE, joinPoliciesPending } from "@/lib/join-server"

// GET /api/onboarding/unfinished — join forms the applicant saved but never
// submitted (joining policies not signed). They are not in Onboarding; HR can
// send the applicant the sign link from here. Only the latest form per mobile,
// and none for a mobile that has since submitted a complete form.
export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, [], "onboarding.view") && !checkAccess(session, [], "recruitment.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }
        const rows = await prisma.employee.findMany({
            where: { ...UNFINISHED_JOIN_WHERE, createdAt: { gte: new Date(Date.now() - 60 * 86400_000) } },
            select: { id: true, employeeId: true, firstName: true, middleName: true, lastName: true, designation: true, phone: true, onboardingToken: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 200,
        })
        const phones = Array.from(new Set(rows.map(r => r.phone).filter(Boolean) as string[]))
        const finished = phones.length ? new Set((await prisma.employee.findMany({
            where: { phone: { in: phones }, NOT: UNFINISHED_JOIN_WHERE }, select: { phone: true },
        })).map(e => e.phone)) : new Set<string | null>()
        const seen = new Set<string>()
        const list = []
        for (const r of rows) {
            const key = r.phone || r.id
            if (seen.has(key) || (r.phone && finished.has(r.phone))) continue
            seen.add(key)
            list.push({ ...r, policiesLeft: await joinPoliciesPending(r.id, r.designation).catch(() => null) })
        }
        return NextResponse.json(list)
    } catch (e) {
        console.error("[ONBOARDING_UNFINISHED]", e)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

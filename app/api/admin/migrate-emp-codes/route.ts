import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// One-time migration: convert legacy EXT-YYYYMMDD-XXXX employee codes to the
// standard EMP-NNNN format so every employee shares one consistent format.
//
// Only converts EXT- employees that are NOT pending onboarding (their onboarding
// is COMPLETED, or they have no incomplete onboarding record). Pending ones keep
// the "Pending" placeholder behaviour and get a real EMP-NNNN code on approval.
//
// ADMIN only. Idempotent — re-running finds nothing left to convert. Open this
// URL in the browser while logged in as ADMIN to run it.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Candidates: real (approved/active) employees still on an EXT- code.
        const targets = await prisma.employee.findMany({
            where: {
                employeeId: { startsWith: "EXT-" },
                NOT: { onboardingRecord: { is: { status: { not: "COMPLETED" } } } },
            },
            select: { id: true, employeeId: true },
            orderBy: { createdAt: "asc" },
        })

        if (targets.length === 0) {
            return NextResponse.json({ converted: 0, message: "No EXT- codes to convert." })
        }

        // Continue the EMP-NNNN sequence from the current maximum.
        const lastEmp = await prisma.employee.findFirst({
            where: { employeeId: { startsWith: "EMP-" } },
            orderBy: { employeeId: "desc" },
            select: { employeeId: true },
        })
        let nextNum = 1
        const m = lastEmp?.employeeId?.match(/\d+$/)
        if (m) nextNum = parseInt(m[0]) + 1

        const changes: { from: string; to: string }[] = []
        let failed = 0

        for (const emp of targets) {
            // Find a free EMP-NNNN code (guard against gaps / races).
            let code = ""
            for (let i = 0; i < 100; i++) {
                const candidate = `EMP-${String(nextNum).padStart(4, "0")}`
                nextNum++
                const exists = await prisma.employee.findUnique({
                    where: { employeeId: candidate },
                    select: { id: true },
                })
                if (!exists) { code = candidate; break }
            }
            if (!code) { failed++; continue }

            try {
                await prisma.employee.update({
                    where: { id: emp.id },
                    data: { employeeId: code },
                })
                changes.push({ from: emp.employeeId, to: code })
            } catch (err) {
                console.error("[MIGRATE_EMP_CODES] update failed", emp.id, err)
                failed++
            }
        }

        return NextResponse.json({ converted: changes.length, failed, changes })
    } catch (error) {
        console.error("[MIGRATE_EMP_CODES_ERROR]", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

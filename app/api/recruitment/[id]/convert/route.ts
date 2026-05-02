import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import crypto from "crypto"

// POST /api/recruitment/[id]/convert
// Converts a SELECTED/JOINED lead into a full Employee with salary + deployment
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: params.id } })
        if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
        if (lead.convertedEmployeeId) {
            // Already converted — return existing employee id
            return NextResponse.json({ alreadyConverted: true, employeeId: lead.convertedEmployeeId })
        }

        const body = await req.json()
        const {
            siteId, departmentId,
            basicSalary, da, washing, conveyance, leaveWithWages, otherAllowance,
            otRatePerHour, canteenRatePerDay, complianceType,
            dateOfJoining, employmentType, designation,
        } = body

        // ── Generate Employee ID ───────────────────────────────────────────────
        const allEmpIds = await prisma.employee.findMany({ select: { employeeId: true } })
            .then(r => new Set(r.map(e => e.employeeId)))
        const lastEmployee = await prisma.employee.findFirst({
            orderBy: { createdAt: "desc" }, select: { employeeId: true }
        })
        let nextNum = 1
        if (lastEmployee?.employeeId) {
            const m = lastEmployee.employeeId.match(/\d+$/)
            if (m) nextNum = parseInt(m[0]) + 1
        }
        let finalId = `EMP-${String(nextNum).padStart(4, "0")}`
        while (allEmpIds.has(finalId)) {
            nextNum++
            finalId = `EMP-${String(nextNum).padStart(4, "0")}`
        }

        // ── Split name ────────────────────────────────────────────────────────
        const nameParts = lead.candidateName.trim().split(/\s+/)
        const firstName = nameParts[0]
        const lastName  = nameParts.slice(1).join(" ") || ""

        // ── Create / reuse User account ───────────────────────────────────────
        const userEmail = lead.email || `${lead.phone}@cims.local`
        let userId: string
        const existingUser = await prisma.user.findUnique({ where: { email: userEmail } })
        if (existingUser) {
            userId = existingUser.id
        } else {
            const hash = await bcrypt.hash(lead.phone || "123456", 8)
            const newUser = await prisma.user.create({
                data: {
                    name: lead.candidateName,
                    email: userEmail,
                    password: hash,
                    role: "INSPECTION_BOY",
                }
            })
            userId = newUser.id
        }

        const onboardingToken = crypto.randomUUID().replace(/-/g, "")

        // ── Create Employee ───────────────────────────────────────────────────
        const employee = await prisma.employee.create({
            data: {
                employeeId:    finalId,
                firstName,
                lastName,
                phone:         lead.phone,
                email:         lead.email || null,
                city:          lead.city  || null,
                designation:   designation || lead.position || null,
                gender:        lead.gender || null,
                departmentId:  departmentId || null,
                dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
                status:        "ACTIVE",
                employmentType: employmentType || "Full-time",
                basicSalary:   basicSalary ? parseFloat(basicSalary) : 0,
                onboardingToken,
                userId,
            },
        })

        // ── Salary structure ──────────────────────────────────────────────────
        const basic = parseFloat(basicSalary || 0)
        const daAmt = parseFloat(da || 0)
        if (basic > 0) {
            const hra    = (basic + daAmt) * 0.05
            const wash   = parseFloat(washing || 0)
            const conv   = parseFloat(conveyance || 0)
            const lww    = parseFloat(leaveWithWages || 0)
            const other  = parseFloat(otherAllowance || 0)
            const ctcM   = basic + daAmt + hra + wash + conv + lww + other
            const cType  = String(complianceType || "OR").toUpperCase() === "CALL" ? "CALL" : "OR"
            await prisma.employeeSalary.create({
                data: {
                    employeeId:       employee.id,
                    basic, da: daAmt, washing: wash, conveyance: conv,
                    leaveWithWages:   lww,
                    otherAllowance:   other,
                    otRatePerHour:    parseFloat(otRatePerHour || 170),
                    canteenRatePerDay: parseFloat(canteenRatePerDay || 55),
                    hra, ctcMonthly: ctcM, ctcAnnual: ctcM * 12,
                    complianceType:   cType,
                    status:           "APPROVED",
                    proposedBy:       session.user.id,
                    approvedBy:       session.user.id,
                },
            })
        }

        // ── Site deployment ───────────────────────────────────────────────────
        const targetSiteId = siteId || lead.siteId
        if (targetSiteId) {
            await prisma.deployment.create({
                data: {
                    employeeId: employee.id,
                    siteId:     targetSiteId,
                    startDate:  dateOfJoining ? new Date(dateOfJoining) : new Date(),
                    isActive:   true,
                },
            })
        }

        // ── Mark lead as converted ────────────────────────────────────────────
        await prisma.lead.update({
            where: { id: params.id },
            data: {
                convertedEmployeeId: employee.id,
                status: "JOINED",
            },
        })

        // Activity log
        await prisma.leadActivity.create({
            data: {
                leadId:  params.id,
                userId:  session.user.id,
                type:    "status_change",
                content: `Lead converted to Employee (${finalId}). Employee account created and activated.`,
            },
        })

        return NextResponse.json({
            success: true,
            employeeId: employee.id,
            employeeCode: finalId,
            onboardingToken,
        })
    } catch (err) {
        console.error("[LEAD_CONVERT]", err)
        return NextResponse.json({ error: (err as Error).message || "Conversion failed" }, { status: 500 })
    }
}

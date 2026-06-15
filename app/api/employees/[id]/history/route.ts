import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import prisma from "@/lib/prisma"

// GET /api/employees/[id]/history
// Recruitment + lifecycle history for one employee:
//  - who recruited them (the source lead's creator) and which HR owned the lead
//  - when they entered recruitment, interview, and when they joined as employee
//  - the full lead activity timeline
// Most of this lives on the source Lead (linked via Lead.convertedEmployeeId);
// the employee itself only records createdAt + createdBy.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER", "ADMIN"], "employees.view")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    try {
        const employee = await prisma.employee.findUnique({
            where: { id: params.id },
            select: { id: true, firstName: true, lastName: true, createdAt: true, createdBy: true, dateOfJoining: true, status: true },
        })
        if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

        // Resolve who created the employee record (HR/admin).
        let createdByName: string | null = null
        if (employee.createdBy) {
            const u = await prisma.user.findUnique({ where: { id: employee.createdBy }, select: { name: true, email: true } })
            createdByName = u?.name || u?.email || null
        }

        // Onboarding: who handled it (assigned HR), falling back to whoever
        // actually completed the most recent task.
        const onboarding = await prisma.onboardingRecord.findUnique({
            where: { employeeId: params.id },
            select: {
                status: true, startedAt: true, completedAt: true, assignedTo: true,
                tasks: {
                    where: { completedBy: { not: null } },
                    orderBy: { completedAt: "desc" },
                    take: 1,
                    select: { completedBy: true },
                },
            },
        })
        let onboardedByName: string | null = null
        const onboarderId = onboarding?.assignedTo || onboarding?.tasks?.[0]?.completedBy || null
        if (onboarderId) {
            const u = await prisma.user.findUnique({ where: { id: onboarderId }, select: { name: true, email: true } })
            onboardedByName = u?.name || u?.email || null
        }

        // The source recruitment lead (if this employee came through recruitment).
        const lead = await prisma.lead.findFirst({
            where: { convertedEmployeeId: params.id },
            select: {
                id: true,
                candidateName: true,
                position: true,
                source: true,
                status: true,
                createdAt: true,
                interviewDate: true,
                interviewResult: true,
                creator: { select: { name: true, email: true } },
                assignee: { select: { name: true, email: true } },
                site: { select: { name: true } },
                activities: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true, type: true, content: true, createdAt: true,
                        user: { select: { name: true, email: true } },
                    },
                },
            },
        })

        const recruitment = lead
            ? {
                leadId: lead.id,
                candidateName: lead.candidateName,
                positionAppliedFor: lead.position,
                source: lead.source,
                recruitedBy: lead.creator?.name || lead.creator?.email || null,
                handledByHr: lead.assignee?.name || lead.assignee?.email || null,
                targetSite: lead.site?.name || null,
                enteredRecruitmentAt: lead.createdAt,
                interviewDate: lead.interviewDate,
                interviewResult: lead.interviewResult,
                leadStatus: lead.status,
                activities: lead.activities.map(a => ({
                    id: a.id,
                    type: a.type,
                    content: a.content,
                    at: a.createdAt,
                    by: a.user?.name || a.user?.email || null,
                })),
            }
            : null

        return NextResponse.json({
            employee: {
                id: employee.id,
                name: `${employee.firstName} ${employee.lastName || ""}`.trim(),
                status: employee.status,
                createdAt: employee.createdAt,
                createdByName,
                dateOfJoining: employee.dateOfJoining,
            },
            recruitment,
            onboarding: onboarding ? {
                onboardedByName,
                status: onboarding.status,
                startedAt: onboarding.startedAt,
                completedAt: onboarding.completedAt,
            } : null,
            cameThroughRecruitment: !!lead,
        })
    } catch (error) {
        console.error("GET_EMPLOYEE_HISTORY_ERROR", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

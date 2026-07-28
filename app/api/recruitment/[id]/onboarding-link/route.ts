import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import crypto from "crypto"

// The onboarding form link for a converted candidate.
//
// Converting a lead creates the Employee with an `onboardingToken`, but the
// token was never surfaced anywhere — so recruiters had no way to actually send
// the candidate their onboarding form. GET returns the existing link (minting a
// token if an older record lacks one); POST forces a fresh token, which
// invalidates any previously shared link.

function linkFor(token: string) {
    return `/onboarding/${token}`
}

async function resolveEmployee(leadId: string) {
    const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, candidateName: true, phone: true, convertedEmployeeId: true },
    })
    if (!lead) return { error: "Lead not found" as const, status: 404 }
    if (!lead.convertedEmployeeId) {
        return { error: "Candidate is not converted to an employee yet" as const, status: 400 }
    }
    const employee = await prisma.employee.findUnique({
        where: { id: lead.convertedEmployeeId },
        select: { id: true, employeeId: true, firstName: true, lastName: true, phone: true, onboardingToken: true },
    })
    if (!employee) return { error: "Employee record not found" as const, status: 404 }
    return { lead, employee }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "recruitment.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const resolved = await resolveEmployee(params.id)
        if ("error" in resolved) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status })
        }
        const { lead, employee } = resolved

        // Older converted records may predate token generation — mint one now so
        // the link always works.
        let token = employee.onboardingToken
        if (!token) {
            token = crypto.randomUUID().replace(/-/g, "")
            await prisma.employee.update({ where: { id: employee.id }, data: { onboardingToken: token } })
        }

        return NextResponse.json({
            path: linkFor(token),
            employeeId: employee.id,
            employeeCode: employee.employeeId,
            candidateName: lead.candidateName,
            phone: employee.phone || lead.phone || null,
        })
    } catch (error) {
        console.error("[RECRUITMENT_ONBOARDING_LINK_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "recruitment.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const resolved = await resolveEmployee(params.id)
        if ("error" in resolved) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status })
        }
        const { lead, employee } = resolved

        const token = crypto.randomUUID().replace(/-/g, "")
        await prisma.employee.update({ where: { id: employee.id }, data: { onboardingToken: token } })

        return NextResponse.json({
            path: linkFor(token),
            employeeId: employee.id,
            employeeCode: employee.employeeId,
            candidateName: lead.candidateName,
            phone: employee.phone || lead.phone || null,
        })
    } catch (error) {
        console.error("[RECRUITMENT_ONBOARDING_LINK_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

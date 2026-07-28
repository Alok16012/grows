import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import crypto from "crypto"

// The onboarding form link a recruiter sends to a candidate.
//
// The whole point is that the CANDIDATE fills their own details and documents —
// so the link must be available straight from the lead, without the recruiter
// first completing the long "Convert to Employee" form. If the lead has no
// employee record yet we create a minimal one here (PENDING-xxxx placeholder,
// status ONBOARDING, seeded from the lead) exactly like the public /join flow;
// the real EMP-NNNN code is assigned when onboarding is approved.
//
// GET  → the link (creating the record / minting a token as needed)
// POST → a fresh token, invalidating any previously shared link

function linkFor(token: string) {
    return `/onboarding/${token}`
}

type ResolveResult =
    | { error: string; status: number }
    | {
          lead: { id: string; candidateName: string; phone: string | null }
          employee: { id: string; employeeId: string; phone: string | null; onboardingToken: string | null }
      }

async function resolveEmployee(leadId: string, allowCreate: boolean): Promise<ResolveResult> {
    const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
            id: true, candidateName: true, phone: true, email: true, city: true,
            position: true, gender: true, profileUrl: true, convertedEmployeeId: true,
        },
    })
    if (!lead) return { error: "Lead not found", status: 404 }

    if (lead.convertedEmployeeId) {
        const employee = await prisma.employee.findUnique({
            where: { id: lead.convertedEmployeeId },
            select: { id: true, employeeId: true, phone: true, onboardingToken: true },
        })
        if (employee) return { lead, employee }
        // Fall through and recreate if the referenced employee is gone.
    }

    if (!allowCreate) return { error: "No onboarding record for this candidate yet", status: 400 }

    // Minimal placeholder employee so the candidate has something to fill in.
    const token = crypto.randomUUID().replace(/-/g, "")
    const nameParts = (lead.candidateName || "Candidate").trim().split(/\s+/)
    const firstName = nameParts[0] || "Candidate"
    const lastName = nameParts.slice(1).join(" ") || "-"

    const created = await prisma.employee.create({
        data: {
            employeeId: `PENDING-${token.slice(0, 10).toUpperCase()}`,
            firstName,
            lastName,
            phone: lead.phone || "0000000000",
            email: lead.email || null,
            city: lead.city || null,
            designation: lead.position || null,
            gender: lead.gender || null,
            photo: lead.profileUrl || null,
            status: "ONBOARDING",
            onboardingToken: token,
        },
        select: { id: true, employeeId: true, phone: true, onboardingToken: true },
    })

    await prisma.onboardingRecord.create({
        data: { employeeId: created.id, status: "IN_PROGRESS", notes: "Onboarding link sent from Recruitment" },
    }).catch(() => { /* non-fatal */ })

    await prisma.lead.update({
        where: { id: leadId },
        data: { convertedEmployeeId: created.id },
    }).catch(() => { /* non-fatal */ })

    return { lead, employee: created }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "recruitment.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Read-only: never create a record just because a drawer was opened.
        const resolved = await resolveEmployee(params.id, false)
        if ("error" in resolved) {
            return NextResponse.json({ exists: false }, { status: 200 })
        }
        const { lead, employee } = resolved

        if (!employee.onboardingToken) {
            return NextResponse.json({ exists: false }, { status: 200 })
        }

        return NextResponse.json({
            exists: true,
            path: linkFor(employee.onboardingToken),
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

// POST → generate the link. Creates the placeholder employee record if this
// lead doesn't have one yet, so a recruiter can send the form straight from the
// candidate without filling the Convert form first. Pass { regenerate: true }
// to force a new token (invalidates the previously shared link).
export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "recruitment.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json().catch(() => ({} as { regenerate?: boolean }))
        const regenerate = body?.regenerate === true

        const resolved = await resolveEmployee(params.id, true)
        if ("error" in resolved) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status })
        }
        const { lead, employee } = resolved

        let token = employee.onboardingToken
        if (!token || regenerate) {
            token = crypto.randomUUID().replace(/-/g, "")
            await prisma.employee.update({ where: { id: employee.id }, data: { onboardingToken: token } })
        }

        return NextResponse.json({
            exists: true,
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

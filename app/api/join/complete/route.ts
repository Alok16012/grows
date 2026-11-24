import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { completeJoinForm } from "@/lib/join-server"

// Public route — the onboarding token is the applicant's credential.
// POST /api/join/complete { token } — the join form's final Submit. The form is
// submitted (reaches HR in Onboarding) only when every required document is on
// file and every joining policy is signed; otherwise says what is still missing.
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}))
        const token = typeof body?.token === "string" ? body.token.trim() : ""
        if (!/^[a-f0-9]{32}$/i.test(token)) return NextResponse.json({ error: "Invalid link" }, { status: 400 })
        const emp = await prisma.employee.findUnique({ where: { onboardingToken: token }, select: { id: true } })
        if (!emp) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 })
        const r = await completeJoinForm(emp.id)
        if (!r.ok) {
            const parts = [
                ...(r.missingDocs.length ? [`upload ${r.missingDocs.join(", ")}`] : []),
                ...(r.policiesLeft ? [`sign ${r.policiesLeft} more polic${r.policiesLeft === 1 ? "y" : "ies"}`] : []),
            ]
            return NextResponse.json({ error: `Not submitted yet — please ${parts.join(" and ") || "complete the form"}.`, ...r }, { status: 400 })
        }
        return NextResponse.json({ ok: true })
    } catch (e) {
        console.error("[JOIN_COMPLETE_POST]", e)
        return NextResponse.json({ error: "Could not submit. Please try again." }, { status: 500 })
    }
}

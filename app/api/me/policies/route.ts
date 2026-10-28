import { NextResponse } from "next/server"
import { policyErrorResponse, scopeFrom, signoffReady, statusFor } from "@/lib/policy-signoff"
import { sessionSigner } from "./_signer"

// GET ?scope=onboarding — the policies I must sign for my designation, with
// progress. Self-onboarding asks for the Onboarding category only; My Policies
// asks for everything.
export async function GET(req: Request) {
    try {
        const { emp } = await sessionSigner(req)
        if (!(await signoffReady())) return NextResponse.json({ ready: false, policies: [] })
        const policies = await statusFor(emp.id, emp.designation, scopeFrom(new URL(req.url).searchParams.get("scope")))
        return NextResponse.json({
            ready: true,
            designation: emp.designation,
            signerName: `${emp.firstName} ${emp.lastName}`.trim(),
            pending: policies.filter(p => p.status !== "SIGNED").length,
            policies,
        })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_ME_LIST]")
    }
}

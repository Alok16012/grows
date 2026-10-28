import { NextResponse } from "next/server"
import { policyErrorResponse, signoffReady, statusFor } from "@/lib/policy-signoff"
import { tokenSigner, designationFrom } from "./_signer"

// GET ?designation= — the Onboarding-category policies this joiner must sign
// while joining, with progress. Other categories wait for My Policies.
export async function GET(req: Request, { params }: { params: { token: string } }) {
    try {
        const emp = await tokenSigner(params.token)
        if (!(await signoffReady())) return NextResponse.json({ ready: false, policies: [] })
        const designation = designationFrom(new URL(req.url).searchParams.get("designation"), emp.designation)
        const policies = await statusFor(emp.id, designation, "onboarding")
        return NextResponse.json({
            ready: true,
            designation,
            signerName: `${emp.firstName} ${emp.lastName}`.trim(),
            policies,
        })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_TOKEN_LIST]")
    }
}

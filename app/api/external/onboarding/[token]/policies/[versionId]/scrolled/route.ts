import { NextResponse } from "next/server"
import { evidenceFrom, policyErrorResponse, recordScrolled } from "@/lib/policy-signoff"
import { tokenSigner, designationFrom } from "../../_signer"

// POST { designation } — the reader reached the end of this version.
export async function POST(req: Request, { params }: { params: { token: string; versionId: string } }) {
    try {
        const emp = await tokenSigner(params.token)
        const body = await req.json().catch(() => ({}))
        const ack = await recordScrolled(emp, designationFrom(body?.designation, emp.designation), params.versionId,
            evidenceFrom(req, "ONBOARDING_LINK", null))
        return NextResponse.json({ scrolledAt: ack.scrolledAt })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_TOKEN_SCROLLED]")
    }
}

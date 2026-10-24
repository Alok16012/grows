import { NextResponse } from "next/server"
import { evidenceFrom, policyErrorResponse, recordScrolled } from "@/lib/policy-signoff"
import { sessionSigner } from "../../_signer"

export async function POST(req: Request, { params }: { params: { versionId: string } }) {
    try {
        const { emp, userId } = await sessionSigner(req)
        const ack = await recordScrolled(emp, emp.designation, params.versionId, evidenceFrom(req, "SELF_SERVICE", userId))
        return NextResponse.json({ scrolledAt: ack.scrolledAt })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_ME_SCROLLED]")
    }
}

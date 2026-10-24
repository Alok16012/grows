import { NextResponse } from "next/server"
import { evidenceFrom, policyErrorResponse, signPolicy } from "@/lib/policy-signoff"
import { sessionSigner } from "../../_signer"

export async function POST(req: Request, { params }: { params: { versionId: string } }) {
    try {
        const { emp, userId } = await sessionSigner(req)
        const body = await req.json().catch(() => ({}))
        const { ack, contentHash, created } = await signPolicy(emp, emp.designation, params.versionId, body,
            evidenceFrom(req, "SELF_SERVICE", userId))
        return NextResponse.json({
            acknowledgementId: ack.id, versionId: ack.versionId, signedAt: ack.signedAt, contentHash,
        }, { status: created ? 201 : 200 })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_ME_SIGN]")
    }
}

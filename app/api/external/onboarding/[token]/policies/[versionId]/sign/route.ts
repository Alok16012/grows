import { NextResponse } from "next/server"
import { evidenceFrom, policyErrorResponse, signPolicy } from "@/lib/policy-signoff"
import { tokenSigner, designationFrom } from "../../_signer"

// POST { designation, agreed, typedName, signatureImage? } — sign this version.
export async function POST(req: Request, { params }: { params: { token: string; versionId: string } }) {
    try {
        const emp = await tokenSigner(params.token)
        const body = await req.json().catch(() => ({}))
        const { ack, contentHash, created } = await signPolicy(emp, designationFrom(body?.designation, emp.designation),
            params.versionId, body, evidenceFrom(req, "ONBOARDING_LINK", null))
        return NextResponse.json({
            acknowledgementId: ack.id, versionId: ack.versionId, signedAt: ack.signedAt, contentHash,
        }, { status: created ? 201 : 200 })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_TOKEN_SIGN]")
    }
}

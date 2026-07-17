import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { ensureHrDocRecallSchema, getUserSignature, setUserSignature } from "@/lib/hr-doc-schema"

// The sender's personal signature image, embedded on documents they issue.
// Each user manages ONLY their own signature — saved once ("locked") and then
// applied automatically to every document they send.

// Small PNG/JPEG only. ~200 KB of binary ≈ ~280 K base64 chars.
const DATA_URL_RE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/
const MAX_DATA_URL_LENGTH = 280_000

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 })

    await ensureHrDocRecallSchema()
    const signature = await getUserSignature(session.user.id)
    return NextResponse.json({ signature })
}

export async function PUT(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 })

    let body: { signature?: string } = {}
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const signature = (body.signature || "").trim()
    if (!signature || !DATA_URL_RE.test(signature)) {
        return NextResponse.json({ error: "Signature must be a PNG or JPEG image" }, { status: 400 })
    }
    if (signature.length > MAX_DATA_URL_LENGTH) {
        return NextResponse.json({ error: "Signature image is too large — keep it under 200 KB" }, { status: 400 })
    }

    try {
        await ensureHrDocRecallSchema()
        await setUserSignature(session.user.id, signature)
        return NextResponse.json({ success: true })
    } catch (e) {
        console.error("[ME_SIGNATURE_PUT]", e)
        return NextResponse.json({ error: "Could not save signature" }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 })

    try {
        await ensureHrDocRecallSchema()
        await setUserSignature(session.user.id, null)
        return NextResponse.json({ success: true })
    } catch (e) {
        console.error("[ME_SIGNATURE_DELETE]", e)
        return NextResponse.json({ error: "Could not remove signature" }, { status: 500 })
    }
}

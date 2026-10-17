import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { computeSettlement, getFnfRecord, saveFnfRecord, type FnfAdjustment } from "@/lib/exit-settlement"

// GET — the worked-out F&F for this exit.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "exit.view")) return new NextResponse("Forbidden", { status: 403 })
    try {
        const s = await computeSettlement(params.id)
        if (!s) return new NextResponse("Not Found", { status: 404 })
        return NextResponse.json(s)
    } catch (error) {
        console.error("[EXIT_SETTLEMENT_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

// PUT — HR's manual lines, excluded auto lines and payment details.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "exit.manage")) return new NextResponse("Forbidden", { status: 403 })
    try {
        const body = await req.json()
        const prev = await getFnfRecord(params.id)
        const adjustments: FnfAdjustment[] = Array.isArray(body.adjustments)
            ? body.adjustments
                .filter((a: any) => a && String(a.label || "").trim() && Number(a.amount) > 0)
                .slice(0, 30)
                .map((a: any) => ({ label: String(a.label).trim().slice(0, 80), amount: Number(a.amount), kind: a.kind === "deduction" ? "deduction" : "earning" }))
            : prev.adjustments
        await saveFnfRecord(params.id, {
            adjustments,
            excluded: Array.isArray(body.excluded) ? body.excluded.filter((x: unknown) => typeof x === "string").slice(0, 30) : prev.excluded,
            paymentMode: typeof body.paymentMode === "string" ? body.paymentMode.slice(0, 30) : prev.paymentMode,
            reference: typeof body.reference === "string" ? body.reference.slice(0, 80) : prev.reference,
        }, session!.user.id)
        return NextResponse.json(await computeSettlement(params.id))
    } catch (error) {
        console.error("[EXIT_SETTLEMENT_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

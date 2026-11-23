import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { renderInspectionReport } from "@/lib/inspection-report-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — the approved report as the PDF customers receive (preview / download).
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, ["approvals.view", "approvals.manage", "assignments.edit"])
    if (g instanceof NextResponse) return g
    const r = await renderInspectionReport(params.id)
    if (!r) return new NextResponse("Only approved inspections have a report PDF.", { status: 404 })
    return new NextResponse(new Uint8Array(r.content), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.filename}"`, "Cache-Control": "private, no-store" },
    })
}

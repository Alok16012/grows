import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { autoLinkDefects, parseDefect, clashWith, QUALITY_MANAGE } from "@/lib/defect-library"

export const dynamic = "force-dynamic"

// PATCH — edit a library defect (name, severity, category, photo, aliases, active).
// Switching one off keeps existing links (history) but stops new auto-links.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, QUALITY_MANAGE)
    if (g instanceof NextResponse) return g
    try {
        const before = await prisma.defectType.findUnique({ where: { id: params.id } })
        if (!before) return NextResponse.json({ error: "Defect not found" }, { status: 404 })
        const data = parseDefect(await req.json().catch(() => ({})), true)
        const names = [data.name ?? before.name, ...(data.aliases ?? before.aliases)]
        if ((data.isActive ?? before.isActive) && (data.name || data.aliases || data.isActive)) {
            const clash = await clashWith(names, before.id)
            if (clash) return NextResponse.json({ error: `That name is already used by ${clash}` }, { status: 409 })
        }
        const defect = await prisma.defectType.update({ where: { id: before.id }, data })
        const linked = await autoLinkDefects()
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "quality.defect_edit", targetType: "DefectType", targetId: defect.id, targetName: `${defect.code} ${defect.name}`, summary: "Library defect edited", before, after: defect, ...requestMeta(req) })
        return NextResponse.json({ defect, linked })
    } catch (e: any) {
        if (e instanceof Error && !("code" in e)) return NextResponse.json({ error: e.message }, { status: 400 })
        console.error("[QUALITY_DEFECT_PATCH]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}

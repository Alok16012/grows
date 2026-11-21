import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { defectKey, normLabel, nextDefectCode, libraryIndex, parseDefect, clashWith, QUALITY_VIEW, QUALITY_MANAGE } from "@/lib/defect-library"

export const dynamic = "force-dynamic"

// GET — every defect spelling used in project forms, grouped by matching key
// (so "SCRATCH MARK" and "SCRATCH MARKS" are one row), with projects, total
// pieces recorded, what it's linked to and a suggested library defect.
export async function GET(req: Request) {
    const g = await guard(req, QUALITY_VIEW)
    if (g instanceof NextResponse) return g
    try {
        const fields = await prisma.formTemplate.findMany({
            where: { category: "DEFECT" },
            select: { id: true, fieldLabel: true, projectId: true, defectTypeId: true },
        })
        const qtyRows: { fieldId: string; qty: number }[] = await prisma.$queryRawUnsafe(`
            SELECT d."fieldId", COALESCE(SUM(CASE WHEN d.value ~ '^[0-9]+(\\.[0-9]+)?$' THEN d.value::numeric ELSE 0 END), 0)::float AS qty
            FROM "InspectionData" d JOIN "FormTemplate" f ON f.id = d."fieldId"
            WHERE f.category = 'DEFECT' GROUP BY d."fieldId"`)
        const qtyOf = new Map(qtyRows.map(r => [r.fieldId, Number(r.qty) || 0]))
        const idx = await libraryIndex()

        type Row = { key: string; label: string; variants: Map<string, number>; projects: Set<string>; fields: number; qty: number; linked: Map<string, number> }
        const rows = new Map<string, Row>()
        for (const f of fields) {
            const key = defectKey(f.fieldLabel)
            if (!key) continue
            const r = rows.get(key) ?? { key, label: "", variants: new Map(), projects: new Set(), fields: 0, qty: 0, linked: new Map() }
            const v = normLabel(f.fieldLabel)
            r.variants.set(v, (r.variants.get(v) ?? 0) + 1)
            r.projects.add(f.projectId)
            r.fields++
            r.qty += qtyOf.get(f.id) ?? 0
            const l = f.defectTypeId ?? ""
            r.linked.set(l, (r.linked.get(l) ?? 0) + 1)
            rows.set(key, r)
        }
        const out = Array.from(rows.values()).map(r => {
            const variants = Array.from(r.variants.entries()).sort((a, b) => b[1] - a[1]).map(([v]) => v)
            const linkedIds = Array.from(r.linked.keys()).filter(Boolean)
            const unlinked = r.linked.get("") ?? 0
            return {
                key: r.key, label: variants[0], variants, projects: r.projects.size, fields: r.fields, qty: Math.round(r.qty),
                linkedTo: linkedIds.length === 1 && unlinked === 0 ? linkedIds[0] : null,
                partlyLinked: linkedIds.length > 0 && (unlinked > 0 || linkedIds.length > 1),
                suggestion: idx.get(r.key) ?? null,
            }
        }).sort((a, b) => b.qty - a.qty || b.projects - a.projects)
        return NextResponse.json({ rows: out, totalFields: fields.length, linkedFields: fields.filter(f => f.defectTypeId).length })
    } catch (e) {
        console.error("[QUALITY_MAPPING_GET]", e)
        return NextResponse.json({ error: "Could not load defect spellings" }, { status: 500 })
    }
}

// POST { keys: string[], defectTypeId } | { keys, create: { name, severity, category } } | { keys, unlink: true }
// Links every project defect column with one of these spellings to a library
// defect (adding the spellings as aliases so new columns link by themselves).
export async function POST(req: Request) {
    const g = await guard(req, QUALITY_MANAGE)
    if (g instanceof NextResponse) return g
    try {
        const b = await req.json().catch(() => ({}))
        const keys = new Set<string>((Array.isArray(b?.keys) ? b.keys : []).map((k: unknown) => String(k)).filter(Boolean))
        if (!keys.size) return NextResponse.json({ error: "Pick at least one defect spelling" }, { status: 400 })
        const fields = (await prisma.formTemplate.findMany({ where: { category: "DEFECT" }, select: { id: true, fieldLabel: true } }))
            .filter(f => keys.has(defectKey(f.fieldLabel)))
        if (!fields.length) return NextResponse.json({ error: "No defect columns use those spellings" }, { status: 400 })
        const spellings = Array.from(new Set(fields.map(f => normLabel(f.fieldLabel))))

        if (b?.unlink) {
            const r = await prisma.formTemplate.updateMany({ where: { id: { in: fields.map(f => f.id) } }, data: { defectTypeId: null } })
            // Drop the spellings from every alias list so they don't re-link.
            const lib = await prisma.defectType.findMany({ select: { id: true, aliases: true } })
            for (const d of lib) {
                const next = d.aliases.filter(a => !keys.has(defectKey(a)))
                if (next.length !== d.aliases.length) await prisma.defectType.update({ where: { id: d.id }, data: { aliases: next } })
            }
            return NextResponse.json({ ok: true, unlinked: r.count })
        }

        let target = typeof b?.defectTypeId === "string" ? await prisma.defectType.findUnique({ where: { id: b.defectTypeId } }) : null
        if (!target && b?.create) {
            const data = parseDefect(b.create, false)
            const clash = await clashWith([data.name!])
            if (clash) return NextResponse.json({ error: `That name is already used by ${clash}` }, { status: 409 })
            target = await prisma.defectType.create({ data: { ...data, name: data.name!, code: await nextDefectCode(), createdBy: g.access.userId } })
        }
        if (!target) return NextResponse.json({ error: "Pick a library defect or create one" }, { status: 400 })

        // Spellings already claimed by another defect move to this one.
        const others = await prisma.defectType.findMany({ where: { id: { not: target.id } }, select: { id: true, aliases: true } })
        for (const d of others) {
            const next = d.aliases.filter(a => !keys.has(defectKey(a)))
            if (next.length !== d.aliases.length) await prisma.defectType.update({ where: { id: d.id }, data: { aliases: next } })
        }
        const aliases = Array.from(new Set([...target.aliases, ...spellings.filter(s => defectKey(s) !== defectKey(target!.name))]))
        await prisma.defectType.update({ where: { id: target.id }, data: { aliases } })
        const r = await prisma.formTemplate.updateMany({ where: { id: { in: fields.map(f => f.id) } }, data: { defectTypeId: target.id } })
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "quality.defect_map", targetType: "DefectType", targetId: target.id, targetName: `${target.code} ${target.name}`, summary: `Linked ${r.count} project defect columns (${spellings.slice(0, 5).join(", ")}${spellings.length > 5 ? "…" : ""})`, ...requestMeta(req) })
        return NextResponse.json({ ok: true, linked: r.count, defect: target })
    } catch (e: any) {
        if (e instanceof Error && !("code" in e)) return NextResponse.json({ error: e.message }, { status: 400 })
        console.error("[QUALITY_MAPPING_POST]", e)
        return NextResponse.json({ error: "Could not save" }, { status: 500 })
    }
}

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { signRefs } from "@/lib/secure-files"
import { visibleLevels, canUpload, canEdit, canDelete } from "@/lib/company-profile-server"
import { VISIBILITY, type Visibility } from "@/lib/company-profile"

export const dynamic = "force-dynamic"

const vis = (v: unknown): Visibility => typeof v === "string" && v in VISIBILITY ? v as Visibility : "STAFF"
const date = (v: unknown) => { if (!v) return null; const d = new Date(`${String(v).slice(0, 10)}T12:00:00+05:30`); return isNaN(d.getTime()) ? null : d }
const okUrl = (u: unknown) => typeof u === "string" && (/^sb:\/\//.test(u) || /^https:\/\/[\w.-]+\.supabase\.co\//.test(u))

// GET ?archived=1 — documents this person may see (current versions; ?history=<id> for a document's older versions). Links are signed.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const levels = visibleLevels(g.access)
    const history = sp.get("history")
    if (history) {
        const list: any[] = []
        let id: string | null = history
        for (let i = 0; i < 30 && id; i++) {
            const d: any = await prisma.companyDocument.findUnique({ where: { id } })
            if (!d || !levels.includes(d.visibility as Visibility)) break
            list.push(d); id = d.replacesId
        }
        return NextResponse.json(await signRefs({ versions: list }))
    }
    // Current = not replaced by a newer version.
    const all = await prisma.companyDocument.findMany({ where: { visibility: { in: levels }, ...(sp.get("archived") === "1" ? {} : { isArchived: false }) }, orderBy: [{ category: "asc" }, { title: "asc" }] })
    const replaced = new Set(all.map(d => d.replacesId).filter(Boolean))
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(all.map(d => d.uploadedBy))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const docs = all.filter(d => !replaced.has(d.id)).map(d => ({ ...d, uploadedByName: nameOf.get(d.uploadedBy) ?? null }))
    return NextResponse.json(await signRefs({ documents: docs }))
}

// POST { category, title, docNumber?, issuedOn?, expiresOn?, fileUrl, fileName, notes?, visibility?, replacesId? } — upload (or a new version)
// PUT  { id, ...fields } — edit details / archive (isArchived) ; DELETE ?id= — remove (company.delete)
export async function POST(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUpload(g.access)) return NextResponse.json({ error: "Needs Create on Company profile" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const title = String(b?.title ?? "").trim().slice(0, 150), category = String(b?.category ?? "").trim().slice(0, 80)
    if (!title || !category) return NextResponse.json({ error: "Enter the document name and category" }, { status: 400 })
    if (!okUrl(b?.fileUrl)) return NextResponse.json({ error: "Upload the file first" }, { status: 400 })
    const visibility = vis(b?.visibility)
    if (visibility === "RESTRICTED" && !canEdit(g.access)) return NextResponse.json({ error: "Only editors can file restricted documents" }, { status: 403 })
    let version = 1, replacesId: string | null = null
    if (b?.replacesId) {
        const prev = await prisma.companyDocument.findUnique({ where: { id: String(b.replacesId) } })
        if (!prev) return NextResponse.json({ error: "Document to replace not found" }, { status: 404 })
        version = prev.version + 1; replacesId = prev.id
    }
    const d = await prisma.companyDocument.create({ data: { category, title, docNumber: b?.docNumber ? String(b.docNumber).trim().slice(0, 80) : null, issuedOn: date(b?.issuedOn), expiresOn: date(b?.expiresOn), fileUrl: b.fileUrl, fileName: String(b?.fileName ?? "file").slice(0, 200), notes: b?.notes ? String(b.notes).slice(0, 1000) : null, visibility, version, replacesId, uploadedBy: g.access.userId } })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: replacesId ? "company.document_version" : "company.document_upload", targetType: "CompanyDocument", targetId: d.id, targetName: title, summary: `${replacesId ? `New version (v${version}) of` : "Uploaded"} ${title} · ${category}`, ...requestMeta(req) })
    return NextResponse.json({ document: d })
}

export async function PUT(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canEdit(g.access)) return NextResponse.json({ error: "Needs Edit on Company profile" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const d = await prisma.companyDocument.findUnique({ where: { id: String(b?.id ?? "") } })
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const data: any = {}
    if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim().slice(0, 150)
    if (typeof b.category === "string" && b.category.trim()) data.category = b.category.trim().slice(0, 80)
    if (b.docNumber !== undefined) data.docNumber = b.docNumber ? String(b.docNumber).trim().slice(0, 80) : null
    if (b.issuedOn !== undefined) data.issuedOn = date(b.issuedOn)
    if (b.expiresOn !== undefined) data.expiresOn = date(b.expiresOn)
    if (b.notes !== undefined) data.notes = b.notes ? String(b.notes).slice(0, 1000) : null
    if (b.visibility !== undefined) data.visibility = vis(b.visibility)
    if (typeof b.isArchived === "boolean") data.isArchived = b.isArchived
    const u = await prisma.companyDocument.update({ where: { id: d.id }, data })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: data.isArchived === true ? "company.document_archive" : "company.document_edit", targetType: "CompanyDocument", targetId: d.id, targetName: d.title, summary: `${data.isArchived === true ? "Archived" : data.isArchived === false ? "Restored" : "Edited"} ${d.title}`, before: d, after: data, ...requestMeta(req) })
    return NextResponse.json({ document: u })
}

export async function DELETE(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canDelete(g.access)) return NextResponse.json({ error: "Needs Delete on Company profile" }, { status: 403 })
    const id = new URL(req.url).searchParams.get("id") ?? ""
    const d = await prisma.companyDocument.findUnique({ where: { id } })
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await prisma.companyDocument.delete({ where: { id } })
    // A newer version pointing at this one now starts the chain.
    await prisma.companyDocument.updateMany({ where: { replacesId: id }, data: { replacesId: d.replacesId } })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "company.document_delete", targetType: "CompanyDocument", targetId: id, targetName: d.title, summary: `Deleted ${d.title} (v${d.version})`, before: d, ...requestMeta(req) })
    return NextResponse.json({ ok: true })
}

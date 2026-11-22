import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { auditLater, requestMeta } from "@/lib/access"
import { duplicateGroups, mergeDuplicates, nameFixes, applyNameFixes, canApprove } from "@/lib/recruitment-server"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const allowed = (s: any) => s && (s.user.role === "ADMIN" || canApprove(s))

// GET — duplicate groups (same mobile) and spellings to tidy. Nothing changes.
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!allowed(s)) return NextResponse.json({ error: "Needs Recruitment → Approve" }, { status: 403 })
    const [groups, names] = await Promise.all([duplicateGroups(), nameFixes()])
    return NextResponse.json({ groups, names })
}

// POST { what: "duplicates", phones?: string[] } | { what: "names" }
export async function POST(req: Request) {
    const s = await getApiSession(req)
    if (!allowed(s)) return NextResponse.json({ error: "Needs Recruitment → Approve" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    try {
        if (b?.what === "duplicates") {
            const r = await mergeDuplicates(s!.user.id, Array.isArray(b.phones) ? b.phones.map(String) : undefined)
            auditLater({ actorId: s!.user.id, actorName: s!.user.name ?? null, action: "recruitment.merge", targetType: "Lead", targetId: null, targetName: "Duplicate candidates", summary: `Merged ${r.groups} group(s); ${r.removed} duplicate record(s) folded in (copies in LeadMergeLog)`, ...requestMeta(req) })
            return NextResponse.json(r)
        }
        if (b?.what === "names") {
            const r = await applyNameFixes()
            auditLater({ actorId: s!.user.id, actorName: s!.user.name ?? null, action: "recruitment.names", targetType: "Lead", targetId: null, targetName: "Position / source names", summary: `Tidied ${r.updated} candidate record(s)`, ...requestMeta(req) })
            return NextResponse.json(r)
        }
        return NextResponse.json({ error: "What should be cleaned?" }, { status: 400 })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not clean" }, { status: 400 }) }
}

import { NextResponse } from "next/server"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { getProfile, saveProfile, getCompanySettings, saveCompanySettings, profileFor, canView, canEdit, canUpload, canDelete } from "@/lib/company-profile-server"

export const dynamic = "force-dynamic"

// GET — the company profile as this person may see it, plus settings and what they can do.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const [p, s] = await Promise.all([getProfile(), getCompanySettings()])
    return NextResponse.json({ profile: profileFor(p, g.access), settings: s, can: { view: canView(g.access), edit: canEdit(g.access), upload: canUpload(g.access), delete: canDelete(g.access) } })
}

// PUT { profile?, settings? } — company.edit.
export async function PUT(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canEdit(g.access)) return NextResponse.json({ error: "Needs Edit on Company profile" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const out: any = {}
    if (b?.profile) {
        const before = await getProfile()
        out.profile = await saveProfile(b.profile, g.access.userId)
        const changed = Object.keys(out.profile).filter(k => JSON.stringify((out.profile as any)[k]) !== JSON.stringify((before as any)[k]))
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "company.profile", targetType: "Setting", targetId: "companyProfile", targetName: "Company profile", summary: `Company profile updated${changed.length ? `: ${changed.join(", ")}` : ""}`, ...requestMeta(req) })
    }
    if (b?.settings) {
        out.settings = await saveCompanySettings(b.settings, g.access.userId)
        auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "company.settings", targetType: "Setting", targetId: "companyProfileSettings", targetName: "Company documents settings", summary: `${out.settings.categories.length} categories; expiry reminder ${out.settings.expiryRemindDays} days`, ...requestMeta(req) })
    }
    return NextResponse.json(out)
}

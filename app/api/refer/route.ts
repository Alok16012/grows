import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"
import { auditLater, requestMeta } from "@/lib/access"
import { getReferralSettings, saveReferralSettings, openJobs, refer, myReferrals, allReferrals } from "@/lib/referrals"

export const dynamic = "force-dynamic"

const hr = (s: any) => checkAccess(s, [], "recruitment.view") || checkAccess(s, [], "jobs.view")
const boss = (s: any) => s?.user?.role === "ADMIN" || checkAccess(s, [], "recruitment.approve") || checkAccess(s, [], "jobs.manage")

// GET — open jobs to refer for, my referrals, settings; HR also gets every referral + leaderboard.
export async function GET(req: Request) {
    const s = await getApiSession(req)
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const settings = await getReferralSettings()
    const [jobs, mine, all] = await Promise.all([
        settings.enabled ? openJobs() : Promise.resolve([]),
        myReferrals(s.user.id),
        hr(s) ? allReferrals() : Promise.resolve(null),
    ])
    return NextResponse.json({ settings, jobs, mine, all, me: s.user.id, canEditSettings: boss(s) })
}

// POST { jobId, name, phone, city?, experience?, note?, resumeUrl? } — refer someone yourself.
export async function POST(req: Request) {
    const s = await getApiSession(req)
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await getReferralSettings()).enabled) return NextResponse.json({ error: "Referrals are switched off" }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    try {
        const r = await refer({ ...b, jobId: String(b?.jobId ?? ""), referrerId: s.user.id, viaLink: false })
        auditLater({ actorId: s.user.id, actorName: s.user.name ?? null, action: "referral.create", targetType: "Lead", targetId: r.id, targetName: String(b?.name ?? "").slice(0, 100), summary: r.existing ? "Referred someone already in the pipeline" : "New referral", ...requestMeta(req) })
        return NextResponse.json(r)
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}

// PUT — referral settings (Admin, Recruitment → Approve or Jobs → Edit).
export async function PUT(req: Request) {
    const s = await getApiSession(req)
    if (!s || !boss(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const v = await saveReferralSettings(await req.json().catch(() => ({})), s.user.id)
    auditLater({ actorId: s.user.id, actorName: s.user.name ?? null, action: "referral.settings", targetType: "Setting", targetId: "referralSettings", targetName: "Referral settings", summary: `Referrals ${v.enabled ? "on" : "off"}; bonus ₹${v.bonusAmount} after ${v.bonusAfterDays} days; links ${v.publicLinks ? "on" : "off"}`, after: v, ...requestMeta(req) })
    return NextResponse.json({ settings: v })
}

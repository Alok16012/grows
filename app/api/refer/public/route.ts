import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getReferralSettings, publicJob, refer } from "@/lib/referrals"
import { COMPANY } from "@/lib/company"

export const dynamic = "force-dynamic"

// Public (no sign-in): the job a shared link points at, and who shared it (first name only).
export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams
    const s = await getReferralSettings()
    if (!s.enabled || !s.publicLinks) return NextResponse.json({ error: "This link is not active." }, { status: 404 })
    const job = await publicJob(String(sp.get("job") ?? ""))
    if (!job) return NextResponse.json({ error: "This job is no longer open." }, { status: 404 })
    const ref = sp.get("ref") ? await prisma.user.findFirst({ where: { id: String(sp.get("ref")), isActive: true }, select: { name: true } }).catch(() => null) : null
    return NextResponse.json({ job, company: COMPANY.name, referrer: ref?.name ? ref.name.split(" ")[0] : null })
}

// Public: the friend sends their details. A filled hidden field ("website") means a bot.
export async function POST(req: Request) {
    const s = await getReferralSettings()
    if (!s.enabled || !s.publicLinks) return NextResponse.json({ error: "This link is not active." }, { status: 404 })
    const b = await req.json().catch(() => ({}))
    if (b?.website) return NextResponse.json({ ok: true })
    try {
        await refer({ jobId: String(b?.jobId ?? ""), referrerId: typeof b?.ref === "string" && b.ref ? b.ref : null, name: b?.name, phone: b?.phone, city: b?.city, experience: b?.experience, note: b?.note, viaLink: true })
        return NextResponse.json({ ok: true })
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not send" }, { status: 400 }) }
}

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { auditLater, requestMeta } from "@/lib/access"
import { makeOffer, getRecSettings, canManage, canView } from "@/lib/recruitment-server"
import { fillOffer } from "@/lib/recruitment"
import { COMPANY } from "@/lib/company"

export const dynamic = "force-dynamic"

async function view(req: Request, id: string) {
    const l = await prisma.lead.findUnique({ where: { id }, select: { id: true, candidateName: true, phone: true, position: true, offerToken: true, offeredSalary: true, offerDesignation: true, offerJoiningDate: true, offeredAt: true, siteId: true, convertedEmployeeId: true, site: { select: { name: true } } } })
    if (!l) return null
    const origin = new URL(req.url).origin
    const link = l.offerToken ? `${origin}/join?o=${l.offerToken}` : null
    const s = await getRecSettings()
    const date = l.offerJoiningDate ? l.offerJoiningDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null
    const message = link ? fillOffer(s.offerMessage, { name: l.candidateName.split(" ")[0], designation: l.offerDesignation || l.position, site: l.site?.name, salary: l.offeredSalary, date, link, company: COMPANY.name }) : null
    return { offer: { salary: l.offeredSalary, designation: l.offerDesignation, joiningDate: l.offerJoiningDate, offeredAt: l.offeredAt, siteId: l.siteId, joined: !!l.convertedEmployeeId }, link, message, phone: l.phone }
}

// GET — the candidate's offer, personal join link and the ready-to-send message.
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const s = await getApiSession(req)
    if (!s || !canView(s)) return NextResponse.json({ error: "No access" }, { status: 403 })
    const v = await view(req, params.id)
    return v ? NextResponse.json(v) : NextResponse.json({ error: "Not found" }, { status: 404 })
}

// POST { salary, designation, joiningDate, siteId } — make / update the offer (status → Offered).
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const s = await getApiSession(req)
    if (!s || !canManage(s)) return NextResponse.json({ error: "Needs Recruitment → Edit" }, { status: 403 })
    try {
        const u = await makeOffer(s, params.id, await req.json().catch(() => ({})))
        auditLater({ actorId: s.user.id, actorName: s.user.name ?? null, action: "recruitment.offer", targetType: "Lead", targetId: u.id, targetName: u.candidateName, summary: `Offer: ${u.offerDesignation}, ₹${u.offeredSalary ?? "—"}, joining ${u.offerJoiningDate?.toISOString().slice(0, 10) ?? "—"}`, ...requestMeta(req) })
        return NextResponse.json(await view(req, params.id))
    } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not save" }, { status: 400 }) }
}

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, auditLater, requestMeta } from "@/lib/access"
import { newLinkCode, linkState, LINK_SOURCE } from "@/lib/join-links"
import { LINK_USERS, canManageAll } from "@/lib/join-link-access"
import { getHrContacts } from "@/lib/hr-contacts"

export const dynamic = "force-dynamic"

// GET — links (everyone's for onboarding managers, own for recruiters) with
// opened → started → submitted → approved.
export async function GET(req: Request) {
    const g = await guard(req, LINK_USERS)
    if (g instanceof NextResponse) return g
    const all = canManageAll(g.access)
    const links = await prisma.joinLink.findMany({ where: all ? {} : { recruiterId: g.access.userId }, orderBy: { createdAt: "desc" }, take: 500 })
    const codes = links.map(l => l.code)
    const leads: { formSlug: string | null; convertedEmployeeId: string | null }[] = codes.length
        ? await (prisma.lead as any).findMany({ where: { source: LINK_SOURCE, formSlug: { in: codes } }, select: { formSlug: true, convertedEmployeeId: true } })
        : []
    const empIds = leads.map(l => l.convertedEmployeeId).filter((x): x is string => !!x)
    const [done, users, sites, recruiters] = await Promise.all([
        empIds.length ? prisma.onboardingRecord.findMany({ where: { employeeId: { in: empIds }, status: "COMPLETED" }, select: { employeeId: true } }) : Promise.resolve([] as { employeeId: string }[]),
        prisma.user.findMany({ where: { id: { in: Array.from(new Set(links.flatMap(l => [l.recruiterId, l.createdBy]))) } }, select: { id: true, name: true } }),
        prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        all ? getHrContacts().catch(() => []) : Promise.resolve([]),
    ])
    const approved = new Set(done.map(d => d.employeeId))
    const nameOf = new Map(users.map(u => [u.id, u.name])), siteOf = new Map(sites.map(s => [s.id, s.name]))
    const perLink = new Map<string, number>()
    for (const l of leads) if (l.formSlug && l.convertedEmployeeId && approved.has(l.convertedEmployeeId)) perLink.set(l.formSlug, (perLink.get(l.formSlug) ?? 0) + 1)
    const now = new Date()
    return NextResponse.json({
        canManageAll: all, me: g.access.userId, sites,
        recruiters: all ? (recruiters as { id: string; name: string | null }[]).map(r => ({ id: r.id, name: r.name ?? "—" })) : [{ id: g.access.userId, name: g.access.name }],
        links: links.map(l => ({
            ...l, recruiter: nameOf.get(l.recruiterId) ?? "—", site: l.siteId ? siteOf.get(l.siteId) ?? null : null, approved: perLink.get(l.code) ?? 0,
            state: linkState(l, now).ok ? "OPEN" : !l.isActive ? "OFF" : l.expiresAt && l.expiresAt < now ? "EXPIRED" : "FULL",
        })),
    })
}

// POST { name, recruiterId?, siteId?, designation?, employmentType?, expiresAt?, maxUses? }
export async function POST(req: Request) {
    const g = await guard(req, LINK_USERS)
    if (g instanceof NextResponse) return g
    const b = await req.json().catch(() => ({}))
    const name = String(b?.name ?? "").trim().slice(0, 80)
    if (!name) return NextResponse.json({ error: "Give the link a name (e.g. Chakan gate - inspectors)" }, { status: 400 })
    const recruiterId = canManageAll(g.access) && b?.recruiterId ? String(b.recruiterId) : g.access.userId
    if (!(await prisma.user.findUnique({ where: { id: recruiterId }, select: { id: true } }))) return NextResponse.json({ error: "Pick the recruiter" }, { status: 400 })
    const siteId = b?.siteId ? String(b.siteId) : null
    if (siteId && !(await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } }))) return NextResponse.json({ error: "Pick a site" }, { status: 400 })
    const exp = b?.expiresAt ? new Date(`${String(b.expiresAt).slice(0, 10)}T23:59:59+05:30`) : null
    const max = b?.maxUses ? Math.max(1, Math.min(100000, Math.round(Number(b.maxUses)) || 1)) : null
    const link = await prisma.joinLink.create({
        data: {
            code: await newLinkCode(), name, recruiterId, siteId,
            designation: b?.designation ? String(b.designation).trim().slice(0, 80) : null,
            employmentType: b?.employmentType ? String(b.employmentType).slice(0, 40) : null,
            expiresAt: exp && !isNaN(exp.getTime()) ? exp : null, maxUses: max, createdBy: g.access.userId,
        },
    })
    auditLater({ actorId: g.access.userId, actorName: g.access.name, action: "join_link.create", targetType: "JoinLink", targetId: link.id, targetName: name, summary: `Join link created (${link.code})`, after: link, ...requestMeta(req) })
    return NextResponse.json({ link })
}

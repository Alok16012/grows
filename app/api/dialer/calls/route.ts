import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, has } from "@/lib/access"
import { canUse, canSeeTeam } from "@/lib/dialer-server"
import { phoneKey } from "@/lib/dialer"

export const dynamic = "force-dynamic"

// GET ?view=mine|team&from=&to=&user=&direction=&target=&outcome=pending|<KEY>&targetType=&targetId=&q=&format=csv
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    if (!canUse(g.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const sp = new URL(req.url).searchParams
    const team = sp.get("view") === "team" && canSeeTeam(g.access)
    const and: any[] = []
    // A record's call history (lead / candidate / employee) is open to anyone who can call them.
    if (sp.get("targetId")) and.push({ targetId: sp.get("targetId") }, ...(sp.get("targetType") ? [{ targetType: sp.get("targetType") }] : []))
    else if (!team) and.push({ userId: g.access.userId })
    if (team && sp.get("user")) and.push({ userId: sp.get("user") })
    if (sp.get("from")) and.push({ startedAt: { gte: new Date(sp.get("from")!) } })
    if (sp.get("to")) and.push({ startedAt: { lt: new Date(sp.get("to")!) } })
    if (sp.get("direction")) and.push({ direction: sp.get("direction") })
    if (sp.get("target")) and.push({ targetType: sp.get("target") })
    const o = sp.get("outcome")
    if (o === "pending") and.push({ outcome: null, connected: true, targetType: { not: "UNKNOWN" } })
    else if (o) and.push({ outcome: o })
    const q = (sp.get("q") ?? "").trim()
    if (q) and.push({ OR: [{ targetName: { contains: q, mode: "insensitive" } }, ...(phoneKey(q).length >= 4 ? [{ phoneKey: { contains: phoneKey(q) } }] : []), { notes: { contains: q, mode: "insensitive" } }] })
    const csv = sp.get("format") === "csv"
    if (csv && !(g.access.isAdmin || has(g.access, "dialer.export"))) return NextResponse.json({ error: "Download needs Call Dialer → Export" }, { status: 403 })
    const calls = await prisma.callLog.findMany({ where: { AND: and }, orderBy: { startedAt: "desc" }, take: csv ? 20000 : Math.min(1000, Number(sp.get("take")) || 300) })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(calls.map(c => c.userId))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const rows = calls.map(c => ({ ...c, userName: nameOf.get(c.userId) ?? "—" }))
    if (csv) {
        const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
        const head = ["Date", "Time", "Caller", "Direction", "Number", "Name", "Type", "Connected", "Talk (sec)", "Outcome", "Notes", "Follow-up"]
        const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString()
        const body = rows.map(r => [ist(r.startedAt).slice(0, 10), ist(r.startedAt).slice(11, 19), r.userName, r.direction, r.phone, r.targetName, r.targetType, r.connected ? "Yes" : "No", r.durationSec, r.outcome, r.notes, r.followUpAt ? ist(r.followUpAt).slice(0, 16).replace("T", " ") : ""].map(esc).join(","))
        return new NextResponse([head.join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="calls.csv"` } })
    }
    return NextResponse.json({ calls: rows, canSeeTeam: canSeeTeam(g.access) })
}

import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { guard, hasAny, auditLater, requestMeta } from "@/lib/access"
import { newJoinerRegister, type RegisterRow } from "@/lib/new-joiners"
import { csvSafe } from "@/lib/csv-safe"

export const dynamic = "force-dynamic"

// GET /api/new-joiners/register?from=YYYY-MM-DD&to=YYYY-MM-DD[&siteId=][&format=xlsx]
//
// The New Joiner Deployment Register: everyone who joined in the range (any
// status, leavers included), when and by whom they were added and first posted,
// and how many days that took. format=xlsx downloads it (needs an export right).

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 366

const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : "")

const COLUMNS = [
    "Employee Code", "Name", "Designation", "Department", "Status", "Joining Date", "Added On", "Added By",
    "Added From", "First Site", "First Site From", "Site Assigned On", "Site Assigned By",
    "Days To Assign Site", "Waiting For Site (Days)", "Current Site", "Postings",
] as const

// Text cells go through csvSafe: names and designations can come from the
// public join link, and a value starting with = + - @ would open as a formula.
function sheetRows(rows: RegisterRow[]) {
    return rows.map(r => ({
        "Employee Code": csvSafe(r.code),
        "Name": csvSafe(r.name),
        "Designation": csvSafe(r.designation ?? ""),
        "Department": csvSafe(r.department ?? ""),
        "Status": r.status,
        "Joining Date": ymd(r.joiningDate),
        "Added On": ymd(r.addedOn),
        "Added By": csvSafe(r.addedBy ?? ""),
        "Added From": r.source ? `${r.source}${r.sourceInferred ? " (from data)" : ""}` : "",
        "First Site": csvSafe(r.firstSite ?? ""),
        "First Site From": ymd(r.firstSiteFrom),
        "Site Assigned On": ymd(r.assignedOn),
        "Site Assigned By": csvSafe(r.assignedBy ?? ""),
        "Days To Assign Site": r.daysToAssign ?? "",
        "Waiting For Site (Days)": r.waitingDays ?? "",
        "Current Site": csvSafe(r.currentSite ?? ""),
        "Postings": r.siteChanges,
    }))
}

export async function GET(req: Request) {
    const g = await guard(req, ["employees.view"])
    if (g instanceof NextResponse) return g
    const sp = new URL(req.url).searchParams
    const from = sp.get("from") ?? ""
    const to = sp.get("to") ?? ""
    if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
        return NextResponse.json({ error: "from and to must be dates (YYYY-MM-DD)" }, { status: 400 })
    }
    const start = new Date(`${from}T00:00:00.000Z`)
    const end = new Date(`${to}T23:59:59.999Z`)
    // "2026-02-30" parses (rolls over), so compare back to what was sent.
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.toISOString().slice(0, 10) !== from || end.toISOString().slice(0, 10) !== to) {
        return NextResponse.json({ error: "from and to must be real dates (YYYY-MM-DD)" }, { status: 400 })
    }
    if (end < start) {
        return NextResponse.json({ error: "The end date must be on or after the start date" }, { status: 400 })
    }
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_DAYS) {
        return NextResponse.json({ error: `Pick at most ${MAX_DAYS} days at a time` }, { status: 400 })
    }
    try {
        const rows = await newJoinerRegister(g.access, { from: start, to: end, siteId: sp.get("siteId") || null })
        if (sp.get("format") !== "xlsx") return NextResponse.json({ rows })

        if (!hasAny(g.access, ["employees.export", "reports.export"])) {
            return NextResponse.json({ error: "Forbidden — missing employees.export" }, { status: 403 })
        }
        const wb = XLSX.utils.book_new()
        // With no rows json_to_sheet writes nothing at all; keep the headings.
        const sheet = rows.length ? XLSX.utils.json_to_sheet(sheetRows(rows), { header: [...COLUMNS] }) : XLSX.utils.aoa_to_sheet([[...COLUMNS]])
        XLSX.utils.book_append_sheet(wb, sheet, "New Joiners")
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
        auditLater({
            actorId: g.access.userId, actorName: g.access.name, action: "export.newJoiners", targetType: "Export",
            targetName: "New Joiner Register", summary: `New Joiner Register ${from} to ${to} · ${rows.length} rows`,
            after: { from, to, siteId: sp.get("siteId") || null, rows: rows.length }, ...requestMeta(req),
        })
        return new NextResponse(new Uint8Array(buf), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="new_joiner_register_${from}_to_${to}.xlsx"`,
            },
        })
    } catch (error) {
        console.error("[NEW_JOINERS_REGISTER]", error)
        return NextResponse.json({ error: "Could not build the register" }, { status: 500 })
    }
}

import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isSelfScopedInspector } from "@/lib/permissions"
import { extractInspectionDimensions, isPartModelLabel, labelHas } from "@/lib/inspection-fields"

// Helper to parse a number value safely
function parseNum(val: string | null | undefined): number {
    if (!val) return 0
    const n = parseFloat(val.replace(/,/g, ""))
    return isNaN(n) ? 0 : n
}


export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const now = new Date()
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const dateFromParam = searchParams.get("dateFrom")
    const dateToParam = searchParams.get("dateTo")
    const role = session.user.role

    // Determine filters
    let siteId: string | null = null
    let inspectorId: string | null = null

    // Full-report access is driven by the reports.view permission (custom roles)
    // or ADMIN — NOT by the hardcoded MANAGER role. This is checked before the
    // base-role scoping so a permission-holder always gets the privileged view.
    const canViewAllReports = role === "ADMIN" || (session.user.permissions ?? []).includes("reports.view")

    if (canViewAllReports) {
        siteId = searchParams.get("siteId") || null
        inspectorId = searchParams.get("inspectorId") || null
    } else if (isSelfScopedInspector(session)) {
        // Always restrict to their own inspections only
        inspectorId = session.user.id
        // Honor site/project filters if provided
        const requestedSiteId = searchParams.get("siteId")
        if (requestedSiteId) siteId = requestedSiteId
    } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const projectId = searchParams.get("projectId") || null

    // Date range — prefer explicit dateFrom/dateTo if provided, else fall back to full month
    let startDate: Date
    let endDate: Date
    let periodLabel: string
    if (dateFromParam && dateToParam) {
        startDate = new Date(dateFromParam + "T00:00:00.000Z")
        endDate = new Date(dateToParam + "T23:59:59.999Z")
        periodLabel = dateFromParam === dateToParam
            ? dateFromParam
            : `${dateFromParam} to ${dateToParam}`
    } else {
        startDate = new Date(year, month - 1, 1)
        endDate = new Date(year, month, 0, 23, 59, 59, 999)
        periodLabel = `${getMonthName(month)} ${year}`
    }

    try {
        // Heals FormTemplate.reportRole on prod (migrations are manual there);
        // the `field` include below selects every column. Memoized — free after
        // the first call.
        await ensureProjectSchema()

        // Fetch all relevant inspections with full relations
        const inspections = await prisma.inspection.findMany({
            where: {
                status: "approved",
                submittedAt: {
                    gte: startDate,
                    lte: endDate,
                },
                assignment: {
                    project: (siteId || projectId) ? {
                        id: projectId || undefined,
                        siteId: siteId || undefined
                    } : undefined,
                    inspectionBoyId: inspectorId || undefined,
                },
            },
            include: {
                responses: {
                    include: { field: true },
                },
                assignment: {
                    include: {
                        project: {
                            include: { site: { select: { id: true, name: true } } },
                        },
                        inspectionBoy: true,
                    },
                },
                submitter: true,
            },
            orderBy: { submittedAt: "desc" },
        })

        // Aggregate data
        const summary = {
            totalInspected: 0,
            totalAccepted: 0,
            totalRework: 0,
            totalRejected: 0,
            acceptanceRate: 0,
            reworkRate: 0,
            rejectionRate: 0,
            reworkPPM: 0,
            rejectionPPM: 0,
            overallPPM: 0,
            period: periodLabel,
            siteName: "All Sites",
            partModel: "",
        }

        // Accumulators
        const partMap: Record<string, any> = {}
        const dayMap: Record<string, any> = {}
        const inspectorMap: Record<string, any> = {}
        const locationMap: Record<string, any> = {}
        const shiftMap: Record<string, any> = {}
        // Which dimensions the forms in this report ACTUALLY carry. The charts
        // used to render Location and Shift unconditionally, so a site whose
        // form has neither still got a Location chart (one "Main" bar) and a
        // Shift chart (one blank bar). Now a chart exists only if some
        // inspection filled that field.
        const present = { location: false, shift: false, partNumber: false }
        const siteMap: Record<string, any> = {}
        const defectMap: Record<string, number> = {}
        const partModels = new Set<string>()
        const partNumberMap = new Map<string, string>()
        let resolvedSiteName: string | null = null

        for (const inspection of inspections) {
            const responses = inspection.responses
            const inspectorName = inspection.assignment.inspectionBoy.name
            const siteName = inspection.assignment.project.site?.name ?? "No Site"
            const rowSiteId = inspection.assignment.project.siteId ?? "no-site"
            if (!resolvedSiteName) resolvedSiteName = siteName
            const date = inspection.submittedAt
                ? new Date(inspection.submittedAt).toISOString().slice(0, 10)
                : new Date(inspection.createdAt).toISOString().slice(0, 10)

            // One extractor for both the charts and the Inspection Report table
            // (lib/inspection-fields.ts). This loop used to have its own rules,
            // matching keywords as substrings — so "part" caught "Part Number"
            // and a part number was charted as a part name, and "location"
            // caught a "Dislocation" defect and charted locations that a site
            // never had.
            const dims = extractInspectionDimensions(responses)
            if (dims.location)   present.location   = true
            if (dims.shift)      present.shift      = true
            if (dims.partNumber) present.partNumber = true
            const partName = dims.partName ?? "General"
            const partNumber = dims.partNumber ?? ""
            const location = dims.location ?? "Main"
            // Was declared "" and never assigned, so every inspection fell into
            // one blank bucket and Shift-Wise always showed a single bar.
            const shift = dims.shift ?? "Not specified"
            let { inspected, accepted } = dims
            const { rework, rejected } = dims

            for (const r of responses) {
                const label = r.field.fieldLabel
                const val = r.value || ""
                if (!(r.field as { reportRole?: string | null }).reportRole && isPartModelLabel(label) && r.field.category !== "DEFECT") {
                    if (val) partModels.add(val)
                }
                // Track DEFECT category fields by their label (field name = defect type)
                if (r.field.category === "DEFECT") {
                    const qty = parseNum(val)
                    if (qty > 0) {
                        // Strip trailing "qty"/"count"/"no" suffixes for cleaner names
                        const cleanName = label.replace(/\s*(qty|count|no\.?|quantity)\s*$/i, "").trim() || label
                        defectMap[cleanName] = (defectMap[cleanName] || 0) + qty
                    }
                } else if (labelHas(label, ["defect type", "defect name", "defect reason"])) {
                    // Fallback: text fields where user types the defect name
                    if (val && val.trim()) {
                        defectMap[val.trim()] = (defectMap[val.trim()] || 0) + 1
                    }
                }
            }

            if (inspected === 0 && (accepted + rework + rejected) > 0) inspected = accepted + rework + rejected
            if (accepted === 0 && inspected > 0) accepted = Math.max(0, inspected - rework - rejected)

            summary.totalInspected += inspected
            summary.totalAccepted += accepted
            summary.totalRework += rework
            summary.totalRejected += rejected

            // Utility to accumulate maps
            const accumulate = (map: any, key: string, nameField: string, nameValue: string) => {
                if (!map[key]) map[key] = { [nameField]: nameValue, totalInspected: 0, totalAccepted: 0, totalRework: 0, totalRejected: 0 }
                map[key].totalInspected += inspected
                map[key].totalAccepted += accepted
                map[key].totalRework += rework
                map[key].totalRejected += rejected
            }

            // Track partNumber alongside partName for the part-wise output.
            // Key = partName so identical names still group together; number is
            // carried through as a display field.
            if (partNumber) partNumberMap.set(partName, partNumber)
            accumulate(partMap, partName, "partName", partName)
            accumulate(dayMap, date, "date", date)
            accumulate(inspectorMap, inspectorName, "inspectorName", inspectorName)
            accumulate(locationMap, location, "location", location)
            accumulate(siteMap, rowSiteId, "siteName", siteName)
            accumulate(shiftMap, shift, "shiftName", shift)
        }

        // Compute summary rates
        const total = summary.totalInspected
        if (total > 0) {
            summary.acceptanceRate = parseFloat(((summary.totalAccepted / total) * 100).toFixed(2))
            summary.reworkRate = parseFloat(((summary.totalRework / total) * 100).toFixed(2))
            summary.rejectionRate = parseFloat(((summary.totalRejected / total) * 100).toFixed(2))
            summary.reworkPPM = Math.round((summary.totalRework / total) * 1_000_000)
            summary.rejectionPPM = Math.round((summary.totalRejected / total) * 1_000_000)
            summary.overallPPM = Math.round(((summary.totalRework + summary.totalRejected) / total) * 1_000_000)
        }
        summary.partModel = Array.from(partModels).join(", ") || "N/A"
        if (resolvedSiteName) summary.siteName = resolvedSiteName

        // Helper for map to array
        const mapToArray = (map: any, sortFn: (a: any, b: any) => number) =>
            Object.values(map).sort(sortFn).map((item: any) => ({
                ...item,
                qualityRate: item.totalInspected > 0 ? parseFloat(((item.totalAccepted / item.totalInspected) * 100).toFixed(2)) : 0
            }))

        const partWise = mapToArray(partMap, (a, b) => b.totalInspected - a.totalInspected).map(p => ({
            ...p,
            partNumber: partNumberMap.get(p.partName) || "",
            reworkPercent: p.totalInspected > 0 ? parseFloat(((p.totalRework / p.totalInspected) * 100).toFixed(2)) : 0,
            rejectionPercent: p.totalInspected > 0 ? parseFloat(((p.totalRejected / p.totalInspected) * 100).toFixed(2)) : 0,
        }))

        const dayWise = mapToArray(dayMap, (a, b) => a.date.localeCompare(b.date))
        const inspectorWise = mapToArray(inspectorMap, (a, b) => b.totalInspected - a.totalInspected)
        const locationWise = Object.values(locationMap).sort((a: any, b: any) => b.totalInspected - a.totalInspected)
        const siteWise = mapToArray(siteMap, (a, b) => b.totalInspected - a.totalInspected)

        const totalDefects = Object.values(defectMap).reduce((a, b) => a + b, 0)
        const topDefects = Object.entries(defectMap)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 15)
            .map(([defectName, count]) => ({
                defectName,
                count,
                percentage: totalDefects > 0 ? parseFloat(((count / totalDefects) * 100).toFixed(2)) : 0,
            }))

        const shiftWise = mapToArray(shiftMap, (a, b) => b.totalInspected - a.totalInspected)

        return NextResponse.json({
            summary,
            partWise,
            dayWise,
            inspectorWise,
            locationWise,
            shiftWise,
            dimensionsPresent: present,
            siteWise,
            topDefects,
            records: inspections.map(i => {
                const r: any = {
                    id: i.id,
                    inspector: i.assignment.inspectionBoy.name,
                    date: i.submittedAt || i.createdAt,
                    site: i.assignment.project.site?.name ?? "No Site",
                    project: i.assignment.project.name,
                    inspected: 0,
                    accepted: 0,
                    rework: 0,
                    rejected: 0,
                    partName: "General",
                    partNumber: "",
                    shift: "",
                    location: "Main",
                    // Every answer keyed by its own label. The named keys above
                    // only cover the handful of labels this mapping knows; any
                    // other field the inspector filled — shift codes, dropdown
                    // selections, remarks, per-project custom columns — had
                    // nowhere to go and vanished from the export entirely.
                    fields: {} as Record<string, string>,
                }
                // Same extractor as the charts, so a row in this table and the
                // bar it feeds can't name a different part or location.
                const dims = extractInspectionDimensions(i.responses)
                if (dims.partName)   r.partName   = dims.partName
                if (dims.partNumber) r.partNumber = dims.partNumber
                if (dims.location)   r.location   = dims.location
                if (dims.shift)      r.shift      = dims.shift
                r.inspected = dims.inspected
                r.accepted  = dims.accepted
                r.rework    = dims.rework
                r.rejected  = dims.rejected
                for (const resp of i.responses) {
                    const val = resp.value || ""
                    if (val !== "") r.fields[resp.field.fieldLabel] = val
                }
                if (r.inspected === 0) r.inspected = r.accepted + r.rework + r.rejected
                return r
            })
        })
    } catch (error) {
        console.error("[REPORTS_GET]", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

function getMonthName(month: number): string {
    const months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"]
    return months[month - 1] || "Unknown"
}

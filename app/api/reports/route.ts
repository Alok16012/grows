import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// Helper to parse a number value safely
function parseNum(val: string | null | undefined): number {
    if (!val) return 0
    const n = parseFloat(val.replace(/,/g, ""))
    return isNaN(n) ? 0 : n
}

// Normalize a field label for matching
function normalizeLabel(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function matchesLabel(label: string, keywords: string[]): boolean {
    const norm = normalizeLabel(label)
    return keywords.some(k => norm.includes(normalizeLabel(k)))
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const now = new Date()
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const role = session.user.role

    // Determine filters
    let companyId: string | null = null
    let inspectorId: string | null = null

    if (role === "CLIENT") {
        const user = await prisma.user.findUnique({ where: { id: session.user.id } })
        companyId = user?.companyId ?? null
    } else if (role === "INSPECTION_BOY") {
        // Find companies where this inspector has assignments
        const assignments = await prisma.assignment.findMany({
            where: { inspectionBoyId: session.user.id },
            include: { project: { include: { company: true } } }
        })
        const allowedCompanyIds = Array.from(new Set(assignments.map(a => a.project.companyId)))

        const requestedCompanyId = searchParams.get("companyId")
        if (requestedCompanyId && allowedCompanyIds.includes(requestedCompanyId)) {
            companyId = requestedCompanyId
        } else if (allowedCompanyIds.length > 0) {
            companyId = allowedCompanyIds[0]
        } else {
            // No assignments, but check if they have a companyId on their profile
            const user = await prisma.user.findUnique({ where: { id: session.user.id } })
            companyId = user?.companyId ?? null
        }

        // IMPORTANT: To show "Company Report", we do NOT filter by inspectorId
        // This allows them to see aggregate data for the company they work for.
        inspectorId = null
    } else if (role === "ADMIN" || role === "MANAGER") {
        companyId = searchParams.get("companyId") || null
        inspectorId = searchParams.get("inspectorId") || null
    } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Date range for the selected month/year
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    try {
        // Fetch all relevant inspections with full relations
        const inspections = await prisma.inspection.findMany({
            where: {
                status: { in: ["approved", "pending"] },
                submittedAt: {
                    gte: startDate,
                    lte: endDate,
                },
                assignment: {
                    project: companyId ? { companyId } : undefined,
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
                            include: { company: true },
                        },
                        inspectionBoy: true,
                    },
                },
                submitter: true,
            },
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
            period: `${getMonthName(month)} ${year}`,
            companyName: companyId
                ? (await prisma.company.findUnique({ where: { id: companyId } }))?.name ?? "All Companies"
                : "All Companies",
            partModel: "",
        }

        // Accumulators
        const partMap: Record<string, any> = {}
        const dayMap: Record<string, any> = {}
        const inspectorMap: Record<string, any> = {}
        const locationMap: Record<string, any> = {}
        const companyMap: Record<string, any> = {}
        const defectMap: Record<string, number> = {}
        const partModels = new Set<string>()

        for (const inspection of inspections) {
            const responses = inspection.responses
            const inspectorName = inspection.assignment.inspectionBoy.name
            const companyName = inspection.assignment.project.company.name
            const companyId = inspection.assignment.project.companyId
            const date = inspection.submittedAt
                ? new Date(inspection.submittedAt).toISOString().slice(0, 10)
                : new Date(inspection.createdAt).toISOString().slice(0, 10)

            // Extract field values by label matching
            let partName = "General"
            let inspected = 0
            let accepted = 0
            let rework = 0
            let rejected = 0
            let location = "Main"

            for (const r of responses) {
                const label = r.field.fieldLabel
                const val = r.value || ""

                if (matchesLabel(label, ["part name", "partname", "part"])) {
                    if (val) partName = val
                }
                if (matchesLabel(label, ["part model", "model", "component model"])) {
                    if (val) partModels.add(val)
                }
                if (matchesLabel(label, ["total inspected", "inspected", "qty inspected", "quantity inspected"])) {
                    inspected = parseNum(val)
                }
                if (matchesLabel(label, ["total accepted", "accepted", "ok qty", "ok"])) {
                    accepted = parseNum(val)
                }
                if (matchesLabel(label, ["total rework", "rework", "rework qty"])) {
                    rework = parseNum(val)
                }
                if (matchesLabel(label, ["total rejected", "rejected", "rejection qty", "rejection"])) {
                    rejected = parseNum(val)
                }
                if (matchesLabel(label, ["location", "shift location", "plant location"])) {
                    if (val) location = val
                }
                if (matchesLabel(label, ["defect", "defect type", "defect name", "defect reason"])) {
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

            accumulate(partMap, partName, "partName", partName)
            accumulate(dayMap, date, "date", date)
            accumulate(inspectorMap, inspectorName, "inspectorName", inspectorName)
            accumulate(locationMap, location, "location", location)
            accumulate(companyMap, companyId, "companyName", companyName)
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

        // Helper for map to array
        const mapToArray = (map: any, sortFn: (a: any, b: any) => number) =>
            Object.values(map).sort(sortFn).map((item: any) => ({
                ...item,
                qualityRate: item.totalInspected > 0 ? parseFloat(((item.totalAccepted / item.totalInspected) * 100).toFixed(2)) : 0
            }))

        const partWise = mapToArray(partMap, (a, b) => b.totalInspected - a.totalInspected).map(p => ({
            ...p,
            reworkPercent: p.totalInspected > 0 ? parseFloat(((p.totalRework / p.totalInspected) * 100).toFixed(2)) : 0,
            rejectionPercent: p.totalInspected > 0 ? parseFloat(((p.totalRejected / p.totalInspected) * 100).toFixed(2)) : 0,
        }))

        const dayWise = mapToArray(dayMap, (a, b) => a.date.localeCompare(b.date))
        const inspectorWise = mapToArray(inspectorMap, (a, b) => b.totalInspected - a.totalInspected)
        const locationWise = Object.values(locationMap).sort((a: any, b: any) => b.totalInspected - a.totalInspected)
        const companyWise = mapToArray(companyMap, (a, b) => b.totalInspected - a.totalInspected)

        const totalDefects = Object.values(defectMap).reduce((a, b) => a + b, 0)
        const topDefects = Object.entries(defectMap)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 15)
            .map(([defectName, count]) => ({
                defectName,
                count,
                percentage: totalDefects > 0 ? parseFloat(((count / totalDefects) * 100).toFixed(2)) : 0,
            }))

        return NextResponse.json({
            summary,
            partWise,
            dayWise,
            inspectorWise,
            locationWise,
            companyWise,
            topDefects,
            records: inspections.map(i => {
                const r: any = {
                    id: i.id,
                    inspector: i.assignment.inspectionBoy.name,
                    date: i.submittedAt || i.createdAt,
                    company: i.assignment.project.company.name,
                    project: i.assignment.project.name,
                    inspected: 0,
                    accepted: 0,
                    rework: 0,
                    rejected: 0,
                    partName: "General",
                    location: "Main"
                }
                for (const resp of i.responses) {
                    const label = resp.field.fieldLabel.toLowerCase()
                    const val = resp.value || ""
                    if (label.includes("part name") || label.includes("partname")) r.partName = val
                    if (label.includes("inspected")) r.inspected = parseNum(val)
                    if (label.includes("accepted")) r.accepted = parseNum(val)
                    if (label.includes("rework")) r.rework = parseNum(val)
                    if (label.includes("rejected")) r.rejected = parseNum(val)
                    if (label.includes("location")) r.location = val
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

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { ifWorkflowInstalled, loadIssues } from "@/lib/asset-workflow"

// GET — assets issued to the signed-in employee, current and returned.
//
// Default response stays the legacy array (the mobile app and older builds
// read it), with each row gaining `issue` — the workflow issue behind it, or
// null for pre-workflow assignments. `?withIssues=1` returns
// { assignments, issues } with the full issue list for the profile tab.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const withIssues = new URL(req.url).searchParams.get("withIssues") === "1"
    const emp = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    if (!emp) return NextResponse.json(withIssues ? { assignments: [], issues: [] } : [])
    const rows = await prisma.employeeAsset.findMany({
        where: { employeeId: emp.id },
        orderBy: [{ isActive: "desc" }, { issuedAt: "desc" }],
        select: {
            id: true, issuedAt: true, returnedAt: true, condition: true, returnCondition: true, notes: true, isActive: true,
            asset: { select: { name: true, assetCode: true, category: true, serialNo: true } },
        },
    })

    // Workflow tables may not be installed yet — then there are simply no issues.
    const issues = (await ifWorkflowInstalled(
        () => loadIssues(prisma, { where: { employeeId: emp.id }, orderBy: [{ status: "asc" }, { issuedAt: "desc" }] }),
        "[ME_ASSETS_ISSUES]",
    )) ?? []
    const byAssignment = new Map(issues.filter(i => i.employeeAssetId).map(i => [i.employeeAssetId!, i]))
    const assignments = rows.map(r => ({ ...r, issue: byAssignment.get(r.id) ?? null }))

    return NextResponse.json(withIssues ? { assignments, issues } : assignments)
}

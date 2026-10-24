import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canRequestAssets, canOverseeAssets } from "@/lib/permissions"
import { jsonError } from "@/lib/asset-workflow"

// GET /api/assets/employees?search=&departmentId=&siteId=&pageSize=
//
// Employee picker for raising asset requests. The full employee list needs
// employees.view, which an HR/store requester often doesn't hold — they could
// then only raise for themselves. This returns just what the picker shows
// (name, code, department, designation, site) for active staff, to anyone who
// may request or oversee assets. No salary, bank, ID or contact fields.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return jsonError(401, "Unauthorized")
    if (!canRequestAssets(session) && !canOverseeAssets(session)) return jsonError(403, "Forbidden")

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get("search") ?? "").trim()
    const departmentId = searchParams.get("departmentId") || undefined
    const siteId = searchParams.get("siteId") || undefined
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") ?? "50") || 50, 1), 100)

    // Every whitespace token must match some name/code field, so "Rahul Kumar"
    // and "Kumar Rahul" both work (same rule as the Employees list).
    const tokens = search.split(/\s+/).filter(Boolean)
    const where: Record<string, unknown> = {
        status: { in: ["ACTIVE", "ON_LEAVE"] },
        ...(departmentId ? { departmentId } : {}),
        ...(siteId ? { deployments: { some: { siteId, isActive: true } } } : {}),
        ...(tokens.length ? {
            AND: tokens.map(t => ({
                OR: [
                    { firstName: { contains: t, mode: "insensitive" } },
                    { lastName: { contains: t, mode: "insensitive" } },
                    { employeeId: { contains: t, mode: "insensitive" } },
                    { designation: { contains: t, mode: "insensitive" } },
                ],
            })),
        } : {}),
    }

    try {
        const [rows, total] = await Promise.all([
            prisma.employee.findMany({
                where,
                select: {
                    id: true, employeeId: true, firstName: true, lastName: true, designation: true,
                    department: { select: { name: true } },
                    deployments: { where: { isActive: true }, take: 1, select: { site: { select: { name: true } } } },
                },
                orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
                take: pageSize,
            }),
            prisma.employee.count({ where }),
        ])
        return NextResponse.json({ employees: rows, total })
    } catch (e) {
        console.error("[ASSET_EMPLOYEES_GET]", e)
        return jsonError(500, "Couldn't load employees")
    }
}

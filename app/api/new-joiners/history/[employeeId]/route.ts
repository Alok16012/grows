import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"
import { siteHistory } from "@/lib/new-joiners"

export const dynamic = "force-dynamic"

// GET /api/new-joiners/history/:employeeId → one person's site history:
// when they were added, and every posting, move and relief, with who did it.
export async function GET(req: Request, { params }: { params: { employeeId: string } }) {
    const g = await guard(req, ["employees.view"])
    if (g instanceof NextResponse) return g
    try {
        // Only for someone the caller may see.
        const scope = await employeeScope(g.access)
        const emp = await prisma.employee.findFirst({
            where: scope ? { AND: [{ id: params.employeeId }, scope] } : { id: params.employeeId },
            select: { id: true, employeeId: true, firstName: true, lastName: true, dateOfJoining: true, createdAt: true },
        })
        if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
        return NextResponse.json({
            employee: { id: emp.id, code: emp.employeeId, name: `${emp.firstName} ${emp.lastName}`.trim(), joiningDate: emp.dateOfJoining, addedOn: emp.createdAt },
            events: await siteHistory(emp.id),
        })
    } catch (error) {
        console.error("[NEW_JOINERS_HISTORY]", error)
        return NextResponse.json({ error: "Could not load the history" }, { status: 500 })
    }
}

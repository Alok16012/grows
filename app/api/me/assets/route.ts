import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"

// GET — assets issued to the signed-in employee, current and returned.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const emp = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    if (!emp) return NextResponse.json([])
    const rows = await prisma.employeeAsset.findMany({
        where: { employeeId: emp.id },
        orderBy: [{ isActive: "desc" }, { issuedAt: "desc" }],
        select: {
            id: true, issuedAt: true, returnedAt: true, condition: true, returnCondition: true, notes: true, isActive: true,
            asset: { select: { name: true, assetCode: true, category: true, serialNo: true } },
        },
    })
    return NextResponse.json(rows)
}

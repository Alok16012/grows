import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { loadNotReceived } from "@/lib/asset-not-received"

export const dynamic = "force-dynamic"

// GET — the signed-in employee's issued items still waiting for "Received" /
// "Not received" (Dashboard card). Items already reported as not received
// are returned separately so the card can say HR is checking.
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) return NextResponse.json({ pending: [], reported: [] })
    const emp = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    if (!emp) return NextResponse.json({ pending: [], reported: [] })
    const [issues, claims] = await Promise.all([
        prisma.assetIssue.findMany({
            where: { employeeId: emp.id, status: "ACTIVE", acknowledgedAt: null },
            orderBy: { issuedAt: "desc" },
            take: 20,
            select: { id: true, issueNo: true, quantity: true, size: true, issuedAt: true, asset: { select: { name: true } } },
        }),
        loadNotReceived(),
    ])
    const row = (i: typeof issues[number]) => ({ id: i.id, issueNo: i.issueNo, name: i.asset?.name ?? "Item", quantity: i.quantity, size: i.size, issuedAt: i.issuedAt })
    return NextResponse.json({
        pending: issues.filter(i => !claims[i.id]).map(row),
        reported: issues.filter(i => claims[i.id]).map(i => ({ ...row(i), reportedAt: claims[i.id].at })),
    })
}

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { phoneDigits } from "@/lib/login-security"

// "Link to employee" on the Create user form: search by name or EMP ID and
// fill name, mobile and manager. Contact fields only — nothing sensitive.
export async function GET(req: Request) {
    const g = await guard(req, ["users.create", "users.edit"])
    if (g instanceof NextResponse) return g
    const q = (new URL(req.url).searchParams.get("q") || "").trim()
    if (q.length < 2) return NextResponse.json([])
    const rows = await prisma.employee.findMany({
        where: {
            status: { notIn: ["TERMINATED", "RESIGNED"] },
            OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { employeeId: { contains: q, mode: "insensitive" } },
                ...(q.replace(/\D/g, "").length >= 4 ? [{ phone: { contains: q.replace(/\D/g, "") } }] : []),
            ],
        },
        select: { id: true, employeeId: true, firstName: true, lastName: true, phone: true, email: true, designation: true, status: true, userId: true, managerId: true },
        orderBy: [{ firstName: "asc" }],
        take: 20,
    })
    const managerIds = Array.from(new Set(rows.map(r => r.managerId).filter((x): x is string => !!x)))
    const managers = managerIds.length ? await prisma.user.findMany({ where: { id: { in: managerIds } }, select: { id: true, name: true } }) : []
    const managerName = new Map(managers.map(m => [m.id, m.name]))
    return NextResponse.json(rows.map(r => ({
        id: r.id, employeeId: r.employeeId, name: `${r.firstName} ${r.lastName ?? ""}`.trim(),
        mobile: phoneDigits(r.phone).length === 10 ? phoneDigits(r.phone) : null,
        email: r.email && r.email.includes("@") ? r.email : null,
        designation: r.designation, status: r.status, hasLogin: !!r.userId,
        reportsTo: r.managerId ? { id: r.managerId, name: managerName.get(r.managerId) ?? null } : null,
    })))
}

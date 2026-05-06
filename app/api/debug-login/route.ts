import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import bcrypt from "bcryptjs"

// GET /api/debug-login?input=9322059808
// Returns full login diagnostic for any employee — ADMIN only
export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const input = searchParams.get("input") || ""

    const result: any = { input, checks: [] }

    // 1. Direct email lookup
    const byEmail = await prisma.user.findUnique({
        where: { email: input },
        select: { id: true, email: true, role: true, isActive: true, name: true, password: true }
    })
    result.checks.push({
        step: "email_lookup",
        found: !!byEmail,
        email: byEmail?.email,
        isActive: byEmail?.isActive,
        hasPassword: !!byEmail?.password
    })

    // 2. Phone lookup
    const rawPhone = input.replace(/@cims\.local$/i, "").replace(/\D/g, "")
    if (rawPhone.length >= 10) {
        const byPhone = await prisma.employee.findFirst({
            where: { phone: { endsWith: rawPhone.slice(-10) } },
            include: {
                user: {
                    select: { id: true, email: true, role: true, isActive: true, name: true, password: true }
                }
            }
        })
        result.checks.push({
            step: "phone_lookup",
            rawPhone,
            found: !!byPhone,
            employeeName: byPhone ? `${byPhone.firstName} ${byPhone.lastName}` : null,
            employeeId: byPhone?.employeeId,
            userId: byPhone?.userId,
            hasUser: !!byPhone?.user,
            userEmail: byPhone?.user?.email,
            isActive: byPhone?.user?.isActive,
            hasPassword: !!byPhone?.user?.password
        })
    }

    // 3. EmployeeId lookup
    const byEmpId = await prisma.employee.findFirst({
        where: { employeeId: { equals: input, mode: "insensitive" } },
        include: {
            user: {
                select: { id: true, email: true, role: true, isActive: true, name: true, password: true }
            }
        }
    })
    result.checks.push({
        step: "employeeId_lookup",
        found: !!byEmpId,
        employeeName: byEmpId ? `${byEmpId.firstName} ${byEmpId.lastName}` : null,
        userId: byEmpId?.userId,
        hasUser: !!byEmpId?.user,
        userEmail: byEmpId?.user?.email,
        isActive: byEmpId?.user?.isActive,
        hasPassword: !!byEmpId?.user?.password
    })

    return NextResponse.json(result)
}

// POST /api/debug-login — force-fix login for an employee by phone/empId
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { input, newPassword } = await req.json()

    // Find employee by phone or employeeId
    const rawPhone = (input || "").replace(/\D/g, "")
    let employee: any = null

    if (rawPhone.length >= 10) {
        employee = await prisma.employee.findFirst({ where: { phone: { endsWith: rawPhone.slice(-10) } } })
    }
    if (!employee) {
        employee = await prisma.employee.findFirst({ where: { employeeId: { equals: input, mode: "insensitive" } } })
    }

    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

    const password = newPassword || employee.phone || "123456"
    const hash = await bcrypt.hash(password, 10)
    const email = `${employee.phone}@cims.local`

    let user
    if (employee.userId) {
        user = await prisma.user.update({
            where: { id: employee.userId },
            data: { isActive: true, password: hash, name: `${employee.firstName} ${employee.lastName}`.trim() },
            select: { id: true, email: true, role: true, isActive: true }
        })
    } else {
        // Check if user with this email already exists
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) {
            user = await prisma.user.update({
                where: { id: existing.id },
                data: { isActive: true, password: hash, name: `${employee.firstName} ${employee.lastName}`.trim() },
                select: { id: true, email: true, role: true, isActive: true }
            })
            await prisma.employee.update({ where: { id: employee.id }, data: { userId: existing.id } })
        } else {
            user = await prisma.user.create({
                data: {
                    email,
                    name: `${employee.firstName} ${employee.lastName}`.trim(),
                    role: "INSPECTION_BOY",
                    isActive: true,
                    password: hash
                },
                select: { id: true, email: true, role: true, isActive: true }
            })
            await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } })
        }
    }

    return NextResponse.json({ success: true, user, loginInput: employee.phone, loginPassword: password })
}

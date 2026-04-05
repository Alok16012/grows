import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const employee = await prisma.employee.findUnique({
            where: { id: params.id },
            include: {
                branch: true,
                department: true,
                documents: true,
                deployments: { include: { site: true }, orderBy: { createdAt: "desc" } },
                attendances: { orderBy: { date: "desc" }, take: 30 },
                leaves: { orderBy: { createdAt: "desc" } },
                payrolls: { orderBy: [{ year: "desc" }, { month: "desc" }] },
                assets: { include: { asset: true } },
            },
        })

        if (!employee) return new NextResponse("Not Found", { status: 404 })
        return NextResponse.json(employee)
    } catch (error) {
        console.error("[EMPLOYEE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const {
            firstName, lastName, email, phone, alternatePhone,
            dateOfBirth, gender, address, city, state, pincode,
            aadharNumber, panNumber, bankAccountNumber, bankIFSC, bankName,
            photo, designation, departmentId, branchId,
            dateOfJoining, dateOfLeaving, status, employmentType, basicSalary, notes,
        } = body

        const updateData: Record<string, unknown> = {}
        if (firstName !== undefined) updateData.firstName = firstName
        if (lastName !== undefined) updateData.lastName = lastName
        if (email !== undefined) updateData.email = email
        if (phone !== undefined) updateData.phone = phone
        if (alternatePhone !== undefined) updateData.alternatePhone = alternatePhone
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null
        if (gender !== undefined) updateData.gender = gender
        if (address !== undefined) updateData.address = address
        if (city !== undefined) updateData.city = city
        if (state !== undefined) updateData.state = state
        if (pincode !== undefined) updateData.pincode = pincode
        if (aadharNumber !== undefined) updateData.aadharNumber = aadharNumber
        if (panNumber !== undefined) updateData.panNumber = panNumber
        if (bankAccountNumber !== undefined) updateData.bankAccountNumber = bankAccountNumber
        if (bankIFSC !== undefined) updateData.bankIFSC = bankIFSC
        if (bankName !== undefined) updateData.bankName = bankName
        if (photo !== undefined) updateData.photo = photo
        if (designation !== undefined) updateData.designation = designation
        if (departmentId !== undefined) updateData.departmentId = departmentId || null
        if (branchId !== undefined) updateData.branchId = branchId
        if (dateOfJoining !== undefined) updateData.dateOfJoining = dateOfJoining ? new Date(dateOfJoining) : null
        if (dateOfLeaving !== undefined) updateData.dateOfLeaving = dateOfLeaving ? new Date(dateOfLeaving) : null
        if (status !== undefined) updateData.status = status
        if (employmentType !== undefined) updateData.employmentType = employmentType
        if (basicSalary !== undefined) updateData.basicSalary = basicSalary ? parseFloat(basicSalary) : 0
        if (notes !== undefined) updateData.notes = notes

        const employee = await prisma.employee.update({
            where: { id: params.id },
            data: updateData,
        })

        return NextResponse.json(employee)
    } catch (error) {
        console.error("[EMPLOYEE_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Check if employee has any associated records
        const employee = await prisma.employee.findUnique({
            where: { id: params.id },
            include: {
                _count: {
                    select: {
                        attendances: true,
                        leaves: true,
                        payrolls: true,
                        deployments: true,
                    },
                },
            },
        })

        if (!employee) return new NextResponse("Not Found", { status: 404 })

        const hasRecords =
            employee._count.attendances > 0 ||
            employee._count.leaves > 0 ||
            employee._count.payrolls > 0 ||
            employee._count.deployments > 0

        if (hasRecords) {
            // Soft delete: set status to TERMINATED
            const updated = await prisma.employee.update({
                where: { id: params.id },
                data: { status: "TERMINATED" },
            })
            return NextResponse.json({ success: true, softDeleted: true, employee: updated })
        }

        await prisma.employee.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true, softDeleted: false })
    } catch (error) {
        console.error("[EMPLOYEE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

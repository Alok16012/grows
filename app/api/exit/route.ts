import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const DEFAULT_CLEARANCE = [
  { title: "Collect ID Card", department: "HR", order: 1 },
  { title: "Collect Uniform / PPE", department: "HR", order: 2 },
  { title: "Collect Access Card / Keys", department: "Admin", order: 3 },
  { title: "Return Mobile / Tools", department: "IT", order: 4 },
  { title: "Clear Outstanding Advances", department: "Finance", order: 5 },
  { title: "Pending Expense Settlement", department: "Finance", order: 6 },
  { title: "PF Withdrawal / Transfer Form", department: "HR", order: 7 },
  { title: "Gratuity Calculation", department: "Finance", order: 8 },
  { title: "Experience Letter Issued", department: "HR", order: 9 },
  { title: "Relieve Letter Issued", department: "HR", order: 10 },
  { title: "Site Handover / Briefing to Replacement", department: "Operations", order: 11 },
  { title: "Final Attendance Marked", department: "HR", order: 12 },
]

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const exitType = searchParams.get("exitType")
    const search = searchParams.get("search")

    const where: Record<string, unknown> = {}
    if (status && status !== "ALL") where.status = status
    if (exitType && exitType !== "ALL") where.exitType = exitType

    if (search) {
      where.employee = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { employeeId: { contains: search, mode: "insensitive" } },
        ],
      }
    }

    const exits = await prisma.exitRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            designation: true,
            department: { select: { name: true } },
            branch: { select: { name: true } },
          },
        },
        clearanceTasks: {
          select: { id: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(exits)
  } catch (error) {
    console.error("[EXIT_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await req.json()
    const { employeeId, exitType, resignationDate, lastWorkingDate, noticePeriodDays, reason } = body

    if (!employeeId || !exitType || !resignationDate) {
      return new NextResponse("employeeId, exitType, resignationDate are required", { status: 400 })
    }

    const existing = await prisma.exitRequest.findUnique({ where: { employeeId } })
    if (existing) {
      return new NextResponse("Exit request already exists for this employee", { status: 400 })
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
    if (!employee) return new NextResponse("Employee not found", { status: 404 })

    const exit = await prisma.exitRequest.create({
      data: {
        employeeId,
        exitType,
        resignationDate: new Date(resignationDate),
        lastWorkingDate: lastWorkingDate ? new Date(lastWorkingDate) : null,
        noticePeriodDays: noticePeriodDays ? parseInt(String(noticePeriodDays)) : 30,
        reason: reason || null,
        initiatedBy: session.user.id,
        status: "INITIATED",
        clearanceTasks: {
          create: DEFAULT_CLEARANCE.map(t => ({
            title: t.title,
            department: t.department,
            order: t.order,
            status: "PENDING",
          })),
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            designation: true,
          },
        },
        clearanceTasks: true,
      },
    })

    return NextResponse.json(exit)
  } catch (error) {
    console.error("[EXIT_POST]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

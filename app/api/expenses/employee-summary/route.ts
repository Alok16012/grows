import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

const CATS = ["TRAVEL","FOOD","FUEL","HOTEL","MATERIAL","MOBILE_RECHARGE","OFFICE_SUPPLIES","OTHER","ACCOMMODATION","COMMUNICATION","MEDICAL","UNIFORM","TRAINING"] as const

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()))

    if (!employeeId) return new NextResponse("employeeId required", { status: 400 })

    // Find the employee + their user id
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, user: { select: { id: true } } }
    })
    if (!employee) return new NextResponse("Employee not found", { status: 404 })

    const userId = employee.user?.id

    // Fetch all expenses for this employee in the given year
    // Match on employeeId OR submittedBy (employee's own user account)
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    const orConditions: any[] = [{ employeeId }]
    if (userId) orConditions.push({ submittedBy: userId })

    const expenses = await prisma.expense.findMany({
      where: {
        OR: orConditions,
        date: { gte: yearStart, lte: yearEnd },
        status: { notIn: ["DRAFT", "REJECTED"] }
      },
      select: {
        id: true, expenseNo: true, title: true, category: true, amount: true,
        date: true, status: true, description: true, receiptUrl: true,
        travelDays: true, travelDailyRate: true
      },
      orderBy: { date: "asc" }
    } as any)

    // Group by month × category
    const monthMap: Record<string, Record<string, { total: number; items: any[] }>> = {}

    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m+1).padStart(2,"0")}`
      monthMap[key] = {}
      for (const cat of CATS) monthMap[key][cat] = { total: 0, items: [] }
    }

    for (const exp of expenses) {
      const d = new Date(exp.date)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
      if (!monthMap[monthKey]) continue
      const cat = exp.category as string
      if (!monthMap[monthKey][cat]) monthMap[monthKey][cat] = { total: 0, items: [] }
      monthMap[monthKey][cat].total += exp.amount
      monthMap[monthKey][cat].items.push(exp)
    }

    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    const rows = Object.entries(monthMap).map(([month, catData]) => {
      const [y, m] = month.split("-").map(Number)
      const row: any = {
        month,
        label: `${MONTH_NAMES[m-1]} ${y}`,
        total: 0,
        items: {}
      }
      for (const cat of CATS) {
        const d = catData[cat] || { total: 0, items: [] }
        row[cat] = d.total
        row.items[cat] = d.items
        row.total += d.total
      }
      return row
    })

    // Column totals
    const totals: any = { total: 0 }
    for (const cat of CATS) {
      totals[cat] = rows.reduce((s, r) => s + (r[cat] || 0), 0)
      totals.total += totals[cat]
    }

    return NextResponse.json({
      employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}` },
      year,
      rows,
      totals,
      categories: CATS
    })
  } catch (error) {
    console.error("[EMP_SUMMARY_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

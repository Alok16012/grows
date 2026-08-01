import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { checkAccess } from "@/lib/permissions"

const CATS = ["TRAVEL","FOOD","FUEL","HOTEL","MATERIAL","MOBILE_RECHARGE","OFFICE_SUPPLIES","OTHER","ACCOMMODATION","COMMUNICATION","MEDICAL","UNIFORM","TRAINING"] as const

export async function GET(req: Request) {
  try {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()))

    if (!employeeId) return new NextResponse("employeeId required", { status: 400 })

    // Reading anyone else's expense history needs expenses.view; a caller can
    // always pull their own (by employee id or by their own user id).
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "expenses.view")) {
      const self = await prisma.employee.findFirst({
        where: { userId: session.user.id },
        select: { id: true }
      })
      if (employeeId !== session.user.id && employeeId !== self?.id) {
        return new NextResponse("Forbidden", { status: 403 })
      }
    }

    // Find the employee + their user id
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, user: { select: { id: true } } }
    })

    // The id may not be an Employee — team-summary also emits rows for
    // non-employee submitters (e.g. ADMIN) keyed by their user id. In that
    // case treat the id as a userId and match expenses by submittedBy.
    const displayId = employeeId
    let displayName: string
    const orConditions: any[] = []
    if (employee) {
      displayName = `${employee.firstName} ${employee.lastName}`
      orConditions.push({ employeeId: employee.id })
      if (employee.user?.id) orConditions.push({ submittedBy: employee.user.id })
    } else {
      const user = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { id: true, name: true, email: true },
      })
      if (!user) return new NextResponse("Employee not found", { status: 404 })
      displayName = user.name || user.email || "Unknown"
      orConditions.push({ submittedBy: user.id })
    }

    // Fetch all expenses for this employee/user in the given year
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    const expenses = await prisma.expense.findMany({
      where: {
        OR: orConditions,
        date: { gte: yearStart, lte: yearEnd },
        status: { notIn: ["DRAFT", "REJECTED"] }
      },
      select: {
        id: true, expenseNo: true, title: true, category: true, amount: true,
        date: true, status: true, description: true, receiptUrl: true,
        travelDays: true, travelDailyRate: true, travelEntries: true, categoryItems: true
      },
      orderBy: { date: "asc" }
    } as any)

    // Split an expense into per-category parts. Multi-category expenses yield one
    // synthesized item per line (with that line's amount + journeys); legacy
    // single-category expenses yield the whole expense unchanged.
    const partsOf = (exp: any): { category: string; item: any }[] => {
      const items = (exp as any).categoryItems
      if (Array.isArray(items) && items.length > 0) {
        return items.map((it: any) => ({
          category: String(it?.category ?? exp.category),
          item: {
            ...exp,
            category: String(it?.category ?? exp.category),
            amount: Number(it?.amount) || 0,
            travelEntries: it?.travelEntries ?? null,
          },
        }))
      }
      return [{ category: exp.category as string, item: exp }]
    }

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
      for (const part of partsOf(exp)) {
        const cat = part.category
        if (!monthMap[monthKey][cat]) monthMap[monthKey][cat] = { total: 0, items: [] }
        monthMap[monthKey][cat].total += Number(part.item.amount) || 0
        monthMap[monthKey][cat].items.push(part.item)
      }
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
      employee: { id: displayId, name: displayName },
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

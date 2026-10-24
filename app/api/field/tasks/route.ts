import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { dayWindow, istDateOnly } from "@/lib/attendance-policy"
import { TaskPriority } from "@prisma/client"

// Due dates arrive as "YYYY-MM-DD" from the form. Store them at UTC midnight
// of that calendar day — the same convention istDateOnly() uses — so the GET
// `date=` filter (dayWindow over an IST day) finds them. `new Date(str)` would
// do the same for a strict ISO date but silently accepts junk like "2026-13-45".
// (Not exported: a route file may only export HTTP handlers. [id]/route.ts has
// its own copy.)
function parseDueDate(raw: unknown): Date | null {
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    const d = new Date(raw + "T00:00:00.000Z")
    if (Number.isNaN(d.getTime())) return null
    // Reject roll-overs (e.g. Feb 30 → Mar 2).
    return d.toISOString().slice(0, 10) === raw ? d : null
}

const DUE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const priority = searchParams.get("priority")
        const employeeId = searchParams.get("employeeId")
        const siteId = searchParams.get("siteId")
        const date = searchParams.get("date")
        const search = searchParams.get("search")

        const isAdminOrManager = checkAccess(session, ["MANAGER"], "field.view")

        const where: Record<string, unknown> = {}

        // Employees see only their own tasks
        if (!isAdminOrManager) {
            // Find employee record linked to this user - match by email
            const employee = await prisma.employee.findFirst({
                where: { userId: session.user.id },
            })
            if (!employee) return NextResponse.json([])
            where.employeeId = employee.id
        } else {
            if (employeeId) where.employeeId = employeeId
            if (siteId) where.siteId = siteId
        }

        if (status) where.status = status
        if (priority) where.priority = priority

        if (date) {
            // IST calendar day, not the server's (UTC) local day.
            where.dueDate = dayWindow(new Date(date.slice(0, 10) + "T00:00:00.000Z"))
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { taskNo: { contains: search, mode: "insensitive" } },
            ]
        }

        const tasks = await prisma.fieldTask.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        photo: true,
                        designation: true,
                    },
                },
            },
            orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        })

        // Fetch site names separately if siteIds exist
        const siteIds = [...new Set(tasks.map((t) => t.siteId).filter(Boolean))] as string[]
        let siteMap: Record<string, string> = {}
        if (siteIds.length > 0) {
            const sites = await prisma.site.findMany({
                where: { id: { in: siteIds } },
                select: { id: true, name: true },
            })
            siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))
        }

        const result = tasks.map((t) => ({
            ...t,
            siteName: t.siteId ? siteMap[t.siteId] || null : null,
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[FIELD_TASKS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "field.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        let body: Record<string, unknown>
        try {
            body = await req.json()
        } catch {
            return new NextResponse("Request body must be JSON", { status: 400 })
        }
        const { title, description, employeeId, siteId, priority, dueDate, dueTime } = body

        // Every bad input gets its own 400 — a bare 500 here read as "the module
        // is broken" in QA when it was really one field.
        const titleStr = typeof title === "string" ? title.trim() : ""
        if (!titleStr) return new NextResponse("Title is required", { status: 400 })
        if (typeof employeeId !== "string" || !employeeId) {
            return new NextResponse("Employee is required", { status: 400 })
        }
        if (priority !== undefined && priority !== null && priority !== ""
            && !Object.values(TaskPriority).includes(priority as TaskPriority)) {
            return new NextResponse(`Invalid priority: must be one of ${Object.values(TaskPriority).join(", ")}`, { status: 400 })
        }
        if (dueDate === undefined || dueDate === null || dueDate === "") {
            return new NextResponse("Due date is required", { status: 400 })
        }
        const due = parseDueDate(dueDate)
        if (!due) return new NextResponse("Due date must be a valid YYYY-MM-DD date", { status: 400 })
        // Compare IST calendar days (both at UTC midnight), not instants.
        if (due < istDateOnly()) return new NextResponse("Due date cannot be in the past", { status: 400 })
        if (dueTime !== undefined && dueTime !== null && dueTime !== ""
            && (typeof dueTime !== "string" || !DUE_TIME_RE.test(dueTime))) {
            return new NextResponse("Due time must be HH:MM (24-hour)", { status: 400 })
        }

        // The form sends Employee.id; a User.id or a stale option would otherwise
        // fail the FK as a 500. Check up front so the message names the problem.
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, status: true },
        })
        if (!employee) return new NextResponse("Employee not found", { status: 400 })
        if (employee.status !== "ACTIVE") {
            return new NextResponse(`Employee is ${employee.status.toLowerCase()} — tasks can only be assigned to active employees`, { status: 400 })
        }
        if (siteId) {
            if (typeof siteId !== "string") return new NextResponse("Invalid site", { status: 400 })
            const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } })
            if (!site) return new NextResponse("Site not found", { status: 400 })
        }

        // Auto-generate taskNo FT-NNNN from the highest existing number. Ordering
        // by taskNo (zero-padded) rather than createdAt means a backdated or
        // re-imported row can't make us re-issue a number that already exists.
        const nextTaskNo = async () => {
            const lastTask = await prisma.fieldTask.findFirst({
                where: { taskNo: { startsWith: "FT-" } },
                orderBy: { taskNo: "desc" },
                select: { taskNo: true },
            })
            const match = lastTask?.taskNo.match(/\d+$/)
            const nextNum = match ? parseInt(match[0], 10) + 1 : 1
            return `FT-${String(nextNum).padStart(4, "0")}`
        }

        const data = {
            title: titleStr,
            description: typeof description === "string" && description.trim() ? description.trim() : null,
            employeeId,
            siteId: (siteId as string) || null,
            priority: (priority as TaskPriority) || "MEDIUM",
            dueDate: due,
            dueTime: (dueTime as string) || null,
            assignedBy: session.user.id,
        }
        const include = {
            employee: {
                select: {
                    id: true,
                    employeeId: true,
                    firstName: true,
                    lastName: true,
                    photo: true,
                    designation: true,
                },
            },
        }

        let task
        try {
            task = await prisma.fieldTask.create({ data: { ...data, taskNo: await nextTaskNo() }, include })
        } catch (err: any) {
            // Two managers assigning at the same moment can race for the same
            // number; the unique index catches it, so take the next one once.
            if (err?.code !== "P2002") throw err
            task = await prisma.fieldTask.create({ data: { ...data, taskNo: await nextTaskNo() }, include })
        }

        // Same shape as GET so the client can show the new row without refetching.
        let siteName: string | null = null
        if (task.siteId) {
            const site = await prisma.site.findUnique({ where: { id: task.siteId }, select: { name: true } })
            siteName = site?.name ?? null
        }

        return NextResponse.json({ ...task, siteName })
    } catch (error) {
        console.error("[FIELD_TASKS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

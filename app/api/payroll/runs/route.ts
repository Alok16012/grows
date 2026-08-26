import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { ensurePayrollSchema } from "@/lib/payroll-schema"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const yearParam = searchParams.get("year")

        const where: Record<string, unknown> = {}
        if (yearParam) {
            // A non-numeric ?year used to reach Prisma as NaN, which throws and
            // turned a bad query string into a 500.
            const year = parseInt(yearParam, 10)
            if (!Number.isFinite(year)) {
                return new NextResponse("Invalid year", { status: 400 })
            }
            where.year = year
        }

        // Payroll/PayrollRun have no migration and prod migrations are manual,
        // so the tables can be missing or short a column here. Create them
        // before querying (no-op once warm).
        await ensurePayrollSchema()

        const runs = await prisma.payrollRun.findMany({
            where,
            orderBy: [{ year: "desc" }, { month: "desc" }],
            include: {
                _count: { select: { payrolls: true } },
            },
        })

        return NextResponse.json(runs)
    } catch (error) {
        console.error("[PAYROLL_RUNS_GET]", error)
        // Send the reason back: the payroll page only ever showed a generic
        // "Failed to load payroll runs", so a schema problem here was
        // indistinguishable from a network blip.
        // Prisma messages are multi-line and start with blank lines; keep the
        // first few non-empty ones so the toast stays readable.
        const raw = error instanceof Error ? error.message : ""
        const message = raw.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 3).join(" ").slice(0, 300)
        return new NextResponse(message || "Internal Error", { status: 500 })
    }
}

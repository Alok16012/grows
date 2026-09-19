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

        // Totals come from the rows, not from the columns on PayrollRun.
        // Processing runs site by site against one month-wide run, and the
        // stored totals used to be overwritten with whichever site went last —
        // so a run could report 657 employees beside a single site's gross.
        // The write side now sums the whole run, but runs processed before that
        // still carry the stale figure, and deleting rows never refreshed it
        // either. Deriving it here keeps the money column describing the same
        // rows as the employee count, which comes off the same relation.
        const sums = await prisma.payroll.groupBy({
            by: ["payrollRunId"],
            where: { payrollRunId: { in: runs.map(r => r.id) } },
            _sum: {
                grossSalary: true, netSalary: true,
                pfEmployer: true, esiEmployer: true,
                lwf: true, tds: true,
            },
        })
        const sumByRun = new Map(sums.map(s => [s.payrollRunId, s._sum]))

        return NextResponse.json(runs.map(run => {
            const s = sumByRun.get(run.id)
            // No rows yet (a run created but never processed): keep what's
            // stored rather than zeroing the row out.
            if (!s) return run
            return {
                ...run,
                totalGross:       s.grossSalary ?? 0,
                totalNet:         s.netSalary   ?? 0,
                totalPfEmployer:  s.pfEmployer  ?? 0,
                totalEsiEmployer: s.esiEmployer ?? 0,
                totalLwf:         s.lwf         ?? 0,
                totalTds:         s.tds         ?? 0,
            }
        }))
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

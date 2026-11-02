import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { ensurePayrollSchema } from "@/lib/payroll-schema"
import { onRollsWhere } from "@/lib/employee-filter"
import { auditLater, requestMeta } from "@/lib/access"
import { canCreatePeriod, latestPayrollPeriod, periodKey, periodLabel, shiftPeriod, istPeriod } from "@/lib/payroll-period"

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

        // A month made with Create next month has no rows until attendance is
        // uploaded. Say how many employees are on its rolls (joined by its end,
        // not left before it), counted live so people who join later count
        // too. Usually one such month, so one count.
        const onRolls = new Map<string, number>()
        for (const run of runs.filter(r => r._count.payrolls === 0)) {
            onRolls.set(run.id, await prisma.employee.count({ where: { AND: onRollsWhere(run.month, run.year) } }))
        }

        return NextResponse.json(runs.map(run => {
            const s = sumByRun.get(run.id)
            // No rows yet (a run created but never processed): keep what's
            // stored rather than zeroing the row out.
            if (!s) return onRolls.has(run.id) ? { ...run, onRolls: onRolls.get(run.id) } : run
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

// POST /api/payroll/runs { month, year } — Create next month.
// Creates the empty month (a DRAFT run, no rows) right after the newest one,
// so it can be opened and its attendance uploaded. Only that next month: no
// gaps, and not more than one month past today. Pay rows come later from the
// usual attendance upload, for whoever is on the rolls that month then.
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json().catch(() => ({}))
        const month = Number(body?.month), year = Number(body?.year)
        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
            return new NextResponse("A valid month and year are required", { status: 400 })
        }
        const wanted = { month, year }

        await ensurePayrollSchema()
        // Check and create under one lock. The (month, year) unique index is in
        // schema.prisma but missing on prod, so two clicks at once both passed
        // the "already created" check and made two Octobers. The advisory lock
        // is held to the end of the transaction, so the second request waits,
        // then sees the first one's month and is refused.
        const outcome = await prisma.$transaction(async tx => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payroll-run-create'))`
            const runs = await tx.payrollRun.findMany({ select: { month: true, year: true } })
            if (runs.some(r => r.month === month && r.year === year)) {
                return { status: 409, message: `${periodLabel(wanted)} is already created` } as const
            }
            const next = shiftPeriod(latestPayrollPeriod(runs, istPeriod()), 1)
            if (periodKey(wanted) !== periodKey(next)) {
                return { status: 400, message: `The next month to create is ${periodLabel(next)}, not ${periodLabel(wanted)}` } as const
            }
            if (!canCreatePeriod(wanted)) {
                return { status: 400, message: `${periodLabel(wanted)} is too far ahead — it can be created once ${periodLabel(shiftPeriod(wanted, -1))} begins` } as const
            }
            const run = await tx.payrollRun.create({
                data: { month, year, status: "DRAFT", processedBy: session.user.id ?? "system" },
            })
            return { status: 201, run } as const
        })
        if (outcome.status !== 201) return new NextResponse(outcome.message, { status: outcome.status })
        const run = outcome.run
        const onRolls = await prisma.employee.count({ where: { AND: onRollsWhere(month, year) } })

        auditLater({
            actorId: session.user.id, actorName: session.user.name ?? null, action: "payroll.month.create", targetType: "PayrollRun",
            targetId: run.id, targetName: `${month}/${year}`,
            summary: `${periodLabel(wanted)} created · ${onRolls} employees on the rolls`,
            after: { month, year, onRolls }, ...requestMeta(req),
        })
        return NextResponse.json({ ...run, _count: { payrolls: 0 }, onRolls }, { status: 201 })
    } catch (error) {
        console.error("[PAYROLL_RUNS_POST]", error)
        return new NextResponse("Could not create the month", { status: 500 })
    }
}

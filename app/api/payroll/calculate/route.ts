import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { calcGrowusPayroll } from "@/lib/payroll-calc"
import { getPayrollRules } from "@/lib/payroll-rules-server"
import { checkAccess } from "@/lib/permissions"

// Zero is a legitimate value here (an employee who worked no days), so `||`
// cannot be used to apply the default — it would silently pay a full month.
function numOrDefault(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === "") return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.manage")) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const body = await req.json()
        const { branchId, siteId, attendance } = body
        // Parse month/year as integers always
        const month = parseInt(String(body.month))
        const year  = parseInt(String(body.year))

        if (!month || !year) return new NextResponse("Month and Year required", { status: 400 })

        // Get or create the payroll run. A locked run is refused: processing
        // deletes and recreates the month's rows, so silently reopening a
        // PROCESSED run destroyed figures that PF/ESI challans were already
        // filed against. Unlocking is a deliberate act via
        // POST /api/payroll/reset?action=unlock.
        // PayrollRun.status is month-wide, but processing is done site by site,
        // and final/lock flips the whole run to PROCESSED even for a partial
        // lock. Refusing on the run would therefore block processing a site that
        // has never been run. Locked *rows* are protected individually below
        // instead, which is where the filed figures actually live.
        let runId: string
        const existing = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } })
        if (existing) {
            if (existing.status !== "DRAFT") {
                await prisma.payrollRun.update({
                    where: { id: existing.id },
                    data: { status: "DRAFT", processedBy: session.user.id ?? "system" }
                })
            }
            runId = existing.id
        } else {
            const created = await prisma.payrollRun.create({
                data: { month, year, processedBy: session.user.id ?? "system", status: "DRAFT" }
            })
            runId = created.id
        }

        // Build employee list:
        // If attendance array is provided (bulk upload flow), process EXACTLY those employees.
        // This ensures all employees from the uploaded sheet are processed, regardless of
        // whether they have a deployment record for this site.
        // Fallback: fetch by site deployment or branch if no attendance array is given.
        let employeeIds: string[] | null = null

        if (attendance && Array.isArray(attendance) && attendance.length > 0) {
            // Use the employee IDs from the attendance array directly
            employeeIds = (attendance as { employeeId: string }[]).map(a => a.employeeId).filter(Boolean)
        } else if (siteId) {
            const deployments = await prisma.deployment.findMany({
                where: { siteId, isActive: true },
                select: { employeeId: true },
            })
            employeeIds = deployments.map(d => d.employeeId)
            if (!employeeIds.length) return new NextResponse("No active deployments found for this site", { status: 404 })
        }

        const whereClause: Record<string, unknown> = {}
        if (employeeIds && employeeIds.length > 0) {
            // When processing from attendance upload, include ALL employees in the array
            // regardless of status — if they're in the sheet, they worked and need payroll
            whereClause.id = { in: employeeIds }
        } else {
            // Fallback (no attendance array): only process ACTIVE employees
            whereClause.status = "ACTIVE"
            if (branchId) whereClause.branchId = branchId
        }

        let employees = await prisma.employee.findMany({
            where: whereClause,
            include: { employeeSalary: true },
        })

        if (!employees.length) return new NextResponse("No active employees found", { status: 404 })

        // Rows already locked (PROCESSED/PAID) are left completely alone: the step
        // below deletes and recreates rows, which would otherwise wipe figures a
        // PF/ESI challan was already filed against. Processing another site, or
        // re-running this one, still works — those rows are DRAFT.
        const lockedRows = await prisma.payroll.findMany({
            where: {
                month, year,
                employeeId: { in: employees.map(e => e.id) },
                status: { not: "DRAFT" },
            },
            select: { employeeId: true },
        })
        const lockedEmployeeIds = new Set(lockedRows.map(r => r.employeeId))
        const skippedLocked = lockedEmployeeIds.size
        if (skippedLocked) {
            employees = employees.filter(e => !lockedEmployeeIds.has(e.id))
            if (!employees.length) {
                return new NextResponse(
                    `All ${skippedLocked} employee(s) for ${month}/${year} have locked payroll. Unlock before reprocessing.`,
                    { status: 409 }
                )
            }
        }

        // Company-configurable calculation rules (Payroll → Calculation Settings)
        const { rules } = await getPayrollRules()
        const defaultMonthDays = rules.defaults.monthDays
        let totalGross = 0, totalNet = 0, totalPfE = 0, totalEsiE = 0

        // ── STEP 1: Calculate ALL payroll values in memory (pure JS, zero DB calls) ──
        type PayrollRow = {
            employeeId: string
            payrollRunId: string
            month: number
            year: number
            siteId: string | null
            processedBy: string
            status: "DRAFT"
            workingDays: number
            presentDays: number
            lwpDays: number
            overtimeHrs: number
            canteenDays: number
            [key: string]: unknown
        }

        const allRows: PayrollRow[] = employees.map(emp => {
            const sal      = emp.employeeSalary
            const salBasic = sal?.basic ?? emp.basicSalary ?? 0
            const salData  = sal  // use salary structure if it exists (PROPOSED or APPROVED)

            const attInput = (attendance as any[])?.find((a: any) => a.employeeId === emp.id) ?? {}
            const att = {
                monthDays:           parseInt(String(attInput.monthDays  ?? defaultMonthDays)) || defaultMonthDays,
                // `|| defaultMonthDays` treated 0 as missing, so marking an
                // employee as having worked zero days paid them a full month.
                // Only fall back when the value is genuinely absent or unparseable.
                workedDays:          numOrDefault(attInput.workedDays, defaultMonthDays),
                otDays:              Number(attInput.otDays)              || 0,
                canteenDays:         Math.round(Number(attInput.canteenDays) || 0),
                penalty:             Number(attInput.penalty)             || 0,
                advance:             Number(attInput.advance)             || 0,
                otherDeductions:     Number(attInput.otherDeductions)     || 0,
                productionIncentive: Number(attInput.productionIncentive) || 0,
                lwf:                 Number(attInput.lwf)                 || 0,
            }

            console.log(`[PAYROLL_DEBUG] ${emp.employeeId} ${emp.firstName} ${emp.lastName}: basic=${salBasic} da=${salData?.da} pfBase=min(${salBasic}+${salData?.da},15000)=${Math.min(salBasic + (salData?.da || 0), 15000)}`)
            const calc = calcGrowusPayroll({
                basic:             salBasic,
                da:                salData?.da               ?? 0,
                hra:               salData?.hra              ?? 0,
                washing:           salData?.washing          ?? 0,
                conveyance:        salData?.conveyance       ?? 0,
                leaveWithWages:    salData?.leaveWithWages   ?? 0,
                otherAllowance:    salData?.otherAllowance   ?? 0,
                bonus:             salData?.bonus            ?? undefined,
                otRatePerHour:     salData?.otRatePerHour    ?? rules.defaults.otRatePerHour,
                canteenRatePerDay: salData?.canteenRatePerDay ?? rules.defaults.canteenRatePerDay,
                complianceType:    salData?.complianceType   ?? "OR",
                isHandicap:        emp.isHandicap            ?? false,
            }, {
                ...att,
                gender: emp.gender ?? "Male",
                month,
            }, rules)

            totalGross += calc.grossSalary
            totalNet   += calc.netSalary
            totalPfE   += calc.pfEmployer
            totalEsiE  += calc.esiEmployer

            return {
                employeeId:  emp.id,
                payrollRunId: runId,
                month, year,
                siteId:      siteId ?? null,
                ...calc,
                canteenDays: att.canteenDays,
                workingDays: att.monthDays,
                presentDays: att.workedDays,
                lwpDays:     att.monthDays - att.workedDays,
                // Actual OT hours: 1 OT day = rules.ot.hoursPerDay extra hours
                // (was hardcoded ×8 while pay was computed at ×4).
                overtimeHrs: Math.round(att.otDays * rules.ot.hoursPerDay),
                status:      "DRAFT" as const,
                processedBy: session.user.id ?? "system",
            }
        })

        // ── STEP 2: Delete existing records for this month/year (1 DB call) ─────────
        // Then recreate all — avoids sequential per-row updates which cause timeouts
        // when Vercel (Mumbai) and Supabase are in different regions (200ms × 144 = 28s+).
        // Safe to delete: no other table has a FK referencing Payroll.id.
        await prisma.payroll.deleteMany({
            where: {
                month, year,
                employeeId: { in: employees.map(e => e.id) },
                // Never delete a locked row, even if one slipped past the filter
                // above (e.g. locked by someone else mid-request).
                status: "DRAFT",
            },
        })

        // ── STEP 3: Bulk-insert ALL rows in one shot (1 DB call) ─────────────────
        await prisma.payroll.createMany({ data: allRows })

        const processedCount = allRows.length

        // ── STEP 5: Update payroll run totals (1 DB call) ─────────────────────────
        await prisma.payrollRun.update({
            where: { id: runId },
            data: { totalGross, totalNet, totalPfEmployer: totalPfE, totalEsiEmployer: totalEsiE }
        })

        return NextResponse.json({
            success: true,
            processedCount,
            runId,
            failedCount: 0,
            totalEmployees: employees.length,
            // Locked rows left untouched, so the caller can say so rather than
            // silently reporting a lower processed count.
            skippedLocked,
        })
    } catch (error) {
        console.error("[PAYROLL_CALCULATE]", error)
        const msg = error instanceof Error ? error.message : "Internal Error"
        return new NextResponse(msg, { status: 500 })
    }
}

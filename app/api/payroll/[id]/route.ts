import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { computePt } from "@/lib/payroll-rules"
import { getPayrollRules } from "@/lib/payroll-rules-server"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const payroll = await prisma.payroll.findUnique({
            where: { id: params.id },
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        basicSalary: true,
                        branch: { select: { name: true } },
                        department: { select: { name: true } },
                    },
                },
            },
        })

        if (!payroll) return new NextResponse("Not found", { status: 404 })
        return NextResponse.json(payroll)
    } catch (error) {
        console.error("[PAYROLL_GET_ID]", error)
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
        // Writing amounts/status is a manage operation — payroll.view is read-only.
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "payroll.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { allowances, tds, otherDeductions, overtimePay, remarks, status } = body

        const existing = await prisma.payroll.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not found", { status: 404 })

        const updateData: Record<string, unknown> = {}

        if (allowances !== undefined) updateData.allowances = allowances
        if (tds !== undefined) updateData.tds = tds
        if (otherDeductions !== undefined) updateData.otherDeductions = otherDeductions
        if (overtimePay !== undefined) updateData.overtimePay = overtimePay
        if (remarks !== undefined) updateData.remarks = remarks

        if (status !== undefined) {
            if (!["DRAFT", "PROCESSED", "PAID"].includes(status)) {
                return new NextResponse("Invalid status", { status: 400 })
            }
            updateData.status = status
            if (status === "PROCESSED") {
                updateData.processedAt = new Date()
                updateData.processedBy = session.user.id
            }
            if (status === "PAID") {
                updateData.paidAt = new Date()
                updateData.paidBy = session.user.id
            }
        }

        // Recalculate ONLY when a financial field actually changed. This used
        // to run on every request with legacy math (basic + hra + allowances,
        // no DA/washing/bonus, deductions without PT/LWF/canteen/advance) — so
        // a bare status update like "mark credited" silently rewrote gross and
        // net with wrong figures.
        const hasFinancialEdit = [allowances, tds, otherDeductions, overtimePay]
            .some(v => v !== undefined)

        if (hasFinancialEdit) {
            // Locked rows are what challans were filed against — never rewrite
            // their amounts. (Status/remarks updates above remain allowed.)
            if (existing.status !== "DRAFT") {
                return new NextResponse("Amounts on a locked payroll cannot be edited. Unlock the run first.", { status: 409 })
            }

            const [{ rules }, employee] = await Promise.all([
                getPayrollRules(),
                prisma.employee.findUnique({
                    where: { id: existing.employeeId },
                    select: { gender: true, isHandicap: true, employeeSalary: { select: { complianceType: true } } },
                }),
            ])
            const isCALL = employee?.employeeSalary?.complianceType === "CALL"
            const isFemale = (employee?.gender ?? "").toLowerCase() === "female"

            const newAllowances = allowances !== undefined ? Number(allowances) || 0 : existing.allowances
            const newOvertimePay = overtimePay !== undefined ? Number(overtimePay) || 0 : existing.overtimePay
            const newTds = tds !== undefined ? Number(tds) || 0 : existing.tds
            const newOtherDeductions = otherDeductions !== undefined ? Number(otherDeductions) || 0 : existing.otherDeductions

            // Earned gross = every earned component stored on the row, with the
            // edited allowances/OT applied — mirrors lib/payroll-calc.ts.
            const grossSalary =
                existing.basicSalary + existing.da + existing.hra + existing.washing +
                existing.conveyance + existing.lwwEarned + existing.bonus +
                newAllowances + newOvertimePay + existing.productionIncentive

            // ESIC follows the engine: eligibility on FULL-MONTH structure
            // gross, wages exclude washing/conveyance/bonus per rules, CALL exempt.
            const esicLimit = employee?.isHandicap ? rules.esic.handicapLimit : rules.esic.eligibilityLimit
            const esicEligible = rules.esic.enabled && !isCALL && existing.grossFullMonth <= esicLimit
            const esicWages = Math.max(0,
                grossSalary
                - (rules.esic.excludeWashing ? existing.washing : 0)
                - (rules.esic.excludeConveyance ? existing.conveyance : 0)
                - (rules.esic.excludeBonus ? existing.bonus : 0))
            const esiEmployee = esicEligible ? Math.ceil(esicWages * rules.esic.employeePct / 100) : 0
            const esiEmployer = esicEligible ? Math.ceil(esicWages * rules.esic.employerPct / 100) : 0

            // PT slab can shift when gross changes.
            const pt = computePt(grossSalary, rules.pt, {
                isFebruary: existing.month === 2,
                isFemale,
                isCall: isCALL,
                // Female limit reads the structure gross, same as the engine.
                femaleExemptBasis: existing.grossFullMonth,
            })

            const totalDeductions =
                existing.pfEmployee + esiEmployee + pt + existing.lwf +
                existing.canteen + existing.penalty + existing.advance +
                newTds + newOtherDeductions
            const netSalary = grossSalary - totalDeductions

            updateData.grossSalary = Math.round(grossSalary)
            updateData.esiEmployee = esiEmployee
            updateData.esiEmployer = esiEmployer
            updateData.pt = pt
            updateData.totalDeductions = totalDeductions
            updateData.netSalary = Math.round(netSalary)
        }

        const payroll = await prisma.payroll.update({
            where: { id: params.id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        employeeId: true,
                        designation: true,
                        photo: true,
                        branch: { select: { name: true } },
                        department: { select: { name: true } },
                    },
                },
            },
        })

        return NextResponse.json(payroll)
    } catch (error) {
        console.error("[PAYROLL_PUT]", error)
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
        // Deleting a payroll row is a manage operation — payroll.view is read-only.
        if (!checkAccess(session, [], "payroll.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const existing = await prisma.payroll.findUnique({ where: { id: params.id } })
        if (!existing) return new NextResponse("Not found", { status: 404 })
        if (existing.status !== "DRAFT") {
            return new NextResponse("Only DRAFT payrolls can be deleted", { status: 400 })
        }

        await prisma.payroll.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[PAYROLL_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

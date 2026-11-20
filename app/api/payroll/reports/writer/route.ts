import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope, hiddenFields } from "@/lib/access"
import { REPORT_COLUMNS, REPORT_KEYS } from "@/lib/report-writer"

export const dynamic = "force-dynamic"

// GET /api/payroll/reports/writer?month=10&year=2026&siteId=&columns=a,b,c
// One row per payroll row for the month, holding only the ticked columns.
// The caller's data scope applies, and KYC / bank / personal fields their role
// may not see come back blank (same switches as Employee Master).
export async function GET(req: Request) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    const { access } = g

    const { searchParams } = new URL(req.url)
    const month = Number(searchParams.get("month"))
    const year = Number(searchParams.get("year"))
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000) {
        return NextResponse.json({ error: "Pick a month and year." }, { status: 400 })
    }
    const siteId = searchParams.get("siteId") || null
    const requested = (searchParams.get("columns") ?? "").split(",").filter(k => REPORT_KEYS.has(k))
    const columns = requested.length ? requested : REPORT_COLUMNS.filter(c => c.preset).map(c => c.key)

    try {
        const scope = await employeeScope(access)
        const payrolls = await prisma.payroll.findMany({
            where: {
                month, year,
                ...(siteId ? { siteId } : {}),
                ...(scope ? { employee: scope } : {}),
            },
            include: {
                employee: {
                    select: {
                        employeeId: true, firstName: true, middleName: true, lastName: true, fathersName: true,
                        phone: true, email: true, dateOfBirth: true, dateOfJoining: true, designation: true,
                        uan: true, esiNumber: true, bankAccountNumber: true, bankIFSC: true, bankName: true,
                        address: true, city: true, state: true, pincode: true,
                        permanentAddress: true, permanentCity: true, permanentState: true, permanentPincode: true,
                        department: { select: { name: true } },
                    },
                },
            },
        })

        const siteIds = Array.from(new Set(payrolls.map(p => p.siteId).filter((x): x is string => !!x)))
        const sites = siteIds.length ? await prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } }) : []
        const siteName = new Map(sites.map(s => [s.id, s.name]))

        const hidden = hiddenFields(access)
        const show = (field: string, v: unknown) => (hidden.has(field) ? "" : v ?? "")
        const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "")
        const joinAddr = (...parts: (string | null)[]) => parts.map(x => (x ?? "").trim()).filter(Boolean).join(", ")
        const r2 = (n: number) => Math.round((n ?? 0) * 100) / 100

        // Site, then employee code — the order a wage register is read in.
        const keyOf = (p: typeof payrolls[number]) => `${p.siteId ? siteName.get(p.siteId) ?? "" : ""}|${p.employee.employeeId}`
        payrolls.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))

        const rows = payrolls.map(p => {
            const e = p.employee
            const all: Record<string, unknown> = {
                empCode: e.employeeId,
                empName: [e.firstName, e.middleName].filter(Boolean).join(" "),
                surname: e.lastName ?? "",
                fatherName: show("fathersName", e.fathersName),
                phone: show("phone", e.phone),
                email: show("email", e.email),
                dob: hidden.has("dateOfBirth") ? "" : date(e.dateOfBirth),
                doj: date(e.dateOfJoining),
                designation: e.designation ?? "",
                department: e.department?.name ?? "",
                site: p.siteId ? siteName.get(p.siteId) ?? "" : "",
                uan: show("uan", e.uan),
                esicNo: show("esiNumber", e.esiNumber),
                accountNo: show("bankAccountNumber", e.bankAccountNumber),
                ifsc: show("bankIFSC", e.bankIFSC),
                bankName: show("bankName", e.bankName),
                addressPresent: hidden.has("address") ? "" : joinAddr(e.address, e.city, e.state, e.pincode),
                addressPermanent: hidden.has("permanentAddress") ? "" : joinAddr(e.permanentAddress, e.permanentCity, e.permanentState, e.permanentPincode),
                monthDays: p.workingDays,
                paidDays: p.presentDays,
                otDays: p.otDays,
                basic: r2(p.basicSalary), da: r2(p.da), hra: r2(p.hra), washing: r2(p.washing),
                conveyance: r2(p.conveyance), lww: r2(p.lwwEarned), bonus: r2(p.bonus), otherAllow: r2(p.allowances),
                ot: r2(p.overtimePay), prodIncentive: r2(p.productionIncentive), gross: r2(p.grossSalary),
                basicTh: r2(p.basicFull), daTh: r2(p.daFull), hraTh: r2(p.hraFull), washingTh: r2(p.washingFull),
                conveyanceTh: r2(p.conveyanceFull), lwwTh: r2(p.lwwFull), bonusTh: r2(p.bonusFull),
                otherAllowTh: r2(p.otherFull), grossTh: r2(p.grossFullMonth),
                pf: r2(p.pfEmployee), esic: r2(p.esiEmployee), pt: r2(p.pt), lwf: r2(p.lwf),
                canteen: r2(p.canteen), penalty: r2(p.penalty), otherDed: r2(p.otherDeductions),
                advanceDed: r2(p.advance), tds: r2(p.tds), totalDed: r2(p.totalDeductions), net: r2(p.netSalary),
                pfEr: r2(p.pfEmployer), esicEr: r2(p.esiEmployer), ctc: r2(p.ctc),
            }
            return Object.fromEntries(columns.map(k => [k, all[k] ?? ""]))
        })

        return NextResponse.json({ columns, rows, total: rows.length })
    } catch (e) {
        console.error("[REPORT_WRITER]", e)
        return NextResponse.json({ error: "Could not build the report." }, { status: 500 })
    }
}

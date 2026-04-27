import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

type PayrollRow = {
    id: string
    month: number
    year: number
    siteId: string | null
    basicSalary: number
    da: number
    hra: number
    washing: number
    conveyance: number
    lwwEarned: number
    bonus: number
    allowances: number
    overtimePay: number
    grossSalary: number
    pfEmployee: number
    pfEmployer: number
    esiEmployee: number
    esiEmployer: number
    pt: number
    lwf: number
    canteen: number
    penalty: number
    advance: number
    otherDeductions: number
    totalDeductions: number
    netSalary: number
    workingDays: number | null
    presentDays: number | null
    basicFull: number
    daFull: number
    hraFull: number
    washingFull: number
    conveyanceFull: number
    lwwFull: number
    bonusFull: number
    otherFull: number
    employee: {
        id: string
        employeeId: string
        firstName: string
        lastName: string
        designation: string | null
        uan: string | null
        pfNumber: string | null
        esiNumber: string | null
        state: string | null
        bankAccountNumber: string | null
        bankIFSC: string | null
    }
}

function pfWages(p: PayrollRow) {
    return Math.min(p.basicSalary + p.da, 15000)
}
function epsContrib(p: PayrollRow) {
    return Math.round(pfWages(p) * 0.0833)
}
function esiWages(p: PayrollRow) {
    return p.grossSalary - (p.washing ?? 0) - (p.bonus ?? 0)
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER)) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get("month") || "")
        const year = parseInt(searchParams.get("year") || "")
        const type = searchParams.get("type") || "pf-summary"
        const stateFilter = searchParams.get("state") || ""
        const siteId = searchParams.get("siteId") || ""

        if (!month || !year) {
            return new NextResponse("Month and Year required", { status: 400 })
        }

        const where: Record<string, unknown> = { month, year }
        if (siteId) where.siteId = siteId

        const payrolls = await prisma.payroll.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        employeeId: true,
                        firstName: true,
                        lastName: true,
                        designation: true,
                        uan: true,
                        pfNumber: true,
                        esiNumber: true,
                        state: true,
                        bankAccountNumber: true,
                        bankIFSC: true,
                    }
                }
            },
            orderBy: { employee: { firstName: "asc" } }
        }) as PayrollRow[]

        if (payrolls.length === 0) {
            return new NextResponse("No payroll data found for this period.", { status: 404 })
        }

        // Apply state filter if provided
        const filtered = stateFilter
            ? payrolls.filter(p => p.employee.state?.toLowerCase() === stateFilter.toLowerCase())
            : payrolls

        // ── Helper: group by siteId and fetch site names ──────────────────────────
        async function groupBySite(rows: PayrollRow[]) {
            const siteMap = new Map<string, PayrollRow[]>()
            for (const p of rows) {
                const key = p.siteId ?? "NO_SITE"
                if (!siteMap.has(key)) siteMap.set(key, [])
                siteMap.get(key)!.push(p)
            }
            const ids = [...siteMap.keys()].filter(k => k !== "NO_SITE")
            const sites = ids.length > 0
                ? await prisma.site.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
                : []
            const nameMap = new Map(sites.map(s => [s.id, s.name]))
            return { siteMap, nameMap }
        }

        let data: Record<string, string | number | null>[] = []

        // ── Summary reports: site-wise aggregated ────────────────────────────────
        if (type === "pf-summary") {
            const { siteMap, nameMap } = await groupBySite(filtered)
            let sr = 1
            for (const [sid, rows] of siteMap) {
                const siteName = sid === "NO_SITE" ? "Unassigned" : (nameMap.get(sid) ?? sid)
                const totPfWages   = rows.reduce((s, p) => s + pfWages(p), 0)
                const tot12        = rows.reduce((s, p) => s + p.pfEmployee, 0)
                const totEPS       = rows.reduce((s, p) => s + epsContrib(p), 0)
                const totER367     = rows.reduce((s, p) => s + Math.max(0, p.pfEmployer - epsContrib(p)), 0)
                const totEDLI      = Math.round(totPfWages * 0.005)
                const totAdmin     = Math.round(totPfWages * 0.005)
                const exemptRows   = rows.filter(p => p.pfEmployee === 0 && p.grossSalary > 0)
                data.push({
                    "Sr": sr++,
                    "Site Name": siteName,
                    "No of Emp": rows.length,
                    "EPF Sal/Wag": Math.round(totPfWages),
                    "EPS Sal/Wag": Math.round(totPfWages),
                    "EDLI Sal/Wag": Math.round(totPfWages),
                    "12%": Math.round(tot12),
                    "3.67%": Math.round(totER367),
                    "8.33%": Math.round(totEPS),
                    "0.50% (EDLI)": totEDLI,
                    "0.50% (Admin)": totAdmin,
                    "0.00%": 0,
                    "Total": Math.round(tot12 + totEPS + totER367 + totEDLI + totAdmin),
                    "Exm Emp": exemptRows.length,
                    "Exmpted Sal/Wages": Math.round(exemptRows.reduce((s, p) => s + p.grossSalary, 0)),
                })
            }
            // Grand total row
            if (siteMap.size > 1) {
                const all = filtered
                const totPfW = all.reduce((s, p) => s + pfWages(p), 0)
                const t12    = all.reduce((s, p) => s + p.pfEmployee, 0)
                const tEPS   = all.reduce((s, p) => s + epsContrib(p), 0)
                const tER    = all.reduce((s, p) => s + Math.max(0, p.pfEmployer - epsContrib(p)), 0)
                const tEDLI  = Math.round(totPfW * 0.005)
                const tAdmin = Math.round(totPfW * 0.005)
                const exEmps = all.filter(p => p.pfEmployee === 0 && p.grossSalary > 0)
                data.push({
                    "Sr": "",
                    "Site Name": "GRAND TOTAL",
                    "No of Emp": all.length,
                    "EPF Sal/Wag": Math.round(totPfW),
                    "EPS Sal/Wag": Math.round(totPfW),
                    "EDLI Sal/Wag": Math.round(totPfW),
                    "12%": Math.round(t12),
                    "3.67%": Math.round(tER),
                    "8.33%": Math.round(tEPS),
                    "0.50% (EDLI)": tEDLI,
                    "0.50% (Admin)": tAdmin,
                    "0.00%": 0,
                    "Total": Math.round(t12 + tEPS + tER + tEDLI + tAdmin),
                    "Exm Emp": exEmps.length,
                    "Exmpted Sal/Wages": Math.round(exEmps.reduce((s, p) => s + p.grossSalary, 0)),
                })
            }
        }

        else if (type === "esic-summary") {
            const { siteMap, nameMap } = await groupBySite(filtered)
            let sr = 1
            for (const [sid, rows] of siteMap) {
                const siteName   = sid === "NO_SITE" ? "Unassigned" : (nameMap.get(sid) ?? sid)
                const esiRows    = rows.filter(p => p.esiEmployee > 0)
                const exemptRows = rows.filter(p => p.esiEmployee === 0 && p.grossSalary > 21000)
                const totWages   = esiRows.reduce((s, p) => s + esiWages(p), 0)
                const totEmpCont = esiRows.reduce((s, p) => s + p.esiEmployee, 0)
                const totErCont  = esiRows.reduce((s, p) => s + p.esiEmployer, 0)
                data.push({
                    "Sr.No": sr++,
                    "Site Name": siteName,
                    "Emp": esiRows.length,
                    "Wages": Math.round(totWages),
                    "Emp. Cont.": Math.round(totEmpCont),
                    "Empr. Cont": parseFloat(totErCont.toFixed(2)),
                    "Total": parseFloat((totEmpCont + totErCont).toFixed(2)),
                    "Ex. Emp": exemptRows.length,
                    "Ex. Wages": Math.round(exemptRows.reduce((s, p) => s + p.grossSalary, 0)),
                })
            }
            // Grand total
            if (siteMap.size > 1) {
                const all        = filtered
                const esiAll     = all.filter(p => p.esiEmployee > 0)
                const exAll      = all.filter(p => p.esiEmployee === 0 && p.grossSalary > 21000)
                const totW       = esiAll.reduce((s, p) => s + esiWages(p), 0)
                const tEmp       = esiAll.reduce((s, p) => s + p.esiEmployee, 0)
                const tEr        = esiAll.reduce((s, p) => s + p.esiEmployer, 0)
                data.push({
                    "Sr.No": "",
                    "Site Name": "GRAND TOTAL",
                    "Emp": esiAll.length,
                    "Wages": Math.round(totW),
                    "Emp. Cont.": Math.round(tEmp),
                    "Empr. Cont": parseFloat(tEr.toFixed(2)),
                    "Total": parseFloat((tEmp + tEr).toFixed(2)),
                    "Ex. Emp": exAll.length,
                    "Ex. Wages": Math.round(exAll.reduce((s, p) => s + p.grossSalary, 0)),
                })
            }
        }

        else if (type === "pt-summary") {
            const { siteMap, nameMap } = await groupBySite(filtered)
            let sr = 1
            for (const [sid, rows] of siteMap) {
                const siteName = sid === "NO_SITE" ? "Unassigned" : (nameMap.get(sid) ?? sid)
                const slab0   = rows.filter(p => p.pt === 0).length
                const slab175 = rows.filter(p => p.pt === 175).length
                const slab200 = rows.filter(p => p.pt === 200).length
                const totAmt  = rows.reduce((s, p) => s + p.pt, 0)
                data.push({
                    "Sr.No": sr++,
                    "Site Name": siteName,
                    "0": slab0,
                    "175": slab175,
                    "200": slab200,
                    "Total Employees": rows.length,
                    "Total Amt": Math.round(totAmt),
                })
            }
            // Grand total
            if (siteMap.size > 1) {
                const all = filtered
                data.push({
                    "Sr.No": "",
                    "Site Name": "GRAND TOTAL",
                    "0": all.filter(p => p.pt === 0).length,
                    "175": all.filter(p => p.pt === 175).length,
                    "200": all.filter(p => p.pt === 200).length,
                    "Total Employees": all.length,
                    "Total Amt": Math.round(all.reduce((s, p) => s + p.pt, 0)),
                })
            }
        }

        // ── Employee-level reports ───────────────────────────────────────────────
        else {
            switch (type) {
                case "pf-deduction":
                    data = filtered.map(p => ({
                        "Emp ID": p.employee.employeeId,
                        "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "UAN": p.employee.uan ?? "",
                        "PF Number": p.employee.pfNumber ?? "",
                        "Gross Salary": p.grossSalary,
                        "PF Wages": pfWages(p),
                        "PF Employee (12%)": p.pfEmployee,
                        "PF Employer (13%)": p.pfEmployer,
                        "Total PF": p.pfEmployee + p.pfEmployer,
                        "Month": month,
                        "Year": year,
                    }))
                    break

                case "pf-challan":
                    data = filtered.map(p => ({
                        "UAN": p.employee.uan ?? "",
                        "Member Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "Emp ID": p.employee.employeeId,
                        "PF Number": p.employee.pfNumber ?? "",
                        "Gross Wages": p.grossSalary,
                        "EPF Wages": pfWages(p),
                        "EPS Wages": pfWages(p),
                        "EPF Contribution (EE)": p.pfEmployee,
                        "EPS Contribution (ER)": epsContrib(p),
                        "EPF Contribution (ER)": Math.max(0, p.pfEmployer - epsContrib(p)),
                        "NCP Days": (p.workingDays ?? 26) - (p.presentDays ?? p.workingDays ?? 26),
                        "Refund of Advances": 0,
                    }))
                    break

                case "pf-ecr":
                    data = filtered.map(p => ({
                        "UAN": p.employee.uan ?? "",
                        "Member Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "Gross Wages": p.grossSalary,
                        "EPF Wages": pfWages(p),
                        "EPS Wages": pfWages(p),
                        "EPF Contribution (EE)": p.pfEmployee,
                        "EPF Contribution (ER)": p.pfEmployer,
                        "EPS Contribution": epsContrib(p),
                        "NCP Days": (p.workingDays ?? 26) - (p.presentDays ?? p.workingDays ?? 26),
                        "Refund of Advances": 0,
                    }))
                    break

                case "pf-register":
                    data = filtered.map(p => ({
                        "UAN": p.employee.uan ?? "",
                        "Emp ID": p.employee.employeeId,
                        "Member Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "PF Number": p.employee.pfNumber ?? "",
                        "Month": month,
                        "Year": year,
                        "Basic + DA": p.basicSalary + p.da,
                        "PF Wages (Capped 15000)": pfWages(p),
                        "Employee PF": p.pfEmployee,
                        "Employer PF": p.pfEmployer,
                        "Total PF Contribution": p.pfEmployee + p.pfEmployer,
                        "Working Days": p.workingDays ?? 26,
                        "Present Days": p.presentDays ?? p.workingDays ?? 26,
                    }))
                    break

                case "esic-deduction":
                    data = filtered.map(p => ({
                        "Sr.No": "",
                        "ESI Number": p.employee.esiNumber ?? "",
                        "Employee Code": p.employee.employeeId,
                        "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "Pay Days": p.presentDays ?? p.workingDays ?? 0,
                        "Gross": Math.round(esiWages(p)),
                        "ESI Employee": p.esiEmployee,
                        "ESI Employer": parseFloat(p.esiEmployer.toFixed(2)),
                    }))
                    // Add serial numbers
                    data.forEach((row, i) => { row["Sr.No"] = i + 1 })
                    break

                case "esic-challan":
                    data = filtered.map(p => ({
                        "ESI Number": p.employee.esiNumber ?? "",
                        "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "Emp ID": p.employee.employeeId,
                        "Contribution Month": `${month}/${year}`,
                        "ESI Wages": Math.round(esiWages(p)),
                        "Employee Contribution (0.75%)": p.esiEmployee,
                        "Employer Contribution (3.25%)": parseFloat(p.esiEmployer.toFixed(2)),
                        "Total Contribution": parseFloat((p.esiEmployee + p.esiEmployer).toFixed(2)),
                        "Working Days": p.workingDays ?? 26,
                        "Present Days": p.presentDays ?? p.workingDays ?? 26,
                    }))
                    break

                case "pt-deduction":
                    data = filtered.map(p => ({
                        "Emp ID": p.employee.employeeId,
                        "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "State": p.employee.state ?? "",
                        "Gross Salary": p.grossSalary,
                        "PT Deducted": p.pt,
                        "Month": month,
                        "Year": year,
                    }))
                    break

                case "pt-challan":
                    data = filtered.map(p => ({
                        "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "Emp ID": p.employee.employeeId,
                        "State": p.employee.state ?? "",
                        "Contribution Month": `${month}/${year}`,
                        "Gross Salary": p.grossSalary,
                        "PT Amount": p.pt,
                        "Working Days": p.workingDays ?? 26,
                        "Present Days": p.presentDays ?? p.workingDays ?? 26,
                    }))
                    break

                case "wage-sheet": {
                    // Form II — MW Rules Rule (27)(1) format
                    // Returns employee-level rows; frontend stacks them per site
                    data = filtered.map((p, i) => ({
                        "Sr.No": i + 1,
                        "Emp Code": p.employee.employeeId,
                        "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                        "IFSC CODE": p.employee.bankIFSC ?? "",
                        "ACCOUNT NO.": p.employee.bankAccountNumber ?? "",
                        "Days Paid": p.presentDays ?? p.workingDays ?? 0,
                        "OT Hrs": 0,
                        // CTC (full month) rate columns
                        "Basic_R": Math.round(p.basicFull ?? p.basicSalary),
                        "DA_R": Math.round(p.daFull ?? p.da),
                        "HRA_R": Math.round(p.hraFull ?? p.hra),
                        "Conv_R": Math.round(p.conveyanceFull ?? p.conveyance),
                        "Washing_R": Math.round(p.washingFull ?? p.washing),
                        "Leave_R": Math.round(p.lwwFull ?? p.lwwEarned),
                        "Bonus_R": Math.round(p.bonusFull ?? p.bonus),
                        // Earned columns
                        "BASIC": Math.round(p.basicSalary),
                        "DA": Math.round(p.da),
                        "HRA": Math.round(p.hra),
                        "CONVEYANCE ALLOWANCE": Math.round(p.conveyance),
                        "WASHING ALLOW": Math.round(p.washing),
                        "LEAVE AMT": Math.round(p.lwwEarned),
                        "BONUS AMT": Math.round(p.bonus),
                        "OT Amt": Math.round(p.overtimePay),
                        "Gross Earning": Math.round(p.grossSalary),
                        // Deductions
                        "PF": Math.round(p.pfEmployee),
                        "ESIC": Math.round(p.esiEmployee),
                        "PT": Math.round(p.pt),
                        "LWF": Math.round(p.lwf),
                        "CANTEEN": Math.round(p.canteen),
                        "OTHER DED": Math.round(p.otherDeductions),
                        "ADVANCE": Math.round(p.advance),
                        "Tot Ded": Math.round(p.totalDeductions),
                        "Net Pay": Math.round(p.netSalary),
                        "Signature": "",
                    }))
                    break
                }

                default:
                    return new NextResponse("Invalid report type", { status: 400 })
            }
        }

        return NextResponse.json(data)

    } catch (error) {
        console.error("[COMPLIANCE_REPORT_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

type PayrollWithEmployee = {
    id: string
    month: number
    year: number
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
    }
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

        if (!month || !year) {
            return new NextResponse("Month and Year required", { status: 400 })
        }

        const payrolls = await prisma.payroll.findMany({
            where: { month, year },
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
                    }
                }
            },
            orderBy: { employee: { firstName: "asc" } }
        }) as PayrollWithEmployee[]

        if (payrolls.length === 0) {
            return new NextResponse("No payroll data found for this period.", { status: 404 })
        }

        // Apply state filter if provided
        const filtered = stateFilter
            ? payrolls.filter(p => p.employee.state?.toLowerCase() === stateFilter.toLowerCase())
            : payrolls

        let data: Record<string, string | number | null>[] = []

        switch (type) {
            case "pf-deduction":
                data = filtered.map(p => ({
                    "Emp ID": p.employee.employeeId,
                    "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "UAN": p.employee.uan ?? "",
                    "PF Number": p.employee.pfNumber ?? "",
                    "Gross Salary": p.grossSalary,
                    "PF Wages": Math.min(p.basicSalary + (p.da ?? 0), 15000),
                    "PF Employee (12%)": p.pfEmployee,
                    "PF Employer (13%)": p.pfEmployer,
                    "Total PF": p.pfEmployee + p.pfEmployer,
                    "Month": month,
                    "Year": year,
                }))
                break

            case "pf-summary":
                data = filtered.map(p => ({
                    "Emp ID": p.employee.employeeId,
                    "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "UAN": p.employee.uan ?? "",
                    "PF Number": p.employee.pfNumber ?? "",
                    "Designation": p.employee.designation ?? "",
                    "Worked Days": p.presentDays ?? p.workingDays ?? 0,
                    "Basic": p.basicSalary,
                    "DA": p.da ?? 0,
                    "Gross Salary": p.grossSalary,
                    "PF Employee": p.pfEmployee,
                    "PF Employer": p.pfEmployer,
                    "Net Salary": p.netSalary,
                }))
                break

            case "pf-challan":
                data = filtered.map(p => ({
                    "UAN": p.employee.uan ?? "",
                    "Member Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "Emp ID": p.employee.employeeId,
                    "PF Number": p.employee.pfNumber ?? "",
                    "Gross Wages": p.grossSalary,
                    "EPF Wages": Math.min(p.basicSalary + (p.da ?? 0), 15000),
                    "EPS Wages": Math.min(p.basicSalary + (p.da ?? 0), 15000),
                    "EPF Contribution (EE)": p.pfEmployee,
                    "EPS Contribution (ER)": Math.round(Math.min(p.basicSalary + (p.da ?? 0), 15000) * 0.0833),
                    "EPF Contribution (ER)": p.pfEmployer - Math.round(Math.min(p.basicSalary + (p.da ?? 0), 15000) * 0.0833),
                    "NCP Days": (p.workingDays ?? 26) - (p.presentDays ?? p.workingDays ?? 26),
                    "Refund of Advances": 0,
                }))
                break

            case "pf-ecr":
                data = filtered.map(p => ({
                    "UAN": p.employee.uan ?? "",
                    "Member Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "Gross Wages": p.grossSalary,
                    "EPF Wages": Math.min(p.basicSalary + (p.da ?? 0), 15000),
                    "EPS Wages": Math.min(p.basicSalary + (p.da ?? 0), 15000),
                    "EPF Contribution (EE)": p.pfEmployee,
                    "EPF Contribution (ER)": p.pfEmployer,
                    "EPS Contribution": Math.round(Math.min(p.basicSalary + (p.da ?? 0), 15000) * 0.0833),
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
                    "Basic + DA": p.basicSalary + (p.da ?? 0),
                    "PF Wages (Capped 15000)": Math.min(p.basicSalary + (p.da ?? 0), 15000),
                    "Employee PF": p.pfEmployee,
                    "Employer PF": p.pfEmployer,
                    "Total PF Contribution": p.pfEmployee + p.pfEmployer,
                    "Working Days": p.workingDays ?? 26,
                    "Present Days": p.presentDays ?? p.workingDays ?? 26,
                }))
                break

            case "esic-deduction":
                data = filtered.map(p => ({
                    "Emp ID": p.employee.employeeId,
                    "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "ESI Number": p.employee.esiNumber ?? "",
                    "PF Number": p.employee.pfNumber ?? "",
                    "Gross Salary": p.grossSalary,
                    "ESI Wages": p.grossSalary - (p.washing ?? 0) - (p.bonus ?? 0),
                    "ESI Employee (0.75%)": p.esiEmployee,
                    "ESI Employer (3.25%)": p.esiEmployer,
                    "Total ESI": p.esiEmployee + p.esiEmployer,
                    "Month": month,
                    "Year": year,
                }))
                break

            case "esic-summary":
                data = filtered.map(p => ({
                    "Emp ID": p.employee.employeeId,
                    "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "ESI Number": p.employee.esiNumber ?? "",
                    "Designation": p.employee.designation ?? "",
                    "Worked Days": p.presentDays ?? p.workingDays ?? 0,
                    "Gross Salary": p.grossSalary,
                    "ESI Employee": p.esiEmployee,
                    "ESI Employer": p.esiEmployer,
                    "Net Salary": p.netSalary,
                }))
                break

            case "esic-challan":
                data = filtered.map(p => ({
                    "ESI Number": p.employee.esiNumber ?? "",
                    "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "Emp ID": p.employee.employeeId,
                    "Contribution Month": `${month}/${year}`,
                    "ESI Wages": p.grossSalary - (p.washing ?? 0) - (p.bonus ?? 0),
                    "Employee Contribution (0.75%)": p.esiEmployee,
                    "Employer Contribution (3.25%)": p.esiEmployer,
                    "Total Contribution": p.esiEmployee + p.esiEmployer,
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

            case "pt-summary":
                data = filtered.map(p => ({
                    "Emp ID": p.employee.employeeId,
                    "Employee Name": `${p.employee.firstName} ${p.employee.lastName}`,
                    "State": p.employee.state ?? "",
                    "Designation": p.employee.designation ?? "",
                    "Worked Days": p.presentDays ?? p.workingDays ?? 0,
                    "Gross Salary": p.grossSalary,
                    "PT": p.pt,
                    "Net Salary": p.netSalary,
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

            default:
                return new NextResponse("Invalid report type", { status: 400 })
        }

        return NextResponse.json(data)

    } catch (error) {
        console.error("[COMPLIANCE_REPORT_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

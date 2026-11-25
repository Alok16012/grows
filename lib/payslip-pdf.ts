import fs from "fs"
import path from "path"
import { createElement, type ReactElement } from "react"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import prisma from "@/lib/prisma"
import { COMPANY } from "@/lib/company"
import { PayslipPDF, type PayslipData } from "@/components/PayslipPDF"

// Server-side salary slip PDF for one payroll row (WhatsApp, download).

const COMPANY_ADDRESS = process.env.PAYSLIP_COMPANY_ADDRESS?.trim()
    || "431, Br2, B Wing, 4th Floor, Jai Ganesh Vision, near Akurdi Chowk, Akurdi, Pune, Maharashtra 411035."
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

let logo: string | null | undefined
function logoDataUrl(): string | null {
    if (logo !== undefined) return logo
    try { logo = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "logo.png")).toString("base64")}` } catch { logo = null }
    return logo
}

export const PAYSLIP_SELECT = {
    id: true, month: true, year: true, status: true, siteId: true,
    basicSalary: true, da: true, hra: true, washing: true, conveyance: true, lwwEarned: true, bonus: true,
    overtimePay: true, grossSalary: true, allowances: true, productionIncentive: true, tds: true,
    pfEmployee: true, esiEmployee: true, pt: true, lwf: true, canteen: true, advance: true,
    otherDeductions: true, totalDeductions: true, netSalary: true,
    workingDays: true, presentDays: true, overtimeHrs: true,
    employee: {
        select: {
            id: true, employeeId: true, firstName: true, lastName: true, designation: true, phone: true,
            uan: true, pfNumber: true, esiNumber: true, dateOfBirth: true, dateOfJoining: true,
        },
    },
} as const

export type PayslipRow = NonNullable<Awaited<ReturnType<typeof loadPayslip>>>
export async function loadPayslip(id: string) {
    return prisma.payroll.findUnique({ where: { id }, select: PAYSLIP_SELECT })
}

export function payslipFilename(p: { month: number; year: number; employee: { employeeId: string } }) {
    return `Salary_Slip_${MONTHS[p.month - 1]}_${p.year}_${p.employee.employeeId}.pdf`
}

export async function renderPayslip(p: PayslipRow, siteName: string): Promise<Buffer> {
    const data: PayslipData = { ...p, site: siteName, employee: p.employee }
    const el = createElement(PayslipPDF, { p: data, logo: logoDataUrl(), companyName: COMPANY.legalName, companyAddress: COMPANY_ADDRESS }) as unknown as ReactElement<DocumentProps>
    return renderToBuffer(el)
}

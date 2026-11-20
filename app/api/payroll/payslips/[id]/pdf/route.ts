import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, employeeScope } from "@/lib/access"
import { loadPayslip, renderPayslip, payslipFilename } from "@/lib/payslip-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/payroll/payslips/<payrollId>/pdf — the slip as a PDF, exactly what
// WhatsApp sends. Payroll view, within the caller's data scope.
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, "payroll.view")
    if (g instanceof NextResponse) return g
    const p = await loadPayslip(params.id)
    if (!p) return new NextResponse("Not found", { status: 404 })
    const scope = await employeeScope(g.access)
    if (scope && !(await prisma.employee.count({ where: { AND: [{ id: p.employee.id }, scope] } }))) {
        return new NextResponse("Not found", { status: 404 })
    }
    const site = p.siteId ? (await prisma.site.findUnique({ where: { id: p.siteId }, select: { name: true } }))?.name ?? "" : ""
    const pdf = await renderPayslip(p, site)
    return new NextResponse(new Uint8Array(pdf), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${payslipFilename(p)}"`,
            "Cache-Control": "private, no-store",
        },
    })
}

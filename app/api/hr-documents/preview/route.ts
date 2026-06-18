import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { fillTemplate, buildDocVars } from "@/lib/hr-document"

// POST /api/hr-documents/preview
// Fill a template (the stored one, or an edited override) for ONE sample
// employee so the sender can see exactly what will be issued before sending.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, ["MANAGER", "HR_MANAGER"], "documents.view")) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    try {
        const { typeId, templateOverride, employeeId, effectiveDate } = await req.json() as {
            typeId?: string
            templateOverride?: string
            employeeId?: string
            effectiveDate?: string
        }

        // The template: prefer the edited override, else the stored template.
        let template = templateOverride
        if (template === undefined || template === null) {
            if (!typeId) return new NextResponse("typeId or templateOverride required", { status: 400 })
            const docType = await prisma.hrDocumentType.findUnique({ where: { id: typeId } })
            template = docType?.templateContent || ""
        }

        // A sample employee to fill variables with.
        const employee = employeeId
            ? await prisma.employee.findUnique({ where: { id: employeeId }, include: { branch: { include: { company: true } }, department: true } })
            : await prisma.employee.findFirst({ include: { branch: { include: { company: true } }, department: true } })

        if (!employee) {
            return NextResponse.json({ content: template, sampleEmployee: null })
        }

        const eff = effectiveDate ? new Date(effectiveDate) : null
        const content = fillTemplate(template, buildDocVars(employee, eff))

        return NextResponse.json({
            content,
            sampleEmployee: `${employee.firstName} ${employee.lastName || ""}`.trim(),
        })
    } catch (e) {
        console.error("[HR_DOC_PREVIEW]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

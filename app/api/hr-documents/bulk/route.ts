import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { generateDocNumber, fillTemplate, buildDocVars } from "@/lib/hr-document"

export const maxDuration = 60

// POST /api/hr-documents/bulk
// Issue one HR document (from a template) to many employees at once, targeting
// either a role, a hand-picked list, or everyone. Documents are issued directly
// (status ISSUED) so employees can see/download them immediately.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, ["MANAGER", "HR_MANAGER"], "documents.view")) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    try {
        const { typeId, scope, roleId, employeeIds, effectiveDate, remarks } = await req.json() as {
            typeId?: string
            scope?: "role" | "employees" | "all"
            roleId?: string
            employeeIds?: string[]
            effectiveDate?: string
            remarks?: string
        }

        if (!typeId || !scope) return new NextResponse("typeId and scope required", { status: 400 })

        const docType = await prisma.hrDocumentType.findUnique({ where: { id: typeId } })
        if (!docType) return new NextResponse("Document type not found", { status: 404 })

        // Resolve target employees.
        let where: Record<string, unknown>
        if (scope === "role") {
            if (!roleId) return new NextResponse("roleId required for role scope", { status: 400 })
            where = { user: { customRoleId: roleId } }
        } else if (scope === "employees") {
            if (!employeeIds?.length) return new NextResponse("employeeIds required", { status: 400 })
            where = { id: { in: employeeIds } }
        } else {
            where = {} // all employees
        }

        const employees = await prisma.employee.findMany({
            where,
            include: { branch: { include: { company: true } }, department: true },
        })

        if (employees.length === 0) {
            return NextResponse.json({ issued: 0, total: 0, message: "No matching employees found" })
        }

        const eff = effectiveDate ? new Date(effectiveDate) : null
        let issued = 0
        let failed = 0

        for (const employee of employees) {
            try {
                const content = fillTemplate(docType.templateContent || "", buildDocVars(employee, eff))
                await prisma.hrDocument.create({
                    data: {
                        docNumber: generateDocNumber(),
                        employeeId: employee.id,
                        typeId,
                        effectiveDate: eff,
                        content,
                        status: "ISSUED",
                        remarks: remarks || null,
                        createdBy: session.user.id,
                        issuedBy: session.user.id,
                        issuedAt: new Date(),
                    },
                })
                issued++
            } catch (e) {
                console.error("[HR_DOCS_BULK] failed for", employee.id, e)
                failed++
            }
        }

        return NextResponse.json({ issued, failed, total: employees.length })
    } catch (e) {
        console.error("[HR_DOCS_BULK]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

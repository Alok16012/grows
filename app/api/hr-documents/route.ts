import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

function generateDocNumber() {
    const y = new Date().getFullYear()
    const r = Math.floor(1000 + Math.random() * 9000)
    return `DOC-${y}-${r}`
}

function fillTemplate(template: string, vars: Record<string, string>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`)
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const employeeId = searchParams.get("employeeId")
    const typeId = searchParams.get("typeId")
    try {
        const where: Record<string, unknown> = {}
        if (status) where.status = status
        if (employeeId) where.employeeId = employeeId
        if (typeId) where.typeId = typeId
        // Employees only see their own documents
        if (session.user.role === "INSPECTION_BOY") {
            const emp = await prisma.employee.findFirst({ where: { userId: session.user.id } })
            if (!emp) return NextResponse.json([])
            where.employeeId = emp.id
            where.status = "ISSUED"
        }
        const docs = await prisma.hrDocument.findMany({
            where,
            include: {
                employee: { select: { employeeId: true, firstName: true, lastName: true, designation: true, branch: { select: { name: true } } } },
                type: { select: { id: true, name: true, requiresApproval: true } }
            },
            orderBy: { createdAt: "desc" }
        })
        return NextResponse.json(docs)
    } catch (e) {
        console.error("[HR_DOCS_GET]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, ["MANAGER", "HR_MANAGER"], "documents.view")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    try {
        const { employeeId, typeId, effectiveDate, remarks, action } = await req.json()
        if (!employeeId || !typeId) return new NextResponse("employeeId and typeId required", { status: 400 })

        const [employee, docType] = await Promise.all([
            prisma.employee.findUnique({
                where: { id: employeeId },
                include: { branch: { include: { company: true } }, department: true }
            }),
            prisma.hrDocumentType.findUnique({ where: { id: typeId } })
        ])
        if (!employee || !docType) return new NextResponse("Employee or document type not found", { status: 404 })

        // Fill template variables
        const vars: Record<string, string> = {
            employee_name: `${employee.firstName} ${employee.lastName}`,
            employee_id: employee.employeeId,
            designation: employee.designation || "",
            department: employee.department?.name || "",
            joining_date: employee.dateOfJoining ? new Date(employee.dateOfJoining).toLocaleDateString("en-IN") : "",
            salary: employee.basicSalary?.toString() || "",
            company_name: employee.branch?.company?.name || "Company",
            effective_date: effectiveDate ? new Date(effectiveDate).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN"),
        }
        const content = fillTemplate(docType.templateContent || "", vars)

        // Determine initial status based on action
        let status: "DRAFT" | "PENDING_APPROVAL" | "ISSUED" = "DRAFT"
        if (action === "send_approval" && docType.requiresApproval) status = "PENDING_APPROVAL"
        if (action === "issue" && !docType.requiresApproval) status = "ISSUED"

        const docNumber = generateDocNumber()
        const doc = await prisma.hrDocument.create({
            data: {
                docNumber,
                employeeId,
                typeId,
                effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
                content,
                status,
                remarks,
                createdBy: session.user.id,
                issuedBy: status === "ISSUED" ? session.user.id : null,
                issuedAt: status === "ISSUED" ? new Date() : null,
            },
            include: {
                employee: { select: { employeeId: true, firstName: true, lastName: true } },
                type: { select: { name: true } }
            }
        })
        return NextResponse.json(doc)
    } catch (e) {
        console.error("[HR_DOCS_POST]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

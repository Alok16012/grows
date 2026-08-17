
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { REPORT_ROLE_VALUES } from "@/lib/report-roles"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const { searchParams } = new URL(req.url)
        const projectId = searchParams.get("projectId")

        if (!projectId) return new NextResponse("projectId is required", { status: 400 })

        // Heals the reportRole column on prod, where migrations are manual —
        // findMany selects every column and would 500 without it. Memoized, so
        // this is free after the first call.
        await ensureProjectSchema()
        const fields = await prisma.formTemplate.findMany({
            where: { projectId },
            orderBy: { displayOrder: "asc" },
        })

        return NextResponse.json(fields)
    } catch (error) {
        console.error("[FORM_TEMPLATES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { projectId, fieldLabel, fieldType, options, defaultValue, isRequired, displayOrder, category, reportRole, isHidden } = body

        if (!projectId || !fieldLabel || !fieldType) {
            return new NextResponse("projectId, fieldLabel, and fieldType are required", { status: 400 })
        }

        // Only accept known section categories; anything else (or missing) falls
        // back to FIXED so a stray value can't land a field in an unknown bucket.
        const allowedCategories = ["FIXED", "DEFECT", "AUTO"]
        const safeCategory = allowedCategories.includes(category) ? category : "FIXED"
        // Unknown role values are stored as null (= infer from the label).
        const safeReportRole = REPORT_ROLE_VALUES.includes(reportRole) ? reportRole : null

        await ensureProjectSchema()
        const field = await prisma.formTemplate.create({
            data: {
                projectId,
                fieldLabel,
                fieldType,
                options: options || null,
                defaultValue: defaultValue || null,
                isRequired: isRequired ?? false,
                displayOrder: displayOrder ?? 0,
                category: safeCategory,
                reportRole: safeReportRole,
                isHidden: !!isHidden,
            },
        })

        return NextResponse.json(field)
    } catch (error) {
        console.error("[FORM_TEMPLATES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

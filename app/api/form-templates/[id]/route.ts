
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { REPORT_ROLE_VALUES } from "@/lib/report-roles"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { fieldLabel, fieldType, options, defaultValue, isRequired, displayOrder, category, reportRole, isHidden } = body

        const allowedCategories = ["FIXED", "DEFECT", "AUTO"]

        await ensureProjectSchema()
        const field = await prisma.formTemplate.update({
            where: { id: params.id },
            data: {
                ...(fieldLabel !== undefined && { fieldLabel }),
                ...(fieldType !== undefined && { fieldType }),
                ...(options !== undefined && { options }),
                ...(defaultValue !== undefined && { defaultValue }),
                ...(isRequired !== undefined && { isRequired }),
                ...(displayOrder !== undefined && { displayOrder }),
                ...(allowedCategories.includes(category) && { category }),
                // null explicitly clears the mapping (back to infer-from-label);
                // unknown strings are ignored rather than stored.
                ...(reportRole === null || REPORT_ROLE_VALUES.includes(reportRole) ? { reportRole } : {}),
                ...(isHidden !== undefined && { isHidden: !!isHidden }),
            },
        })

        return NextResponse.json(field)
    } catch (error) {
        console.error("[FORM_TEMPLATE_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.formTemplate.delete({
            where: { id: params.id },
        })

        return new NextResponse(null, { status: 204 })
    } catch (error) {
        console.error("[FORM_TEMPLATE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

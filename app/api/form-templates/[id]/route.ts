
import { getServerSession } from "next-auth"
import { bumpFormVersion } from "@/lib/form-version"
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
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.edit")) {
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
        // Anything but a pure reorder is a new form version.
        if ([fieldLabel, fieldType, options, category, reportRole, isHidden, isRequired].some(v => v !== undefined)) await bumpFormVersion(field.projectId)

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
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.edit")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        // Deleting a field also deletes its answers from every past report, so a
        // field that has been filled in can only be hidden.
        const answers = await prisma.inspectionData.count({ where: { fieldId: params.id, NOT: [{ value: null }, { value: "" }] } })
        if (answers > 0) {
            return NextResponse.json({ error: `This field has answers on ${answers} report${answers === 1 ? "" : "s"}. Hide it instead so past reports keep them.` }, { status: 409 })
        }
        const deleted = await prisma.formTemplate.delete({
            where: { id: params.id },
        })
        await bumpFormVersion(deleted.projectId)

        return new NextResponse(null, { status: 204 })
    } catch (error) {
        console.error("[FORM_TEMPLATE_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

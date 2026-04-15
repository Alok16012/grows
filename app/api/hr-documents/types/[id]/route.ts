import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, ["HR_MANAGER"], "documents.view")) {
        return new NextResponse("Forbidden", { status: 403 })
    }
    try {
        const { name, description, templateContent, autoGenerate, requiresApproval, isActive } = await req.json()
        const type = await prisma.hrDocumentType.update({
            where: { id: params.id },
            data: { name, description, templateContent, autoGenerate, requiresApproval, isActive, updatedAt: new Date() }
        })
        return NextResponse.json(type)
    } catch (e) {
        console.error("[HR_DOC_TYPES_PUT]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [], "documents.view")) return new NextResponse("Forbidden", { status: 403 })
    try {
        await prisma.hrDocumentType.update({ where: { id: params.id }, data: { isActive: false } })
        return new NextResponse(null, { status: 204 })
    } catch (e) {
        console.error("[HR_DOC_TYPES_DELETE]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

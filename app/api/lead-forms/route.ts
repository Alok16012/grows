import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { nanoid } from "nanoid"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const forms = await prisma.leadForm.findMany({
        include: {
            creator: { select: { id: true, name: true } },
            site: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(forms)
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { title, description, siteId, formType } = await req.json()
    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 })

    const validFormTypes = ["RECRUITMENT", "ON_SITE_JOIN"]
    const resolvedFormType = validFormTypes.includes(formType) ? formType : "RECRUITMENT"

    const slug = nanoid(10)
    const createData: any = {
        title,
        description: description || null,
        siteId: siteId || null,
        formType: resolvedFormType,  // applied after migration: add_form_type_to_lead_form
        slug,
        createdBy: session.user.id,
    }
    const form = await prisma.leadForm.create({
        data: createData,
        include: {
            creator: { select: { id: true, name: true } },
            site: { select: { id: true, name: true } },
        },
    })
    return NextResponse.json(form)
}

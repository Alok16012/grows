import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { nanoid } from "nanoid"
import { checkAccess } from "@/lib/permissions"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "recruitment.manage")) {
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
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "recruitment.manage")) {
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
        slug,
        createdBy: session!.user.id,
    }

    // Include formType only if the DB column exists (migration may not have run yet)
    try {
        createData.formType = resolvedFormType
        const form = await prisma.leadForm.create({
            data: createData,
            include: {
                creator: { select: { id: true, name: true } },
                site: { select: { id: true, name: true } },
            },
        })
        return NextResponse.json(form)
    } catch (e: any) {
        // If column doesn't exist yet (migration pending), retry without formType
        if (e?.message?.includes("formType") || e?.code === "P2009" || e?.code === "P2025") {
            delete createData.formType
            const form = await prisma.leadForm.create({
                data: createData,
                include: {
                    creator: { select: { id: true, name: true } },
                    site: { select: { id: true, name: true } },
                },
            })
            return NextResponse.json(form)
        }
        console.error("[LEAD_FORM_CREATE]", e)
        return NextResponse.json({ error: "Failed to create form" }, { status: 500 })
    }
}

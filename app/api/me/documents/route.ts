import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { isPhotoDoc } from "@/lib/employee-photo"
import { getApiSession } from "@/lib/apiSession"
import { holdsDocuments, createChangeRequest, pendingSelfChanges, isDocChange } from "@/lib/employee-change"
import { DOC_LABELS } from "@/lib/doc-labels"

// Find employee linked to logged-in user
async function getMyEmployee(userId: string) {
    return prisma.employee.findFirst({
        where: { userId }
    })
}

export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await getMyEmployee(session.user.id)
    if (!emp) return NextResponse.json([])

    const docs = await prisma.employeeDocument.findMany({
        where: { employeeId: emp.id },
        orderBy: { uploadedAt: "desc" }
    })
    // Uploads waiting in Onboarding → Approvals come first, so the page shows them.
    const waiting = (await pendingSelfChanges(emp.id)).filter(isDocChange).map(c => ({
        id: `pending-${c.field.slice(4)}`, employeeId: emp.id, type: c.field.slice(4), fileName: c.to ?? "", fileUrl: c.fileUrl ?? "",
        status: "AWAITING_APPROVAL", rejectionReason: null, verifiedBy: null, uploadedAt: null,
    }))
    return NextResponse.json([...waiting, ...docs])
}

export async function POST(req: Request) {
    const session = await getApiSession(req)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const emp = await getMyEmployee(session.user.id)
    if (!emp) return new NextResponse("Employee profile not found", { status: 404 })

    const body = await req.json()
    const { type, fileName, fileUrl } = body

    if (!type || !fileName || !fileUrl) {
        return new NextResponse("type, fileName, fileUrl required", { status: 400 })
    }

    // Onboarding → Approvals: the file waits for HR before it replaces anything.
    if (await holdsDocuments(emp)) {
        const old = await prisma.employeeDocument.findFirst({ where: { employeeId: emp.id, type }, select: { fileName: true } })
        await createChangeRequest({ employeeId: emp.id, requestedBy: session.user.id, requesterName: session.user.name ?? "Employee", source: "SELF",
            changes: [{ field: `doc:${type}`, label: `${DOC_LABELS[type] ?? type} (document)`, from: old?.fileName ?? null, to: String(fileName).slice(0, 200), fileUrl: String(fileUrl) }] })
        return NextResponse.json({ id: `pending-${type}`, employeeId: emp.id, type, fileName, fileUrl, status: "AWAITING_APPROVAL", rejectionReason: null, pendingApproval: true })
    }

    // Replace existing doc of same type (re-upload)
    await prisma.employeeDocument.deleteMany({
        where: { employeeId: emp.id, type }
    })

    const doc = await prisma.employeeDocument.create({
        data: {
            employeeId: emp.id,
            type,
            fileName,
            fileUrl,
            status: "PENDING"
        }
    })

    // Keep the employee's profile photo in sync so the avatar shows up
    // everywhere (list view, board view, detail page, HR logins, etc.)
    if (isPhotoDoc(type, fileName)) {
        try {
            await prisma.employee.update({
                where: { id: emp.id },
                data: { photo: fileUrl },
            })
        } catch (e) {
            console.error("[ME_DOCS_PHOTO_SYNC]", e)
        }
    }

    return NextResponse.json(doc)
}

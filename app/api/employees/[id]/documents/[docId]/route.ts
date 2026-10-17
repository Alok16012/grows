import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { createClient } from "@supabase/supabase-js"

const VALID_STATUSES = ["PENDING", "VERIFIED", "REJECTED"]

// Upload (../upload/route.ts) stores files in the "documents" bucket and saves
// the public URL as fileUrl. Recover the object path from that URL so the file
// can be removed with the row. Legacy rows hold base64 data: URLs and have no
// object to remove, so this returns null for them.
const DOC_BUCKET = "documents"
function storagePathFromUrl(fileUrl: string | null | undefined): string | null {
    if (!fileUrl || !/^https?:\/\//.test(fileUrl)) return null
    const marker = `/storage/v1/object/public/${DOC_BUCKET}/`
    const idx = fileUrl.indexOf(marker)
    if (idx === -1) return null
    const path = fileUrl.slice(idx + marker.length).split("?")[0]
    return path ? decodeURIComponent(path) : null
}

// Best-effort: the DB row is the source of truth, a leftover object only costs
// storage, so a failure here is logged, not surfaced.
async function removeStorageObject(fileUrl: string | null | undefined) {
    const path = storagePathFromUrl(fileUrl)
    if (!path) return
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        console.warn("[EMPLOYEE_DOC_DELETE] Supabase credentials missing — storage object left in place", path)
        return
    }
    try {
        // Lazy client, same as upload: constructing at module load breaks the build.
        const { error } = await createClient(url, key).storage.from(DOC_BUCKET).remove([path])
        if (error) console.warn("[EMPLOYEE_DOC_DELETE] storage remove failed", path, error.message)
    } catch (err) {
        console.warn("[EMPLOYEE_DOC_DELETE] storage remove threw", path, err)
    }
}

// These documents are KYC (Aadhaar / PAN / bank proof), so anyone without the
// relevant documents.* permission may only touch their OWN employee record.
async function isSelf(userId: string, employeeId: string) {
    const self = await prisma.employee.findFirst({
        where: { userId },
        select: { id: true },
    })
    return self?.id === employeeId
}

// On-demand fetch of a single document's file blob. The master documents grid
// no longer ships base64 `fileUrl` in its bulk list (that made it ~15s slow);
// View/Download call this only for the one document the user actually opened.
export async function GET(
    _req: Request,
    { params }: { params: { id: string; docId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        if (!checkAccess(session, [], "documents.view")
            && !(await isSelf(session.user.id, params.id))) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const doc = await prisma.employeeDocument.findFirst({
            where: { id: params.docId, employeeId: params.id },
            select: { fileUrl: true, fileName: true },
        })
        if (!doc) return new NextResponse("Document not found", { status: 404 })

        return NextResponse.json(doc)
    } catch (error) {
        console.error("[EMPLOYEE_DOC_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string; docId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Verifying / rejecting is never a self-service action.
        if (!checkAccess(session, [], "documents.verify")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { status, rejectionReason } = body

        if (!status) {
            return new NextResponse("status is required", { status: 400 })
        }
        if (!VALID_STATUSES.includes(status)) {
            return new NextResponse("Invalid status. Must be PENDING, VERIFIED, or REJECTED", { status: 400 })
        }
        if (status === "REJECTED" && !rejectionReason) {
            return new NextResponse("rejectionReason is required when rejecting", { status: 400 })
        }

        // Verify document belongs to this employee
        const existing = await prisma.employeeDocument.findFirst({
            where: { id: params.docId, employeeId: params.id },
        })
        if (!existing) return new NextResponse("Document not found", { status: 404 })

        const document = await prisma.employeeDocument.update({
            where: { id: params.docId },
            data: {
                status,
                rejectionReason: status === "REJECTED" ? rejectionReason : null,
                verifiedBy: status === "VERIFIED" ? session.user.id : null,
            },
        })

        return NextResponse.json(document)
    } catch (error) {
        console.error("[EMPLOYEE_DOC_PATCH]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; docId: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }
        if (!checkAccess(session, [], "documents.upload")
            && !(await isSelf(session.user.id, params.id))) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const existing = await prisma.employeeDocument.findFirst({
            where: { id: params.docId, employeeId: params.id },
        })
        if (!existing) return new NextResponse("Document not found", { status: 404 })

        await prisma.employeeDocument.delete({ where: { id: params.docId } })
        // Row first, then the file: an orphaned object is harmless, an
        // orphaned row pointing at a missing file is a broken download.
        await removeStorageObject(existing.fileUrl)
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[EMPLOYEE_DOC_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

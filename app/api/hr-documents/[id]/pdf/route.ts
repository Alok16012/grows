import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import { ensureHrDocRecallSchema } from "@/lib/hr-doc-schema"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { createElement, type ReactElement } from "react"
import { LetterheadDocumentPDF } from "@/components/LetterheadDocumentPDF"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"

let cachedLogo: string | null | undefined
function getLogoDataUrl(): string | null {
    if (cachedLogo !== undefined) return cachedLogo
    try {
        const buf = fs.readFileSync(path.join(process.cwd(), "public", "logo.png"))
        cachedLogo = `data:image/png;base64,${buf.toString("base64")}`
    } catch {
        cachedLogo = null
    }
    return cachedLogo
}

// GET /api/hr-documents/[id]/pdf — letterhead PDF for one document.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    try {
        await ensureHrDocRecallSchema()
        const doc = await prisma.hrDocument.findUnique({
            where: { id: params.id },
            include: {
                type: { select: { name: true } },
                employee: { select: { userId: true } },
            },
        })
        if (!doc) return new NextResponse("Not found", { status: 404 })

        // Managers/HR can view any document; an employee can only view their own
        // issued document.
        const isManager = checkAccess(session, ["MANAGER", "HR_MANAGER"], "documents.view")
        if (!isManager) {
            if (doc.employee.userId !== session.user.id || doc.status !== "ISSUED") {
                return new NextResponse("Forbidden", { status: 403 })
            }
        }

        const dateText = (doc.issuedAt || doc.effectiveDate || doc.createdAt).toLocaleDateString("en-IN", {
            day: "2-digit", month: "long", year: "numeric",
        })

        // @react-pdf types the root element as <Document>; our wrapper component
        // returns one, so cast through the expected element type.
        const element = createElement(LetterheadDocumentPDF, {
            docNumber: doc.docNumber,
            typeName: doc.type.name,
            content: doc.content,
            dateText,
            logoDataUrl: getLogoDataUrl(),
        }) as unknown as ReactElement<DocumentProps>

        const buffer = await renderToBuffer(element)

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${doc.docNumber}.pdf"`,
                "Cache-Control": "private, no-store",
            },
        })
    } catch (e) {
        console.error("[HR_DOC_PDF]", e)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

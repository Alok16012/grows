import fs from "fs"
import { withSnapshot } from "@/lib/form-version"
import path from "path"
import { createElement, type ReactElement } from "react"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import prisma from "@/lib/prisma"
import { InspectionPDF } from "@/components/InspectionPDF"

// The approved inspection report as a PDF on the server — the same document
// the public share page offers as "Download PDF" — for WhatsApp / email.

let logo: string | null | undefined
function logoDataUrl(): string | null {
    if (logo !== undefined) return logo
    try { logo = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "logo.png")).toString("base64")}` } catch { logo = null }
    return logo
}

// Same fields as the public share API (/api/share/[token]) — what the PDF draws.
export async function loadInspectionForReport(id: string) {
    return prisma.inspection.findUnique({
        where: { id },
        select: {
            id: true, status: true, submittedAt: true, approvedAt: true, gpsLocation: true, signature: true,
            approvedBy: true, defectPhotos: true, customerSignature: true, customerSignedName: true, customerSignedAt: true, formSnapshot: true,
            submitter: { select: { name: true } },
            assignment: { select: { project: { select: { id: true, name: true, reportConfig: true, site: { select: { id: true, name: true } } } } } },
            responses: { select: { id: true, fieldId: true, value: true, field: { select: { fieldLabel: true, fieldType: true, displayOrder: true, isHidden: true } } } },
        },
    })
}

export function reportFilename(i: { id: string; submittedAt: Date | null; assignment: { project: { name: string } } }) {
    const proj = i.assignment.project.name.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Project"
    const d = i.submittedAt ? i.submittedAt.toISOString().slice(0, 10) : i.id.slice(0, 8)
    return `Inspection_Report_${proj}_${d}.pdf`
}

export async function renderInspectionReport(id: string): Promise<{ filename: string; content: Buffer } | null> {
    const i = await loadInspectionForReport(id)
    if (!i || i.status !== "approved") return null
    const approver = i.approvedBy ? await prisma.user.findUnique({ where: { id: i.approvedBy }, select: { name: true } }) : null
    const el = createElement(InspectionPDF, { inspection: { ...i, responses: withSnapshot(i.responses, i.formSnapshot), approverName: approver?.name ?? null }, logo: logoDataUrl() }) as unknown as ReactElement<DocumentProps>
    return { filename: reportFilename(i), content: await renderToBuffer(el) }
}

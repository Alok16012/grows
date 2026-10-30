import { NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { createElement, type ReactElement } from "react"
import fs from "fs"
import path from "path"
import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { canReportPolicies, checkAccess } from "@/lib/permissions"
import { policyErrorResponse, PolicyError } from "@/lib/policy-signoff"
import { PolicySignedPDF } from "@/components/PolicySignedPDF"

export const runtime = "nodejs"

let cachedLogo: string | null | undefined
function logo(): string | null {
    if (cachedLogo !== undefined) return cachedLogo
    try { cachedLogo = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "logo.png")).toString("base64")}` }
    catch { cachedLogo = null }
    return cachedLogo
}

// GET — the signed policy as a PDF. Allowed for the employee who signed, and
// for everyone who can see the sign-off in the first place: the same check as
// GET /api/policies/employee/[employeeId], which lists these PDFs in the
// onboarding review. It used to require policy.report only, so HR reviewing an
// onboarding (onboarding / employees access, no Policies permission) saw the
// PDF link and got "Forbidden".
export async function GET(req: Request, { params }: { params: { ackId: string } }) {
    try {
        const session = await getApiSession(req)
        if (!session?.user?.id) throw new PolicyError(401, "UNAUTHORIZED", "Unauthorized")
        const ack = await prisma.signoffAck.findUnique({
            where: { id: params.ackId },
            include: {
                employee: { select: { firstName: true, lastName: true, employeeId: true, designation: true, userId: true } },
                version: { include: { policy: { select: { category: true } } } },
            },
        })
        if (!ack || !ack.signedAt || !ack.scrolledAt) throw new PolicyError(404, "NOT_FOUND", "Signed policy not found")
        const canSeeSignoffs = canReportPolicies(session)
            || checkAccess(session, [], "onboarding.view") || checkAccess(session, [], "employees.view")
        if (!canSeeSignoffs && ack.employee.userId !== session.user.id) throw new PolicyError(403, "FORBIDDEN", "Forbidden")

        const element = createElement(PolicySignedPDF, {
            logoDataUrl: logo(),
            policyTitle: ack.version.title,
            category: ack.version.policy.category,
            versionNo: ack.version.versionNo,
            effectiveFrom: ack.version.effectiveFrom?.toISOString() ?? null,
            publishedAt: ack.version.publishedAt.toISOString(),
            content: ack.version.content,
            attachmentUrl: ack.version.attachmentUrl,
            contentHash: ack.version.contentHash,
            employeeName: `${ack.employee.firstName} ${ack.employee.lastName}`.trim(),
            employeeCode: ack.employee.employeeId,
            designation: ack.employee.designation,
            typedName: ack.typedName ?? "",
            signatureImage: ack.signatureImage,
            scrolledAt: ack.scrolledAt.toISOString(),
            signedAt: ack.signedAt.toISOString(),
            ipAddress: ack.ipAddress,
            userAgent: ack.userAgent,
            channel: ack.channel,
            ackId: ack.id,
            generatedAt: new Date().toISOString(),
        }) as unknown as ReactElement<DocumentProps>
        const buffer = await renderToBuffer(element)
        const file = `${ack.version.title}-${ack.employee.employeeId}-v${ack.version.versionNo}`.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 100)
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${file}.pdf"`,
                "Cache-Control": "private, no-store",
            },
        })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_ACK_PDF]")
    }
}

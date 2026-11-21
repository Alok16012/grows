import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { certificateKeyOk } from "@/lib/certificate"

export const dynamic = "force-dynamic"

// GET ?c=CERT-…&k=… — public check behind the QR code on a certificate.
// Without the right key it answers "not found", so numbers can't be guessed.
export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams
    const c = (sp.get("c") ?? "").trim().slice(0, 40)
    if (!c || !certificateKeyOk(c, sp.get("k"))) return NextResponse.json({ error: "Certificate not found" }, { status: 404 })
    const e = await prisma.courseEnrollment.findFirst({
        where: { certificate: c },
        select: {
            completedAt: true, status: true,
            employee: { select: { firstName: true, lastName: true } },
            course: { select: { title: true, validityDays: true } },
        },
    })
    if (!e?.completedAt) return NextResponse.json({ error: "Certificate not found" }, { status: 404 })
    const validUntil = e.course.validityDays ? new Date(e.completedAt.getTime() + e.course.validityDays * 86_400_000) : null
    const state = e.status !== "COMPLETED" ? "renewing" : validUntil && validUntil.getTime() < Date.now() ? "expired" : "valid"
    return NextResponse.json({
        certificate: c, name: `${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim(),
        course: e.course.title, issuedAt: e.completedAt, validUntil, state,
    })
}

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard } from "@/lib/access"
import { verifyPath } from "@/lib/certificate"

export const dynamic = "force-dynamic"

// GET — what the certificate PDF needs: names, dates, validity and the QR link.
// The learner's own certificate, or anyone's for LMS managers.
export async function GET(req: Request, { params }: { params: { enrollmentId: string } }) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const e = await prisma.courseEnrollment.findUnique({
        where: { id: params.enrollmentId },
        select: {
            certificate: true, completedAt: true, score: true, status: true,
            employee: { select: { userId: true, firstName: true, lastName: true, employeeId: true } },
            course: { select: { title: true, courseCode: true, validityDays: true, duration: true } },
        },
    })
    if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const mine = e.employee.userId === g.access.userId
    if (!mine && !g.access.isAdmin && !g.access.permissions.includes("lms.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!e.certificate || !e.completedAt) return NextResponse.json({ error: "This course isn't completed yet" }, { status: 400 })
    const validUntil = e.course.validityDays ? new Date(e.completedAt.getTime() + e.course.validityDays * 86_400_000) : null
    const origin = process.env.NEXTAUTH_URL?.startsWith("https://") ? process.env.NEXTAUTH_URL.replace(/\/$/, "") : new URL(req.url).origin
    return NextResponse.json({
        certificate: e.certificate,
        name: `${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim(),
        employeeCode: e.employee.employeeId,
        course: e.course.title, courseCode: e.course.courseCode, hours: Math.round((e.course.duration / 60) * 10) / 10,
        score: e.score, issuedAt: e.completedAt, validUntil,
        verifyUrl: `${origin}${verifyPath(e.certificate)}`,
    })
}

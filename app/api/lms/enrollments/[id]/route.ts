import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { progress, status, score, completedAt, startedAt, dueDate } = body

        // Fetch course to check passing score
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { id: params.id },
            include: { course: { select: { passingScore: true } } },
        })
        if (!enrollment) return new NextResponse("Not found", { status: 404 })

        let finalStatus = status
        let certificate: string | undefined
        let finalCompletedAt = completedAt ? new Date(completedAt) : undefined

        // Auto-determine status based on score
        if (score !== undefined && score !== null) {
            const passingScore = enrollment.course.passingScore
            if (score >= passingScore) {
                finalStatus = "COMPLETED"
                if (!finalCompletedAt) finalCompletedAt = new Date()

                // Generate certificate number CERT-YYYYMM-NNNN
                const now = new Date()
                const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
                const countThisMonth = await prisma.courseEnrollment.count({
                    where: {
                        certificate: { startsWith: `CERT-${yyyymm}-` },
                    },
                })
                certificate = `CERT-${yyyymm}-${String(countThisMonth + 1).padStart(4, "0")}`
            } else if (finalStatus === undefined) {
                finalStatus = "FAILED"
            }
        }

        const updated = await prisma.courseEnrollment.update({
            where: { id: params.id },
            data: {
                ...(progress !== undefined && { progress }),
                ...(finalStatus !== undefined && { status: finalStatus }),
                ...(score !== undefined && { score: parseFloat(score) }),
                ...(finalCompletedAt && { completedAt: finalCompletedAt }),
                ...(startedAt !== undefined && { startedAt: startedAt ? new Date(startedAt) : null }),
                ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
                ...(certificate && { certificate }),
                attempts: { increment: score !== undefined ? 1 : 0 },
            },
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error("[LMS_ENROLLMENT_PUT]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        await prisma.courseEnrollment.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[LMS_ENROLLMENT_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

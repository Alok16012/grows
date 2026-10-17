import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { learnerEmployee, nextCertificateNumber } from "@/lib/lms-learner"

// POST /api/lms/learn/progress { enrollmentId, moduleId }
// A learner marks the next module done. The old path went through
// PUT /api/lms/enrollments/[id], which needs lms.manage — so every learner's
// "Mark complete" was silently refused and progress never moved.
//
// Modules are taken in order: progress is stored as a percentage, and the
// module just finished must be the next one, so the % always means "the first
// N modules are done".
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    try {
        const me = await learnerEmployee(session)
        if (!me) return new NextResponse("No employee record linked to your login", { status: 404 })

        const { enrollmentId, moduleId } = await req.json()
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { id: String(enrollmentId || "") },
            include: { course: { select: { modules: { orderBy: { order: "asc" }, select: { id: true } }, quiz: { select: { id: true, isActive: true } } } } },
        })
        if (!enrollment || enrollment.employeeId !== me.id) return new NextResponse("Enrollment not found", { status: 404 })
        if (enrollment.status === "COMPLETED") return NextResponse.json(enrollment)

        const mods = enrollment.course.modules
        const done = Math.round((enrollment.progress / 100) * mods.length)
        const idx = mods.findIndex(m => m.id === moduleId)
        if (idx < 0) return new NextResponse("Module not in this course", { status: 400 })
        if (idx < done) return NextResponse.json(enrollment) // already done
        if (idx > done) return new NextResponse("Finish the earlier modules first", { status: 400 })

        const progress = Math.round(((idx + 1) / mods.length) * 100)
        // A course with no active assessment is complete once its modules are.
        const finishes = progress >= 100 && !enrollment.course.quiz?.isActive
        const updated = await prisma.courseEnrollment.update({
            where: { id: enrollment.id },
            data: {
                progress,
                status: finishes ? "COMPLETED" : "IN_PROGRESS",
                startedAt: enrollment.startedAt ?? new Date(),
                ...(finishes ? { completedAt: new Date(), certificate: enrollment.certificate ?? await nextCertificateNumber() } : {}),
            },
        })
        return NextResponse.json(updated)
    } catch (error) {
        console.error("[LMS_LEARN_PROGRESS]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

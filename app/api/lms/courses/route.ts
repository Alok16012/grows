import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "lms.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const category = searchParams.get("category")
        const isMandatory = searchParams.get("isMandatory")
        const search = searchParams.get("search")

        const where: Record<string, unknown> = {}
        if (status) where.status = status
        if (category) where.category = category
        if (isMandatory !== null && isMandatory !== "") where.isMandatory = isMandatory === "true"
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { courseCode: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
            ]
        }

        const courses = await prisma.course.findMany({
            where,
            include: {
                _count: {
                    select: { enrollments: true, modules: true },
                },
            },
            orderBy: { createdAt: "desc" },
        })

        // Compute pass rate per course
        const courseIds = courses.map(c => c.id)
        const enrollmentStats = await prisma.courseEnrollment.groupBy({
            by: ["courseId", "status"],
            where: { courseId: { in: courseIds } },
            _count: { id: true },
        })

        const statsMap: Record<string, { completed: number; total: number }> = {}
        for (const s of enrollmentStats) {
            if (!statsMap[s.courseId]) statsMap[s.courseId] = { completed: 0, total: 0 }
            statsMap[s.courseId].total += s._count.id
            if (s.status === "COMPLETED") statsMap[s.courseId].completed += s._count.id
        }

        const result = courses.map(c => ({
            ...c,
            enrolledCount: statsMap[c.id]?.total ?? 0,
            passRate: statsMap[c.id]?.total
                ? Math.round((statsMap[c.id].completed / statsMap[c.id].total) * 100)
                : 0,
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error("[LMS_COURSES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "lms.view")) {
            return new NextResponse("Forbidden", { status: 403 })
        }
        // Resolve real DB user ID
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const body = await req.json()
        const { title, description, category, duration, passingScore, isMandatory, status, thumbnail } = body

        if (!title || !category) {
            return new NextResponse("title and category are required", { status: 400 })
        }

        // Auto-generate courseCode as CRS-NNNN
        const lastCourse = await prisma.course.findFirst({
            orderBy: { createdAt: "desc" },
            select: { courseCode: true },
        })
        let nextNum = 1
        if (lastCourse?.courseCode) {
            const match = lastCourse.courseCode.match(/\d+$/)
            if (match) nextNum = parseInt(match[0]) + 1
        }
        const courseCode = `CRS-${String(nextNum).padStart(4, "0")}`

        const existing = await prisma.course.findUnique({ where: { courseCode } })
        const finalCode = existing ? `CRS-${String(nextNum + 1).padStart(4, "0")}` : courseCode

        const course = await prisma.course.create({
            data: {
                courseCode: finalCode,
                title,
                description: description || null,
                category,
                duration: duration ? parseInt(duration) : 60,
                passingScore: passingScore ? parseInt(passingScore) : 70,
                isMandatory: isMandatory ?? false,
                status: status || "DRAFT",
                thumbnail: thumbnail || null,
                createdBy: actorId!,
            },
        })

        return NextResponse.json(course)
    } catch (error) {
        console.error("[LMS_COURSES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

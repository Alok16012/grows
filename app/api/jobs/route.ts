import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

// ─── Field coercion helpers ──────────────────────────────────────────────────
const toInt = (v: any) =>
    v === "" || v === null || v === undefined ? null : Number.isFinite(parseInt(v)) ? parseInt(v) : null
const toStrArray = (v: any) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [], "jobs.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    const where: any = {}
    if (status && status !== "ALL") where.status = status
    if (search) {
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { department: { contains: search, mode: "insensitive" } },
            { jobLocation: { contains: search, mode: "insensitive" } },
            { jobRole: { contains: search, mode: "insensitive" } },
        ]
    }

    try {
        const jobs = await prisma.jobPosting.findMany({
            where,
            include: { creator: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
        })
        return NextResponse.json(jobs)
    } catch (err) {
        console.error("[JOBS_GET]", err)
        return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [], "jobs.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { title, status } = body

        if (!title || !String(title).trim()) {
            return NextResponse.json({ error: "Job title is required" }, { status: 400 })
        }

        // Resolve real user ID (session.user.id may be a demo-xxx string).
        const realUser =
            (await prisma.user.findUnique({ where: { id: session.user.id } })) ??
            (await prisma.user.findUnique({ where: { email: session.user.email ?? "" } }))

        const job = await prisma.jobPosting.create({
            data: {
                title: String(title).trim(),
                workExpMin: toInt(body.workExpMin),
                workExpMax: toInt(body.workExpMax),
                freshersAllowed: !!body.freshersAllowed,
                salaryMin: toInt(body.salaryMin),
                salaryMax: toInt(body.salaryMax),
                salaryPeriod: body.salaryPeriod || "month",
                perks: toStrArray(body.perks),
                department: body.department || null,
                jobRole: body.jobRole || null,
                jobLocation: body.jobLocation || null,
                qualifications: toStrArray(body.qualifications),
                educationDegree: body.educationDegree || null,
                genderPreference: body.genderPreference || "Any",
                skills: toStrArray(body.skills),
                candidateIndustry: body.candidateIndustry || null,
                languages: toStrArray(body.languages),
                screeningQuestions: Array.isArray(body.screeningQuestions) ? body.screeningQuestions : undefined,
                description: body.description || null,
                companyName: body.companyName || null,
                employmentType: body.employmentType || null,
                industryType: body.industryType || null,
                roleCategory: body.roleCategory || null,
                openings: toInt(body.openings) ?? 1,
                allowCalls: !!body.allowCalls,
                contactName: body.contactName || null,
                contactPhone: body.contactPhone || null,
                callStartTime: body.callStartTime || null,
                callEndTime: body.callEndTime || null,
                callDays: body.callDays || null,
                status: status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
                createdBy: realUser?.id ?? null,
            },
            include: { creator: { select: { id: true, name: true } } },
        })

        return NextResponse.json(job)
    } catch (err) {
        console.error("[JOBS_POST]", err)
        return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
    }
}

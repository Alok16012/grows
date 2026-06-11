import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"

const toInt = (v: any) =>
    v === "" || v === null || v === undefined ? null : Number.isFinite(parseInt(v)) ? parseInt(v) : null
const toStrArray = (v: any) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [], "jobs.view")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    try {
        const job = await prisma.jobPosting.findUnique({
            where: { id: params.id },
            include: { creator: { select: { id: true, name: true } } },
        })
        if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
        return NextResponse.json(job)
    } catch (err) {
        console.error("[JOB_GET]", err)
        return NextResponse.json({ error: "Failed to load job" }, { status: 500 })
    }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [], "jobs.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    try {
        const body = await req.json()
        const data: any = {}

        // Only touch fields that were sent so partial updates (e.g. status flip) work.
        const passthrough = [
            "title", "salaryPeriod", "department", "jobRole", "jobLocation",
            "educationDegree", "genderPreference", "candidateIndustry", "description",
            "companyName", "employmentType", "industryType", "roleCategory",
            "contactName", "contactPhone", "callStartTime", "callEndTime", "callDays",
            "partSectionLabel", "partName", "partMaterial", "partPhotoUrl",
            "inspectionType", "qualityStandard", "customerName", "plantLocation",
            "plantAddress", "shiftType", "weeklyOff", "overtimePolicy",
        ]
        for (const k of passthrough) if (k in body) data[k] = body[k] || null
        if ("title" in body) {
            if (!body.title || !String(body.title).trim())
                return NextResponse.json({ error: "Job title is required" }, { status: 400 })
            data.title = String(body.title).trim()
        }
        for (const k of ["workExpMin", "workExpMax", "salaryMin", "salaryMax", "openings"])
            if (k in body) data[k] = toInt(body[k])
        for (const k of ["perks", "qualifications", "skills", "languages"])
            if (k in body) data[k] = toStrArray(body[k])
        for (const k of ["freshersAllowed", "allowCalls", "canteenAvailable", "transportAvailable", "accommodationAvailable", "busFacility"])
            if (k in body) data[k] = !!body[k]
        if ("screeningQuestions" in body)
            data.screeningQuestions = Array.isArray(body.screeningQuestions) ? body.screeningQuestions : []
        if ("status" in body && ["DRAFT", "PUBLISHED", "CLOSED"].includes(body.status))
            data.status = body.status

        const job = await prisma.jobPosting.update({
            where: { id: params.id },
            data,
            include: { creator: { select: { id: true, name: true } } },
        })
        return NextResponse.json(job)
    } catch (err) {
        console.error("[JOB_PATCH]", err)
        return NextResponse.json({ error: "Failed to update job" }, { status: 500 })
    }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session || !checkAccess(session, [], "jobs.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    try {
        await prisma.jobPosting.delete({ where: { id: params.id } })
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error("[JOB_DELETE]", err)
        return NextResponse.json({ error: "Failed to delete job" }, { status: 500 })
    }
}

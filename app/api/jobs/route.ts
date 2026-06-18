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

// Prod migrations don't run on deploy (DIRECT_URL unset on Vercel), so the
// customer/part/facility columns from 20260611120000 may be missing on the live
// DB. Selecting them via the Prisma client then throws P2022. Self-heal at
// runtime by adding the columns on demand (mirrors the expense-route pattern).
let jobColumnsEnsured = false
async function ensureJobPostingColumns() {
    if (jobColumnsEnsured) return
    try {
        await (prisma as any).$executeRawUnsafe(`
            ALTER TABLE "JobPosting"
                ADD COLUMN IF NOT EXISTS "partSectionLabel"       TEXT,
                ADD COLUMN IF NOT EXISTS "partName"               TEXT,
                ADD COLUMN IF NOT EXISTS "partMaterial"           TEXT,
                ADD COLUMN IF NOT EXISTS "partPhotoUrl"           TEXT,
                ADD COLUMN IF NOT EXISTS "inspectionType"         TEXT,
                ADD COLUMN IF NOT EXISTS "qualityStandard"        TEXT,
                ADD COLUMN IF NOT EXISTS "customerName"           TEXT,
                ADD COLUMN IF NOT EXISTS "plantLocation"          TEXT,
                ADD COLUMN IF NOT EXISTS "plantAddress"           TEXT,
                ADD COLUMN IF NOT EXISTS "mapUrl"                 TEXT,
                ADD COLUMN IF NOT EXISTS "shiftType"              TEXT,
                ADD COLUMN IF NOT EXISTS "weeklyOff"              TEXT,
                ADD COLUMN IF NOT EXISTS "overtimePolicy"         TEXT,
                ADD COLUMN IF NOT EXISTS "canteenAvailable"       BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS "transportAvailable"     BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS "accommodationAvailable" BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS "busFacility"            BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS "priority"               TEXT NOT NULL DEFAULT 'MEDIUM',
                ADD COLUMN IF NOT EXISTS "deadline"               TIMESTAMP(3),
                ADD COLUMN IF NOT EXISTS "siteId"                 TEXT,
                ADD COLUMN IF NOT EXISTS "siteName"               TEXT
        `)
        jobColumnsEnsured = true
    } catch { /* best effort */ }
}

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

    const loadJobs = () =>
        prisma.jobPosting.findMany({
            where,
            include: { creator: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
        })

    try {
        return NextResponse.json(await loadJobs())
    } catch (err: any) {
        // Schema drift on prod: a column the client selects doesn't exist yet.
        // Add the missing columns, then retry once before giving up.
        const msg = String(err?.message || "").toLowerCase()
        if (msg.includes("does not exist") || err?.code === "P2022") {
            await ensureJobPostingColumns()
            try {
                return NextResponse.json(await loadJobs())
            } catch (retryErr) {
                console.error("[JOBS_GET_RETRY]", retryErr)
            }
        } else {
            console.error("[JOBS_GET]", err)
        }
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

        // Make sure the customer/part/facility columns exist before writing them.
        await ensureJobPostingColumns()

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
                // Sample / inspection part
                partSectionLabel: body.partSectionLabel || null,
                partName: body.partName || null,
                partMaterial: body.partMaterial || null,
                partPhotoUrl: body.partPhotoUrl || null,
                inspectionType: body.inspectionType || null,
                qualityStandard: body.qualityStandard || null,
                // Customer & plant location
                customerName: body.customerName || null,
                plantLocation: body.plantLocation || null,
                plantAddress: body.plantAddress || null,
                mapUrl: body.mapUrl || null,
                // Facility / amenities
                shiftType: body.shiftType || null,
                weeklyOff: body.weeklyOff || null,
                overtimePolicy: body.overtimePolicy || null,
                canteenAvailable: !!body.canteenAvailable,
                transportAvailable: !!body.transportAvailable,
                accommodationAvailable: !!body.accommodationAvailable,
                busFacility: !!body.busFacility,
                // Priority / deadline / target site
                priority: ["LOW", "MEDIUM", "HIGH"].includes(body.priority) ? body.priority : "MEDIUM",
                deadline: body.deadline ? new Date(body.deadline) : null,
                siteId: body.siteId || null,
                siteName: body.siteName || null,
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

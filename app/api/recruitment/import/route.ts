import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Role } from "@prisma/client"

interface NormalizedRow {
    candidateName?: string
    phone?: string
    email?: string
    city?: string
    position?: string
    source?: string
    priority?: string
    score?: string
    experience?: string | number
    qualification?: string
    skills?: string
    notes?: string
    locality?: string
    gender?: string
    languages?: string
    age?: string | number
    course?: string
    specialization?: string
    collegeName?: string
    courseStartYear?: string
    courseEndYear?: string
    previousDesignation?: string
    previousCompany?: string
    resumeUrl?: string
    profileUrl?: string
    englishLevel?: string
    levelOfExperience?: string
    currentSalary?: string | number
}

function parseExperience(val: string | number | undefined): number | null {
    if (val === undefined || val === null || val === "") return null
    const str = String(val).trim()
    // Try "10 years in..." pattern
    const match = str.match(/(\d+(?:\.\d+)?)\s*year/i)
    if (match) return parseFloat(match[1])
    // Try plain number
    const n = parseFloat(str)
    return isNaN(n) ? null : n
}

function parseSalary(val: string | number | undefined): number | null {
    if (val === undefined || val === null || val === "") return null
    const str = String(val).trim()
    if (str === "-" || str.toLowerCase() === "n/a") return null
    const n = parseFloat(str.replace(/[^0-9.]/g, ""))
    return isNaN(n) ? null : n
}

function normalizeWorkIndiaRow(r: Record<string, unknown>): NormalizedRow {
    return {
        candidateName: String(r["Full Name"] ?? "").trim(),
        phone: String(r["Mobile No."] ?? r["Mobile No"] ?? "").trim().replace(/\D/g, "").slice(-10),
        city: String(r["City"] ?? "").trim(),
        locality: String(r["Location"] ?? "").trim(),
        qualification: String(r["Qualification"] ?? "").trim(),
        experience: parseExperience(r["Relevant Experience"] as string | number | undefined) ?? undefined,
        gender: String(r["Gender"] ?? "").trim(),
        skills: String(r["Skills"] ?? "").trim(),
        currentSalary: parseSalary(r["Current Salary"] as string | number | undefined) ?? undefined,
        englishLevel: String(r["English Speaking"] ?? "").trim(),
        age: r["Age"] !== undefined && r["Age"] !== "" ? parseInt(String(r["Age"])) : undefined,
        course: String(r["Course"] ?? "").trim(),
        specialization: String(r["Specialization"] ?? "").trim(),
        collegeName: String(r["College Name"] ?? "").trim(),
        courseStartYear: String(r["Course Start Time"] ?? "").trim(),
        courseEndYear: String(r["Course End Time"] ?? "").trim(),
        previousDesignation: String(r["Previous Designation"] ?? "").trim(),
        previousCompany: String(r["Previous Company Name"] ?? "").trim(),
        resumeUrl: String(r["Resume Link"] ?? "").trim(),
        profileUrl: String(r["Profile Link"] ?? "").trim(),
        levelOfExperience: String(r["Level Of Experience"] ?? "").trim(),
        languages: String(r["Languages Known"] ?? "").trim(),
        // WorkIndia doesn't have "position" — use previous designation or "Not Specified"
        position: String(r["Previous Designation"] ?? "").trim() || "Not Specified",
        source: "WorkIndia",
    }
}

function normalizeOurRow(r: Record<string, unknown>): NormalizedRow {
    const entry: NormalizedRow = {}
    for (const key of Object.keys(r)) {
        const val = r[key]
        const lk = key.toLowerCase().replace(/[\s._-]+/g, "")
        if (lk === "candidatename") entry.candidateName = String(val ?? "")
        else if (lk === "phone") entry.phone = String(val ?? "")
        else if (lk === "email") entry.email = String(val ?? "")
        else if (lk === "city") entry.city = String(val ?? "")
        else if (lk === "locality") entry.locality = String(val ?? "")
        else if (lk === "position") entry.position = String(val ?? "")
        else if (lk === "source") entry.source = String(val ?? "")
        else if (lk === "experience") entry.experience = val as string | number
        else if (lk === "qualification") entry.qualification = String(val ?? "")
        else if (lk === "skills") entry.skills = String(val ?? "")
        else if (lk === "notes") entry.notes = String(val ?? "")
        else if (lk === "priority") entry.priority = String(val ?? "")
        else if (lk === "score") entry.score = String(val ?? "")
        else if (lk === "gender") entry.gender = String(val ?? "")
        else if (lk === "languages" || lk === "languagesknown") entry.languages = String(val ?? "")
        else if (lk === "age") entry.age = val as string | number
        else if (lk === "course") entry.course = String(val ?? "")
        else if (lk === "specialization") entry.specialization = String(val ?? "")
        else if (lk === "collegename") entry.collegeName = String(val ?? "")
        else if (lk === "coursestartyear" || lk === "coursestarttime") entry.courseStartYear = String(val ?? "")
        else if (lk === "courseendyear" || lk === "courseendtime") entry.courseEndYear = String(val ?? "")
        else if (lk === "previousdesignation") entry.previousDesignation = String(val ?? "")
        else if (lk === "previouscompany" || lk === "previouscompanyname") entry.previousCompany = String(val ?? "")
        else if (lk === "resumeurl" || lk === "resumelink") entry.resumeUrl = String(val ?? "")
        else if (lk === "profileurl" || lk === "profilelink") entry.profileUrl = String(val ?? "")
        else if (lk === "englishlevel" || lk === "englishspeaking") entry.englishLevel = String(val ?? "")
        else if (lk === "levelofexperience") entry.levelOfExperience = String(val ?? "")
        else if (lk === "currentsalary") entry.currentSalary = val as string | number
    }
    return entry
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const realUser = await prisma.user.findUnique({ where: { id: session.user.id } })
        ?? await prisma.user.findUnique({ where: { email: session.user.email ?? "" } })
    if (!realUser) return NextResponse.json({ error: "User not found" }, { status: 403 })

    const body = await req.json()
    const rawRows: Record<string, unknown>[] = body.rows ?? []

    // Detect format: WorkIndia has "Full Name" key
    const isWorkIndia = rawRows.length > 0 && ("Full Name" in rawRows[0] || "Mobile No." in rawRows[0])

    const rows: NormalizedRow[] = rawRows.map(r =>
        isWorkIndia ? normalizeWorkIndiaRow(r) : normalizeOurRow(r)
    )

    let imported = 0
    let skipped = 0
    const errors: { row: number; reason: string }[] = []

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2

        const candidateName = String(row.candidateName ?? "").trim()
        const phone = String(row.phone ?? "").trim()
        const position = String(row.position ?? "").trim()
        const source = String(row.source ?? "").trim()

        if (!candidateName || !phone) {
            errors.push({ row: rowNum, reason: `Missing required fields (Name, Phone)` })
            skipped++
            continue
        }

        // For WorkIndia imports, position and source are always set; for our format require them
        if (!isWorkIndia && (!position || !source)) {
            errors.push({ row: rowNum, reason: `Missing required fields (Position, Source)` })
            skipped++
            continue
        }

        const existing = await prisma.lead.findFirst({ where: { phone } })
        if (existing) {
            skipped++
            errors.push({ row: rowNum, reason: `Duplicate phone: ${phone} (${existing.candidateName})` })
            continue
        }

        try {
            const expVal = row.experience !== undefined && row.experience !== ""
                ? (typeof row.experience === "number" ? row.experience : parseFloat(String(row.experience)))
                : null
            const ageVal = row.age !== undefined && row.age !== ""
                ? parseInt(String(row.age))
                : null
            const salaryVal = row.currentSalary !== undefined && row.currentSalary !== "" && row.currentSalary !== null
                ? parseSalary(row.currentSalary)
                : null

            await prisma.lead.create({
                data: {
                    candidateName,
                    phone,
                    position: position || "Not Specified",
                    source: source || "Other",
                    email: row.email ? String(row.email).trim() || null : null,
                    city: row.city ? String(row.city).trim() || null : null,
                    priority: (row.priority as "HIGH" | "MEDIUM" | "LOW") || "MEDIUM",
                    score: (row.score as "HOT" | "WARM" | "COLD") || "WARM",
                    experience: isNaN(expVal as number) ? null : expVal,
                    qualification: row.qualification ? String(row.qualification).trim() || null : null,
                    skills: row.skills ? String(row.skills).trim() || null : null,
                    notes: row.notes ? String(row.notes).trim() || null : null,
                    locality: row.locality ? String(row.locality).trim() || null : null,
                    gender: row.gender ? String(row.gender).trim() || null : null,
                    languages: row.languages ? String(row.languages).trim() || null : null,
                    age: isNaN(ageVal as number) ? null : ageVal,
                    course: row.course ? String(row.course).trim() || null : null,
                    specialization: row.specialization ? String(row.specialization).trim() || null : null,
                    collegeName: row.collegeName ? String(row.collegeName).trim() || null : null,
                    courseStartYear: row.courseStartYear ? String(row.courseStartYear).trim() || null : null,
                    courseEndYear: row.courseEndYear ? String(row.courseEndYear).trim() || null : null,
                    previousDesignation: row.previousDesignation ? String(row.previousDesignation).trim() || null : null,
                    previousCompany: row.previousCompany ? String(row.previousCompany).trim() || null : null,
                    resumeUrl: row.resumeUrl ? String(row.resumeUrl).trim() || null : null,
                    profileUrl: row.profileUrl ? String(row.profileUrl).trim() || null : null,
                    englishLevel: row.englishLevel ? String(row.englishLevel).trim() || null : null,
                    levelOfExperience: row.levelOfExperience ? String(row.levelOfExperience).trim() || null : null,
                    currentSalary: isNaN(salaryVal as number) ? null : salaryVal,
                    createdBy: realUser.id,
                },
            })
            imported++
        } catch (err) {
            errors.push({ row: rowNum, reason: `DB error: ${(err as Error).message}` })
            skipped++
        }
    }

    return NextResponse.json({ imported, skipped, errors })
}

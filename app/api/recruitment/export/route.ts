import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Role } from "@prisma/client"
import * as XLSX from "xlsx"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== Role.ADMIN && session.user.role !== Role.MANAGER && session.user.role !== Role.HR_MANAGER)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const score = searchParams.get("score")
    const assignedTo = searchParams.get("assignedTo")
    const search = searchParams.get("search")

    const where: Record<string, unknown> = {}
    if (status && status !== "ALL") where.status = status
    if (priority && priority !== "ALL") where.priority = priority
    if (score && score !== "ALL") where.score = score
    if (assignedTo && assignedTo !== "ALL") where.assignedTo = assignedTo
    if (search) {
        where.OR = [
            { candidateName: { contains: search, mode: "insensitive" } },
            { position: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
        ]
    }

    const leads = await prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
    })

    const rows = leads.map(l => ({
        "Candidate Name": l.candidateName,
        "Phone": l.phone,
        "Email": l.email ?? "",
        "City": l.city ?? "",
        "Locality": (l as any).locality ?? "",
        "Position": l.position,
        "Experience": l.experience ?? "",
        "Level Of Experience": (l as any).levelOfExperience ?? "",
        "Source": l.source,
        "Status": l.status,
        "Priority": l.priority,
        "Score": l.score,
        "Qualification": l.qualification ?? "",
        "Skills": l.skills ?? "",
        "Current Salary": l.currentSalary ?? "",
        "Expected Salary": l.expectedSalary ?? "",
        "Gender": (l as any).gender ?? "",
        "Age": (l as any).age ?? "",
        "English Level": (l as any).englishLevel ?? "",
        "Languages": (l as any).languages ?? "",
        "Previous Designation": (l as any).previousDesignation ?? "",
        "Previous Company": (l as any).previousCompany ?? "",
        "Course": (l as any).course ?? "",
        "Specialization": (l as any).specialization ?? "",
        "College Name": (l as any).collegeName ?? "",
        "Course Start Year": (l as any).courseStartYear ?? "",
        "Course End Year": (l as any).courseEndYear ?? "",
        "Resume URL": (l as any).resumeUrl ?? "",
        "Profile URL": (l as any).profileUrl ?? "",
        "Interview Date": l.interviewDate ? new Date(l.interviewDate).toISOString().split("T")[0] : "",
        "Notes": l.notes ?? "",
        "Created At": new Date(l.createdAt).toISOString().split("T")[0],
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, "Recruitment")

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

    const today = new Date().toISOString().split("T")[0]
    return new NextResponse(buf, {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="recruitment_export_${today}.xlsx"`,
        },
    })
}

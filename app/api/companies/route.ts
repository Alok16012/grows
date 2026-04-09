
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { resolveUserId } from "@/lib/resolveUserId"

export async function GET() {
    try {
        const session = await getServerSession(authOptions)

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 })
        }
        // Resolve real DB user ID (session.user.id may be a demo-xxx string)
        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })


        const companies = await prisma.company.findMany({
            include: {
                _count: {
                    select: { projects: true },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        })

        return NextResponse.json(companies)
    } catch (error) {
        console.error("[COMPANIES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        // Role check: CLIENT cannot create companies (Assuming ADMIN, MANAGER, INSPECTION_BOY can)
        if (session.user.role === "CLIENT") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const actorId = await resolveUserId(session)
        if (!actorId) return NextResponse.json({ error: "User not found. Please log in again." }, { status: 403 })

        const body = await req.json()
        const { name, address, contactPerson, contactPhone, logoUrl } = body

        if (!name) {
            return new NextResponse("Name is required", { status: 400 })
        }

        const company = await prisma.company.create({
            data: {
                name,
                address,
                contactPerson,
                contactPhone,
                logoUrl,
                createdBy: actorId!,
            },
        })

        return NextResponse.json(company)
    } catch (error) {
        console.error("[COMPANIES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

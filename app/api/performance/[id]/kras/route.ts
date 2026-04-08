import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        const kras = await prisma.kRA.findMany({
            where: { reviewId: params.id },
            include: {
                kpis: { orderBy: { weightage: "desc" } },
            },
            orderBy: { weightage: "desc" },
        })

        return NextResponse.json(kras)
    } catch (error) {
        console.error("[KRAS_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const review = await prisma.performanceReview.findUnique({
            where: { id: params.id },
            select: { id: true },
        })
        if (!review) return new NextResponse("Review not found", { status: 404 })

        const body = await req.json()
        const { title, description, weightage, kpis } = body

        if (!title) {
            return new NextResponse("title is required", { status: 400 })
        }

        const kra = await prisma.kRA.create({
            data: {
                reviewId: params.id,
                title,
                description: description || null,
                weightage: weightage ?? 25,
                ...(kpis && Array.isArray(kpis) && kpis.length > 0
                    ? {
                          kpis: {
                              create: kpis.map((k: { title: string; description?: string; target: string; weightage?: number }) => ({
                                  reviewId: params.id,
                                  title: k.title,
                                  description: k.description || null,
                                  target: k.target,
                                  weightage: k.weightage ?? 10,
                              })),
                          },
                      }
                    : {}),
            },
            include: {
                kpis: true,
            },
        })

        return NextResponse.json(kra)
    } catch (error) {
        console.error("[KRAS_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

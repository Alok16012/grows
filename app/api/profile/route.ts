import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { collectErrors, validationResponse, validatePhone, normalizePhone } from "@/lib/validation"

export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const data = await req.json()
        const { name, phone, image } = data

        const errors = collectErrors({ phone: validatePhone(phone) })
        // The profile page reads a failed response with res.text().
        if (errors) return new NextResponse(validationResponse(errors).message, { status: 400 })

        const updatedUser = await prisma.user.update({
            where: { id: session.user.id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(phone !== undefined ? { phone: phone ? normalizePhone(phone) : phone } : {}),
                ...(image !== undefined ? { image } : {}),
            }
        })

        return NextResponse.json(updatedUser)
    } catch (error) {
        console.error("Profile update error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                name: true,
                email: true,
                phone: true,
                role: true,
                image: true
            }
        })

        return NextResponse.json(user)
    } catch (error) {
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}

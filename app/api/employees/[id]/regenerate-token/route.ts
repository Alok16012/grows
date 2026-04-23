import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import crypto from "crypto"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.create")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const employee = await prisma.employee.findUnique({ where: { id: params.id } })
        if (!employee) return new NextResponse("Employee not found", { status: 404 })

        const onboardingToken = crypto.randomUUID().replace(/-/g, "")

        const updated = await prisma.employee.update({
            where: { id: params.id },
            data: { onboardingToken },
        })

        return NextResponse.json({ onboardingToken: updated.onboardingToken })
    } catch (error) {
        console.error("[REGENERATE_TOKEN]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

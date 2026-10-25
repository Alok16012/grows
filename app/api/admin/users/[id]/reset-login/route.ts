import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { guard, accessTablesReady, audit, requestMeta, bumpAccessVersion } from "@/lib/access"
import { RuleError } from "@/lib/role-rules"
import { ruleResponse } from "@/lib/role-admin"
import { resetLogin } from "@/lib/login-security"

// Clears the user's password, MPIN and lockout; they sign in again with an OTP
// and set a new MPIN. Nobody learns a secret, and none is written to the log.
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const g = await guard(req, ["users.resetLogin", "users.manage"])
    if (g instanceof NextResponse) return g
    try {
        const u = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true, role: true } })
        if (!u) throw new RuleError(404, "User not found")
        if (u.role === "ADMIN" && !g.access.isAdmin) throw new RuleError(403, "Only an Admin can reset an Admin's login.")
        await resetLogin([u.id])
        if (await accessTablesReady()) {
            await prisma.$transaction(async tx => {
                await tx.userAccess.upsert({ where: { userId: u.id }, create: { userId: u.id, loginMethod: "OTP" }, update: { loginMethod: "OTP", mustChangePassword: false } })
                await bumpAccessVersion(tx, [u.id])
                await audit(tx, { actorId: g.access.userId, actorName: g.access.name, action: "user.resetLogin", targetType: "User", targetId: u.id, targetName: u.name, summary: `${u.name}: login reset — next sign-in by OTP`, ...requestMeta(req) })
            })
        }
        return NextResponse.json({ ok: true })
    } catch (e) {
        return ruleResponse(e, "[USER_RESET_LOGIN]")
    }
}

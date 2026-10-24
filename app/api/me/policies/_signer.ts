import prisma from "@/lib/prisma"
import { getApiSession } from "@/lib/apiSession"
import { PolicyError, SIGNER_SELECT } from "@/lib/policy-signoff"

// A logged-in employee signs against the designation on their record.
export async function sessionSigner(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) throw new PolicyError(401, "UNAUTHORIZED", "Unauthorized")
    const emp = await prisma.employee.findUnique({ where: { userId: session.user.id }, select: SIGNER_SELECT })
    if (!emp) throw new PolicyError(404, "NO_EMPLOYEE", "Your login isn't linked to an employee record")
    return { emp, userId: session.user.id }
}

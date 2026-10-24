import prisma from "@/lib/prisma"
import { PolicyError, SIGNER_SELECT } from "@/lib/policy-signoff"

// The onboarding link is the joiner's credential. Designation is typed on step
// 1 and only saved at final submit, so the screen sends the one it has; the
// submit gate re-checks against the designation that is actually saved.
export async function tokenSigner(token: string) {
    const emp = await prisma.employee.findUnique({ where: { onboardingToken: token }, select: SIGNER_SELECT })
    if (!emp) throw new PolicyError(404, "INVALID_LINK", "Invalid or expired link")
    if (emp.status === "ACTIVE") {
        throw new PolicyError(403, "ONBOARDING_DONE", "Onboarding is already finalised — sign pending policies from your profile")
    }
    return emp
}

export function designationFrom(v: unknown, fallback: string | null): string | null {
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : fallback
}

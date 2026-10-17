import prisma from "@/lib/prisma"

// Everything a learner owns in the LMS (enrollments, quiz attempts, policy
// acknowledgements, feedback) is keyed by the EMPLOYEE id. The learner routes
// used session.user.id — a User id — so a learner never found their own
// enrollments, and acknowledging a policy failed on the foreign key.

export async function learnerEmployee(session: { user: { id: string } } | null | undefined) {
    if (!session?.user?.id) return null
    return prisma.employee.findUnique({
        where: { userId: session.user.id },
        select: { id: true, firstName: true, lastName: true },
    })
}

/** CERT-YYYYMM-NNNN, numbered within the month. */
export async function nextCertificateNumber(now = new Date()): Promise<string> {
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
    const last = await prisma.courseEnrollment.findFirst({
        where: { certificate: { startsWith: `CERT-${yyyymm}-` } },
        orderBy: { certificate: "desc" },
        select: { certificate: true },
    })
    const n = last?.certificate ? parseInt(last.certificate.split("-")[2] || "0", 10) : 0
    return `CERT-${yyyymm}-${String(n + 1).padStart(4, "0")}`
}

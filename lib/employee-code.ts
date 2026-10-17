import prisma from "@/lib/prisma"

// Generate the next sequential EMP-NNNN code. Only considers real EMP- codes so
// temporary PENDING-xxxx placeholders (used while onboarding is unapproved)
// never affect the sequence.
//
// `reserved` lets a bulk caller (the Excel import) hand out several codes in one
// request before any of them has reached the database — a code in that set is
// treated as taken even though findUnique() can't see it yet.
export async function generateEmployeeCode(opts: { reserved?: Set<string> } = {}): Promise<string> {
    const last = await prisma.employee.findFirst({
        where: { employeeId: { startsWith: "EMP-" } },
        orderBy: { employeeId: "desc" },
        select: { employeeId: true },
    })
    let nextNum = 1
    const match = last?.employeeId?.match(/\d+$/)
    if (match) nextNum = parseInt(match[0]) + 1
    // Guard against a collision (race) by bumping until free.
    for (let i = 0; i < 50; i++) {
        const code = `EMP-${String(nextNum + i).padStart(4, "0")}`
        if (opts.reserved?.has(code)) continue
        const exists = await prisma.employee.findUnique({ where: { employeeId: code }, select: { id: true } })
        if (!exists) return code
    }
    return `EMP-${Date.now()}`
}

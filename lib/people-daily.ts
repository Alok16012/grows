// Daily people job (vercel.json → /api/cron/people-daily): apply movements
// whose effective date has come, and remind approvers about change requests
// waiting more than a day; issue joining letters that are due (lib/letter-schedule-server).
import prisma from "@/lib/prisma"
import { notifyApprovers } from "@/lib/hr-notify"
import { applyDueMovements } from "@/lib/employee-movement"
import { runDueLetters } from "@/lib/letter-schedule-server"

export async function runPeopleDaily(now = new Date()) {
    const applied = await applyDueMovements(now)
    const waiting = await prisma.employeeChangeRequest.count({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 86_400_000) } } })
    if (waiting) await notifyApprovers(["employees.edit"], { title: "Employee changes waiting", message: `${waiting} employee change request(s) have been waiting more than a day for approval.`, type: "employee", link: "/employees/changes" })
    let letters: Awaited<ReturnType<typeof runDueLetters>> | { error: string }
    try { letters = await runDueLetters(now) } catch (e) { console.error("[PEOPLE_DAILY_LETTERS]", e); letters = { error: "letters failed" } }
    return { applied, waiting, letters }
}

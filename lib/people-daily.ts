// Daily people job (vercel.json → /api/cron/people-daily): apply movements
// whose effective date has come, and remind approvers about change requests
// waiting more than a day; issue joining letters that are due (lib/letter-schedule-server).
import prisma from "@/lib/prisma"
import { notifyApprovers } from "@/lib/hr-notify"
import { applyDueMovements } from "@/lib/employee-movement"
import { runDueLetters } from "@/lib/letter-schedule-server"
import { assignMissingRoles } from "@/lib/auto-role-server"
import { disableIdleLogins, alertFailures, remindReview } from "@/lib/access-centre-data"
import { runExitDaily } from "@/lib/exit-flow"
import { remindChallans } from "@/lib/challans"
import { remindExpiringDocs } from "@/lib/company-profile-server"
import { remindWaitingJoiners } from "@/lib/join-server"
import { remindTasks } from "@/lib/tasks-server"

export async function runPeopleDaily(now = new Date()) {
    const applied = await applyDueMovements(now)
    const waiting = await prisma.employeeChangeRequest.count({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 86_400_000) } } })
    if (waiting) await notifyApprovers(["employees.edit"], { title: "Employee changes waiting", message: `${waiting} employee change request(s) have been waiting more than a day for approval.`, type: "employee", link: "/employees/changes" })
    let letters: Awaited<ReturnType<typeof runDueLetters>> | { error: string }
    try { letters = await runDueLetters(now) } catch (e) { console.error("[PEOPLE_DAILY_LETTERS]", e); letters = { error: "letters failed" } }
    const joinersWaiting = await remindWaitingJoiners(now).catch(e => { console.error("[PEOPLE_DAILY_JOINERS]", e); return -1 })
    // Safety net: any login still without a role gets its designation's role.
    const rolesGiven = await assignMissingRoles().catch(e => { console.error("[PEOPLE_DAILY_ROLES]", e); return -1 })
    // Company documents expiring.
    const companyDocs = await remindExpiringDocs(now).catch(e => { console.error("[PEOPLE_DAILY_COMPANY_DOCS]", e); return -1 })
    // Statutory challans due soon / overdue.
    const challans = await remindChallans(now).catch(e => { console.error("[PEOPLE_DAILY_CHALLANS]", e); return -1 })
    // Exits: leave on the last working day; clearance ticks itself.
    const exits = await runExitDaily(now).catch(e => { console.error("[PEOPLE_DAILY_EXITS]", e); return null })
    // Access centre: idle logins, failed sign-in alerts, access review reminder.
    const access = await Promise.all([disableIdleLogins(now), alertFailures(now), remindReview(now)]).catch(e => { console.error("[PEOPLE_DAILY_ACCESS]", e); return null })
    // Tasks: due-soon and overdue reminders (Tasks → settings).
    const tasks = await remindTasks(now).catch(e => { console.error("[PEOPLE_DAILY_TASKS]", e); return null })
    return { applied, waiting, letters, joinersWaiting, rolesGiven, access, exits, challans, companyDocs, tasks }
}

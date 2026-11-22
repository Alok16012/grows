// Joining checklist — evaluate tasks against real data, the approval gate, and
// the pipeline board. Manual ticks are OnboardingTask rows whose description is
// "tpl:<taskId>" (the old 14 text-only tasks are left alone).
import prisma from "@/lib/prisma"
import { postedSites } from "@/lib/attendance-guard"
import { normalizeEmploymentType } from "@/lib/employment-type"
import { applicablePolicies, signoffReady } from "@/lib/policy-signoff"
import { findEmployeeDuplicates } from "@/lib/employee-dedupe"
import { applies, sanitizeChecklist, AUTO_CHECKS, type AutoCheck, type CheckTask, type ChecklistSettings, type Stage } from "@/lib/onboarding-checklist"

const KEY = "onboardingChecklist"
export const TPL = (id: string) => `tpl:${id}`

export async function getChecklistSettings(): Promise<ChecklistSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeChecklist(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizeChecklist({}) }
}

export async function saveChecklistSettings(input: unknown, userId: string): Promise<ChecklistSettings> {
    const s = sanitizeChecklist(input)
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return s
}

export type TaskState = {
    id: string; title: string; owner: string; auto: AutoCheck | null; autoLabel: string | null; beforeApproval: boolean
    done: boolean; doneAt: string | null; doneBy: string | null; note: string | null
    dueDate: string | null; overdue: boolean
}
export type PersonChecklist = { employeeId: string; tasks: TaskState[]; done: number; total: number; blocking: TaskState[]; overdue: number }

const IST = 5.5 * 3600_000
const ymd = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10)
const addDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }

/** Checklist for many employees at once (one query per data source). */
export async function evaluateChecklists(employeeIds: string[], settings?: ChecklistSettings, now = new Date()): Promise<Map<string, PersonChecklist>> {
    const s = settings ?? await getChecklistSettings()
    const out = new Map<string, PersonChecklist>()
    if (!employeeIds.length) return out
    const ids = Array.from(new Set(employeeIds))
    const used = new Set(s.tasks.map(t => t.auto).filter(Boolean) as AutoCheck[])
    const need = (...a: AutoCheck[]) => a.some(x => used.has(x))

    const [emps, posted, docs, salaries, kits, kits2, courses, letters, rows] = await Promise.all([
        prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, employmentType: true, designation: true, dateOfJoining: true, uan: true, esiNumber: true, bankAccountNumber: true, bankIFSC: true, managerId: true, userId: true, user: { select: { isActive: true } } } }),
        postedSites(ids),
        need("DOC_AADHAAR", "DOC_PAN", "DOC_PHOTO", "DOC_BANK") ? prisma.employeeDocument.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, type: true } }) : Promise.resolve([]),
        need("SALARY") ? prisma.employeeSalary.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, basic: true } }) : Promise.resolve([]),
        need("KIT") ? prisma.assetIssue.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true }, distinct: ["employeeId"] }) : Promise.resolve([]),
        need("KIT") ? prisma.employeeAsset.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true }, distinct: ["employeeId"] }).catch(() => []) : Promise.resolve([]),
        need("LEARNING") ? prisma.courseEnrollment.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true }, distinct: ["employeeId"] }) : Promise.resolve([]),
        need("LETTER") ? prisma.hrDocument.findMany({ where: { employeeId: { in: ids }, status: { notIn: ["RECALLED", "REJECTED"] as any } }, select: { employeeId: true }, distinct: ["employeeId"] }) : Promise.resolve([]),
        prisma.onboardingTask.findMany({ where: { employeeId: { in: ids }, description: { startsWith: "tpl:" } }, select: { employeeId: true, description: true, status: true, completedAt: true, completedBy: true, title: true } }),
    ])
    const docOf = new Map<string, Set<string>>()
    for (const d of docs) docOf.set(d.employeeId, new Set([...(docOf.get(d.employeeId) ?? []), d.type.toUpperCase()]))
    const salOk = new Set(salaries.filter(x => Number(x.basic) > 0).map(x => x.employeeId))
    const kitOk = new Set([...kits, ...kits2].map(x => x.employeeId))
    const courseOk = new Set(courses.map(x => x.employeeId))
    const letterOk = new Set(letters.map(x => x.employeeId))
    const rowOf = new Map(rows.map(r => [`${r.employeeId}|${r.description}`, r]))
    const userIds = Array.from(new Set(rows.map(r => r.completedBy).filter((x): x is string => !!x)))
    const names = new Map((userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []).map(u => [u.id, u.name]))
    const policiesOk = need("POLICIES") ? await signedJoiningPolicies(emps).catch(() => new Set<string>()) : new Set<string>()
    const today = ymd(now)

    for (const e of emps) {
        const siteId = posted.get(e.id) ?? null
        const p = { employmentType: normalizeEmploymentType(e.employmentType), siteId, designation: e.designation }
        const held = docOf.get(e.id) ?? new Set<string>()
        const autoDone: Record<AutoCheck, boolean> = {
            DOC_AADHAAR: held.has("AADHAAR"), DOC_PAN: held.has("PAN"), DOC_PHOTO: held.has("PHOTO"), DOC_BANK: held.has("BANK_DETAILS"),
            POLICIES: policiesOk.has(e.id), SITE: !!siteId, SALARY: salOk.has(e.id),
            BANK: !!(e.bankAccountNumber?.trim() && e.bankIFSC?.trim()), MANAGER: !!e.managerId,
            UAN: !!e.uan?.trim(), ESIC: !!e.esiNumber?.trim(), KIT: kitOk.has(e.id), LEARNING: courseOk.has(e.id), LETTER: letterOk.has(e.id),
            LOGIN: !!(e.userId && e.user?.isActive),
        }
        const join = e.dateOfJoining ? ymd(e.dateOfJoining) : null
        const tasks: TaskState[] = s.tasks.filter(t => applies(t, p)).map((t: CheckTask) => {
            const row = rowOf.get(`${e.id}|${TPL(t.id)}`)
            const manualDone = row?.status === "COMPLETED"
            const done = t.auto ? autoDone[t.auto] || manualDone : manualDone
            const dueDate = join ? addDays(join, t.dueDays) : null
            return {
                id: t.id, title: t.title, owner: t.owner, auto: t.auto, autoLabel: t.auto ? AUTO_CHECKS[t.auto] : null, beforeApproval: t.beforeApproval,
                done, doneAt: manualDone ? row?.completedAt?.toISOString() ?? null : null, doneBy: manualDone && row?.completedBy ? names.get(row.completedBy) ?? null : null,
                note: manualDone && row?.title && row.title !== t.title ? row.title : null,
                dueDate, overdue: !done && !!dueDate && dueDate < today,
            }
        })
        out.set(e.id, { employeeId: e.id, tasks, done: tasks.filter(x => x.done).length, total: tasks.length, blocking: tasks.filter(x => x.beforeApproval && !x.done), overdue: tasks.filter(x => x.overdue).length })
    }
    return out
}

/**
 * Who has signed every joining (onboarding) policy for their designation — the
 * same rule as policy-signoff pendingTitles, batched: one policy lookup per
 * designation and one signature query for everyone.
 */
async function signedJoiningPolicies(emps: { id: string; designation: string | null }[]): Promise<Set<string>> {
    const ok = new Set<string>()
    if (!emps.length) return ok
    if (!(await signoffReady())) { emps.forEach(e => ok.add(e.id)); return ok }
    const byDes = new Map<string, Awaited<ReturnType<typeof applicablePolicies>>>()
    await Promise.all(Array.from(new Set(emps.map(e => e.designation ?? ""))).map(async des => { byDes.set(des, await applicablePolicies(des || null, "onboarding")) }))
    const policyIds = Array.from(new Set(Array.from(byDes.values()).flat().map(a => a.policyId)))
    const acks = policyIds.length ? await prisma.signoffAck.findMany({
        where: { employeeId: { in: emps.map(e => e.id) }, signedAt: { not: null }, version: { policyId: { in: policyIds } } },
        select: { employeeId: true, version: { select: { policyId: true, versionNo: true } } },
    }) : []
    const best = new Map<string, number>() // employee|policy → highest signed version
    for (const a of acks) { const k = `${a.employeeId}|${a.version.policyId}`; best.set(k, Math.max(best.get(k) ?? 0, a.version.versionNo)) }
    for (const e of emps) {
        const apps = byDes.get(e.designation ?? "") ?? []
        if (apps.every(a => (best.get(`${e.id}|${a.policyId}`) ?? 0) >= a.minVersionNo)) ok.add(e.id)
    }
    return ok
}

/** Tick / untick a hand-ticked task (or confirm an automatic one by hand, e.g. kit given outside the system). */
export async function setTaskDone(employeeId: string, taskId: string, done: boolean, userId: string, note?: string | null) {
    const s = await getChecklistSettings()
    const t = s.tasks.find(x => x.id === taskId)
    if (!t) throw new Error("Task not found")
    const rec = await prisma.onboardingRecord.findUnique({ where: { employeeId }, select: { id: true } })
    if (!rec) throw new Error("No onboarding record for this employee")
    const existing = await prisma.onboardingTask.findFirst({ where: { employeeId, description: TPL(taskId) }, select: { id: true } })
    const data = { status: done ? "COMPLETED" as const : "PENDING" as const, completedAt: done ? new Date() : null, completedBy: done ? userId : null, title: (done && note?.trim() ? `${t.title} — ${note.trim()}` : t.title).slice(0, 300) }
    if (existing) await prisma.onboardingTask.update({ where: { id: existing.id }, data })
    else await prisma.onboardingTask.create({ data: { ...data, onboardingId: rec.id, employeeId, description: TPL(taskId), category: t.owner, order: 100 + s.tasks.indexOf(t), isRequired: t.beforeApproval } })
}

/**
 * KYC documents this person must have before becoming Active — the checklist's
 * "before approval" document tasks that apply to them. One rule for approval,
 * the employee form's status change and rejoining.
 */
export async function missingRequiredDocs(employeeId: string, settings?: ChecklistSettings): Promise<string[]> {
    const s = settings ?? await getChecklistSettings()
    const [c] = Array.from((await evaluateChecklists([employeeId], s)).values())
    return (c?.blocking ?? []).filter(b => b.auto?.startsWith("DOC_")).map(b => b.title)
}

/** Why approval should wait: open "before approval" tasks, duplicate KYC, an old joining date. */
export async function approvalGate(employeeId: string, now = new Date()) {
    const s = await getChecklistSettings()
    const [c] = Array.from((await evaluateChecklists([employeeId], s, now)).values())
    const reasons: string[] = []
    const docMissing = (c?.blocking ?? []).filter(b => b.auto?.startsWith("DOC_")).map(b => b.title)
    if (c?.blocking.length) reasons.push(`still open: ${c.blocking.map(b => b.title).join(", ")}`)
    const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { aadharNumber: true, panNumber: true, bankAccountNumber: true, phone: true, dateOfJoining: true } })
    if (e && s.blockDuplicates) {
        const dups = await findEmployeeDuplicates({ aadharNumber: e.aadharNumber, panNumber: e.panNumber, bankAccountNumber: e.bankAccountNumber, phone: e.phone }, employeeId)
        if (dups.length) reasons.push(`same ${Array.from(new Set(dups.map(d => d.label))).join(", ")} as ${Array.from(new Set(dups.map(d => `${d.employee.name} (${d.employee.employeeId})`))).join(", ")}`)
    }
    if (e?.dateOfJoining && s.oldJoiningDays > 0) {
        const days = Math.floor((now.getTime() - e.dateOfJoining.getTime()) / 86_400_000)
        if (days > s.oldJoiningDays) reasons.push(`joining date is ${days} days ago — check it is right`)
    }
    return { reasons, docMissing, docsBypass: s.docsBypass, override: s.override, checklist: c ?? null }
}

export type BoardCard = {
    recordId: string; employeeId: string; code: string; name: string; designation: string | null; site: string | null; recruiter: string | null
    stage: Stage; days: number; stuck: boolean; joiningDate: string | null
    done: number; total: number; blocking: string[]; overdue: number; nextTask: string | null
}

/** Everyone in onboarding plus recently approved joiners with tasks still open, by stage. */
export async function pipelineBoard(scopeEmployeeIds: string[] | null, now = new Date()) {
    const s = await getChecklistSettings()
    const since = new Date(now.getTime() - s.followUpDays * 86_400_000)
    const recs = await prisma.onboardingRecord.findMany({
        where: {
            ...(scopeEmployeeIds ? { employeeId: { in: scopeEmployeeIds } } : {}),
            OR: [{ status: { in: ["IN_PROGRESS", "NOT_STARTED", "ON_HOLD"] } }, { status: "COMPLETED", completedAt: { gte: since } }],
        },
        select: { id: true, employeeId: true, status: true, createdAt: true, completedAt: true, updatedAt: true, employee: { select: { employeeId: true, firstName: true, lastName: true, designation: true, dateOfJoining: true, managerId: true, status: true } } },
        take: 1000,
    })
    const live = recs.filter(r => !(r.status === "COMPLETED" && ["RESIGNED", "TERMINATED", "INACTIVE"].includes(String(r.employee.status))))
    const ids = live.map(r => r.employeeId)
    const [checks, posted, sites, users] = await Promise.all([
        evaluateChecklists(ids, s, now), postedSites(ids),
        prisma.site.findMany({ select: { id: true, name: true } }),
        prisma.user.findMany({ where: { id: { in: Array.from(new Set(live.map(r => r.employee.managerId).filter((x): x is string => !!x))) } }, select: { id: true, name: true } }),
    ])
    const siteName = new Map(sites.map(x => [x.id, x.name])), userName = new Map(users.map(u => [u.id, u.name]))
    const cards: BoardCard[] = []
    for (const r of live) {
        const c = checks.get(r.employeeId)
        const blocking = c?.blocking ?? []
        let stage: Stage
        if (r.status === "ON_HOLD") stage = "ON_HOLD"
        else if (r.status === "COMPLETED") { if (!c || c.done === c.total) continue; stage = "JOINED" }
        else if (blocking.some(b => b.auto?.startsWith("DOC_"))) stage = "DOCS"
        else if (blocking.some(b => b.auto === "POLICIES")) stage = "POLICIES"
        else if (blocking.length) stage = "SETUP"
        else stage = "READY"
        const from = r.status === "COMPLETED" ? r.completedAt ?? r.updatedAt : r.status === "ON_HOLD" ? r.updatedAt : r.createdAt
        const days = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000))
        const open = (c?.tasks ?? []).filter(t => !t.done)
        cards.push({
            recordId: r.id, employeeId: r.employeeId, code: r.employee.employeeId, name: `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim(), designation: r.employee.designation,
            site: siteName.get(posted.get(r.employeeId) ?? "") ?? null, recruiter: r.employee.managerId ? userName.get(r.employee.managerId) ?? null : null,
            stage, days, stuck: stage === "JOINED" ? (c?.overdue ?? 0) > 0 : days > s.stuckAfterDays,
            joiningDate: r.employee.dateOfJoining ? ymd(r.employee.dateOfJoining) : null,
            done: c?.done ?? 0, total: c?.total ?? 0, blocking: blocking.map(b => b.title), overdue: c?.overdue ?? 0,
            nextTask: open.sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))[0]?.title ?? null,
        })
    }
    cards.sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.days - a.days)
    return { settings: s, cards }
}

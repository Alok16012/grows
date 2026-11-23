// Exit flow: settings, leaving on the last working day, self-ticking clearance,
// F&F approval, relieving / experience letters, and backfill for past leavers.
import prisma from "@/lib/prisma"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"
import { recordSiteChanges, type SiteChange } from "@/lib/site-history"
import { fillTemplate, buildDocVars, generateDocNumber } from "@/lib/hr-document"
import { ensureHrDocRecallSchema, getUserSignature } from "@/lib/hr-doc-schema"
import { computeSettlement, getFnfRecord, saveFnfRecord } from "@/lib/exit-settlement"
import { sanitizeExitSettings, EXIT_AUTO, type ExitAuto, type ExitSettings } from "@/lib/exit-settings"

const KEY = "exitSettings"
const LEFT = ["RESIGNED", "TERMINATED", "INACTIVE"]
type Actor = { id: string | null; name: string | null }

export async function getExitSettings(): Promise<ExitSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        const s = sanitizeExitSettings(row?.value ? JSON.parse(row.value) : {})
        // Default letters: the HR document types named Relieving / Experience Letter.
        if (!row) {
            const types = await prisma.hrDocumentType.findMany({ where: { isActive: true }, select: { id: true, name: true } })
            s.relievingTypeId = types.find(t => /reliev/i.test(t.name))?.id ?? null
            s.experienceTypeId = types.find(t => /experience/i.test(t.name))?.id ?? null
        }
        return s
    } catch { return sanitizeExitSettings({}) }
}

export async function saveExitSettings(input: unknown, userId: string): Promise<ExitSettings> {
    const s = sanitizeExitSettings(input)
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return s
}

export const leftStatusFor = (exitType: string) => exitType === "TERMINATION" || exitType === "ABSCONDING" ? "TERMINATED" : "RESIGNED"

/**
 * Mark the person as left: status, leaving date, site postings ended, login
 * closed. Safe to run twice. Used on the last working day (daily job, or at
 * once when that day has already passed) and when an exit is completed.
 */
export async function offboardForExit(exitId: string, actor: Actor, req?: Request) {
    const ex = await prisma.exitRequest.findUnique({ where: { id: exitId }, select: { id: true, employeeId: true, exitType: true, lastWorkingDate: true, status: true } })
    if (!ex || ex.status === "CANCELLED") return false
    const leftAs = leftStatusFor(ex.exitType)
    const leavingDate = ex.lastWorkingDate ?? new Date()
    const relieved: SiteChange[] = []
    let changed = false
    await prisma.$transaction(async tx => {
        const emp = await tx.employee.findUnique({ where: { id: ex.employeeId }, select: { status: true, userId: true } })
        if (!emp) return
        if (!LEFT.includes(String(emp.status))) {
            await tx.employee.update({ where: { id: ex.employeeId }, data: { status: leftAs as any, dateOfLeaving: leavingDate } })
            changed = true
        }
        const live = await tx.deployment.findMany({ where: { employeeId: ex.employeeId, isActive: true }, select: { siteId: true } })
        for (const d of live) relieved.push({ action: "deployment.relieve", employeeId: ex.employeeId, siteId: d.siteId, startDate: leavingDate, source: "Exit", actorId: actor.id, actorName: actor.name, extra: { status: leftAs }, req } as SiteChange)
        if (live.length) await tx.deployment.updateMany({ where: { employeeId: ex.employeeId, isActive: true }, data: { isActive: false, endDate: leavingDate, relievedAt: leavingDate } })
        if (emp.userId) await tx.user.updateMany({ where: { id: emp.userId, isActive: true, role: { not: "ADMIN" } }, data: { isActive: false } })
    })
    recordSiteChanges(relieved)
    return changed
}

// ─── Clearance ───────────────────────────────────────────────────────────────

async function autoState(employeeId: string): Promise<Record<ExitAuto, boolean>> {
    const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { isActive: true } } } })
    const userId = e?.userId ?? null
    const [held, issued, claims, advances] = await Promise.all([
        prisma.employeeAsset.count({ where: { employeeId, isActive: true, returnedAt: null } }).catch(() => 0),
        prisma.assetIssue.count({ where: { employeeId, status: "ACTIVE" } }).catch(() => 0),
        prisma.expense.count({ where: { status: { in: ["SUBMITTED", "APPROVED"] }, OR: [{ employeeId }, ...(userId ? [{ submittedBy: userId }] : [])] } }).catch(() => 0),
        userId ? prisma.expenseAdvance.count({ where: { requestedBy: userId, status: { in: ["APPROVED", "PAID"] } } }).catch(() => 0) : Promise.resolve(0),
    ])
    return { ASSETS: held + issued === 0, EXPENSES: claims === 0, ADVANCES: advances === 0, LOGIN: !userId || e?.user?.isActive === false }
}

/**
 * Bring an exit's clearance up to date: add the checklist rows it lacks, tick
 * automatic ones that are now true, and move a finished clearance on to F&F.
 */
export async function syncClearance(exitId: string, s?: ExitSettings) {
    const settings = s ?? await getExitSettings()
    const ex = await prisma.exitRequest.findUnique({ where: { id: exitId }, select: { id: true, employeeId: true, status: true, clearanceTasks: { select: { id: true, title: true, status: true, order: true } } } })
    if (!ex || ex.status === "CANCELLED" || ex.status === "COMPLETED") return null
    const have = new Map(ex.clearanceTasks.map(t => [t.title, t]))
    let order = ex.clearanceTasks.reduce((m, t) => Math.max(m, t.order), 0)
    const missing = settings.clearance.filter(c => !have.has(c.title))
    if (missing.length) await prisma.exitClearanceTask.createMany({ data: missing.map(c => ({ exitId, title: c.title, department: c.owner, order: ++order, status: "PENDING" })) })
    const autos = settings.clearance.filter(c => c.auto)
    let ticked = 0
    if (autos.length) {
        const state = await autoState(ex.employeeId)
        const rows = await prisma.exitClearanceTask.findMany({ where: { exitId, title: { in: autos.map(a => a.title) } }, select: { id: true, title: true, status: true } })
        for (const r of rows) {
            const a = autos.find(x => x.title === r.title)!
            if (r.status !== "COMPLETED" && r.status !== "WAIVED" && state[a.auto!]) {
                await prisma.exitClearanceTask.update({ where: { id: r.id }, data: { status: "COMPLETED", completedAt: new Date(), completedBy: "system", remarks: `Done automatically — ${EXIT_AUTO[a.auto!].toLowerCase()}` } })
                ticked++
            }
        }
    }
    // Clearance finished → F&F.
    if (ex.status === "CLEARANCE_PENDING") {
        const open = await prisma.exitClearanceTask.count({ where: { exitId, status: { notIn: ["COMPLETED", "WAIVED"] } } })
        if (!open) await prisma.exitRequest.update({ where: { id: exitId }, data: { status: "FULL_FINAL_PENDING" } })
    }
    return { added: missing.length, ticked }
}

/** Daily: people whose last working day has come are marked as left; clearance moves on. */
export async function runExitDaily(now = new Date()) {
    const s = await getExitSettings()
    const endOfToday = new Date(new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) + "T23:59:59+05:30")
    const due = await prisma.exitRequest.findMany({
        where: { status: { in: ["INITIATED", "NOTICE_PERIOD", "CLEARANCE_PENDING", "FULL_FINAL_PENDING"] }, lastWorkingDate: { lte: endOfToday }, employee: { status: { in: ["ACTIVE", "ON_LEAVE", "ONBOARDING"] as any } } },
        select: { id: true, status: true }, take: 300,
    })
    let left = 0
    for (const ex of due) {
        if (await offboardForExit(ex.id, { id: null, name: "Daily job" })) left++
        if (ex.status === "INITIATED" || ex.status === "NOTICE_PERIOD") await prisma.exitRequest.update({ where: { id: ex.id }, data: { status: "CLEARANCE_PENDING" } })
    }
    const open = await prisma.exitRequest.findMany({ where: { status: { in: ["CLEARANCE_PENDING", "FULL_FINAL_PENDING", "NOTICE_PERIOD", "INITIATED"] } }, select: { id: true }, take: 500 })
    let ticked = 0
    for (const ex of open) { const r = await syncClearance(ex.id, s).catch(() => null); ticked += r?.ticked ?? 0 }
    return { left, ticked }
}

// ─── F&F approval and letters ────────────────────────────────────────────────

export type FnfApproval = { preparedBy?: string | null; approvedBy?: string | null; approvedByName?: string | null; approvedAt?: string | null; approvedNet?: number | null }

export async function approvalOf(exitId: string): Promise<FnfApproval> {
    return ((await getFnfRecord(exitId)) as any).approval ?? {}
}

export async function approveFnf(exitId: string, actor: { id: string; name: string; isAdmin: boolean }) {
    const s = await getExitSettings()
    const ex = await prisma.exitRequest.findUnique({ where: { id: exitId }, select: { status: true, fnfPaidAt: true, initiatedBy: true } })
    if (!ex) throw new Error("Exit not found")
    if (ex.fnfPaidAt) throw new Error("Already paid")
    const rec: any = await getFnfRecord(exitId)
    const preparedBy = rec.approval?.preparedBy ?? ex.initiatedBy
    if (s.makerChecker && !actor.isAdmin && preparedBy === actor.id) throw new Error("Someone other than the person who prepared this F&F must approve it")
    const st = await computeSettlement(exitId)
    if (!st) throw new Error("Could not work out the F&F")
    rec.approval = { preparedBy, approvedBy: actor.id, approvedByName: actor.name, approvedAt: new Date().toISOString(), approvedNet: st.net }
    await saveFnfRecord(exitId, rec, actor.id)
    return rec.approval as FnfApproval
}

/** Any change to the F&F after approval needs approving again. */
export async function markPrepared(exitId: string, userId: string) {
    const rec: any = await getFnfRecord(exitId)
    const was = rec.approval ?? {}
    rec.approval = { preparedBy: userId }
    await saveFnfRecord(exitId, rec, userId)
    return !!was.approvedAt
}

const istDate = (d: Date | null | undefined) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : ""

/** Relieving and experience letters (settings) for a paid exit; skips ones already issued. */
export async function issueExitLetters(exitId: string, actor: Actor) {
    const s = await getExitSettings()
    const typeIds = [s.relievingTypeId, s.experienceTypeId].filter((x): x is string => !!x)
    if (!typeIds.length) return 0
    await ensureHrDocRecallSchema()
    const ex = await prisma.exitRequest.findUnique({ where: { id: exitId }, select: { employeeId: true, resignationDate: true, lastWorkingDate: true } })
    if (!ex) return 0
    const [employee, types, existing] = await Promise.all([
        prisma.employee.findUnique({ where: { id: ex.employeeId }, include: { branch: { include: { company: true } }, department: true, employeeSalary: { select: { ctcMonthly: true } } } }),
        prisma.hrDocumentType.findMany({ where: { id: { in: typeIds }, isActive: true } }),
        prisma.hrDocument.findMany({ where: { employeeId: ex.employeeId, typeId: { in: typeIds }, status: { notIn: ["RECALLED", "REJECTED"] as any } }, select: { typeId: true } }),
    ])
    if (!employee) return 0
    const done = new Set(existing.map(e => e.typeId))
    const signature = actor.id ? await getUserSignature(actor.id).catch(() => null) : null
    let n = 0
    for (const t of types) {
        if (done.has(t.id) || !t.templateContent?.trim()) continue
        const vars = { ...buildDocVars(employee, ex.lastWorkingDate), leaving_date: istDate(ex.lastWorkingDate), last_working_date: istDate(ex.lastWorkingDate), relieving_date: istDate(ex.lastWorkingDate), resignation_date: istDate(ex.resignationDate) }
        const waiting = t.requiresApproval
        for (let i = 0; i < 6; i++) {
            try {
                await prisma.hrDocument.create({ data: { docNumber: generateDocNumber(), employeeId: employee.id, typeId: t.id, effectiveDate: ex.lastWorkingDate, content: fillTemplate(t.templateContent, vars), status: waiting ? "PENDING_APPROVAL" : "ISSUED", remarks: "Exit — issued after F&F payment", createdBy: actor.id ?? "system", ...(waiting ? {} : { issuedBy: actor.id ?? "system", issuedAt: new Date() }), signature } })
                n++; break
            } catch (e: any) { if (e?.code !== "P2002") throw e }
        }
    }
    if (n) await notifyEmployee(employee.id, { title: "Your exit letters", message: "Your relieving / experience letter has been issued. HR can share the PDF with you.", type: "document", link: "/profile?tab=letters" })
    return n
}

// ─── Backfill ────────────────────────────────────────────────────────────────

/** Past leavers (left within `days`) with no exit record — preview or create, so their F&F can be checked. */
export async function backfillExits(days: number, apply: boolean, actor: Actor) {
    const s = await getExitSettings()
    const since = new Date(Date.now() - Math.max(1, Math.min(730, days)) * 86_400_000)
    const people = await prisma.employee.findMany({
        where: { status: { in: ["RESIGNED", "TERMINATED"] as any }, dateOfLeaving: { gte: since }, exitRequest: null } as any,
        select: { id: true, employeeId: true, firstName: true, lastName: true, status: true, dateOfLeaving: true }, orderBy: { dateOfLeaving: "desc" }, take: 1000,
    })
    if (!apply) return { count: people.length, sample: people.slice(0, 10).map(p => ({ code: p.employeeId, name: `${p.firstName} ${p.lastName ?? ""}`.trim(), left: p.dateOfLeaving?.toISOString().slice(0, 10) ?? null, status: String(p.status) })) }
    let created = 0
    for (const p of people) {
        const lwd = p.dateOfLeaving ?? new Date()
        const ex = await prisma.exitRequest.create({
            data: {
                employeeId: p.id, exitType: p.status === "TERMINATED" ? "TERMINATION" : "RESIGNATION", status: "CLEARANCE_PENDING",
                resignationDate: lwd, lastWorkingDate: lwd, noticePeriodDays: 0, initiatedBy: actor.id ?? "system",
                hrComments: "Created for a past leaver (left before every exit went through Exit) — check clearance and F&F.",
                clearanceTasks: { create: s.clearance.map((c, i) => ({ title: c.title, department: c.owner, order: i + 1, status: "PENDING" })) },
            },
            select: { id: true },
        })
        await syncClearance(ex.id, s).catch(() => {})
        created++
    }
    if (created) await prisma.auditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: "exit.backfill", targetType: "ExitRequest", targetName: `${created} exit(s)`, summary: `Exit records created for ${created} past leaver(s) (last ${days} days)` } }).catch(() => {})
    return { count: created }
}

/** A resignation handed in by the employee (My Profile). */
export async function selfResign(userId: string, input: { lastWorkingDate?: string | null; reason?: string | null }) {
    const s = await getExitSettings()
    if (!s.selfResign) throw new Error("Resignations are handed to HR directly")
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true, firstName: true, lastName: true, status: true } })
    if (!emp) throw new Error("No employee record for this login")
    if (LEFT.includes(String(emp.status))) throw new Error("You have already left")
    if (await prisma.exitRequest.findUnique({ where: { employeeId: emp.id }, select: { id: true } })) throw new Error("Your resignation is already with HR")
    const today = new Date()
    const lwd = input.lastWorkingDate ? new Date(`${input.lastWorkingDate}T00:00:00+05:30`) : new Date(today.getTime() + s.defaultNoticeDays * 86_400_000)
    if (isNaN(lwd.getTime()) || lwd < new Date(today.toISOString().slice(0, 10))) throw new Error("Pick a last working day from today on")
    const ex = await prisma.exitRequest.create({
        data: {
            employeeId: emp.id, exitType: "RESIGNATION", status: "INITIATED", resignationDate: today, lastWorkingDate: lwd,
            noticePeriodDays: Math.round((lwd.getTime() - today.getTime()) / 86_400_000), reason: input.reason ? String(input.reason).slice(0, 500) : null, initiatedBy: userId,
            clearanceTasks: { create: s.clearance.map((c, i) => ({ title: c.title, department: c.owner, order: i + 1, status: "PENDING" })) },
        },
    })
    await notifyApprovers(["exit.edit"], { title: "Resignation received", message: `${emp.firstName} ${emp.lastName ?? ""} resigned — requested last working day ${lwd.toISOString().slice(0, 10)}. Review it in Exit.`, type: "exit", link: "/exit" })
    return ex
}

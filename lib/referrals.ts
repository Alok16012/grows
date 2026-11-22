// Jobs & Refer — employees refer people for open jobs, or share a personal link
// (/apply/job/<id>?ref=<user>) the friend fills in. Each referral is a Recruitment
// candidate (source "Referral", referredBy = the employee), linked to the job.
import prisma from "@/lib/prisma"
import { normalizePhone } from "@/lib/validation"
import { findLeadForJoin, pickRecruiter } from "@/lib/recruitment-server"
import { STAGE_LABEL, JOINED_STAGES, CLOSED_STAGES } from "@/lib/recruitment"

export type ReferralSettings = { enabled: boolean; bonusAmount: number; bonusAfterDays: number; bonusNote: string; publicLinks: boolean }
const DEFAULTS: ReferralSettings = { enabled: true, bonusAmount: 0, bonusAfterDays: 90, bonusNote: "", publicLinks: true }
export function sanitizeReferralSettings(v: any): ReferralSettings {
    const n = (x: unknown, d: number, max: number) => { const k = Number(x); return Number.isFinite(k) ? Math.max(0, Math.min(max, Math.round(k))) : d }
    return {
        enabled: typeof v?.enabled === "boolean" ? v.enabled : DEFAULTS.enabled,
        bonusAmount: n(v?.bonusAmount, DEFAULTS.bonusAmount, 1_000_000),
        bonusAfterDays: n(v?.bonusAfterDays, DEFAULTS.bonusAfterDays, 730),
        bonusNote: typeof v?.bonusNote === "string" ? v.bonusNote.slice(0, 500) : DEFAULTS.bonusNote,
        publicLinks: typeof v?.publicLinks === "boolean" ? v.publicLinks : DEFAULTS.publicLinks,
    }
}
const KEY = "referralSettings"
export async function getReferralSettings() {
    try { const r = await prisma.appSetting.findUnique({ where: { key: KEY } }); return sanitizeReferralSettings(r?.value ? JSON.parse(r.value) : {}) } catch { return sanitizeReferralSettings({}) }
}
export async function saveReferralSettings(v: unknown, userId: string) {
    const s = sanitizeReferralSettings(v)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(s), updatedBy: userId }, create: { key: KEY, value: JSON.stringify(s), updatedBy: userId } })
    return s
}

/** Open jobs anyone can refer for (published), as a light card. */
export async function openJobs() {
    return prisma.jobPosting.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, title: true, siteName: true, jobLocation: true, plantLocation: true, salaryMin: true, salaryMax: true, salaryPeriod: true, openings: true, workExpMin: true, workExpMax: true, freshersAllowed: true, shiftType: true, description: true, qualifications: true, skills: true, deadline: true, priority: true, createdAt: true },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }], take: 200,
    })
}
export async function publicJob(id: string) {
    const j = await prisma.jobPosting.findFirst({
        where: { id, status: "PUBLISHED" },
        select: { id: true, title: true, siteName: true, jobLocation: true, plantLocation: true, salaryMin: true, salaryMax: true, salaryPeriod: true, openings: true, workExpMin: true, workExpMax: true, freshersAllowed: true, shiftType: true, weeklyOff: true, description: true, qualifications: true, skills: true, perks: true, canteenAvailable: true, transportAvailable: true, accommodationAvailable: true, busFacility: true, deadline: true },
    })
    return j
}

export async function refer(input: { jobId: string; referrerId: string | null; name: string; phone: string; city?: string; experience?: string | number; note?: string; resumeUrl?: string; viaLink: boolean }) {
    const name = String(input.name ?? "").trim().replace(/\s+/g, " ")
    const phone = normalizePhone(String(input.phone ?? ""))
    if (name.length < 2) throw new Error("Enter the person's name")
    if (String(phone).replace(/\D/g, "").length < 10) throw new Error("Enter a valid 10-digit mobile number")
    const job = await prisma.jobPosting.findFirst({ where: { id: input.jobId, status: "PUBLISHED" }, select: { id: true, title: true, siteId: true, siteName: true, createdBy: true } })
    if (!job) throw new Error("This job is no longer open")
    const referrer = input.referrerId ? await prisma.user.findFirst({ where: { id: input.referrerId, isActive: true }, select: { id: true, name: true } }) : null
    if (!input.viaLink && !referrer) throw new Error("Sign in to refer")

    // Already in the pipeline → note it there, don't make a second record.
    const existing = await findLeadForJoin(null, phone)
    if (existing) {
        const owner = await prisma.lead.findUnique({ where: { id: existing }, select: { assignedTo: true, createdBy: true, referredBy: true } })
        await prisma.leadActivity.create({ data: { leadId: existing, userId: referrer?.id ?? owner?.assignedTo ?? owner!.createdBy, type: "note", content: `${input.viaLink ? "Applied" : "Referred"} again for ${job.title}${referrer ? ` — referred by ${referrer.name}` : ""}` } }).catch(() => {})
        if (referrer && !owner?.referredBy) await prisma.lead.update({ where: { id: existing }, data: { referredBy: referrer.id } }).catch(() => {})
        return { id: existing, existing: true }
    }
    const fallback = job.createdBy ?? (await prisma.user.findFirst({ where: { role: "ADMIN" as any, isActive: true }, select: { id: true } }))?.id
    const recruiter = (await pickRecruiter().catch(() => null)) ?? job.createdBy ?? null
    const creator = referrer?.id ?? recruiter ?? fallback
    if (!creator) throw new Error("No recruiter set up to receive referrals")
    const exp = Number(input.experience)
    const lead = await prisma.lead.create({
        data: {
            candidateName: name, phone, city: input.city ? String(input.city).slice(0, 80) : null, position: job.title,
            experience: Number.isFinite(exp) && exp >= 0 ? exp : null, source: "Referral", status: "NEW_LEAD" as any, priority: "HIGH" as any, score: "WARM" as any,
            notes: [referrer ? `Referred by ${referrer.name}${input.viaLink ? " (shared link)" : ""}` : "Applied through the job link", input.note ? String(input.note).slice(0, 1000) : null].filter(Boolean).join("\n"),
            resumeUrl: input.resumeUrl && /^(sb:\/\/|https:\/\/[\w.-]+\.supabase\.co\/)/.test(input.resumeUrl) ? input.resumeUrl : null,
            jobId: job.id, siteId: job.siteId, referredBy: referrer?.id ?? null, createdBy: creator, assignedTo: recruiter, stageChangedAt: new Date(),
        },
        select: { id: true },
    })
    await prisma.leadActivity.create({ data: { leadId: lead.id, userId: creator, type: "note", content: `${referrer ? `Referred by ${referrer.name}` : "Applied"} for ${job.title}${job.siteName ? ` at ${job.siteName}` : ""}` } }).catch(() => {})
    if (recruiter) await prisma.notification.create({ data: { userId: recruiter, title: "New referral", message: `${name} for ${job.title}${referrer ? ` — referred by ${referrer.name}` : ""}`, type: "recruitment", link: `/recruitment?lead=${lead.id}` } }).catch(() => {})
    return { id: lead.id, existing: false }
}

/** The employee's own referrals with where each one is now. */
export async function myReferrals(userId: string) {
    const rows = await prisma.lead.findMany({ where: { referredBy: userId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, candidateName: true, position: true, status: true, createdAt: true, stageChangedAt: true, convertedEmployeeId: true } })
    return rows.map(r => ({ id: r.id, name: r.candidateName, position: r.position, status: String(r.status), stage: STAGE_LABEL[String(r.status)] ?? String(r.status), joined: JOINED_STAGES.includes(String(r.status)), closed: CLOSED_STAGES.includes(String(r.status)), joinedAt: JOINED_STAGES.includes(String(r.status)) ? r.stageChangedAt : null, createdAt: r.createdAt }))
}

/** HR view: every referral, and a leaderboard of who refers the most (and who joined). */
export async function allReferrals() {
    const rows = await prisma.lead.findMany({ where: { OR: [{ referredBy: { not: null } }, { source: "Referral" }] }, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, candidateName: true, phone: true, position: true, status: true, createdAt: true, stageChangedAt: true, referredBy: true, assignee: { select: { name: true } } } })
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.referredBy).filter((x): x is string => !!x))) } }, select: { id: true, name: true } })
    const nameOf = new Map(users.map(u => [u.id, u.name]))
    const board = new Map<string, { name: string; referred: number; joined: number }>()
    for (const r of rows) {
        const k = r.referredBy ?? "none"
        const e = board.get(k) ?? { name: r.referredBy ? nameOf.get(r.referredBy) ?? "—" : "Not recorded", referred: 0, joined: 0 }
        e.referred++; if (JOINED_STAGES.includes(String(r.status))) e.joined++
        board.set(k, e)
    }
    return {
        referrals: rows.map(r => ({ id: r.id, name: r.candidateName, phone: r.phone, position: r.position, stage: STAGE_LABEL[String(r.status)] ?? String(r.status), joined: JOINED_STAGES.includes(String(r.status)), joinedAt: JOINED_STAGES.includes(String(r.status)) ? r.stageChangedAt : null, referrer: r.referredBy ? nameOf.get(r.referredBy) ?? "—" : "—", recruiter: r.assignee?.name ?? null, createdAt: r.createdAt })),
        leaderboard: Array.from(board.values()).sort((a, b) => b.joined - a.joined || b.referred - a.referred),
    }
}

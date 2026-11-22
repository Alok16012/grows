// Admin → Access centre: settings, activity, login health, security, access review.
import prisma from "@/lib/prisma"
import { sanitizeAccessCentre, type AccessCentreSettings } from "@/lib/access-centre"

const KEY = "accessCentre"
const REVIEW_KEY = "accessReviews"
let cache: { at: number; s: AccessCentreSettings } | null = null

export async function getAccessCentre(): Promise<AccessCentreSettings> {
    if (cache && Date.now() - cache.at < 60_000) return cache.s
    let s: AccessCentreSettings
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        s = sanitizeAccessCentre(row?.value ? JSON.parse(row.value) : {})
    } catch { s = sanitizeAccessCentre({}) }
    cache = { at: Date.now(), s }
    return s
}

export async function saveAccessCentre(input: unknown, userId: string): Promise<AccessCentreSettings> {
    const cur = await getAccessCentre()
    const s = sanitizeAccessCentre({ ...(input as object), trackingSince: cur.trackingSince })
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    cache = { at: Date.now(), s }
    return s
}

/** The day last-seen tracking started (first time anyone reads it). */
export async function trackingSince(): Promise<Date> {
    const s = await getAccessCentre()
    if (s.trackingSince) return new Date(`${s.trackingSince}T00:00:00+05:30`)
    const first = await prisma.userActivity.findFirst({ where: { lastSeenAt: { not: null } }, orderBy: { lastSeenAt: "asc" }, select: { lastSeenAt: true } }).catch(() => null)
    const day = (first?.lastSeenAt ?? new Date()).toISOString().slice(0, 10)
    const next = { ...s, trackingSince: day }
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(next) }, create: { key: KEY, value: JSON.stringify(next) } }).catch(() => {})
    cache = { at: Date.now(), s: next }
    return new Date(`${day}T00:00:00+05:30`)
}

export type ReviewEntry = { at: string; by: string; byId: string; note: string | null; counts: { logins: number; admins: number; roles: Record<string, number> } }
export async function getReviews(): Promise<ReviewEntry[]> {
    try { const r = await prisma.appSetting.findUnique({ where: { key: REVIEW_KEY } }); const v = r?.value ? JSON.parse(r.value) : []; return Array.isArray(v) ? v : [] } catch { return [] }
}
export async function addReview(e: ReviewEntry, userId: string) {
    const list = [e, ...(await getReviews())].slice(0, 30)
    const value = JSON.stringify(list)
    await prisma.appSetting.upsert({ where: { key: REVIEW_KEY }, update: { value, updatedBy: userId }, create: { key: REVIEW_KEY, value, updatedBy: userId } })
    return list
}

import prisma from "@/lib/prisma"
import { DEFAULT_BANDS, PERFORMANCE_POLICY_KEY, sanitizeBands, parseTargetHint, withDirection, scoreReview, bandFor, type Band } from "@/lib/performance-score"

export async function getBands(): Promise<{ bands: Band[]; customized: boolean }> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: PERFORMANCE_POLICY_KEY } })
        if (!row?.value) return { bands: DEFAULT_BANDS, customized: false }
        return { bands: sanitizeBands(JSON.parse(row.value).bands), customized: true }
    } catch {
        return { bands: DEFAULT_BANDS, customized: false }
    }
}

export async function saveBands(input: unknown, userId: string): Promise<Band[]> {
    const bands = sanitizeBands(input)
    const value = JSON.stringify({ bands })
    await prisma.appSetting.upsert({
        where: { key: PERFORMANCE_POLICY_KEY },
        update: { value, updatedBy: userId },
        create: { key: PERFORMANCE_POLICY_KEY, value, updatedBy: userId },
    })
    return bands
}

/**
 * Put a role's KPI template onto a review as KRAs + KPIs, normalised to the
 * standard weighting: KRA weights total 100, KPI weights within each KRA total
 * 100. Targets and direction are read from the template's hint ("< 2%").
 * Returns how many KRAs were added; existing KRAs with the same title are kept.
 */
export async function applyTemplate(reviewId: string, role: string): Promise<number> {
    const rows = await prisma.kPITemplate.findMany({ where: { role }, orderBy: [{ kraTitle: "asc" }, { weightage: "desc" }] })
    if (!rows.length) return 0
    const existing = new Set((await prisma.kRA.findMany({ where: { reviewId }, select: { title: true } })).map(k => k.title.toLowerCase()))

    const byKra = new Map<string, typeof rows>()
    for (const r of rows) byKra.set(r.kraTitle, [...(byKra.get(r.kraTitle) ?? []), r])
    const total = rows.reduce((t, r) => t + r.weightage, 0) || 1

    // Round KRA weights and give the rounding remainder to the largest one.
    const entries = Array.from(byKra.entries()).filter(([t]) => !existing.has(t.toLowerCase()))
    if (!entries.length) return 0
    const kraW = entries.map(([, list]) => Math.round(list.reduce((t, r) => t + r.weightage, 0) / total * 100))
    if (existing.size === 0) {
        const diff = 100 - kraW.reduce((a, b) => a + b, 0)
        kraW[kraW.indexOf(Math.max(...kraW))] += diff
    }

    for (let i = 0; i < entries.length; i++) {
        const [title, list] = entries[i]
        const sub = list.reduce((t, r) => t + r.weightage, 0) || 1
        const kpiW = list.map(r => Math.round(r.weightage / sub * 100))
        kpiW[kpiW.indexOf(Math.max(...kpiW))] += 100 - kpiW.reduce((a, b) => a + b, 0)
        await prisma.kRA.create({
            data: {
                reviewId, title, weightage: kraW[i],
                kpis: {
                    create: list.map((r, j) => {
                        const hint = parseTargetHint(r.targetHint)
                        return {
                            reviewId,
                            title: r.kpiTitle,
                            description: withDirection(r.description ?? (r.targetHint ? `Target ${r.targetHint}` : null), hint.dir ?? (/^(<|≤)/.test(r.targetHint ?? "") ? "lower" : "higher")),
                            target: hint.value,
                            weightage: kpiW[j],
                        }
                    }),
                },
            },
        })
    }
    return entries.length
}

export async function reviewScore(reviewId: string) {
    const [kras, kpis, { bands }] = await Promise.all([
        prisma.kRA.findMany({ where: { reviewId }, select: { id: true, title: true, weightage: true } }),
        prisma.kPI.findMany({ where: { reviewId }, select: { id: true, title: true, description: true, target: true, actual: true, weightage: true, rating: true, kraId: true } }),
        getBands(),
    ])
    const s = scoreReview(kras, kpis)
    return { ...s, band: bandFor(s.overall, bands), bands }
}

// ─── Employee self-assessment, KPI by KPI ────────────────────────────────────
// KPI has no self-assessment columns, and adding them would break the live KPI
// queries if code ever shipped before the migration. Stored per review in
// AppSetting instead: { submittedAt, entries: { [kpiId]: { actual, rating, comment } } }.

export type SelfEntry = { actual: number | null; rating: number | null; comment: string }
export type SelfAssessment = { submittedAt: string | null; entries: Record<string, SelfEntry> }

const selfKey = (reviewId: string) => `perfSelf:${reviewId}`

export async function getSelfAssessment(reviewId: string): Promise<SelfAssessment> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: selfKey(reviewId) } })
        const v = row?.value ? JSON.parse(row.value) : {}
        return { submittedAt: typeof v.submittedAt === "string" ? v.submittedAt : null, entries: v.entries && typeof v.entries === "object" ? v.entries : {} }
    } catch {
        return { submittedAt: null, entries: {} }
    }
}

export async function saveSelfAssessment(reviewId: string, input: Record<string, unknown>, submit: boolean, userId: string): Promise<SelfAssessment> {
    const kpis = await prisma.kPI.findMany({ where: { reviewId }, select: { id: true, weightage: true } })
    const valid = new Set(kpis.map(k => k.id))
    const prev = await getSelfAssessment(reviewId)
    const entries: Record<string, SelfEntry> = { ...prev.entries }
    for (const [id, raw] of Object.entries(input || {})) {
        if (!valid.has(id) || !raw || typeof raw !== "object") continue
        const r = raw as Record<string, unknown>
        const actual = r.actual === "" || r.actual === null || r.actual === undefined ? null : Number(r.actual)
        const rating = r.rating ? Math.max(1, Math.min(5, Math.round(Number(r.rating)))) : null
        entries[id] = { actual: actual !== null && Number.isFinite(actual) ? actual : null, rating, comment: String(r.comment ?? "").slice(0, 1000) }
    }
    for (const id of Object.keys(entries)) if (!valid.has(id)) delete entries[id]

    const value: SelfAssessment = { submittedAt: submit ? new Date().toISOString() : prev.submittedAt, entries }
    await prisma.appSetting.upsert({
        where: { key: selfKey(reviewId) },
        update: { value: JSON.stringify(value), updatedBy: userId },
        create: { key: selfKey(reviewId), value: JSON.stringify(value), updatedBy: userId },
    })

    // Keep the review's single self-rating in step: weighted mean of KPI self-ratings.
    let sum = 0, w = 0
    for (const k of kpis) { const e = entries[k.id]; if (e?.rating) { sum += e.rating * (k.weightage || 1); w += k.weightage || 1 } }
    if (w > 0) await prisma.performanceReview.update({ where: { id: reviewId }, data: { selfRating: Math.round((sum / w) * 100) / 100 } })
    return value
}

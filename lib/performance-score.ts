// KRA / KPI scoring — one implementation shared by the review drawer, the
// submit check and the bulk tools, so the number HR sees is the number stored.
//
// The standard model:
//   • A review has KRAs whose weightages add up to 100%.
//   • Each KRA has KPIs whose weightages add up to 100% within that KRA.
//   • A KPI is scored 1–5 from achievement % (actual vs target). Some KPIs are
//     "lower is better" (error rate, TAT, complaints); achievement is inverted
//     for those. A manager rating, when given, overrides the computed score.
//   • KRA score = weighted mean of its KPI scores; overall = weighted mean of
//     KRA scores. KPIs outside any KRA count as their own KRA.
//
// KPI has no column for direction, so it's carried as a "[lower-better]" tag
// at the start of KPI.description (set from the form or a template's "< 2%"
// hint); without a tag it's inferred from the KPI title.

export type Direction = "higher" | "lower"

export type ScoreKPI = { id: string; title: string; description?: string | null; target: number; actual?: number | null; weightage: number; rating?: number | null; kraId?: string | null }
export type ScoreKRA = { id: string; title: string; weightage: number }

export const LOWER_TAG = "[lower-better]"
const LOWER_WORDS = /\b(error|errors|tat|turnaround|time to|late|delay|drop|complaint|complaints|attrition|issues?|defect rate|resolution time|absent|absenteeism|accident|incident|cost|wastage|rework|escalation)\b/i

export function kpiDirection(kpi: { title: string; description?: string | null }): Direction {
    const d = kpi.description ?? ""
    if (d.startsWith(LOWER_TAG)) return "lower"
    if (d.startsWith("[higher-better]")) return "higher"
    return LOWER_WORDS.test(kpi.title) ? "lower" : "higher"
}

export function withDirection(description: string | null | undefined, dir: Direction): string | null {
    const body = (description ?? "").replace(/^\[(lower|higher)-better\]\s*/, "").trim()
    return dir === "lower" ? `${LOWER_TAG} ${body}`.trim() : body ? body : null
}

export function cleanDescription(description: string | null | undefined): string {
    return (description ?? "").replace(/^\[(lower|higher)-better\]\s*/, "").trim()
}

/** "≥ 10/day" → { value: 10, dir: "higher" }, "< 2%" → { value: 2, dir: "lower" }. */
export function parseTargetHint(hint: string | null | undefined): { value: number; dir: Direction | null } {
    const s = String(hint ?? "").trim()
    const n = s.match(/-?\d+(\.\d+)?/)
    const dir: Direction | null = /^(<|≤|<=|below|under|max)/i.test(s) ? "lower" : /^(>|≥|>=|above|min|at least)/i.test(s) ? "higher" : null
    return { value: n ? parseFloat(n[0]) : 0, dir }
}

/** Achievement % (0–150). null when there's nothing to measure yet. */
export function achievement(kpi: ScoreKPI): number | null {
    if (kpi.actual === null || kpi.actual === undefined || Number.isNaN(Number(kpi.actual))) return null
    const a = Number(kpi.actual), t = Number(kpi.target) || 0
    let pct: number
    if (kpiDirection(kpi) === "lower") {
        // Target 0 (e.g. "0 complaints"): every miss costs 20 points.
        pct = t > 0 ? (a <= 0 ? 150 : (t / a) * 100) : Math.max(0, 100 - a * 20)
    } else {
        if (t <= 0) return null
        pct = (a / t) * 100
    }
    return Math.max(0, Math.min(150, Math.round(pct * 10) / 10))
}

/** Achievement % → 1–5. */
export function scoreFromAchievement(pct: number): number {
    if (pct >= 120) return 5
    if (pct >= 100) return 4
    if (pct >= 85) return 3
    if (pct >= 70) return 2
    return 1
}

export type KpiResult = { id: string; achievement: number | null; autoScore: number | null; score: number | null; source: "manager" | "auto" | "none"; direction: Direction }
export type KraResult = { id: string; title: string; weightage: number; kpiWeightTotal: number; score: number | null; kpis: KpiResult[] }

export function scoreKpi(kpi: ScoreKPI): KpiResult {
    const ach = achievement(kpi)
    const autoScore = ach === null ? null : scoreFromAchievement(ach)
    const manual = kpi.rating && kpi.rating > 0 ? kpi.rating : null
    return {
        id: kpi.id, achievement: ach, autoScore,
        score: manual ?? autoScore,
        source: manual ? "manager" : autoScore !== null ? "auto" : "none",
        direction: kpiDirection(kpi),
    }
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function scoreReview(kras: ScoreKRA[], kpis: ScoreKPI[]) {
    const groups: { kra: ScoreKRA; kpis: ScoreKPI[] }[] = kras.map(k => ({ kra: k, kpis: kpis.filter(p => p.kraId === k.id) }))
    for (const p of kpis.filter(p => !p.kraId || !kras.some(k => k.id === p.kraId))) {
        groups.push({ kra: { id: `kpi:${p.id}`, title: p.title, weightage: p.weightage }, kpis: [{ ...p, weightage: 100 }] })
    }

    const kraResults: KraResult[] = groups.map(({ kra, kpis: list }) => {
        const results = list.map(scoreKpi)
        let sum = 0, w = 0
        list.forEach((p, i) => { const s = results[i].score; if (s !== null) { sum += s * p.weightage; w += p.weightage } })
        return { id: kra.id, title: kra.title, weightage: kra.weightage, kpiWeightTotal: list.reduce((t, p) => t + p.weightage, 0), score: w > 0 ? r2(sum / w) : null, kpis: results }
    })

    let sum = 0, w = 0
    for (const k of kraResults) if (k.score !== null) { sum += k.score * k.weightage; w += k.weightage }
    const overall = w > 0 ? r2(sum / w) : null

    const kraWeightTotal = kraResults.reduce((t, k) => t + k.weightage, 0)
    const issues: string[] = []
    if (kraResults.length === 0) issues.push("Add at least one KRA with KPIs")
    if (kraResults.length && Math.abs(kraWeightTotal - 100) > 0.5) issues.push(`KRA weightages add up to ${r2(kraWeightTotal)}% — they must total 100%`)
    for (const k of kraResults) {
        if (k.id.startsWith("kpi:")) continue
        if (!k.kpis.length) issues.push(`"${k.title}" has no KPIs`)
        else if (Math.abs(k.kpiWeightTotal - 100) > 0.5) issues.push(`KPI weightages in "${k.title}" add up to ${r2(k.kpiWeightTotal)}% — they must total 100%`)
    }
    const unscored = kraResults.flatMap(k => k.kpis).filter(p => p.score === null).length
    if (unscored) issues.push(`${unscored} KPI${unscored === 1 ? "" : "s"} without an actual value or a rating`)

    return { overall, kras: kraResults, kraWeightTotal: r2(kraWeightTotal), issues }
}

// ─── Rating bands ─────────────────────────────────────────────────────────────

export type Band = { min: number; label: string; rank: "TOP_PERFORMER" | "HIGH_PERFORMER" | "AVERAGE" | "LOW_PERFORMER"; increment: number; bonus: number; pip: boolean; color: string }

export const PERFORMANCE_POLICY_KEY = "performancePolicy"

export const DEFAULT_BANDS: Band[] = [
    { min: 4.5, label: "Outstanding",        rank: "TOP_PERFORMER",  increment: 15, bonus: 20, pip: false, color: "#0b5cff" },
    { min: 3.5, label: "Exceeds Expectations", rank: "HIGH_PERFORMER", increment: 10, bonus: 10, pip: false, color: "#16a34a" },
    { min: 2.5, label: "Meets Expectations",  rank: "AVERAGE",        increment: 6,  bonus: 5,  pip: false, color: "#d97706" },
    { min: 1.5, label: "Needs Improvement",   rank: "LOW_PERFORMER",  increment: 0,  bonus: 0,  pip: true,  color: "#ea580c" },
    { min: 0,   label: "Unsatisfactory",      rank: "LOW_PERFORMER",  increment: 0,  bonus: 0,  pip: true,  color: "#dc2626" },
]

export function sanitizeBands(input: any): Band[] {
    if (!Array.isArray(input) || !input.length) return DEFAULT_BANDS
    const ranks = ["TOP_PERFORMER", "HIGH_PERFORMER", "AVERAGE", "LOW_PERFORMER"]
    const out = input
        .filter((b: any) => b && Number.isFinite(Number(b.min)))
        .map((b: any) => ({
            min: Math.max(0, Math.min(5, Number(b.min))),
            label: String(b.label || "Band").slice(0, 40),
            rank: ranks.includes(b.rank) ? b.rank : "AVERAGE",
            increment: Math.max(0, Math.min(100, Number(b.increment) || 0)),
            bonus: Math.max(0, Math.min(500, Number(b.bonus) || 0)),
            pip: !!b.pip,
            color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#6b7280",
        }))
        .sort((a: Band, b: Band) => b.min - a.min)
    if (!out.length || out[out.length - 1].min > 0) out.push({ ...DEFAULT_BANDS[DEFAULT_BANDS.length - 1] })
    return out
}

export function bandFor(score: number | null | undefined, bands: Band[] = DEFAULT_BANDS): Band | null {
    if (score === null || score === undefined) return null
    return bands.find(b => score >= b.min) ?? bands[bands.length - 1]
}

/** Template role a designation most likely maps to. */
export function templateRoleFor(designation: string | null | undefined, userRole: string | null | undefined, roles: string[]): string | null {
    const d = (designation ?? "").toLowerCase()
    const pick = (r: string) => (roles.includes(r) ? r : null)
    if (/payroll/.test(d)) return pick("PAYROLL_MANAGER")
    if (/recruit|talent acq/.test(d)) return pick("HR_RECRUITER")
    if (/\bhr\b|human resource/.test(d)) return pick("HR_MANAGER")
    if (/inspect|quality|qc|qa/.test(d)) return pick("INSPECTION_BOY") ?? pick("INSPECTOR")
    if (/manager|supervisor|lead|incharge|in-charge/.test(d)) return pick("MANAGER")
    if (userRole && roles.includes(userRole)) return userRole
    return null
}

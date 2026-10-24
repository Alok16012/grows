// Performance Hub engine: periods, achievement, RAG, scores, register
// roll-ups and monthly scorecards. Pure functions only — no Prisma, no
// "@/..." imports — so it can be unit-checked with plain `node`. Database
// work lives in lib/perf-hub-db.ts.

export const PERF_HUB_MIGRATION = "scripts/perf-hub.sql"
export const PERF_HUB_MISSING_MESSAGE =
    `Performance Hub is not set up yet — run ${PERF_HUB_MIGRATION} in Supabase`

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const
export const VALUE_TYPES = ["COUNT", "PERCENT", "NUMBER", "CURRENCY", "YESNO"] as const
export const DIRECTIONS = ["HIGHER", "LOWER"] as const
export const ROLLUPS = ["AVG", "SUM", "LAST", "MIN", "MAX"] as const
export const SOURCE_TYPES = ["MANUAL", "REGISTER", "SYSTEM"] as const
export const REGISTER_MODES = ["SINGLE", "RATIO"] as const
export const AGGREGATES = ["SUM", "AVG", "COUNT", "LAST", "MAX", "MIN"] as const
export const TEMPLATE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const
export const REPORT_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED"] as const
export const FIELD_TYPES = ["number", "text", "date", "select", "yesno"] as const

export type Frequency = (typeof FREQUENCIES)[number]
export type Rag = "GREEN" | "AMBER" | "RED"

export const SYSTEM_METRICS = [
    { key: "recruitment.leads_created", label: "Candidates (leads) created", unit: "count" },
    { key: "recruitment.interviews", label: "Candidates moved to interview", unit: "count" },
    { key: "recruitment.joined", label: "Candidates joined", unit: "count" },
    { key: "inspections.submitted", label: "Inspections submitted", unit: "count" },
    { key: "inspections.approved", label: "Inspections approved", unit: "count" },
    { key: "fieldtasks.completed", label: "Field tasks completed", unit: "count" },
] as const
export const SYSTEM_METRIC_KEYS: readonly string[] = SYSTEM_METRICS.map(m => m.key)

export const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
    typeof v === "string" && (list as readonly string[]).includes(v)

// ─── IST calendar ────────────────────────────────────────────────────────────
// Day values are the IST calendar date at UTC midnight (as attendance stores
// them). Kept local rather than imported so this file stays dependency-free.

const IST_OFFSET_MS = 330 * 60000
const DAY_MS = 86400000

/** The IST calendar day of an instant, as a UTC-midnight Date. */
export function istDay(now: Date = new Date()): Date {
    const ist = new Date(now.getTime() + IST_OFFSET_MS)
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()))
}

/**
 * Parse a request date. "YYYY-MM-DD" is taken as that IST calendar day; any
 * other parseable value is an instant and mapped to its IST day.
 */
export function parseDay(v: unknown): Date | null {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : istDay(v)
    if (typeof v !== "string" || !v.trim()) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
    if (m) {
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
        // Reject rollovers like 2026-02-31.
        return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null
    }
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : istDay(d)
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS)
export const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export type Period = { start: Date; end: Date } // both IST days, end inclusive

/** daily = the IST day; weekly = Mon–Sun IST week; monthly = IST calendar month. */
export function periodFor(frequency: string, date: Date = new Date(), alreadyDay = false): Period {
    const day = alreadyDay ? date : istDay(date)
    if (frequency === "WEEKLY") {
        const dow = (day.getUTCDay() + 6) % 7 // Monday = 0
        const start = addDays(day, -dow)
        return { start, end: addDays(start, 6) }
    }
    if (frequency === "MONTHLY") {
        const y = day.getUTCFullYear(), m = day.getUTCMonth()
        return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 0)) }
    }
    return { start: day, end: day }
}

/** Instants covered by a period of IST days: IST midnight → next IST midnight. */
export function periodWindow(p: Period): { gte: Date; lt: Date } {
    return { gte: new Date(p.start.getTime() - IST_OFFSET_MS), lt: new Date(addDays(p.end, 1).getTime() - IST_OFFSET_MS) }
}

/** "YYYY-MM" → the month as a period; null when malformed. */
export function monthPeriod(month: string | null | undefined, now = new Date()): Period | null {
    if (!month) return periodFor("MONTHLY", now)
    const m = /^(\d{4})-(\d{2})$/.exec(month.trim())
    if (!m || +m[2] < 1 || +m[2] > 12) return null
    return periodFor("MONTHLY", new Date(Date.UTC(+m[1], +m[2] - 1, 1)), true)
}

export const monthKey = (p: Period) => dayKey(p.start).slice(0, 7)

// ─── Achievement / RAG / score ───────────────────────────────────────────────

export type KpiRule = {
    valueType: string
    direction: string
    target: number
    greenAt: number
    amberAt: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

/** % of target achieved (uncapped, 1 decimal); null when there is no actual. */
export function achievement(kpi: Pick<KpiRule, "valueType" | "direction" | "target">, actual: number | null | undefined): number | null {
    if (actual === null || actual === undefined || !Number.isFinite(actual)) return null
    if (kpi.valueType === "YESNO") return actual >= 1 ? 100 : 0
    const t = kpi.target
    let pct: number
    if (kpi.direction === "LOWER") {
        // Lower is better: at or under target is full marks; a zero target
        // ("no incidents") is all-or-nothing.
        if (t > 0) pct = actual <= t ? 100 : Math.max(0, (t / actual) * 100)
        else pct = actual <= 0 ? 100 : 0
    } else {
        if (t > 0) pct = (actual / t) * 100
        else pct = actual > 0 ? 100 : 0
    }
    return round1(Math.max(0, pct))
}

export function rag(kpi: Pick<KpiRule, "greenAt" | "amberAt">, ach: number | null | undefined): Rag | null {
    if (ach === null || ach === undefined) return null
    if (ach >= kpi.greenAt) return "GREEN"
    if (ach >= kpi.amberAt) return "AMBER"
    return "RED"
}

/** Weighted average of capped achievement over the items that have one. */
export function weightedScore(items: { weight: number; pct: number | null | undefined }[]): number | null {
    let num = 0, den = 0
    for (const it of items) {
        if (it.pct === null || it.pct === undefined || !(it.weight > 0)) continue
        num += Math.min(it.pct, 100) * it.weight
        den += it.weight
    }
    return den > 0 ? round1(num / den) : null
}

/** Report score = Σ(min(ach,100) × weightage) / Σ weightage over KPIs with a value. */
export function reportScore(values: { weightage: number; achievementPct: number | null | undefined }[]): number | null {
    return weightedScore(values.map(v => ({ weight: v.weightage, pct: v.achievementPct })))
}

export function grade(score: number | null | undefined): string | null {
    if (score === null || score === undefined) return null
    if (score >= 90) return "A+ Outstanding"
    if (score >= 80) return "A Exceeds"
    if (score >= 70) return "B Meets"
    if (score >= 60) return "C Needs improvement"
    return "D Below expectations"
}

// ─── Roll-ups ────────────────────────────────────────────────────────────────

/** Combine values (in chronological order) with AVG/SUM/LAST/MIN/MAX/COUNT. */
export function rollup(values: number[], mode: string): number | null {
    if (mode === "COUNT") return values.length
    if (values.length === 0) return null
    switch (mode) {
        case "SUM": return round2(values.reduce((a, b) => a + b, 0))
        case "LAST": return values[values.length - 1]
        case "MIN": return Math.min(...values)
        case "MAX": return Math.max(...values)
        default: return round2(values.reduce((a, b) => a + b, 0) / values.length)
    }
}

/** A register cell as a number: numbers, numeric strings, yes/no → 1/0. */
export function toNum(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) ? v : null
    if (typeof v === "boolean") return v ? 1 : 0
    if (typeof v === "string") {
        const s = v.trim().toLowerCase()
        if (s === "yes" || s === "true") return 1
        if (s === "no" || s === "false") return 0
        if (s === "") return null
        const n = Number(s)
        return Number.isFinite(n) ? n : null
    }
    return null
}

export type RegisterBinding = {
    registerMode?: string | null
    valueField?: string | null
    numeratorField?: string | null
    denominatorField?: string | null
    aggregate?: string | null
}
export type EntryLite = { date: Date; values: unknown }

const cell = (e: EntryLite, key: string | null | undefined) =>
    key && e.values && typeof e.values === "object" ? toNum((e.values as Record<string, unknown>)[key]) : null

/**
 * A KPI's value from the register entries in its period.
 * SINGLE → aggregate(valueField) (COUNT = number of entries);
 * RATIO  → Σnumerator / Σdenominator × 100, null when the denominator is 0.
 */
export function registerValue(kpi: RegisterBinding, entries: EntryLite[]): number | null {
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime())
    if (kpi.registerMode === "RATIO") {
        let num = 0, den = 0
        for (const e of sorted) {
            num += cell(e, kpi.numeratorField) ?? 0
            den += cell(e, kpi.denominatorField) ?? 0
        }
        return den > 0 ? round2((num / den) * 100) : null
    }
    const agg = kpi.aggregate || "SUM"
    if (agg === "COUNT") return sorted.length
    const vals = sorted.map(e => cell(e, kpi.valueField)).filter((n): n is number => n !== null)
    return rollup(vals, agg)
}

// ─── Template validation (on publish) ────────────────────────────────────────

const near = (a: number, b: number) => Math.abs(a - b) < 0.01
const fmt = (n: number) => String(round2(n))

export type TemplateShape = {
    kras: {
        title: string
        weight: number
        kpis: (RegisterBinding & { name: string; weightage: number; sourceType: string; registerId?: string | null; systemMetric?: string | null })[]
    }[]
}

/** The first reason a template can't be published, or null when it can. */
export function publishProblem(t: TemplateShape): string | null {
    if (t.kras.length === 0) return "Add at least one KRA before publishing"
    const total = t.kras.reduce((s, k) => s + k.weight, 0)
    if (!near(total, 100)) return `KRA weights total ${fmt(total)}, must be 100`
    for (const kra of t.kras) {
        if (kra.kpis.length === 0) return `KRA "${kra.title}" has no KPIs`
        const sum = kra.kpis.reduce((s, k) => s + k.weightage, 0)
        if (!near(sum, kra.weight)) {
            return `KPI weightages in "${kra.title}" total ${fmt(sum)}, must equal the KRA weight ${fmt(kra.weight)}`
        }
        for (const kpi of kra.kpis) {
            if (kpi.sourceType === "REGISTER") {
                if (!kpi.registerId) return `KPI "${kpi.name}" reads a register but none is picked`
                if (kpi.registerMode === "RATIO" ? !(kpi.numeratorField && kpi.denominatorField)
                    : !(kpi.aggregate === "COUNT" || kpi.valueField)) {
                    return `KPI "${kpi.name}" needs its register field(s) picked`
                }
            }
            if (kpi.sourceType === "SYSTEM" && !SYSTEM_METRIC_KEYS.includes(kpi.systemMetric ?? "")) {
                return `KPI "${kpi.name}" needs a system metric`
            }
        }
    }
    return null
}

// ─── Monthly scorecard ───────────────────────────────────────────────────────

/**
 * KPIs are matched across template versions by code, else by KRA title + name,
 * so a month that straddles a new version still rolls up as one line.
 */
export function kpiKey(kraTitle: string, kpi: { name: string; code?: string | null }): string {
    const code = kpi.code?.trim().toLowerCase()
    return code ? `c:${code}` : `n:${kraTitle.trim().toLowerCase()}|${kpi.name.trim().toLowerCase()}`
}

export type ScoreKpi = KpiRule & {
    id: string
    key: string
    name: string
    frequency: string
    weightage: number
    rollup: string
}
export type ScoreKra = { id: string; title: string; weight: number; kpis: ScoreKpi[] }
export type Observation = { key: string; frequency: string; periodStart: Date; actual: number }

export type ScoredKpi = ScoreKpi & { value: number | null; achievementPct: number | null; rag: Rag | null; periodValues: number }
export type ScoredKra = { id: string; title: string; weight: number; pct: number | null; kpis: ScoredKpi[] }

/**
 * Roll each KPI's period values up to the month (MONTHLY KPIs just take the
 * month's value), then KRA % and the weighted overall. Callers pass only the
 * observations they want counted (e.g. approved reports only).
 */
export function monthlyBreakdown(kras: ScoreKra[], obs: Observation[]) {
    const byKey = new Map<string, Observation[]>()
    for (const o of obs) {
        const k = `${o.frequency}|${o.key}`
        const list = byKey.get(k) ?? []
        list.push(o)
        byKey.set(k, list)
    }
    const scored: ScoredKra[] = kras.map(kra => {
        const kpis: ScoredKpi[] = kra.kpis.map(kpi => {
            const list = (byKey.get(`${kpi.frequency}|${kpi.key}`) ?? [])
                .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
            const vals = list.map(o => o.actual)
            const value = kpi.frequency === "MONTHLY" ? (vals.length ? vals[vals.length - 1] : null) : rollup(vals, kpi.rollup)
            const ach = achievement(kpi, value)
            return { ...kpi, value, achievementPct: ach, rag: rag(kpi, ach), periodValues: vals.length }
        })
        const pct = weightedScore(kpis.map(k => ({ weight: k.weightage, pct: k.achievementPct })))
        return { id: kra.id, title: kra.title, weight: kra.weight, pct, kpis }
    })
    const overall = weightedScore(scored.map(k => ({ weight: k.weight, pct: k.pct })))
    const redKpis = scored.reduce((n, k) => n + k.kpis.filter(x => x.rag === "RED").length, 0)
    return { kras: scored, overall, grade: grade(overall), redKpis }
}

/**
 * Reports an employee owes for one frequency in a month, counted up to today
 * (and from the assignment date, when that falls inside the month).
 * daily: Mon–Sat days; weekly: weeks whose Monday has arrived; monthly: 1 once
 * the month has ended.
 */
export function expectedReports(frequency: string, month: Period, today: Date, from?: Date | null): number {
    if (frequency === "MONTHLY") return today.getTime() > month.end.getTime() ? 1 : 0
    const first = from && from.getTime() > month.start.getTime() ? from : month.start
    const last = today.getTime() < month.end.getTime() ? today : month.end
    let n = 0
    for (let d = first; d.getTime() <= last.getTime(); d = addDays(d, 1)) {
        const dow = d.getUTCDay()
        if (frequency === "DAILY" ? dow !== 0 : dow === 1) n++
    }
    return n
}

/** Submitted-or-approved ÷ expected, capped per frequency; null when nothing was due. */
export function compliance(
    frequencies: string[],
    month: Period,
    today: Date,
    filedByFrequency: Record<string, number>,
    from?: Date | null,
): number | null {
    let expected = 0, filed = 0
    for (const f of Array.from(new Set(frequencies))) {
        const e = expectedReports(f, month, today, from)
        expected += e
        filed += Math.min(filedByFrequency[f] ?? 0, e)
    }
    return expected > 0 ? round1((filed / expected) * 100) : null
}

// ─── Registers ───────────────────────────────────────────────────────────────

export type RegisterField = {
    key: string
    label: string
    type: (typeof FIELD_TYPES)[number]
    options?: string[]
    required?: boolean
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

/** Validate a register's field list; returns the cleaned list or an error message. */
export function parseRegisterFields(raw: unknown): { fields: RegisterField[] } | { error: string } {
    if (!Array.isArray(raw) || raw.length === 0) return { error: "Add at least one field" }
    const out: RegisterField[] = []
    const seen = new Set<string>()
    for (const f of raw) {
        const label = typeof f?.label === "string" ? f.label.trim() : ""
        if (!label) return { error: "Every field needs a label" }
        let key = typeof f?.key === "string" && f.key.trim() ? f.key.trim() : slug(label)
        if (!/^[a-z][a-z0-9_]{0,49}$/.test(key)) key = slug(key)
        if (!/^[a-z][a-z0-9_]{0,49}$/.test(key)) return { error: `Field "${label}" needs a key of letters, digits and _` }
        if (seen.has(key)) return { error: `Two fields share the key "${key}"` }
        seen.add(key)
        const type = isOneOf(FIELD_TYPES, f?.type) ? f.type : null
        if (!type) return { error: `Field "${label}" has an unknown type` }
        const field: RegisterField = { key, label, type, required: !!f?.required }
        if (type === "select") {
            const options = Array.isArray(f?.options)
                ? Array.from(new Set((f.options as unknown[]).map(o => String(o ?? "").trim()).filter(Boolean)))
                : []
            if (options.length === 0) return { error: `Field "${label}" needs at least one option` }
            field.options = options
        }
        out.push(field)
    }
    return { fields: out }
}

/**
 * Check an entry against its register's fields. Unknown keys are dropped;
 * numbers/yes-no/dates are normalised so roll-ups never parse strings.
 */
export function parseEntryValues(fields: RegisterField[], raw: unknown): { values: Record<string, unknown> } | { error: string } {
    const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    const values: Record<string, unknown> = {}
    const errors: string[] = []
    for (const f of fields) {
        const v = src[f.key]
        const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "")
        if (empty) {
            if (f.required) errors.push(`"${f.label}" is required`)
            continue
        }
        switch (f.type) {
            case "number": {
                const n = typeof v === "boolean" ? null : toNum(v)
                if (n === null) errors.push(`"${f.label}" must be a number`)
                else values[f.key] = n
                break
            }
            case "yesno": {
                const n = toNum(v)
                if (n !== 0 && n !== 1) errors.push(`"${f.label}" must be yes or no`)
                else values[f.key] = n === 1
                break
            }
            case "date": {
                const d = parseDay(v)
                if (!d) errors.push(`"${f.label}" must be a date`)
                else values[f.key] = dayKey(d)
                break
            }
            case "select": {
                const s = String(v).trim()
                if (!f.options?.includes(s)) errors.push(`"${f.label}" must be one of: ${f.options?.join(", ")}`)
                else values[f.key] = s
                break
            }
            default:
                values[f.key] = String(v).trim().slice(0, 2000)
        }
    }
    return errors.length ? { error: errors.join("; ") } : { values }
}

/** "24 Oct 2026" / "week of 19 Oct 2026" / "Oct 2026" for notifications. */
export function periodLabel(frequency: string, start: Date): string {
    const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
    if (frequency === "MONTHLY") return start.toLocaleDateString("en-IN", { timeZone: "UTC", month: "short", year: "numeric" })
    if (frequency === "WEEKLY") return `week of ${fmtDay(start)}`
    return fmtDay(start)
}

// ─── Configurable Payroll Rules ──────────────────────────────────────────────
//
// Every statutory rate, ceiling and slab the wage engine uses lives in a
// PayrollRules object. DEFAULT_PAYROLL_RULES reproduces the verified Growus
// wage sheet behaviour (docs/wage-sheet-rules.md); a company can override any
// of it from Payroll → Calculation Settings, which stores the object as JSON
// in AppSetting under PAYROLL_RULES_SETTING_KEY.
//
// This module is isomorphic — no Prisma / server imports — so client pages can
// use the same types and sanitizer for previews. Server-side loading lives in
// lib/payroll-rules-server.ts.

export const PAYROLL_RULES_SETTING_KEY = "payrollRules"

// A Professional Tax slab: earned gross up to `upTo` (inclusive) pays `amount`.
// Exactly one slab per list has upTo === null — the unbounded top slab.
export type PtSlab = {
    upTo: number | null
    amount: number
}

// What the ESIC eligibility limit is compared against:
//   "structureGross" → full-month structure gross (the rule up to Sep 2026)
//   "basicDa"        → full-month Basic + DA (the rule from 1 Oct 2026)
export type EsicEligibilityBasis = "structureGross" | "basicDa"
// What the ESIC % is charged on:
//   "esicWages" → earned gross minus the excluded components (Washing, Conveyance…)
//   "basicDa"   → earned Basic + DA only
export type EsicChargeBase = "esicWages" | "basicDa"
// Which month figure decides eligibility:
//   "fullMonth" → the salary structure (stable; a short month doesn't change it)
//   "earned"    → what was earned that month after attendance
export type EsicEligibilityPeriod = "fullMonth" | "earned"

// A dated change to the statutory rules. From the effective month onward,
// payroll uses these figures instead of the base pf/esic values; months
// before it keep the old ones, so re-running or re-filing an old month never
// picks up the new rule. See rulesForPeriod().
export type StatutoryRevision = {
    enabled: boolean
    effectiveMonth: number   // 1–12
    effectiveYear: number
    // PF wage ceiling: Basic + DA up to this is charged at 12% of actual,
    // above it PF is fixed at 12% of the ceiling (₹25,000 → ₹3,000).
    pfWageCeiling: number
    // Employer PF (EPS + EPF + EDLI + admin) is worked out on Basic + DA up
    // to this. null = the same ceiling as the employee's PF.
    employerPfWageCeiling: number | null
    esicEligibilityBasis: EsicEligibilityBasis
    esicEligibilityPeriod: EsicEligibilityPeriod
    esicChargeBase: EsicChargeBase
    // Basic + DA up to this (inclusive) pays ESIC; above it, none.
    esicEligibilityLimit: number
}

export type RoundMode = "nearest" | "up"

/**
 * OT rules (Calculation Settings → OT Rule by Site → "Edit OT rules" popup).
 * Each rule is either
 *   FORMULA  (sum of the ticked salary parts) ÷ days ÷ hours × multiplier
 *            e.g. (Basic + DA) ÷ 26 ÷ 8 × 2 = OT rate per hour
 *   FIXED    a fixed ₹ rate per hour; blank = each employee's own OT rate
 *   MANUAL_RATE    a ₹/hour rate typed per employee (ot.manualRates); none typed = own rate
 *   MANUAL_AMOUNT  a ₹ OT amount typed per employee for each payroll month
 *                  (lib/payroll-manual-ot); none typed = OT days × own rate
 * Parts are the full-month salary structure, not the days-worked figures.
 * Every site uses one rule (its own, else the default rule).
 */
export const OT_PARTS = ["basic", "da", "hra", "washing", "conveyance", "leaveWithWages", "bonus", "otherAllowance"] as const
export type OtPart = typeof OT_PARTS[number]
export const OT_PART_LABELS: Record<OtPart, string> = {
    basic: "Basic", da: "DA", hra: "HRA", washing: "Washing", conveyance: "Conveyance",
    leaveWithWages: "Leave with wages", bonus: "Bonus", otherAllowance: "Other allowance",
}
export type OtFormula = {
    id: string
    name: string                 // optional label; blank → the formula itself
    kind: "FORMULA" | "FIXED" | "MANUAL_RATE" | "MANUAL_AMOUNT"
    parts: OtPart[]
    days: number
    hours: number
    multiplier: number
    fixedRate: number | null     // FIXED only; null = employee's own OT rate
}
export type OtSiteRule = { rule: string; fixedRate?: number | null }

const otFormula = (id: string, parts: OtPart[], kind: OtFormula["kind"] = "FORMULA"): OtFormula =>
    ({ id, name: "", kind, parts, days: 26, hours: 8, multiplier: 2, fixedRate: null })
export const DEFAULT_OT_FORMULAS: OtFormula[] = [
    otFormula("BASIC_DA", ["basic", "da"]),
    otFormula("BASIC_DA_CONV", ["basic", "da", "conveyance"]),
    otFormula("GROSS", [...OT_PARTS]),
    otFormula("FIXED", [], "FIXED"),
    otFormula("MANUAL_RATE", [], "MANUAL_RATE"),
    otFormula("MANUAL_AMOUNT", [], "MANUAL_AMOUNT"),
]
const MANUAL_KINDS: OtFormula["kind"][] = ["MANUAL_RATE", "MANUAL_AMOUNT"]
export const isManualOt = (f?: OtFormula | null) => !!f && MANUAL_KINDS.includes(f.kind)

/** What a rule does, in words: "(Basic+DA)/26/8×2", "Gross/26/8×2", "Fixed ₹150/hr". */
export function otFormulaText(f: OtFormula): string {
    if (f.kind === "MANUAL_RATE") return "Manual OT — rate per employee"
    if (f.kind === "MANUAL_AMOUNT") return "Manual OT — monthly amount per employee"
    if (f.kind === "FIXED") return f.fixedRate && f.fixedRate > 0 ? `Fixed ₹${f.fixedRate}/hr` : "Fixed — employee's own OT rate"
    const base = f.parts.length === OT_PARTS.length ? "Gross"
        : f.parts.length === 1 ? OT_PART_LABELS[f.parts[0]]
        : `(${f.parts.map(p => OT_PART_LABELS[p]).join("+")})`
    return `${base}/${f.days}/${f.hours}×${f.multiplier}`
}
/** The rule's name if it has one, with its formula. */
export function otFormulaLabel(f: OtFormula): string {
    const t = otFormulaText(f)
    return f.name.trim() ? `${f.name.trim()} — ${t}` : t
}

export type PayrollRules = {
    // How earned pay is worked out from attendance (Calculation Settings → Pay & proration).
    pay: {
        // true = paid in full every month; false = cut by days worked (Basic and DA always are).
        fullMonth: { hra: boolean; washing: boolean; conveyance: boolean; leaveWithWages: boolean; bonus: boolean; otherAllowance: boolean }
        // true = each earned amount rounded to the rupee; false = kept to the paise.
        roundEarned: boolean
    }
    // What contract ("CALL") employees get. Default: none of these.
    call: { pf: boolean; esic: boolean; hra: boolean; bonus: boolean }
    // Rounding of the employee PF and of ESIC (employee + employer).
    rounding: { pf: RoundMode; esic: RoundMode }
    // Full & final settlement (Exit → F&F, Payroll → Reports → FNF).
    fnf: {
        gratuityDays: number          // days' wages per year of service (15)
        gratuityDivisor: number       // a month's wages ÷ this = one day (26)
        gratuityMinDays: number       // service needed, in days (4 yr 240 d = 1700)
        gratuityCap: number           // maximum gratuity (₹20,00,000)
        roundUpMonthsFrom: number     // part-year of this many months or more counts as a full year (6)
        encashOn: "basicDa" | "gross" // leave encashment rate base
        encashDivisor: number         // ÷ this = one day's encashment (26)
        noticeDivisor: number         // gross ÷ this = one notice day (30)
    }
    pf: {
        enabled: boolean
        // PF base = min(earned Basic + DA, wageCeiling).
        wageCeiling: number
        // Employer contributions use min(earned Basic + DA, this). null = wageCeiling.
        employerWageCeiling: number | null
        employeePct: number
        // When true, employees who worked fewer than prorationThresholdDays
        // pay PF on (base / threshold × workedDays) — the pre-May-2026 rule.
        // Default false: full PF regardless of worked days.
        prorateEmployee: boolean
        prorationThresholdDays: number
        employer: {
            epsPct: number
            epfPct: number
            edliPct: number
            adminPct: number
        }
    }
    esic: {
        enabled: boolean
        // Eligibility is checked on a FULL-MONTH figure — which one is set by
        // eligibilityBasis (structure gross unless a revision says otherwise).
        eligibilityBasis: EsicEligibilityBasis
        // Full-month structure figure, or what was earned that month.
        eligibilityPeriod: EsicEligibilityPeriod
        // What the employee / employer % is charged on.
        chargeBase: EsicChargeBase
        eligibilityLimit: number
        handicapLimit: number
        employeePct: number
        employerPct: number
        // ESIC wage base = earned gross minus the excluded components below.
        // OT and Bonus stay included per ESIC rules; only reimbursement-style
        // components (Washing, Conveyance) come out by default.
        excludeWashing: boolean
        excludeConveyance: boolean
        excludeBonus: boolean
        excludeOt: boolean
        excludeIncentive: boolean
    }
    pt: {
        enabled: boolean
        // Current engine behaviour charges PT to CALL (contract) employees
        // too; the rule book says CALL should be exempt. Keep the historical
        // behaviour as default and let the company decide.
        appliesToCall: boolean
        slabs: PtSlab[]
        // Amount charged in February INSTEAD of the top slab amount (annual
        // adjustment). null disables the February special.
        februaryAmount: number | null
        // Female employees with earned gross ≤ this pay zero PT
        // (Maharashtra notification). 0 disables the exemption.
        femaleExemptUpTo: number
        // The female limit is checked on the full-month salary structure or on what was earned.
        femaleExemptOn: "structure" | "earned"
    }
    lwf: {
        // LWF stays a manual per-run entry; these only prefill the attendance
        // template / process grid. Maharashtra: 6 employee / 12 employer.
        employeeDefault: number
        employerDefault: number
    }
    ot: {
        // What the OT figure in the attendance sheet is: "hours" → OT pay = rate × those
        // hours; "days" → OT hours = days × hoursPerDay, then rate × hours.
        inputUnit: "hours" | "days"
        // 1 OT day = this many hours (only when inputUnit is "days").
        hoursPerDay: number
        // The OT rules a site can use (editable in the popup).
        formulas: OtFormula[]
        // MANUAL_RATE rule: employeeId → ₹ per hour.
        manualRates: Record<string, number>
        // Rule id for sites with no rule of their own. FIXED = each employee's own OT rate (as before).
        defaultRule: string
        // siteId → that site's rule.
        sites: Record<string, OtSiteRule>
    }
    defaults: {
        monthDays: number
        otRatePerHour: number
        canteenRatePerDay: number
        da: number
        bonus: number
    }
    codes: {
        // Establishment codes printed on compliance report headers.
        pfEstablishment: string
        esicEstablishment: string
    }
    revision: StatutoryRevision
}

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
    pay: {
        fullMonth: { hra: false, washing: false, conveyance: false, leaveWithWages: false, bonus: false, otherAllowance: false },
        roundEarned: true,
    },
    call: { pf: false, esic: false, hra: false, bonus: false },
    rounding: { pf: "nearest", esic: "up" },
    fnf: {
        gratuityDays: 15, gratuityDivisor: 26, gratuityMinDays: 4 * 365 + 240, gratuityCap: 2_000_000,
        roundUpMonthsFrom: 6, encashOn: "basicDa", encashDivisor: 26, noticeDivisor: 30,
    },
    pf: {
        enabled: true,
        wageCeiling: 15000,
        employerWageCeiling: null,
        employeePct: 12,
        prorateEmployee: false,
        prorationThresholdDays: 26,
        employer: {
            epsPct: 8.33,
            epfPct: 3.67,
            edliPct: 0.5,
            adminPct: 0.5,
        },
    },
    esic: {
        enabled: true,
        eligibilityBasis: "structureGross",
        eligibilityPeriod: "fullMonth",
        chargeBase: "esicWages",
        eligibilityLimit: 21000,
        handicapLimit: 25000,
        employeePct: 0.75,
        employerPct: 3.25,
        excludeWashing: true,
        excludeConveyance: true,
        // Bonus STAYS in the ESIC base. Only Washing and Conveyance come out:
        //   ESIC wages = EarnedGross − Washing − Conveyance
        excludeBonus: false,
        // OT and production incentive are wages for ESIC.
        excludeOt: false,
        excludeIncentive: false,
    },
    pt: {
        enabled: true,
        appliesToCall: true,
        slabs: [
            { upTo: 7500, amount: 0 },
            { upTo: 10000, amount: 175 },
            { upTo: null, amount: 200 },
        ],
        februaryAmount: 300,
        femaleExemptUpTo: 25000,
        femaleExemptOn: "structure",
    },
    lwf: {
        employeeDefault: 0,
        employerDefault: 0,
    },
    ot: {
        inputUnit: "hours",
        hoursPerDay: 4,
        formulas: DEFAULT_OT_FORMULAS.map(f => ({ ...f, parts: [...f.parts] })),
        manualRates: {},
        defaultRule: "FIXED",
        sites: {},
    },
    defaults: {
        monthDays: 26,
        otRatePerHour: 170,
        canteenRatePerDay: 55,
        da: 2511,
        bonus: 583,
    },
    codes: {
        pfEstablishment: "PUPUN2450654000",
        esicEstablishment: "33000891430000999",
    },
    // Govt. rule effective 1 Oct 2026:
    //   PF:   Basic + DA ≥ ₹25,000 → ₹3,000 (12% of 25,000); below → 12% of actual
    //   ESIC: Basic + DA ≤ ₹21,000 → 0.75%; ₹21,001 and above → no ESIC
    revision: {
        enabled: true,
        effectiveMonth: 10,
        effectiveYear: 2026,
        pfWageCeiling: 25000,
        employerPfWageCeiling: null,
        esicEligibilityBasis: "basicDa",
        esicEligibilityPeriod: "fullMonth",
        esicChargeBase: "esicWages",
        esicEligibilityLimit: 21000,
    },
}

// ─── Period-specific rules ───────────────────────────────────────────────────
// The rules that apply to payroll for month/year: the base rules, with the
// statutory revision laid over them from its effective month onward. Every
// place that computes or files a month's PF/ESIC must go through this, so a
// September re-run keeps the old ceiling while October uses the new one.

export function revisionApplies(rules: PayrollRules, month: number, year: number): boolean {
    const r = rules.revision
    if (!r?.enabled) return false
    return year * 12 + month >= r.effectiveYear * 12 + r.effectiveMonth
}

export function rulesForPeriod(rules: PayrollRules, month: number, year: number): PayrollRules {
    if (!revisionApplies(rules, month, year)) return rules
    const r = rules.revision
    return {
        ...rules,
        pf: { ...rules.pf, wageCeiling: r.pfWageCeiling, employerWageCeiling: r.employerPfWageCeiling },
        esic: {
            ...rules.esic,
            eligibilityBasis: r.esicEligibilityBasis, eligibilityPeriod: r.esicEligibilityPeriod,
            chargeBase: r.esicChargeBase, eligibilityLimit: r.esicEligibilityLimit,
        },
    }
}

/** Rules for the current calendar month — for salary-structure previews. */
export function rulesForToday(rules: PayrollRules, now: Date = new Date()): PayrollRules {
    return rulesForPeriod(rules, now.getMonth() + 1, now.getFullYear())
}

/**
 * The figure ESIC eligibility is tested against, per the rules' basis
 * (Basic + DA or gross) and period (full-month structure or earned). Shared
 * by the engine, the single-row edit route and the reports.
 */
export function esicEligibilityBase(
    esic: PayrollRules["esic"],
    full: { basic: number; da: number; gross: number },
    earned?: { basic: number; da: number; gross: number },
): number {
    const f = esic.eligibilityPeriod === "earned" && earned ? earned : full
    return esic.eligibilityBasis === "basicDa" ? f.basic + f.da : f.gross
}

/** What the ESIC % is charged on: ESIC wages, or earned Basic + DA. */
export function esicChargeAmount(esic: PayrollRules["esic"], v: { esicWages: number; basicDa: number }): number {
    return esic.chargeBase === "basicDa" ? v.basicDa : v.esicWages
}

/** Base for employer PF: earned Basic + DA up to the employer ceiling. */
export function employerPfBase(pf: PayrollRules["pf"], basicDa: number): number {
    return Math.min(basicDa, pf.employerWageCeiling ?? pf.wageCeiling)
}

// ─── Sanitizer ───────────────────────────────────────────────────────────────
// Accepts anything (stored JSON, request body) and returns a fully-populated,
// numerically sane PayrollRules. Unknown keys are dropped, missing ones take
// the default, numbers are clamped to ≥ 0.

function num(v: unknown, fallback: number, opts?: { min?: number; max?: number }): number {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN
    if (!Number.isFinite(n)) return fallback
    const min = opts?.min ?? 0
    const max = opts?.max
    if (n < min) return min
    if (max !== undefined && n > max) return max
    return n
}

function bool(v: unknown, fallback: boolean): boolean {
    return typeof v === "boolean" ? v : fallback
}

function str(v: unknown, fallback: string): string {
    return typeof v === "string" ? v.trim() : fallback
}

function sanitizeSlabs(v: unknown, fallback: PtSlab[]): PtSlab[] {
    if (!Array.isArray(v)) return fallback.map(s => ({ ...s }))
    const bounded: PtSlab[] = []
    let top: PtSlab | null = null
    for (const raw of v) {
        if (!raw || typeof raw !== "object") continue
        const r = raw as Record<string, unknown>
        const amount = num(r.amount, NaN)
        if (!Number.isFinite(amount)) continue
        if (r.upTo === null || r.upTo === undefined || r.upTo === "") {
            // last unbounded slab wins if several were sent
            top = { upTo: null, amount }
        } else {
            const upTo = num(r.upTo, NaN)
            if (!Number.isFinite(upTo) || upTo <= 0) continue
            bounded.push({ upTo, amount })
        }
    }
    if (!bounded.length && !top) return fallback.map(s => ({ ...s }))
    bounded.sort((a, b) => (a.upTo! - b.upTo!))
    // Ensure the list always ends with an unbounded slab so every gross maps
    // to an amount.
    if (!top) top = { upTo: null, amount: bounded[bounded.length - 1]?.amount ?? 0 }
    return [...bounded, top]
}

const money = (v: unknown): number | null => {
    const n = Number(v)
    return v !== null && v !== "" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function sanitizeOtFormulas(v: unknown, old: Record<string, any>): OtFormula[] {
    // Settings saved before rules were editable had one days / hours / multiplier for all.
    const seed = DEFAULT_OT_FORMULAS.map(f => ({
        ...f, parts: [...f.parts],
        days: num(old.rateDays, f.days, { min: 1, max: 31 }),
        hours: num(old.rateHours, f.hours, { min: 1, max: 24 }),
        multiplier: num(old.multiplier, f.multiplier, { min: 0, max: 10 }),
    }))
    if (!Array.isArray(v) || !v.length) return seed
    const out: OtFormula[] = []
    const seen = new Set<string>()
    for (const raw of v.slice(0, 30)) {
        if (!raw || typeof raw !== "object") continue
        let id = typeof raw.id === "string" ? raw.id.trim().slice(0, 40) : ""
        if (!id || seen.has(id)) id = `RULE_${out.length + 1}_${seen.size}`
        seen.add(id)
        const kind: OtFormula["kind"] = ["FIXED", ...MANUAL_KINDS].includes(raw.kind) ? raw.kind : "FORMULA"
        // One of each manual kind is enough.
        if (MANUAL_KINDS.includes(kind) && out.some(f => f.kind === kind)) continue
        const parts = Array.isArray(raw.parts) ? OT_PARTS.filter(p => raw.parts.includes(p)) : []
        if (kind === "FORMULA" && !parts.length) continue
        out.push({
            id, kind, parts: kind === "FORMULA" ? parts : [],
            name: typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "",
            days: num(raw.days, 26, { min: 1, max: 31 }),
            hours: num(raw.hours, 8, { min: 1, max: 24 }),
            multiplier: num(raw.multiplier, 2, { min: 0, max: 10 }),
            fixedRate: kind === "FIXED" ? money(raw.fixedRate) : null,
        })
    }
    if (!out.length) return seed
    // The two manual options are always offered.
    for (const k of MANUAL_KINDS) if (!out.some(f => f.kind === k)) {
        const id = seen.has(k) ? `${k}_${out.length}` : k
        out.push({ ...DEFAULT_OT_FORMULAS.find(f => f.kind === k)!, id })
    }
    return out
}

function sanitizeRates(v: unknown): Record<string, number> {
    const out: Record<string, number> = {}
    if (!v || typeof v !== "object") return out
    for (const [id, r] of Object.entries(v as Record<string, unknown>).slice(0, 20000)) {
        const n = money(r)
        if (id && id.length <= 64 && n !== null) out[id] = n
    }
    return out
}

function sanitizeOtSites(v: unknown, ids: Set<string>): Record<string, OtSiteRule> {
    const out: Record<string, OtSiteRule> = {}
    if (!v || typeof v !== "object") return out
    for (const [id, raw] of Object.entries(v as Record<string, any>)) {
        if (!id || id.length > 64 || !raw || !ids.has(raw.rule)) continue
        const rate = money(raw.fixedRate)
        out[id] = rate ? { rule: raw.rule, fixedRate: rate } : { rule: raw.rule }
    }
    return out
}

/** OT hours from the attendance OT figure (hours as entered, or days × hours per OT day). */
export function otHoursOf(ot: PayrollRules["ot"], value: number): number {
    const v = Number(value) || 0
    return Math.round((ot.inputUnit === "hours" ? v : v * (ot.hoursPerDay || 0)) * 100) / 100
}

/** The OT rule in force for a site (its own, else the default). */
export function otRuleFor(ot: PayrollRules["ot"], siteId?: string | null): { formula: OtFormula | null; siteRate: number | null } {
    const own = siteId ? ot.sites?.[siteId] : undefined
    const id = own?.rule ?? ot.defaultRule
    return { formula: ot.formulas?.find(f => f.id === id) ?? null, siteRate: own?.fixedRate ?? null }
}

/**
 * OT rate per hour for one employee under their site's rule. `parts` is the
 * full-month salary structure; `ownRate` the employee's own OT rate.
 */
export function otRatePerHourFor(ot: PayrollRules["ot"], siteId: string | null | undefined,
    parts: Record<OtPart, number>, ownRate: number, employeeId?: string | null): number {
    // A rate typed for the employee (Employee OT window) wins over the site rule.
    const typed = employeeId ? ot.manualRates?.[employeeId] : undefined
    if (typed && typed > 0) return typed
    const { formula: f, siteRate } = otRuleFor(ot, siteId)
    if (!f) return ownRate
    if (f.kind === "MANUAL_RATE") return ownRate
    if (f.kind === "MANUAL_AMOUNT") return ownRate
    if (f.kind === "FIXED") return siteRate ?? (f.fixedRate && f.fixedRate > 0 ? f.fixedRate : ownRate)
    const base = f.parts.reduce((a, p) => a + (Number(parts[p]) || 0), 0)
    return base / (f.days || 26) / (f.hours || 8) * f.multiplier
}

export function sanitizePayrollRules(input: unknown): PayrollRules {
    const d = DEFAULT_PAYROLL_RULES
    const o = (input && typeof input === "object" ? input : {}) as Record<string, any>
    const pf = o.pf ?? {}
    const pfEmployer = pf.employer ?? {}
    const esic = o.esic ?? {}
    const pt = o.pt ?? {}
    const lwf = o.lwf ?? {}
    const ot = o.ot ?? {}
    const defaults = o.defaults ?? {}
    const codes = o.codes ?? {}
    const revision = o.revision ?? {}
    const pay = o.pay ?? {}
    const fm = pay.fullMonth ?? {}
    const call = o.call ?? {}
    const rounding = o.rounding ?? {}
    const fnf = o.fnf ?? {}
    const round = (v: unknown, fallback: RoundMode): RoundMode => (v === "nearest" || v === "up" ? v : fallback)
    const period = (v: unknown, fallback: EsicEligibilityPeriod): EsicEligibilityPeriod =>
        v === "fullMonth" || v === "earned" ? v : fallback
    const charge = (v: unknown, fallback: EsicChargeBase): EsicChargeBase =>
        v === "esicWages" || v === "basicDa" ? v : fallback
    const optCeiling = (v: unknown, fallback: number | null): number | null =>
        v === null || v === "" ? null : v === undefined ? fallback : num(v, fallback ?? 0)
    const basis = (v: unknown, fallback: EsicEligibilityBasis): EsicEligibilityBasis =>
        v === "basicDa" || v === "structureGross" ? v : fallback

    return {
        pay: {
            fullMonth: {
                hra: bool(fm.hra, d.pay.fullMonth.hra), washing: bool(fm.washing, d.pay.fullMonth.washing),
                conveyance: bool(fm.conveyance, d.pay.fullMonth.conveyance), leaveWithWages: bool(fm.leaveWithWages, d.pay.fullMonth.leaveWithWages),
                bonus: bool(fm.bonus, d.pay.fullMonth.bonus), otherAllowance: bool(fm.otherAllowance, d.pay.fullMonth.otherAllowance),
            },
            roundEarned: bool(pay.roundEarned, d.pay.roundEarned),
        },
        call: { pf: bool(call.pf, d.call.pf), esic: bool(call.esic, d.call.esic), hra: bool(call.hra, d.call.hra), bonus: bool(call.bonus, d.call.bonus) },
        rounding: { pf: round(rounding.pf, d.rounding.pf), esic: round(rounding.esic, d.rounding.esic) },
        fnf: {
            gratuityDays: num(fnf.gratuityDays, d.fnf.gratuityDays, { min: 0, max: 60 }),
            gratuityDivisor: num(fnf.gratuityDivisor, d.fnf.gratuityDivisor, { min: 1, max: 31 }),
            gratuityMinDays: num(fnf.gratuityMinDays, d.fnf.gratuityMinDays, { min: 0, max: 20000 }),
            gratuityCap: num(fnf.gratuityCap, d.fnf.gratuityCap),
            roundUpMonthsFrom: num(fnf.roundUpMonthsFrom, d.fnf.roundUpMonthsFrom, { min: 1, max: 12 }),
            encashOn: fnf.encashOn === "gross" || fnf.encashOn === "basicDa" ? fnf.encashOn : d.fnf.encashOn,
            encashDivisor: num(fnf.encashDivisor, d.fnf.encashDivisor, { min: 1, max: 31 }),
            noticeDivisor: num(fnf.noticeDivisor, d.fnf.noticeDivisor, { min: 1, max: 31 }),
        },
        pf: {
            enabled: bool(pf.enabled, d.pf.enabled),
            wageCeiling: num(pf.wageCeiling, d.pf.wageCeiling),
            employerWageCeiling: optCeiling(pf.employerWageCeiling, d.pf.employerWageCeiling),
            employeePct: num(pf.employeePct, d.pf.employeePct, { max: 100 }),
            prorateEmployee: bool(pf.prorateEmployee, d.pf.prorateEmployee),
            prorationThresholdDays: num(pf.prorationThresholdDays, d.pf.prorationThresholdDays, { min: 1, max: 31 }),
            employer: {
                epsPct: num(pfEmployer.epsPct, d.pf.employer.epsPct, { max: 100 }),
                epfPct: num(pfEmployer.epfPct, d.pf.employer.epfPct, { max: 100 }),
                edliPct: num(pfEmployer.edliPct, d.pf.employer.edliPct, { max: 100 }),
                adminPct: num(pfEmployer.adminPct, d.pf.employer.adminPct, { max: 100 }),
            },
        },
        esic: {
            enabled: bool(esic.enabled, d.esic.enabled),
            eligibilityBasis: basis(esic.eligibilityBasis, d.esic.eligibilityBasis),
            eligibilityPeriod: period(esic.eligibilityPeriod, d.esic.eligibilityPeriod),
            chargeBase: charge(esic.chargeBase, d.esic.chargeBase),
            eligibilityLimit: num(esic.eligibilityLimit, d.esic.eligibilityLimit),
            handicapLimit: num(esic.handicapLimit, d.esic.handicapLimit),
            employeePct: num(esic.employeePct, d.esic.employeePct, { max: 100 }),
            employerPct: num(esic.employerPct, d.esic.employerPct, { max: 100 }),
            excludeWashing: bool(esic.excludeWashing, d.esic.excludeWashing),
            excludeConveyance: bool(esic.excludeConveyance, d.esic.excludeConveyance),
            excludeBonus: bool(esic.excludeBonus, d.esic.excludeBonus),
            excludeOt: bool(esic.excludeOt, d.esic.excludeOt),
            excludeIncentive: bool(esic.excludeIncentive, d.esic.excludeIncentive),
        },
        pt: {
            enabled: bool(pt.enabled, d.pt.enabled),
            appliesToCall: bool(pt.appliesToCall, d.pt.appliesToCall),
            slabs: sanitizeSlabs(pt.slabs, d.pt.slabs),
            februaryAmount: pt.februaryAmount === null ? null : num(pt.februaryAmount, d.pt.februaryAmount ?? 0),
            femaleExemptUpTo: num(pt.femaleExemptUpTo, d.pt.femaleExemptUpTo),
            femaleExemptOn: pt.femaleExemptOn === "earned" || pt.femaleExemptOn === "structure" ? pt.femaleExemptOn : d.pt.femaleExemptOn,
        },
        lwf: {
            employeeDefault: num(lwf.employeeDefault, d.lwf.employeeDefault),
            employerDefault: num(lwf.employerDefault, d.lwf.employerDefault),
        },
        ot: {
            inputUnit: ot.inputUnit === "hours" ? "hours" : ot.inputUnit === "days" ? "days" : (input && typeof input === "object" && Object.keys(input).length ? "days" : d.ot.inputUnit),
            hoursPerDay: num(ot.hoursPerDay, d.ot.hoursPerDay, { min: 0, max: 24 }),
            ...(() => {
                const formulas = sanitizeOtFormulas(ot.formulas, ot)
                const ids = new Set(formulas.map(f => f.id))
                const defaultRule = ids.has(ot.defaultRule) ? ot.defaultRule
                    : (formulas.find(f => f.kind === "FIXED" && !f.fixedRate) ?? formulas[0]).id
                return { formulas, defaultRule, sites: sanitizeOtSites(ot.sites, ids), manualRates: sanitizeRates(ot.manualRates) }
            })(),
        },
        defaults: {
            monthDays: num(defaults.monthDays, d.defaults.monthDays, { min: 1, max: 31 }),
            otRatePerHour: num(defaults.otRatePerHour, d.defaults.otRatePerHour),
            canteenRatePerDay: num(defaults.canteenRatePerDay, d.defaults.canteenRatePerDay),
            da: num(defaults.da, d.defaults.da),
            bonus: num(defaults.bonus, d.defaults.bonus),
        },
        codes: {
            pfEstablishment: str(codes.pfEstablishment, d.codes.pfEstablishment),
            esicEstablishment: str(codes.esicEstablishment, d.codes.esicEstablishment),
        },
        // Stored settings saved before revisions existed have no `revision`
        // key, so they pick up the default (the Oct 2026 rule) automatically.
        revision: {
            enabled: bool(revision.enabled, d.revision.enabled),
            effectiveMonth: num(revision.effectiveMonth, d.revision.effectiveMonth, { min: 1, max: 12 }),
            effectiveYear: num(revision.effectiveYear, d.revision.effectiveYear, { min: 2000, max: 2100 }),
            pfWageCeiling: num(revision.pfWageCeiling, d.revision.pfWageCeiling),
            employerPfWageCeiling: optCeiling(revision.employerPfWageCeiling, d.revision.employerPfWageCeiling),
            esicEligibilityBasis: basis(revision.esicEligibilityBasis, d.revision.esicEligibilityBasis),
            esicEligibilityPeriod: period(revision.esicEligibilityPeriod, d.revision.esicEligibilityPeriod),
            esicChargeBase: charge(revision.esicChargeBase, d.revision.esicChargeBase),
            esicEligibilityLimit: num(revision.esicEligibilityLimit, d.revision.esicEligibilityLimit),
        },
    }
}

/** x rounded per the setting: to the nearest rupee, or up to the next rupee. */
export function roundAmt(x: number, mode: RoundMode): number {
    return mode === "up" ? Math.ceil(x) : Math.round(x)
}

/** ESIC wages: earned gross less the components Calculation Settings excludes. Engine, edits and reports share it. */
export function esicWagesOf(esic: PayrollRules["esic"], c: { gross: number; washing: number; conveyance: number; bonus: number; ot: number; incentive: number }): number {
    return Math.max(0, c.gross
        - (esic.excludeWashing ? c.washing : 0)
        - (esic.excludeConveyance ? c.conveyance : 0)
        - (esic.excludeBonus ? c.bonus : 0)
        - (esic.excludeOt ? c.ot : 0)
        - (esic.excludeIncentive ? c.incentive : 0))
}

// ─── PT slab lookup ──────────────────────────────────────────────────────────
// Shared by the engine and by client previews.

export function computePt(
    grossEarned: number,
    pt: PayrollRules["pt"],
    opts: {
        isFebruary?: boolean
        isFemale?: boolean
        isCall?: boolean
        /**
         * What the female exemption limit is measured against. Defaults to
         * grossEarned; callers pass the FULL-MONTH structure gross (the
         * "Gross(R)" column on Form II).
         *
         * The two sides of PT deliberately read different figures, per the
         * company's stated criteria: the male slab is on what was EARNED,
         * while the female limit is on the GROSS SALARY. So the exemption
         * depends on what someone is paid, not on how many days or how much
         * overtime they worked — EMP-7631's 20,195 salary keeps the exemption
         * in a month her earnings reached 32,440 on overtime.
         *
         * Above the limit she falls through to the same slab as everyone
         * else, still measured on earned gross.
         */
        femaleExemptBasis?: number
    } = {}
): number {
    if (!pt.enabled) return 0
    if (opts.isCall && !pt.appliesToCall) return 0
    const exemptBasis = opts.femaleExemptBasis ?? grossEarned
    if (opts.isFemale && pt.femaleExemptUpTo > 0 && exemptBasis <= pt.femaleExemptUpTo) return 0

    for (let i = 0; i < pt.slabs.length; i++) {
        const slab = pt.slabs[i]
        if (slab.upTo !== null && grossEarned <= slab.upTo) return slab.amount
        if (slab.upTo === null) {
            // Top slab: February charges the annual-adjustment amount instead.
            if (opts.isFebruary && pt.februaryAmount !== null) return pt.februaryAmount
            return slab.amount
        }
    }
    return 0
}

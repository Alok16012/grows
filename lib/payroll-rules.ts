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

export type PayrollRules = {
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
    }
    lwf: {
        // LWF stays a manual per-run entry; these only prefill the attendance
        // template / process grid. Maharashtra: 6 employee / 12 employer.
        employeeDefault: number
        employerDefault: number
    }
    ot: {
        // 1 OT day = this many hours at the employee's per-hour OT rate.
        hoursPerDay: number
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
    },
    lwf: {
        employeeDefault: 0,
        employerDefault: 0,
    },
    ot: {
        hoursPerDay: 4,
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
    const period = (v: unknown, fallback: EsicEligibilityPeriod): EsicEligibilityPeriod =>
        v === "fullMonth" || v === "earned" ? v : fallback
    const charge = (v: unknown, fallback: EsicChargeBase): EsicChargeBase =>
        v === "esicWages" || v === "basicDa" ? v : fallback
    const optCeiling = (v: unknown, fallback: number | null): number | null =>
        v === null || v === "" ? null : v === undefined ? fallback : num(v, fallback ?? 0)
    const basis = (v: unknown, fallback: EsicEligibilityBasis): EsicEligibilityBasis =>
        v === "basicDa" || v === "structureGross" ? v : fallback

    return {
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
        },
        pt: {
            enabled: bool(pt.enabled, d.pt.enabled),
            appliesToCall: bool(pt.appliesToCall, d.pt.appliesToCall),
            slabs: sanitizeSlabs(pt.slabs, d.pt.slabs),
            februaryAmount: pt.februaryAmount === null ? null : num(pt.februaryAmount, d.pt.februaryAmount ?? 0),
            femaleExemptUpTo: num(pt.femaleExemptUpTo, d.pt.femaleExemptUpTo),
        },
        lwf: {
            employeeDefault: num(lwf.employeeDefault, d.lwf.employeeDefault),
            employerDefault: num(lwf.employerDefault, d.lwf.employerDefault),
        },
        ot: {
            hoursPerDay: num(ot.hoursPerDay, d.ot.hoursPerDay, { min: 0, max: 24 }),
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

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

export type PayrollRules = {
    pf: {
        enabled: boolean
        // PF base = Basic + DA (no ceiling). wageCeiling kept in type for
        // backward compat with stored settings but not used in calculation.
        wageCeiling: number
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
        // Eligibility is checked on the FULL-MONTH structure gross.
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
}

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
    pf: {
        enabled: true,
        wageCeiling: 15000,
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

    return {
        pf: {
            enabled: bool(pf.enabled, d.pf.enabled),
            wageCeiling: num(pf.wageCeiling, d.pf.wageCeiling),
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
         * grossEarned, but callers pass earned gross MINUS overtime: a woman
         * whose salary sits under the limit shouldn't lose the exemption in
         * the months she happens to work overtime. Without this, EMP-7631 —
         * 23,302 earned, 9,138 OT — tipped over 25,000 on OT alone and was
         * charged PT, while the slab itself still applies to the full gross.
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
